/**
 * Linearität der zweiten Schutzschicht für Mermaid-Quelltext im Deck (ReDoS-Konvention, CORE-TEST-26 (b)): der erschöpfende Fuzz `pruefeLinearFuzz` aus dem Kit-Testmodul.
 * Gemessen wird ein Quotient t(50 000)/t(10 000), keine Millisekunden.
 *
 * Geprüft ist `secondPassDeck` auf einem Deck mit einem Mermaid-Block, dessen Inhalt der Fuzz füllt: `url`, Kommentar, Klammer, `@{ img: … }`, Anführungszeichen und Zeilenumbruch
 * (der Kommentar auch verschachtelt).
 * Die handgewählten Muster und die Zeitgrenze für den Exponential-Fall (0.15.1) stehen in `deck-second-pass.test.ts`; dieser Test ergänzt sie um alle Einheiten bis drei
 * Alphabet-Einträge. Die Gegenprobe (eine absichtlich quadratische Fassung wird rot) steht am Ende dieser Datei.
 */
import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { secondPassDeck } from "../src/deck-second-pass";
import { mitLastSchutz, pruefeLast, pruefeLinearFuzz } from "./vendor/kit/linear-probe";

const FUZZ_MS = 180_000;

// Ohne Seitenladen: das Dokument ist inert, happy-dom darf auch für iframes nichts holen (wie in deck-second-pass.test.ts).
const win = new Window({ settings: { disableIframePageLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
// happy-dom behält die geparsten Bäume, solange der Lauf synchron bleibt (gemessen 2026-11-24: rund 300 MB je Parse einer 575-kB-Folie, nach `body.innerHTML = ""` frei).
// Der Fuzz läuft hunderte Male ohne Pause und füllte so den Heap (Node 24, 4 GB, „heap out of memory“). Das ist ein Testartefakt: das Plugin parst mit dem DOMParser des Browsers.
// Darum leert `lauf` jedes Dokument, das `parseHtml` herausgab, sobald `secondPassDeck` fertig ist.
const geparst: Document[] = [];
const parseHtml = (html: string): Document => {
  const d = new win.DOMParser().parseFromString(html, "text/html") as unknown as Document;
  geparst.push(d);
  return d;
};
const lauf = (src: string): unknown => {
  try { return secondPassDeck(src, deps); } finally { for (const d of geparst.splice(0)) d.body.innerHTML = ""; }
};
const deps = { parseHtml };
const deck = (src: string): string => `# A\n\n\`\`\`mermaid\n${src}\n\`\`\`\n`;

/** Befund als lesbarer Text, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). */
const befund = (r: { verdaechtig: ReadonlyArray<{ message: string }> }): string => r.verdaechtig.map((v) => v.message).join("\n");

describe("Mermaid-Quelltext im Deck (secondPassDeck)", () => {
  it("Fuzz über url, Klammer, img-Feld, Anführungszeichen und Zeilenumbruch", (ctx) => {
    const f = mitLastSchutz(ctx, () => pruefeLinearFuzz((s) => lauf(deck(`graph TD\n${s}`)), {
      alphabet: ["url", "(", "@{ img: ", '"', "\n", "x"],
      maxLaenge: 3,
    }));
    expect(f.linear, befund(f)).toBe(true);
    expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
  }, FUZZ_MS);
});

// Der Kommentar `/**/` steht nicht im Fuzz: er macht aus 50 000 Wiederholungen 25 000 `<strong>`-Elemente, und das Aufräumen von `lauf` (`innerHTML = ""`) ist in happy-dom selbst
// überlinear (gemessen 2026-11-24: n = 5 000: 14 ms, n = 10 000: 194 ms) — der Fuzz meldete deshalb einen Befund, der in `secondPassDeck` nicht liegt (54 ms bei n = 10 000). Hier wird
// nur `secondPassDeck` gezeitet, das Aufräumen steht danach. Die Heap-Meldung der Task („`"/**/".repeat(50000) + "(".repeat(50000)` füllt den Heap“) war dasselbe Artefakt: ein einzelner Lauf braucht rund 0,4 s und 330 MB.
describe("Kommentar und Klammer, verschachtelt (secondPassDeck, nur der Aufruf gezeitet)", () => {
  const zeit = (n: number): number => {
    const md = deck(`graph TD\n${"/**/".repeat(n)}${"(".repeat(n)}`);
    const t0 = performance.now();
    secondPassDeck(md, deps);
    const ms = performance.now() - t0;
    for (const d of geparst.splice(0)) d.body.innerHTML = "";
    return ms;
  };

  // Die eigenen Zeitmessungen hier laufen nicht durch die Proben des Kits; dieselbe Gültigkeitsbedingung (Last je Kern vor und nach der Messung,
  // Schwelle des Kits) stellt `gemessen` her: über der Schwelle ist der Fall übersprungen, nicht rot.
  const gemessen = <T>(ctx: Parameters<typeof mitLastSchutz>[0], messung: () => T): T =>
    mitLastSchutz(ctx, () => { pruefeLast(undefined, "vor"); const r = messung(); pruefeLast(undefined, "nach"); return r; });

  it("250 kB Quelltext (n = 50 000) laufen in unter 5 s durch", (ctx) => {
    expect(gemessen(ctx, () => zeit(50_000))).toBeLessThan(5_000);
  }, FUZZ_MS);

  it("t(50 000)/t(12 500) liegt unter 8 (linear etwa 4, quadratisch 16)", (ctx) => {
    const { klein, gross } = gemessen(ctx, () => {
      zeit(2_000); // Aufwärmen
      return { klein: Math.min(zeit(12_500), zeit(12_500)), gross: zeit(50_000) };
    });
    expect(gross < 100 || gross / Math.max(klein, 0.05) < 8, `t(12 500) = ${klein.toFixed(1)} ms, t(50 000) = ${gross.toFixed(1)} ms`).toBe(true);
  }, FUZZ_MS);
});

describe("Gegenprobe: der Fuzz kann rot werden (CORE-TEST-01)", () => {
  /** Absichtlich quadratisch: dieselbe Form wie `src.replace(/\n*$/, …)` auf dem Mermaid-Quelltext. */
  const quadratisch = (s: string): string => s.replace(/\n*$/, "\n\n");

  it("pruefeLinearFuzz meldet die quadratische Form als Verdacht", (ctx) => {
    const f = mitLastSchutz(ctx, () => pruefeLinearFuzz((s) => quadratisch(`graph TD\n${s}\nA-->B`), { alphabet: ["\n", "x"], maxLaenge: 1, verschachtelt: false }));
    expect(f.linear).toBe(false);
    expect(f.verdaechtig.map((v) => v.einheit)).toContain("\n");
  }, FUZZ_MS);
});
