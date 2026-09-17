/**
 * GUI-Smoke-Treiber — faehrt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand (CORE-TEST-02 b).
 *
 * Was er prueft, das die vitest-Suite strukturell nicht kann: dieses Plugin rendert seine
 * Folien in einem `sandbox="allow-same-origin"`-iframe, misst darin mit echten
 * Schrift-Metriken und exportiert aus demselben Artefakt. `vitest` laeuft hier mit
 * `environment: "node"` — kein DOM, kein iframe, keine `fonts.ready`. Alles zwischen
 * "das Deck ist geparst" und "die Folie steht im Fenster" ist deshalb bis hierher
 * ungeprueft gewesen.
 *
 * ## Voraussetzung
 *
 * ⚠️ **Zuerst pruefen, wer sonst an Obsidian haengt.** Der Quit trifft die Instanz, an der
 * moeglicherweise eine andere Session arbeitet, und zerstoert deren Zustand — der eigene
 * Lauf ist danach sauber gruen, der Schaden faellt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "laeuft bereits — NICHT beenden"
 * curl -s http://127.0.0.1:9222/json/list | grep -o '"title":[^,]*'   # wen trifft ein Quit?
 * ```
 *
 * Hoert der Port schon, dann **mitnutzen statt neu starten** — dieser Smoke braucht keinen
 * frischen Start. Fehlt nur der Ziel-Vault, oeffnet ihn ein zusaetzliches Fenster derselben
 * Instanz:
 *
 * ```bash
 * open "obsidian://open?vault=slide-deck"                    # registrierter Vault
 * open "obsidian://open?path=<datei-im-vault>"               # frisch gebauter, unbekannter
 * ```
 *
 * Muss es doch eine eigene Instanz sein (Absturz reproduzieren, dutzendfach neu laden): die
 * Sperre haengt am Profil, nicht am Rechner — mit eigenem `--user-data-dir` und eigenem Port
 * laeuft eine zweite Instanz neben der regulaeren (Rezept in der `AGENTS.md` des Dachs).
 *
 * ```bash
 * npm run build && OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/slide-deck npm run deploy
 * npm run smoke:gui -- --vault slide-deck
 * npm run smoke:gui -- --section vorschau --keep
 * ```
 *
 * Der Vault entsteht aus dem getrackten Fixture: `npm run shots:obsidian -- --setup` baut ihn
 * (dieselbe Quelle, `docs/images/fixture/`), damit dieser Lauf nicht vom Arbeitsvault abhaengt.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Cdp,
  attachTo,
  closeExtraLeaves,
  notices,
  openExisting,
  pollUntil,
  setPluginSetting,
} from "../../tools/obsidian-cdp/cdp.js";
import { requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";
// Das Woerterbuch selbst, nicht eine Kopie seiner Form: daraus kommen sowohl die exakten
// Schluessel als auch die Praefix-Liste fuer B2. Eine im Treiber gepflegte Musterliste waere
// beim naechsten neuen Namensraum still blind — und genau diese Sorte Blindheit misst B2.
import { STRINGS_DE, STRINGS_EN } from "../src/i18n";

const PLUGIN_ID = "slide-deck";
// Seit Welle 6 (Hub-Tab-Leiste, `src/hub-view.ts`): ein View-Typ fuer Vorschau UND Erzeugen,
// Tabs statt getrennter Leaves. Alle Pruefpunkte unten suchen weiterhin per Klassen-Selektor
// (`.sd-message`, `.sd-warn`, …) innerhalb `leaf.view.containerEl` — das findet sie unabhaengig
// davon, ob sie eine Ebene tiefer im Hub-Panel liegen. `openPreview()` schaltet den Tab explizit.
const VIEW_TYPE = "slide-deck-hub";
/** Fixture-Notizen (docs/images/fixture/notes/ — buildVault legt sie flach in den Vault). */
const DECK_NOTE = "Quarterly Review.md";
const OVERFLOW_NOTE = "Overflow example.md";
/** Die Folienzahl steht im Fixture, nicht im Code: fuenf `---`-getrennte Abschnitte. */
const DECK_SLIDES = 5;
/** Der Pruefling fuer die 0.5.0-Regressionen (eigener Layoutname, Modifier, Bild in Spalten).
 *  Er liegt getrackt unter docs/themes/ und wird zur LAUFZEIT in den Vault geschrieben, statt
 *  als zweite Kopie im Fixture zu liegen — eine Kopie hiesse: die Quelle aendert sich, der
 *  Smoke misst weiter den alten Stand und meldet ihn als aktuell. */
const REGRESSION_SRC = join("docs", "themes", "regression-deck.md");
const REGRESSION_NOTE = "Regression deck.md";
const REGRESSION_SLIDES = 5;
/** Folien-Indizes (0-basiert) im Regressions-Deck, aus der Datei abgelesen. */
const REGRESSION_MOD_SLIDE = 3;      // D · `<!-- layout: default sand -->` → .sd-mod-sand
const REGRESSION_CUSTOM_LAYOUT = 4;  // E · `<!-- layout: tagesordnung -->` → info, kein Streifen
/** Was der Modifier im Export sichtbar machen soll: eine Farbe, die kein Theme traegt. */
const MOD_PROBE_CSS = ".sd-slide.sd-mod-sand { background: #d81b60 !important; }";
const MOD_PROBE_RGB: [number, number, number] = [216, 27, 96];

/** Abschnitt M — der Ordner-Theme-Pruefling. Eigene Probefarbe, bewusst NICHT die des
 *  Modifiers: taeuchten in einem Protokoll zwei Punkte mit derselben Farbe auf, waere bei
 *  einem roten Lauf nicht mehr zu sehen, welcher Weg sie dorthin gebracht hat. */
const MERMAID_THEME_KEY = "zz-mermaid-probe";
const MERMAID_NOTE = "Mermaid probe.md";
const MERMAID_PROBE_RGB: [number, number, number] = [0, 131, 143];

/** M3 — die Segmentfarbe des `pie`-Pruflings. Wieder eine eigene: M1/M2 messen die
 *  ABGELEITETE Farbe (Token → Mermaid), M3 die DEKLARIERTE (`sd-mermaid-var`). Traegen beide
 *  dieselbe Farbe, belegt ein gruenes M3 nicht mehr, dass die Deklaration ueberhaupt
 *  gegriffen hat — die Ableitung haette denselben Wert geliefert. */
const PIE_NOTE = "Mermaid pie probe.md";
const PIE_PROBE_RGB: [number, number, number] = [255, 87, 34];
/** Ab wie vielen voll deckenden Pixeln das Segment als "durchgetragen" gilt. Die einmalige
 *  Messung vom 2026-09-04 lieferte 245.306 mit und 2.025 ohne die Direktive; die Schwelle
 *  liegt zwei Groessenordnungen unter dem Ja-Fall und eine ueber dem Nein-Fall, damit weder
 *  ein anderes Folienformat noch ein Antialias-Saum sie kippt. */
const PIE_VOLL_MIN = 20_000;

/** M4 — der `sender:`-Slot. Der Text ist absichtlich unverwechselbar: er wird im
 *  gerenderten Deck per `textContent` gesucht, und ein Allerweltswort koennte aus einer
 *  Fuss- oder Kopfzeile stammen. */
const SENDER_NOTE = "Sender probe.md";
const SENDER_TEXT = "Zz Probe Absender";

/** M5 — der theme-eigene Modifier. NICHT `sand` wie im Regressions-Deck (A8/D2): derselbe
 *  Name in zwei Punkten macht eine rote Zeile mehrdeutig. */
const MOD_NOTE = "Modifier probe.md";
const THEME_MOD = "zzprobe";

interface ThemeOpts {
  /** ausdrueckliche `sd-mermaid`-Angabe (M2) */
  pin?: boolean;
  /** `/* sd-modifiers: … *\/` deklarieren (M5) */
  modifiers?: readonly string[];
  /** `pie1` auf die Probefarbe setzen (M3 — beide Faelle) */
  pie?: boolean;
  /** zusaetzlich `pieOpacity 1` (M3 — nur der Ja-Fall) */
  pieOpacity?: boolean;
}

/** Das Ordner-Theme des Pruefpunkts. Zwei Eigenschaften sind Absicht, nicht Zufall:
 *  die Farbe kommt ueber eine `var()`-Kette, und `--sd-surface` ist zweimal deklariert.
 *  Genau daran waere der billigere Weg gescheitert, der bei der Entscheidung zur Wahl stand
 *  (Regex im Pure-Core): er haette den Literaltext "var(--probe-akzent)" an Mermaid gereicht
 *  und die zweite Deklaration nicht als Sieger der Kaskade erkannt. `getComputedStyle` loest
 *  beides auf, weil der Browser es ohnehin tut. Der Pruefpunkt misst damit nicht nur, DASS
 *  die Ableitung wirkt, sondern den Fall, fuer den sie so gebaut wurde.
 *
 *  Die vier Schalter erzeugen die Faelle von M1–M3 und M5 aus EINER Quelle. Getrennte
 *  Vorlagen waeren die naheliegende Alternative und die schlechtere: die Punkte messen
 *  Unterschiede zwischen zwei Faellen, und zwei Vorlagen koennen unbemerkt in mehr als dem
 *  gemessenen Merkmal auseinanderlaufen. */
function mermaidThemeCss(opts: ThemeOpts = {}): string {
  const kopf = [
    opts.pin ? "/* sd-mermaid: dark */" : "",
    opts.modifiers?.length ? `/* sd-modifiers: ${opts.modifiers.join(" ")} */` : "",
    opts.pie ? `/* sd-mermaid-var: pie1 ${rgbCss(PIE_PROBE_RGB)} */` : "",
    opts.pieOpacity ? "/* sd-mermaid-var: pieOpacity 1 */" : "",
  ].filter(Boolean);
  return `${kopf.map((z) => z + "\n").join("")}/* sd-base: 24px */
:root { --probe-akzent: #00838f; --probe-tinte: #101014; }
.sd-slide {
  --sd-surface: #999999;
  --sd-surface: var(--probe-akzent);
  --sd-fg: var(--probe-tinte);
  --sd-muted: #5a5a66;
  --sd-bg: #fdfdfd;
  --sd-code-bg: #eceff4;
  --sd-font: "Inter", sans-serif;
  background: var(--sd-bg);
  color: var(--sd-fg);
}
.sd-slide.sd-mod-${THEME_MOD} { letter-spacing: 0.01em; }
`;
}

function rgbCss(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Die Pruefnotiz: eine Folie, ein Mermaid-Block, das Ordner-Theme in der Frontmatter. */
const MERMAID_NOTE_MD = `---
theme: ${MERMAID_THEME_KEY}
---

# Mermaid probe

\`\`\`mermaid
flowchart LR
  A[Erste] --> B[Zweite]
\`\`\`
`;

/** M3 — EIN Segment, damit die gemessene Flaeche der Vollkreis ist und nicht davon abhaengt,
 *  wohin Mermaid welchen Sektor legt. Gezaehlt werden Pixel im ganzen Bild, nicht an einer
 *  Koordinate: wo der Kreis im PNG sitzt, haengt an Diagrammgroesse und Layout, die Menge
 *  seiner Pixel nicht. */
const PIE_NOTE_MD = `---
theme: ${MERMAID_THEME_KEY}
---

\`\`\`mermaid
pie
  "Anteil" : 100
\`\`\`
`;

/** M4 — `sender:` traegt einen eigenen Slot; `header:` steht daneben, damit der Punkt nicht
 *  gruen wird, weil ueberhaupt kein Slot gerendert wird. */
const SENDER_NOTE_MD = `---
sender: ${SENDER_TEXT}
header: Zz Probe Kopf
---

# Sender probe

Eine Folie, zwei Slots.
`;

/** M5 — ein Modifier, den der Kern nicht kennt und das Theme deklariert. */
const MOD_NOTE_MD = `---
theme: ${MERMAID_THEME_KEY}
---

<!-- layout: default ${THEME_MOD} -->

# Modifier probe

Der Modifier steht im Theme, nicht im Kern.
`;

// --- Protokoll ---------------------------------------------------------------

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Luecke nicht wie
 *  Abdeckung aussieht — ein stillschweigend ausgelassener Punkt liest sich hinterher
 *  wie ein gruener. */
function skipped(name: string, reason: string): void {
  console.log(`  – ${name} — uebersprungen: ${reason}`);
}

// --- Helfer ------------------------------------------------------------------

/** Vom Lauf angelegte Ordner und Notizen — im `finally` in den PAPIERKORB, nie hart geloescht. */
const erzeugtePfade: string[] = [];

/** Ausdruck, der im Renderer das Deck-iframe der Vorschau greift. Immer ueber den
 *  plugin-eigenen Anker (`.sd-deck-iframe` im Container der eigenen View), nie ueber eine
 *  nackte Obsidian-Klasse — sonst misst der Punkt irgendein fremdes iframe und ist
 *  gruen am Falschen. */
const DECK_DOC = `
  const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
  const frame = leaf && leaf.view.containerEl.querySelector("iframe.sd-deck-iframe");
  const deck = frame && frame.contentDocument;
`;

/** Die Vorschau oeffnen und warten, bis wirklich Folien darin stehen — der Blattwechsel
 *  allein beweist nichts, die View existiert vor ihrem ersten Rendern.
 *  Form uebernommen aus `scripts/shots-obsidian.ts` (openPreview), wo sie erprobt ist:
 *  ohne das `refresh()` zeigt die Vorschau das zuletzt gerenderte Deck weiter und der
 *  Lauf misst die vorige Notiz, waehrend er Erfolg meldet. */
async function openPreview(cdp: Cdp, note: string): Promise<number> {
  if (!(await openExisting(cdp, note, "source"))) throw new Error(`Notiz fehlt im Vault: ${note}`);
  await cdp.evaluate(`
    await app.commands.executeCommandById("${PLUGIN_ID}:open-preview");
    const rechts = app.workspace.rightSplit;
    if (rechts) {
      if (rechts.collapsed) rechts.expand();
      if (typeof rechts.setSize === "function") rechts.setSize(640);
    }
    await new Promise((r) => setTimeout(r, 900));
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    if (leaf && typeof leaf.view.refresh === "function") await leaf.view.refresh();
    return true;
  `);
  const folien = await pollUntil<number>(cdp, `
    ${DECK_DOC}
    return deck ? deck.querySelectorAll(".sd-slide").length : 0;
  `, 25_000);
  return folien ?? 0;
}

/** Der sichtbare Meldungstext des Pruflings, mitzuliefern bei JEDEM Fehlschlag
 *  (CORE-TEST-14): eine Bilanzzeile "0 Folien" neben einem ungelesenen Klartext ist eine
 *  Fehldiagnose mit Zahl. `.sd-message` traegt hier den Grund, `.sd-warn` die Warnungen. */
async function diagnose(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`
    ${DECK_DOC}
    const meldung = leaf ? leaf.view.containerEl.querySelector(".sd-message") : null;
    const teile = [
      "vault=" + app.vault.getName(),
      "datei=" + (app.workspace.getActiveFile() ? app.workspace.getActiveFile().path : "-"),
      "vorschau=" + Boolean(leaf),
      "folien=" + (deck ? deck.querySelectorAll(".sd-slide").length : 0),
    ];
    const text = meldung && meldung.textContent.trim();
    if (text) teile.push("meldung=" + JSON.stringify(text));
    return teile.join(" · ");
  `);
}

/** Den Regressions-Pruefling in den Vault schreiben (oder auf den Repo-Stand bringen) und
 *  fuer den Papierkorb vormerken. Der Inhalt geht als String durch CDP — 42 KB, die Bilder
 *  stecken als data:-URI darin, deshalb braucht der Pruefling weder Assets noch Netz. */
async function ensureRegressionNote(cdp: Cdp): Promise<void> {
  const inhalt = readFileSync(join(process.cwd(), REGRESSION_SRC), "utf8");
  const angelegt = await cdp.evaluate<boolean>(`
    const pfad = ${JSON.stringify(REGRESSION_NOTE)};
    const inhalt = ${JSON.stringify(inhalt)};
    const da = app.vault.getAbstractFileByPath(pfad);
    if (da) { await app.vault.modify(da, inhalt); return false; }
    await app.vault.create(pfad, inhalt);
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `);
  if (angelegt) erzeugtePfade.push(REGRESSION_NOTE);
}

/** Die Theme-Registry neu einlesen und die offene Vorschau nachziehen. Das Plugin tut das
 *  von sich aus bei `create`/`delete`/`rename` unter dem Themes-Ordner — aber NICHT bei
 *  `modify`, und M2 aendert eine bestehende Datei. Ohne diesen Aufruf misst M2 das Theme
 *  von M1 und ist gruen, ohne seinen Gegenstand je gesehen zu haben. */
async function refreshThemes(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    if (typeof plugin.refreshThemes === "function") await plugin.refreshThemes();
    await new Promise((r) => setTimeout(r, 800));
    return true;
  `);
}

interface MermaidKnoten { fill: string; knoten: number }

/** Die Fuellfarbe der Mermaid-Knoten aus dem GERENDERTEN SVG im Deck-iframe.
 *
 *  `getComputedStyle`, nicht das `fill`-Attribut: Mermaid schreibt seine Farben teils als
 *  Attribut, teils in ein `<style>` innerhalb der Grafik, und welchen Weg es waehlt, haengt
 *  an der Diagrammart. Der berechnete Wert deckt beide ab.
 *
 *  Der Aufruf steht in `pollUntil`, weil Mermaid asynchron rendert: `renderMermaidSlots`
 *  laeuft nach dem Folienaufbau, und zwischen "Folie steht" und "Grafik steht" liegt ein
 *  Fenster, in dem hier nichts zu finden waere — ein Punkt ohne Warten waere zufaellig rot. */
async function mermaidKnoten(cdp: Cdp): Promise<MermaidKnoten | null> {
  return pollUntil<MermaidKnoten>(cdp, `
    ${DECK_DOC}
    if (!deck) return null;
    const svg = deck.querySelector(".sd-mermaid svg, svg[id^='sd-mermaid']");
    if (!svg) return null;
    const knoten = svg.querySelectorAll(".node rect, .node polygon, .basic.label-container, rect.basic");
    if (knoten.length === 0) return null;
    return { fill: deck.defaultView.getComputedStyle(knoten[0]).fill, knoten: knoten.length };
  `, 20_000);
}

/** "rgb(r, g, b)" gegen ein Zieltripel, mit derselben Toleranz wie der Pixel-Vergleich in D2
 *  (Rundung beim Rendern). Ein nicht lesbarer String ist FALSCH, nicht gleich — sonst waere
 *  ein Punkt gruen, weil die Messung misslang. */
function nahAn(rgb: string, ziel: [number, number, number]): boolean {
  const teile = rgb.match(/\d+/g)?.slice(0, 3).map(Number);
  return Boolean(teile) && teile!.length === 3 && teile!.every((v, i) => Math.abs(v - ziel[i]) <= 8);
}

interface WarnRow { sev: string; title: string; text: string }

/** Die Warnzeilen der Vorschau mit Schwere-Klasse, `title` und Text. */
const WARN_ROWS = `
  const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
  const rows = leaf ? [...leaf.view.containerEl.querySelectorAll(".sd-warn")] : [];
  const warnRows = rows.map((r) => ({
    sev: ([...r.classList].find((c) => c.startsWith("sd-warn-sev-")) || "").replace("sd-warn-sev-", ""),
    title: r.getAttribute("title") || "",
    text: r.textContent.trim(),
  }));
`;

/** Das Wort, das der `title` einer Warnzeile tragen muss — EN oder DE, je App-Sprache.
 *  Beide Woerterbuecher zulassen, statt die Sprache zu raten: falsch geraten waere rot am
 *  Werkzeug, und das Wort selbst kommt so oder so aus `i18n.ts`, nicht aus dem Treiber. */
function severityWords(sev: string): string[] {
  return [STRINGS_EN[`warn.severity.${sev}`], STRINGS_DE[`warn.severity.${sev}`]].filter(Boolean) as string[];
}

/** Streifen am Folienrand, gemessen am EFFEKT: der Vorschau-Chrome zeichnet ihn als
 *  `inset`-box-shadow in die Folie. Klasse allein reicht nicht — ohne PREVIEW_CHROME_CSS
 *  im iframe raegt sie inert mit und faerbt nichts. */
const STRIPE = (index: number): string => `
  ${DECK_DOC}
  const folie = deck ? deck.querySelectorAll(".sd-slide")[${index}] : null;
  if (!folie) return { da: false, klassen: "", schatten: "" };
  return { da: true, klassen: folie.className, schatten: getComputedStyle(folie).boxShadow };
`;
interface Stripe { da: boolean; klassen: string; schatten: string }

/** (a) Schluessel, die es im Woerterbuch gibt und die trotzdem als Text dastehen. */
function bekannteSichtbar(text: string): string[] {
  return Object.keys(STRINGS_EN).filter((key) => text.includes(key));
}

/** (b) Schluessel, die es NICHT gibt: erkennbar an einem bekannten Namensraum vor dem Punkt.
 *  Die Praefixe kommen aus dem Woerterbuch, damit ein neuer Namensraum nicht uebersehen wird.
 *
 *  ⚠️ **Kein `\b` vor dem Praefix** — die erste Fassung hatte eines und fand nichts, obwohl der
 *  rohe Schluessel dastand. `textContent` klebt die Texte benachbarter Knoten ohne Trenner
 *  aneinander; im Tab steht deshalb "...-Keysettings.themesFolder.name", und zwischen "y" und
 *  "s" ist keine Wortgrenze. Gefunden hat das erst die Gegenprobe: bei entferntem Schluessel
 *  blieb der Punkt gruen. Ein Falschtreffer waere hier ohnehin das kleinere Uebel — er wird
 *  laut und untersucht, ein verpasster Treffer nicht. */
function unbekannteSichtbar(text: string): string[] {
  const praefixe = [...new Set(Object.keys(STRINGS_EN).map((k) => k.split(".")[0]))];
  const muster = new RegExp(`(?:${praefixe.join("|")})(?:\\.[a-zA-Z][a-zA-Z0-9]*){2,}`, "g");
  return text.match(muster) ?? [];
}

// --- Prüfpunkte --------------------------------------------------------------

interface Section {
  key: string;
  title: string;
  run: (cdp: Cdp, ctx: Ctx) => Promise<void>;
}

interface Ctx {
  port: number;
  vault?: string;
}

/** A — die Vorschau. Der Weg Notiz → Deck → iframe, den kein Unit-Test sieht. */
const vorschau: Section = {
  key: "vorschau",
  title: "A · Vorschau (iframe-Naht)",
  async run(cdp) {
    const folien = await openPreview(cdp, DECK_NOTE);

    const ort = await cdp.evaluate<string>(`
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      if (!leaf) return "keine View";
      const rechts = app.workspace.rightSplit;
      return leaf.getRoot() === rechts ? "rechte Seitenleiste" : "anderer Split";
    `);
    record("A1 Vorschau oeffnet in der rechten Seitenleiste", ort === "rechte Seitenleiste", ort);

    record(
      `A2 Deck rendert im isolierten iframe (${DECK_SLIDES} Folien erwartet)`,
      folien === DECK_SLIDES,
      folien === DECK_SLIDES ? `${folien} Folien` : `${folien} Folien · ${await diagnose(cdp)}`,
    );

    // A3 misst die Kernzusage des Plugins: das Vault-Theme erreicht die Folien nicht.
    // Gemessen wird am EFFEKT (Hintergrundfarbe im iframe), und die Gegenkontrolle gehoert
    // dazu: aendert sich die Elternfarbe nicht mit, hat der Punkt keinen Gegenstand und
    // waere ausgerechnet im Defektfall gruen.
    const isolation = await cdp.evaluate<{ elternVor: string; elternNach: string; deckVor: string; deckNach: string; fehler?: string }>(`
      ${DECK_DOC}
      if (!deck) return { elternVor: "", elternNach: "", deckVor: "", deckNach: "", fehler: "kein Deck-iframe" };
      const folie = deck.querySelector(".sd-slide");
      if (!folie) return { elternVor: "", elternNach: "", deckVor: "", deckNach: "", fehler: "keine Folie im iframe" };
      const lies = () => ({
        eltern: getComputedStyle(document.body).backgroundColor,
        deck: getComputedStyle(folie).backgroundColor,
      });
      const vor = lies();
      // Die fluechtigste Ebene waehlen: app.changeTheme() schriebe nach appearance.json und
      // machte aus einem system-folgenden Vault einen fest eingestellten.
      const war = document.body.classList.contains("theme-dark");
      document.body.classList.toggle("theme-dark", !war);
      document.body.classList.toggle("theme-light", war);
      app.workspace.trigger("css-change");
      await new Promise((r) => setTimeout(r, 900));
      const nach = lies();
      document.body.classList.toggle("theme-dark", war);
      document.body.classList.toggle("theme-light", !war);
      app.workspace.trigger("css-change");
      await new Promise((r) => setTimeout(r, 400));
      return { elternVor: vor.eltern, elternNach: nach.eltern, deckVor: vor.deck, deckNach: nach.deck };
    `);
    const elternWechselte = isolation.elternVor !== isolation.elternNach && isolation.elternVor !== "";
    const deckBlieb = isolation.deckVor === isolation.deckNach && isolation.deckVor !== "";
    record(
      "A3 Vault-Theme erreicht die Folien nicht",
      elternWechselte && deckBlieb,
      isolation.fehler
        ? isolation.fehler
        : `Obsidian ${isolation.elternVor} → ${isolation.elternNach}` +
          ` · Folie ${isolation.deckVor} → ${isolation.deckNach}` +
          (elternWechselte ? "" : " · ACHTUNG: das Eltern-Theme wechselte nicht, der Punkt hatte keinen Gegenstand"),
    );

    // A4: Fremd-CSS (highlight.js) kommt ueber deckCss in den iframe. Gemessen an der
    // Wirkung — ein gefaerbtes Token —, nicht an der Existenz eines <style>-Knotens.
    const hljs = await cdp.evaluate<{ gefunden: boolean; token: string; text: string }>(`
      ${DECK_DOC}
      if (!deck) return { gefunden: false, token: "", text: "" };
      const pre = deck.querySelector("pre code.hljs, code.hljs, .hljs");
      if (!pre) return { gefunden: false, token: "", text: "" };
      const span = pre.querySelector("span[class^='hljs-'], span[class*=' hljs-']");
      return {
        gefunden: Boolean(span),
        token: span ? getComputedStyle(span).color : "",
        text: getComputedStyle(pre).color,
      };
    `);
    record(
      "A4 Code-Hervorhebung erreicht den iframe",
      hljs.gefunden && hljs.token !== "" && hljs.token !== hljs.text,
      hljs.gefunden ? `Token ${hljs.token} vs. Fliesstext ${hljs.text}` : "kein hljs-Token im Deck gefunden",
    );

    // A5: fit-or-warn. Die Warnung traegt ein Formzeichen, nicht nur eine Farbe — das ist
    // die WCAG-1.4.1-Zusage, die das Plugin den Callouts nebenan gibt.
    const folienOverflow = await openPreview(cdp, OVERFLOW_NOTE);
    const warn = await cdp.evaluate<{ anzahl: number; text: string; zeichen: boolean }>(`
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      const rows = leaf ? [...leaf.view.containerEl.querySelectorAll(".sd-warn")] : [];
      const text = rows.map((r) => r.textContent.trim()).join(" | ");
      return { anzahl: rows.length, text, zeichen: /[▲●ℹ]/.test(text) };
    `);
    record(
      "A5 Overflow wird gewarnt, nicht beschnitten",
      warn.anzahl > 0 && warn.zeichen,
      warn.anzahl > 0
        ? `${warn.anzahl} Warnung(en): ${warn.text.slice(0, 120)}`
        : `keine Warnung · ${folienOverflow} Folien · ${await diagnose(cdp)}`,
    );

    // A6: die Farbe der Warnung ist ihre SCHWERE, nicht ihre Art — `error` zeichnet einen
    // roten Streifen in die Folie. Gemessen am Effekt (inset-Schatten im iframe), und die
    // Warnzeile muss den Schwere-Namen als `title` tragen (zweiter Kanal neben Farbe und
    // Formzeichen, WCAG 1.4.1). Das Deck ist noch die Overflow-Notiz aus A5.
    const rot = await cdp.evaluate<Stripe>(STRIPE(0));
    const zeilenOverflow = await cdp.evaluate<WarnRow[]>(`${WARN_ROWS} return warnRows;`);
    const errorZeile = zeilenOverflow.find((r) => r.sev === "error");
    const rotStreifen = rot.da && /(^|\s)sd-slide-warn(\s|$)/.test(rot.klassen) && /inset/.test(rot.schatten);
    const errorTitel = Boolean(errorZeile) && severityWords("error").includes(errorZeile!.title);
    record(
      "A6 Overflow-Folie traegt den roten Streifen, Warnzeile den Schwere-Namen als title",
      rotStreifen && errorTitel,
      !rot.da
        ? "keine Folie im iframe"
        : `Folie: ${/inset/.test(rot.schatten) ? "inset-Schatten" : "KEIN inset-Schatten"} (${rot.klassen})` +
          ` · title="${errorZeile ? errorZeile.title : "(keine error-Zeile)"}" erwartet ${JSON.stringify(severityWords("error"))}`,
    );

    // A7: das Dropdown schaltet ephemer — Wirkung sofort sichtbar, Notiz unangetastet.
    // Zwei Haelften, weil genau die Trennung die dokumentierte Zusage ist ("Setzen"
    // schreibt, das Dropdown nicht).
    await openPreview(cdp, DECK_NOTE);
    const wechsel = await cdp.evaluate<{ von: string; nach: string; vorher: string; nachher: string; frontmatter: string; fehler?: string }>(`
      ${DECK_DOC}
      const select = leaf && leaf.view.containerEl.querySelector("select.sd-toolbar-theme");
      if (!deck || !select) return { von: "", nach: "", vorher: "", nachher: "", frontmatter: "", fehler: "Dropdown oder Deck fehlt" };
      const folie = deck.querySelector(".sd-slide");
      const vorher = getComputedStyle(folie).backgroundColor;
      const aktuell = select.value;
      const andere = [...select.options].map((o) => o.value).filter((v) => v && v !== aktuell);
      if (!andere.length) return { von: aktuell, nach: "", vorher, nachher: "", frontmatter: "", fehler: "nur ein Theme im Dropdown" };
      select.value = andere[0];
      select.dispatchEvent(new Event("change"));
      await new Promise((r) => setTimeout(r, 1500));
      const frame2 = leaf.view.containerEl.querySelector("iframe.sd-deck-iframe");
      const folie2 = frame2 && frame2.contentDocument && frame2.contentDocument.querySelector(".sd-slide");
      const nachher = folie2 ? getComputedStyle(folie2).backgroundColor : "";
      const datei = app.vault.getAbstractFileByPath(${JSON.stringify(DECK_NOTE)});
      const inhalt = await app.vault.read(datei);
      const treffer = inhalt.match(/^theme:\\s*(\\S+)/m);
      return { von: aktuell, nach: andere[0], vorher, nachher, frontmatter: treffer ? treffer[1] : "(keine)" };
    `);
    const sichtbar = wechsel.vorher !== "" && wechsel.nachher !== "" && wechsel.vorher !== wechsel.nachher;
    const ephemer = wechsel.frontmatter === wechsel.von;
    record(
      "A7 Theme-Dropdown wirkt sofort und laesst die Notiz in Ruhe",
      sichtbar && ephemer,
      wechsel.fehler
        ? wechsel.fehler
        : `${wechsel.von} → ${wechsel.nach}: ${wechsel.vorher} → ${wechsel.nachher}` +
          ` · Frontmatter bleibt "${wechsel.frontmatter}"` +
          (sichtbar ? "" : " · ACHTUNG: kein sichtbarer Unterschied") +
          (ephemer ? "" : " · ACHTUNG: die Notiz wurde geschrieben"),
    );

    // A8: der Erweiterungsweg darf nicht wie ein Defekt aussehen. Ein Theme darf eigene
    // Layoutnamen fuehren; der Kern reicht sie als `info` durch — und `info` faerbt nichts.
    // Vor deck-core 0.5.0 stand hier ein amber Streifen (`layout-unknown` nach kind gefaerbt).
    // Der Punkt hat nur dann einen Gegenstand, wenn die info-Zeile da ist: fehlt sie, wurde
    // der Name gar nicht als unbekannt erkannt, und "kein Streifen" bewiese nichts.
    await ensureRegressionNote(cdp);
    const folienRegression = await openPreview(cdp, REGRESSION_NOTE);
    const eigen = await cdp.evaluate<Stripe>(STRIPE(REGRESSION_CUSTOM_LAYOUT));
    const zeilenRegression = await cdp.evaluate<WarnRow[]>(`${WARN_ROWS} return warnRows;`);
    const infoZeile = zeilenRegression.find((r) => r.sev === "info" && r.text.includes(`#${REGRESSION_CUSTOM_LAYOUT + 1}`));
    const ohneStreifen = eigen.da && !/sd-slide-warn/.test(eigen.klassen) && !/inset/.test(eigen.schatten);
    const infoTitel = Boolean(infoZeile) && severityWords("info").includes(infoZeile!.title);
    record(
      "A8 Eigener Layoutname: Hinweiszeile (info), aber kein Streifen an der Folie",
      folienRegression === REGRESSION_SLIDES && ohneStreifen && infoTitel,
      folienRegression !== REGRESSION_SLIDES
        ? `${folienRegression} Folien statt ${REGRESSION_SLIDES} · ${await diagnose(cdp)}`
        : `Folie ${REGRESSION_CUSTOM_LAYOUT + 1}: ${ohneStreifen ? "kein Streifen" : "GESTREIFT"} (${eigen.klassen})` +
          ` · info-Zeile ${infoZeile ? `"${infoZeile.text.slice(0, 70)}" title="${infoZeile.title}"` : "FEHLT"}`,
    );
  },
};

/** M — Mermaid-Farben eines ORDNER-Themes. Der Prueffall, den `deck-core` strukturell nicht
 *  fuehren kann: `mermaidVarsFromDocument` haengt eine `.sd-slide`-Sonde ins Deck-Dokument und
 *  liest die Tokens per `getComputedStyle` — ohne Browser gibt es nichts zu messen, und
 *  `vitest` laeuft dort wie hier mit `environment: "node"`.
 *
 *  Warum das ein eigener Abschnitt ist und nicht ein Punkt in A: er stellt seinen Gegenstand
 *  selbst her (Theme-Datei + Notiz), und er misst am gerenderten SVG, nicht am CSS. Mermaid
 *  inlined seine Farben in die Grafik; eine CSS-Regel im Deck erreicht sie nicht. Genau
 *  deshalb existiert die Token-Ableitung ueberhaupt. */
const mermaid: Section = {
  key: "mermaid",
  title: "M · Mermaid-Farben aus Theme-Tokens",
  async run(cdp) {
    const themesFolder = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.themesFolder;
    `);
    const cssPfad = `${themesFolder}/${MERMAID_THEME_KEY}.css`;

    // Ordner und Dateien anlegen — ueber den Vault, nicht ueber `fs`: der Treiber kann per
    // --vault an jedes Fenster andocken, und dann liegt der Vault nicht dort, wo dieses
    // Skript ihn vermuten wuerde. Alles Angelegte geht ins Papierkorb-Protokoll.
    const dateien: Array<[string, string]> = [
      [cssPfad, mermaidThemeCss()],
      [MERMAID_NOTE, MERMAID_NOTE_MD],
      [PIE_NOTE, PIE_NOTE_MD],
      [SENDER_NOTE, SENDER_NOTE_MD],
      [MOD_NOTE, MOD_NOTE_MD],
    ];
    const angelegt = await cdp.evaluate<{ ordner: boolean; neu: string[] }>(`
      const ordner = ${JSON.stringify(themesFolder)};
      const neuerOrdner = !(await app.vault.adapter.exists(ordner));
      if (neuerOrdner) await app.vault.createFolder(ordner);
      const neu = [];
      for (const [pfad, inhalt] of ${JSON.stringify(dateien)}) {
        const da = app.vault.getAbstractFileByPath(pfad);
        if (da) await app.vault.modify(da, inhalt);
        else { await app.vault.create(pfad, inhalt); neu.push(pfad); }
      }
      await new Promise((r) => setTimeout(r, 600));
      return { ordner: neuerOrdner, neu };
    `);
    if (angelegt.ordner) erzeugtePfade.push(themesFolder);
    for (const pfad of angelegt.neu) {
      // Der Themes-Ordner raeumt seinen Inhalt mit weg — ein zweiter Eintrag dafuer waere
      // beim Aufraeumen ein Fehlschlag auf einer laengst geloeschten Datei.
      if (angelegt.ordner && pfad.startsWith(themesFolder + "/")) continue;
      erzeugtePfade.push(pfad);
    }

    /** Das Ordner-Theme auf einen anderen Fall stellen und die Registry nachziehen. Beides
     *  gehoert zusammen: `modify` loest die Neuregistrierung NICHT aus (s. `refreshThemes`),
     *  und ein Punkt, der das vergisst, misst das Theme des vorigen Punkts und ist gruen,
     *  ohne seinen Gegenstand gesehen zu haben — am 2026-09-04 genau so passiert. */
    const stelleTheme = async (opts: ThemeOpts): Promise<void> => {
      await cdp.evaluate(`
        const datei = app.vault.getAbstractFileByPath(${JSON.stringify(cssPfad)});
        await app.vault.modify(datei, ${JSON.stringify(mermaidThemeCss(opts))});
        await new Promise((r) => setTimeout(r, 400));
        return true;
      `);
      await refreshThemes(cdp);
    };

    // M1: die Tokens des Ordner-Themes erreichen das Diagramm.
    await refreshThemes(cdp);
    await openPreview(cdp, MERMAID_NOTE);
    const m1 = await mermaidKnoten(cdp);
    record(
      "M1 Ordner-Theme faerbt das Diagramm ueber seine Tokens",
      Boolean(m1) && nahAn(m1!.fill, MERMAID_PROBE_RGB),
      m1
        ? `Knotenfuellung ${m1.fill} (${m1.knoten} Knoten) · Probe rgb(${MERMAID_PROBE_RGB.join(",")})` +
          (nahAn(m1.fill, MERMAID_PROBE_RGB) ? "" : " · ACHTUNG: die Tokens des Themes erreichen Mermaid nicht")
        : `kein Mermaid-SVG im Deck · ${await diagnose(cdp)}`,
    );

    // M2: eine ausdrueckliche `sd-mermaid`-Angabe schlaegt die Ableitung (`mermaidPinned`).
    // Ohne diesen Punkt waere M1 auch dann gruen, wenn die Ableitung eine bewusste
    // Theme-Entscheidung ueberstimmt — der Fehler, den deck-core 0.6.0 hatte und 0.6.1 behob.
    await stelleTheme({ pin: true });
    await openPreview(cdp, MERMAID_NOTE);
    const m2 = await mermaidKnoten(cdp);
    record(
      "M2 sd-mermaid-Angabe schlaegt die Token-Ableitung",
      Boolean(m2) && !nahAn(m2!.fill, MERMAID_PROBE_RGB),
      m2
        ? `Knotenfuellung ${m2.fill} (benanntes Thema "dark") · nicht rgb(${MERMAID_PROBE_RGB.join(",")})` +
          (nahAn(m2.fill, MERMAID_PROBE_RGB) ? " · ACHTUNG: die Tokens ueberstimmen die Angabe" : "")
        : `kein Mermaid-SVG im Deck · ${await diagnose(cdp)}`,
    );

    // M4: der `sender:`-Slot steht im gerenderten Deck. Er kam mit deck-core 0.9.0 und war
    // bis hierher nur am Kern belegt — dass `parseDeck` ihn liest, sagt nichts darueber, ob
    // `appendSlots` ihn baut und das Struktur-CSS ihn sichtbar macht. Gemessen wird deshalb
    // die BREITE, nicht die Existenz: eine Klasse ohne Regel haengt inert im Baum (dieselbe
    // Lehre wie beim Warn-Streifen in A7). Gegenprobe im selben Punkt, weil ein Punkt, der
    // nur die Anwesenheit prueft, auch dann gruen bliebe, wenn das Deck den Slot
    // bedingungslos baut.
    const senderFolien = await openPreview(cdp, SENDER_NOTE);
    const mitSender = await cdp.evaluate<{ da: boolean; text: string; breite: number }>(`
      ${DECK_DOC}
      const el = deck ? deck.querySelector(".sd-slide-sender") : null;
      if (!el) return { da: false, text: "", breite: 0 };
      return { da: true, text: el.textContent.trim(), breite: el.getBoundingClientRect().width };
    `);
    await openPreview(cdp, MERMAID_NOTE);
    const ohneSender = await cdp.evaluate<number>(`
      ${DECK_DOC}
      return deck ? deck.querySelectorAll(".sd-slide-sender").length : -1;
    `);
    const senderOk = mitSender.da && mitSender.text === SENDER_TEXT && mitSender.breite > 0;
    record(
      "M4 sender-Slot steht sichtbar im Deck (und fehlt ohne die Direktive)",
      senderOk && ohneSender === 0,
      senderFolien === 0
        ? `Pruefling rendert nicht · ${await diagnose(cdp)}`
        : `mit sender: ${mitSender.da ? `"${mitSender.text}" ${Math.round(mitSender.breite)}px` : "KEIN Element"}` +
          (mitSender.da && mitSender.text !== SENDER_TEXT ? ` · ACHTUNG: erwartet "${SENDER_TEXT}"` : "") +
          (mitSender.da && mitSender.breite === 0 ? " · ACHTUNG: ohne Breite — Klasse ohne Regel" : "") +
          ` · ohne sender: ${ohneSender} Elemente` +
          (ohneSender > 0 ? " · ACHTUNG: der Slot entsteht auch ohne die Direktive" : ""),
    );

    // M5: ein Theme darf seine eigenen Modifier deklarieren (`sd-modifiers`, deck-core
    // 0.9.0/0.10.0). Die Kette laeuft ueber vier Module und zwei Repos; `tests/adapter.test.ts`
    // prueft sie strukturell, aber nichts prueft, was in der VORSCHAU ankommt. Gemessen wird
    // die Warnzeile, weil sie das ist, was der Autor sieht: mit Deklaration keine, ohne eine.
    const modZeilen = async (): Promise<{ unbekannt: number; alle: number }> => cdp.evaluate(`
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      const rows = leaf ? [...leaf.view.containerEl.querySelectorAll(".sd-warn")] : [];
      return {
        unbekannt: rows.filter((r) => r.classList.contains("sd-warn-modifier-unknown")).length,
        alle: rows.length,
      };
    `);
    await stelleTheme({ modifiers: [THEME_MOD] });
    const modFolien = await openPreview(cdp, MOD_NOTE);
    const mitDekl = await modZeilen();
    // Gegenprobe: dieselbe Notiz, dasselbe Theme MINUS der einen Zeile. Ohne sie belegte der
    // Punkt nur, dass irgendetwas keine Warnung erzeugt — die Bewegung aus der
    // Consumer-Ketten-Naht in `tests/adapter.test.ts`.
    await stelleTheme({});
    await openPreview(cdp, MOD_NOTE);
    const ohneDekl = await modZeilen();
    record(
      `M5 Theme-eigener Modifier "${THEME_MOD}" warnt nicht (ohne Deklaration schon)`,
      modFolien > 0 && mitDekl.unbekannt === 0 && ohneDekl.unbekannt === 1,
      modFolien === 0
        ? `Pruefling rendert nicht · ${await diagnose(cdp)}`
        : `mit sd-modifiers: ${mitDekl.unbekannt} modifier-unknown (${mitDekl.alle} Warnzeilen)` +
          (mitDekl.unbekannt > 0 ? " · ACHTUNG: die Deklaration erreicht den Parser nicht" : "") +
          ` · ohne: ${ohneDekl.unbekannt}` +
          (ohneDekl.unbekannt === 0 ? " · ACHTUNG: es warnt auch ohne Deklaration — der Punkt misst nichts" : ""),
    );

    // M3: `sd-mermaid-var` (deck-core 0.7.0) traegt bis ins PNG. Der teuerste Punkt des
    // Abschnitts, und der einzige, der exportieren MUSS: in der Ansicht wirkt eine
    // `!important`-Regel gegen Mermaids SVG-CSS, im Export nicht (`getDiffStyle` schreibt nur
    // Abweichungen vom Default inline, und `opacity: 1` IST der Default). Am DOM gemessen
    // waere dieser Punkt gruen, waehrend der Nutzer ein blasses Segment bekommt — genau der
    // Befund vom 2026-09-04, der die Direktive ueberhaupt ausgeloest hat.
    const exportOrdner = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.exportFolder;
    `);
    const pieOrdner = `${exportOrdner}/${PIE_NOTE.replace(/\.md$/, "")}`;
    const pieBild = `${pieOrdner}/01-${PIE_NOTE.replace(/\.md$/, "")}.png`;

    /** Einmal exportieren und die voll deckenden Probe-Pixel zaehlen.
     *
     *  ⚠️ Das ALTE Bild wird vorher geloescht, und darauf steht der ganze Punkt: M3 laeuft
     *  zweimal ueber dieselbe Notiz, und ein Poll auf `exists` + `size` faende beim zweiten
     *  Mal sofort das Artefakt des ersten Laufs — beide Faelle lieferten dieselbe Zahl, der
     *  Punkt waere gruen und haette nichts gemessen (offener Befund an D1/D2, s. Cockpit).
     *  Nach dem Loeschen kann eine gefundene Datei nur die neue sein. */
    const pieVollePixel = async (): Promise<number | null> => {
      await cdp.evaluate(`
        const adapter = app.vault.adapter;
        if (await adapter.exists(${JSON.stringify(pieOrdner)})) await adapter.rmdir(${JSON.stringify(pieOrdner)}, true);
        for (const n of document.querySelectorAll(".notice")) n.remove();
        return true;
      `);
      await openPreview(cdp, PIE_NOTE);
      await cdp.evaluate(`
        await app.commands.executeCommandById("${PLUGIN_ID}:export-images");
        return true;
      `);
      return pollUntil<number>(cdp, `
        const adapter = app.vault.adapter;
        const pfad = ${JSON.stringify(pieBild)};
        if (!(await adapter.exists(pfad))) return null;
        const s = await adapter.stat(pfad);
        if (!s || s.size < 1024) return null;
        const bmp = await createImageBitmap(new Blob([await adapter.readBinary(pfad)], { type: "image/png" }));
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
        const [zr, zg, zb] = ${JSON.stringify(PIE_PROBE_RGB)};
        let voll = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - zr) <= 4 && Math.abs(d[i + 1] - zg) <= 4 && Math.abs(d[i + 2] - zb) <= 4) voll++;
        }
        // 0 waere nicht von "noch nicht geschrieben" zu unterscheiden — als -1 melden, damit
        // der Poll nicht bis zum Timeout auf ein Bild wartet, das laengst dasteht.
        return voll === 0 ? -1 : voll;
      `, 90_000, 2000);
    };

    // Der Ja-Fall stellt sein Theme SELBST her, statt den Stand des vorigen Punkts zu erben:
    // M5 hinterlaesst das Theme im Grundzustand, und ohne diese Zeile maesse der Ja-Fall ein
    // Segment ohne Probefarbe. Genau so beim ersten Lauf passiert — gefangen hat es die
    // Gegenprobe, weil sie den hoeheren Wert lieferte als der Fall, der gewinnen soll.
    await stelleTheme({ pie: true, pieOpacity: true });
    const mitVar = await pieVollePixel();
    // Gegenprobe: dasselbe Theme, dieselbe Notiz, nur ohne `pieOpacity 1`. Mermaid zeichnet
    // das Segment dann mit seiner Voreinstellung 0.7, und die Probefarbe kommt nirgends mehr
    // rein durch.
    await stelleTheme({ pie: true });
    const ohneVar = await pieVollePixel();
    if (mitVar !== null && !erzeugtePfade.includes(exportOrdner)) erzeugtePfade.push(exportOrdner);
    const genug = (n: number | null): boolean => n !== null && n >= PIE_VOLL_MIN;
    record(
      "M3 sd-mermaid-var traegt bis ins PNG (pieOpacity 1 gegen Mermaids 0.7)",
      genug(mitVar) && !genug(ohneVar) && ohneVar !== null,
      mitVar === null || ohneVar === null
        ? `kein Export-PNG (${mitVar === null ? "Ja-Fall" : "Gegenprobe"}) unter "${pieBild}" · ${await diagnose(cdp)}`
        : `mit pieOpacity: ${Math.max(mitVar, 0)} volle Probe-Pixel · ohne: ${Math.max(ohneVar, 0)}` +
          ` · Schwelle ${PIE_VOLL_MIN}` +
          (genug(mitVar) ? "" : " · ACHTUNG: die Deklaration erreicht das PNG nicht") +
          (genug(ohneVar) ? " · ACHTUNG: auch ohne sie voll deckend — der Punkt misst nicht die Direktive" : ""),
    );

    // Das Theme fuer einen etwaigen naechsten Lauf auf den Ausgangsfall zuruecksetzen. Ohne
    // das stuende bei `--keep` ein pie-gefaerbtes Theme im Vault und M1 maesse beim naechsten
    // Mal einen Zustand, den dieser Lauf hinterlassen hat.
    await stelleTheme({});
  },
};

interface TabInhalt { gefunden: boolean; text: string; endpunkte: number; placeholders: string[] }
interface OffenerTab { ziel: Cdp; eigenesFenster: boolean; tab: TabInhalt }

/** Den Plugin-Tab oeffnen und seinen Inhalt lesen. Erst im Hauptfenster nach dem Modal sehen,
 *  sonst auf das Settings-Fenster verbinden (ab Obsidian 1.13 ein eigenes Fenster). Nie ueber
 *  den Fenstertitel entscheiden — sein erstes Wort ist lokalisiert. */
async function oeffneTab(cdp: Cdp, ctx: Ctx): Promise<OffenerTab> {
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 1200));
    return true;
  `);
  let ziel: Cdp = cdp;
  let eigenesFenster = false;
  const imHauptfenster = await cdp.evaluate<boolean>(`
    return Boolean(document.querySelector(".modal.mod-settings .vertical-tab-content"));
  `);
  if (!imHauptfenster) {
    const settings = await attachTo("settings", ctx.port, ctx.vault);
    if (settings) {
      ziel = settings;
      eigenesFenster = true;
    }
  }
  const tab = await ziel.evaluate<TabInhalt>(`
    const wurzel = document.querySelector(".vertical-tab-content-container .vertical-tab-content")
      ?? document.querySelector(".vertical-tab-content");
    if (!wurzel) return { gefunden: false, text: "", endpunkte: 0, placeholders: [] };
    return {
      gefunden: true,
      text: wurzel.textContent,
      endpunkte: wurzel.querySelectorAll(".okit-ep-row").length,
      placeholders: [...wurzel.querySelectorAll("input[placeholder]")].map((i) => i.placeholder),
    };
  `);
  return { ziel, eigenesFenster, tab };
}

interface HostMessung { display: string; kinder: number; stapelt: boolean }
interface LayoutMessung {
  hosts: HostMessung[];
  /** Gegenkontrolle: ist ein GEWOEHNLICHES `.setting-item` in dieser Obsidian-Version
   *  ueberhaupt eine Flex-Row? Ohne diese Frage misst B5 nichts. */
  normalIstFlex: boolean;
  normalDisplay: string;
}

/** Das gerechnete Layout der §8-Host-Elemente. Gemessen wird der EFFEKT, nicht die Klasse:
 *  `settingBodyHost()` strippt `setting-item`, aber ob die Zeilen dann wirklich stapeln, sagt
 *  erst die Geometrie. „Stapelt" heisst: mindestens zwei Kinder, verschiedene `top`, gleiche
 *  linke Kante — nebeneinander stehende Kinder teilen sich das `top` und unterscheiden sich
 *  im `left`, das ist der Fall, den 0.6.0 gezeigt hat. */
async function hostLayout(cdp: Cdp, ctx: Ctx): Promise<LayoutMessung> {
  const offen = await oeffneTab(cdp, ctx);
  try {
    return await offen.ziel.evaluate<LayoutMessung>(`
      const wurzel = document.querySelector(".vertical-tab-content-container .vertical-tab-content")
        ?? document.querySelector(".vertical-tab-content");
      const hosts = [];
      for (const h of (wurzel ? wurzel.querySelectorAll(".sd-settings-host") : [])) {
        const kinder = [...h.children].map((k) => k.getBoundingClientRect());
        const tops = new Set(kinder.map((r) => Math.round(r.top)));
        const lefts = new Set(kinder.map((r) => Math.round(r.left)));
        hosts.push({
          display: getComputedStyle(h).display,
          kinder: kinder.length,
          // Zwei Kinder mit gleichem top und verschiedenem left stehen nebeneinander; das
          // Gegenteil ist die Zusage. Bei einem einzigen Kind ist nichts zu stapeln — der
          // Host zaehlt dann nicht als Beleg, aber auch nicht als Defekt.
          stapelt: kinder.length >= 2 && tops.size === kinder.length && lefts.size === 1,
        });
      }
      const normal = wurzel ? wurzel.querySelector(".setting-item:not(.sd-settings-host)") : null;
      const normalDisplay = normal ? getComputedStyle(normal).display : "(keins gefunden)";
      return { hosts, normalIstFlex: normalDisplay === "flex", normalDisplay };
    `);
  } finally {
    await schliesseTab(cdp, offen);
  }
}

async function schliesseTab(cdp: Cdp, offen: OffenerTab): Promise<void> {
  if (offen.eigenesFenster) offen.ziel.close();
  await cdp.evaluate(`app.setting.close(); await new Promise((r) => setTimeout(r, 500)); return true;`);
}

/** B — die Einstellungen. Ab Obsidian 1.13 ein eigenes Fenster; beide Faelle offen halten. */
const einstellungen: Section = {
  key: "einstellungen",
  title: "B · Einstellungen (i18n + Endpunkt-Editor)",
  async run(cdp, ctx) {
    const offen = await oeffneTab(cdp, ctx);
    const { tab, eigenesFenster } = offen;
    record(
      "B1 Einstellungen-Tab oeffnet",
      tab.gefunden,
      tab.gefunden
        ? `${eigenesFenster ? "eigenes Fenster" : "Modal im Hauptfenster"} · ${tab.text.length} Zeichen`
        : "kein Tab-Inhalt gefunden",
    );

    // B2 ist der Waechter fuer den Befund von CORE-TEST-04: `t()` faellt bei unbekanntem
    // Schluessel auf den SCHLUESSEL zurueck (erst EN, dann key) — in der Oberflaeche stand
    // dann "deck.settings.endpoint.status.unauthorized" und sah aus wie ein plausibler
    // String. Der Typecheck deckt seither die Endpunkt-Statusklassen ab; jeder andere
    // Schluessel faellt weiterhin nur hier auf.
    //
    // Zwei Suchen, weil ein Fall den anderen nicht abdeckt:
    //   (a) ein Schluessel, den es GIBT, aber der als Text erscheint (falscher Aufruf),
    //   (b) ein Schluessel, den es NICHT gibt — der steht per Definition nicht im
    //       Woerterbuch, also greift (a) nicht. Dafuer das Praefix-Muster, dessen
    //       Namensraeume aus demselben Woerterbuch kommen und mit ihm mitwandern.
    const rohe = tab.gefunden ? [...new Set([...bekannteSichtbar(tab.text), ...unbekannteSichtbar(tab.text)])] : [];
    record(
      "B2 Kein roher i18n-Schluessel in der Oberflaeche",
      tab.gefunden && rohe.length === 0,
      rohe.length ? `sichtbar: ${rohe.join(", ")}` : "keiner",
    );

    record(
      "B3 Endpunkt-Zeileneditor ist verdrahtet",
      tab.endpunkte > 0,
      tab.endpunkte > 0 ? `${tab.endpunkte} Zeile(n) (.okit-ep-row)` : "keine .okit-ep-row im Tab",
    );

    await schliesseTab(cdp, offen);

    // B4: der Placeholder des Modellfelds ist ein uebersetzter Satz ("Model ID such as qwen3"),
    // keine Kit-Vorgabe — er kommt aus i18n.ts. Er ist nur im OFFLINE-Fall sichtbar: sobald die
    // Probe Modelle liefert, wird das Feld zum Dropdown (globales Feld wie Kit-Zeile). Der erste
    // Lauf dieses Punkts war deshalb rot am Werkzeug, nicht am Plugin — auf dem Maintainer-
    // Rechner antwortet LM Studio auf :1234. Der Punkt stellt den Offline-Fall selbst her:
    // Endpunkt auf einen toten Port, Tab neu oeffnen, messen, zurueckstellen. Gemessen wird
    // der exakte Text gegen beide Woerterbuecher; "aehnlich" waere ein Kit-Default.
    const endpunkteVorher = await cdp.evaluate<unknown>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llmEndpoints;
    `);
    await setPluginSetting(cdp, PLUGIN_ID, "llmEndpoints", [{ url: "http://127.0.0.1:9" }]);
    let offline: OffenerTab | null = null;
    try {
      offline = await oeffneTab(cdp, ctx);
      const erwartet = [STRINGS_EN["deck.settings.model.placeholder"], STRINGS_DE["deck.settings.model.placeholder"]];
      const treffer = offline.tab.placeholders.filter((p) => erwartet.includes(p));
      record(
        "B4 Modellfeld-Placeholder ist der uebersetzte Satz aus i18n (Endpunkt offline)",
        offline.tab.gefunden && treffer.length > 0,
        treffer.length
          ? `"${treffer[0]}" (${treffer.length}x, ${offline.tab.placeholders.length} Placeholder im Tab)`
          : `keiner von ${JSON.stringify(erwartet)} · gesehen: ${JSON.stringify(offline.tab.placeholders.slice(0, 8))}`,
      );
    } finally {
      if (offline) await schliesseTab(cdp, offline);
      await setPluginSetting(cdp, PLUGIN_ID, "llmEndpoints", endpunkteVorher);
    }

    // B5: die §8-Bloecke stapeln, statt in einer Flex-Row zu landen. Das Risiko aus 0.6.0:
    // `hostFor()` reicht EIN Setting an einen Block weiter, der darin MEHRERE Zeilen zeichnet
    // — Obsidians `.setting-item` ist aber `display:flex; flex-direction:row`, und ohne das
    // Strippen dieser Klasse (`settingBodyHost`) wuerden Endpunkt-Liste, Modellfeld und
    // Denk-Schalter nebeneinander stehen statt untereinander. Im Repo praezedenzlos, von
    // keinem Unit-Test erreichbar: es ist eine Aussage ueber gerechnetes Layout.
    const layout = await hostLayout(cdp, ctx);
    const kaputt = layout.hosts.filter((h) => h.display === "flex");
    const gestapelt = layout.hosts.filter((h) => h.stapelt);
    record(
      "B5 KI-Settings-Bloecke stapeln, statt eine Flex-Row zu werden",
      layout.hosts.length > 0 && kaputt.length === 0 && gestapelt.length > 0 && layout.normalIstFlex,
      layout.hosts.length === 0
        ? "kein .sd-settings-host im Tab — der Punkt hat keinen Gegenstand"
        : !layout.normalIstFlex
          // Ohne diese Gegenkontrolle waere der Punkt tautologisch: in einer Obsidian-Version,
          // die `.setting-item` nicht mehr als Flex-Row zeichnet, waere "nicht flex" gratis
          // wahr und der Punkt gruen, ohne je etwas gemessen zu haben (Muster von A3).
          ? `Gegenkontrolle fehlgeschlagen: ein normales .setting-item ist hier "${layout.normalDisplay}", nicht flex — dann sagt "Host ist nicht flex" nichts aus`
          // Die display-Werte kommen aus der Messung, nicht aus dem Satz: eine erste Fassung
          // schrieb "alle display:block" fest und meldete das im roten Fall neben
          // "3 Host(s) sind flex" — ein Protokoll, das sich selbst widerspricht, kostet mehr
          // Zeit als eines, das schweigt.
          : `${layout.hosts.length} Host(s) display=[${layout.hosts.map((h) => h.display).join(", ")}]` +
            ` · ${gestapelt.length}/${layout.hosts.length} mit gestapelten Kindern` +
            (kaputt.length ? ` · ACHTUNG: ${kaputt.length} Host(s) sind flex` : "") +
            ` · Gegenkontrolle: normales .setting-item ist ${layout.normalDisplay}`,
    );
  },
};

const ORDNER_SEL = (pfad: string): string =>
  JSON.stringify(`.nav-folder-title[data-path=${JSON.stringify(pfad)}]`);

/** C — der Datei-Explorer. `data-path` ist internes Obsidian-Markup ohne API-Zusage; ein
 *  Unit-Test kann nur den CSS-String pruefen, nicht seine Wirkung im echten Explorer. */
const explorer: Section = {
  key: "explorer",
  title: "C · Themes-Ordner ausblenden",
  async run(cdp) {
    const ordner = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.themesFolder;
    `);
    const angelegt = await cdp.evaluate<boolean>(`
      const pfad = ${JSON.stringify(ordner)};
      if (app.vault.getAbstractFileByPath(pfad)) return false;
      await app.vault.createFolder(pfad);
      await new Promise((r) => setTimeout(r, 800));
      return true;
    `);
    if (angelegt) erzeugtePfade.push(ordner);

    await setPluginSetting(cdp, PLUGIN_ID, "hideThemesFolder", true);
    await cdp.evaluate(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
      await new Promise((r) => setTimeout(r, 600));
      return true;
    `);

    // Erst den Gegenstand belegen, dann die Eigenschaft messen: ein Vergleich gegen ein
    // nicht existierendes Element wird gruen — ausgerechnet im Defektfall.
    const versteckt = await cdp.evaluate<{ da: boolean; display: string }>(`
      const el = document.querySelector(${ORDNER_SEL(ordner)});
      return { da: Boolean(el), display: el ? getComputedStyle(el).display : "" };
    `);
    record(
      `C1 Themes-Ordner "${ordner}" ist im Explorer ausgeblendet`,
      versteckt.da && versteckt.display === "none",
      versteckt.da
        ? `display: ${versteckt.display}`
        : "kein .nav-folder-title[data-path] fuer den Ordner — Markup geaendert oder Explorer zu",
    );

    await setPluginSetting(cdp, PLUGIN_ID, "hideThemesFolder", false);
    await cdp.evaluate(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
      await new Promise((r) => setTimeout(r, 600));
      return true;
    `);
    const wiederDa = await cdp.evaluate<{ da: boolean; display: string }>(`
      const el = document.querySelector(${ORDNER_SEL(ordner)});
      return { da: Boolean(el), display: el ? getComputedStyle(el).display : "" };
    `);
    record(
      "C2 Ausschalten macht ihn wieder sichtbar",
      wiederDa.da && wiederDa.display !== "none",
      wiederDa.da ? `display: ${wiederDa.display}` : "Ordner-Eintrag nicht gefunden",
    );
  },
};

/** D — der Bilder-Export. Zweiter Kernpfad: dasselbe iframe-Artefakt wie die Vorschau,
 *  aufgenommen mit `modern-screenshot`. PDF bleibt Handarbeit — `contentWindow.print()`
 *  oeffnet einen modalen Systemdialog und der blockiert jede weitere CDP-Nachricht. */
const exportSektion: Section = {
  key: "export",
  title: "D · Bilder-Export",
  async run(cdp) {
    skipped("PDF-Export", "oeffnet den Systemdruckdialog — modal, blockiert CDP; bleibt Hand-Smoke");

    const zielOrdner = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.exportFolder;
    `);
    // exportImages legt je Notiz einen Unterordner an: <exportFolder>/<basename>/NN-<basename>.png.
    // Ein Prüfpunkt auf den Wurzelordner fände dort nur den Unterordner und zaehlte 0 PNG —
    // gruen waere er nie geworden, aber die rote Zeile haette auf den Export gezeigt statt
    // auf sich selbst.
    const bildOrdner = `${zielOrdner}/${DECK_NOTE.replace(/\.md$/, "")}`;

    /** Den Ziel-Unterordner leeren, BEVOR exportiert wird.
     *
     *  ⚠️ Ohne das misst der Punkt womoeglich das Artefakt des Vorlaufs: die Wartebedingung
     *  unten ist `exists` + `size > 1024`, und beides erfuellt eine alte Datei **sofort** —
     *  der Poll kehrt zurueck, bevor der laufende Export geschrieben hat. Der Punkt ist dann
     *  gruen und hat den aktuellen Build nie gesehen. Aufgeraeumt wird zwar am Ende des
     *  Laufs, aber genau dann nicht, wenn es darauf ankommt: bei `--keep`, nach einem
     *  Abbruch (der Aufraeum-Block haengt an `.catch`) oder wenn eine Datei dem Index fehlt.
     *
     *  Nach dem Loeschen kann eine gefundene Datei nur die neue sein. Dieselbe Bewegung wie
     *  in Abschnitt M (`pieVollePixel`) und bei B4: ein Pruefpunkt stellt seinen Gegenstand
     *  selbst her, statt ihn von der Umgebung zu erwarten. */
    const leereExport = async (ordner: string): Promise<void> => {
      await cdp.evaluate(`
        const adapter = app.vault.adapter;
        const ordner = ${JSON.stringify(ordner)};
        if (await adapter.exists(ordner)) await adapter.rmdir(ordner, true);
        for (const n of document.querySelectorAll(".notice")) n.remove();
        return true;
      `);
    };

    await openPreview(cdp, DECK_NOTE);
    // `leereExport` raeumt zweierlei weg, und beides aus demselben Grund — der Punkt soll
    // nichts messen, was vor ihm da war: das Artefakt des Vorlaufs (s. o.) und Obsidians
    // Toast, der app-weit ist und in den jedes Plugin im Vault schreibt.
    await leereExport(bildOrdner);
    await cdp.evaluate(`
      await app.commands.executeCommandById("${PLUGIN_ID}:export-images");
      return true;
    `);
    // Über den ADAPTER zaehlen, nicht ueber getAbstractFileByPath: `exportImages` schreibt
    // mit `adapter.writeBinary`, und Obsidians Datei-Index kennt die neuen Dateien erst nach
    // seinem naechsten Lauf. Ein Punkt auf dem Index misst hier die Indizierung, nicht den Export.
    const bilder = await pollUntil<number>(cdp, `
      const adapter = app.vault.adapter;
      if (!(await adapter.exists(${JSON.stringify(bildOrdner)}))) return 0;
      const liste = await adapter.list(${JSON.stringify(bildOrdner)});
      let voll = 0;
      for (const datei of liste.files) {
        if (!datei.endsWith(".png")) continue;
        const s = await adapter.stat(datei);
        if (s && s.size > 1024) voll++;
      }
      return voll >= ${DECK_SLIDES} ? voll : 0;
    `, 90_000, 2000);
    const meldung = await notices(cdp);
    if (bilder && !erzeugtePfade.includes(zielOrdner)) erzeugtePfade.push(zielOrdner);
    record(
      `D1 Bilder-Export schreibt ${DECK_SLIDES} PNG nach "${bildOrdner}"`,
      bilder === DECK_SLIDES,
      bilder
        ? `${bilder} PNG > 1 KB${meldung ? ` · Meldung: ${meldung}` : ""}`
        : `keine vollstaendige Serie${meldung ? ` · Meldung: ${meldung}` : " · keine Meldung des Pruflings"}` +
          ` · ${await diagnose(cdp)}`,
    );

    // D2: die Modifier-Klasse ueberlebt den Export — bisher nur strukturell belegt (sie steht
    // im serialisierten slidesHtml). Gemessen wird am ARTEFAKT: eine Probe-Regel im
    // customCss faerbt `.sd-mod-sand` in eine Farbe, die kein Theme traegt, und das PNG der
    // Modifier-Folie muss sie tragen, das einer Nachbarfolie nicht. Die Pixel werden im
    // Renderer aus den geschriebenen Dateien gelesen (adapter → Blob → ImageBitmap), nicht
    // aus dem iframe, den der Export gleich wieder wegwirft.
    await ensureRegressionNote(cdp);
    if (!(await openExisting(cdp, REGRESSION_NOTE, "source"))) throw new Error(`Notiz fehlt im Vault: ${REGRESSION_NOTE}`);
    await setPluginSetting(cdp, PLUGIN_ID, "customCss", MOD_PROBE_CSS);
    const regOrdner = `${zielOrdner}/${REGRESSION_NOTE.replace(/\.md$/, "")}`;
    await leereExport(regOrdner);
    await cdp.evaluate(`
      await app.commands.executeCommandById("${PLUGIN_ID}:export-images");
      return true;
    `);
    const pixel = await pollUntil<{ mod: number[]; nachbar: number[] } | null>(cdp, `
      const adapter = app.vault.adapter;
      const base = ${JSON.stringify(REGRESSION_NOTE.replace(/\.md$/, ""))};
      const pfad = (i) => ${JSON.stringify(regOrdner)} + "/" + String(i + 1).padStart(2, "0") + "-" + base + ".png";
      const lies = async (i) => {
        if (!(await adapter.exists(pfad(i)))) return null;
        const s = await adapter.stat(pfad(i));
        if (!s || s.size < 1024) return null;
        const bytes = await adapter.readBinary(pfad(i));
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        // Linker Rand, halbe Hoehe: Folienhintergrund, kein Inhalt, keine Kopf-/Fusszeile.
        const d = ctx.getImageData(4, Math.floor(bmp.height / 2), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const letzte = await lies(${REGRESSION_SLIDES - 1});   // erst wenn die Serie komplett ist
      if (!letzte) return null;
      const mod = await lies(${REGRESSION_MOD_SLIDE});
      const nachbar = await lies(${REGRESSION_MOD_SLIDE - 1});
      return mod && nachbar ? { mod, nachbar } : null;
    `, 90_000, 2000);
    const meldung2 = await notices(cdp);
    if (pixel && !erzeugtePfade.includes(zielOrdner)) erzeugtePfade.push(zielOrdner);
    const nah = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - b[i]) <= 8);
    const modGefaerbt = Boolean(pixel) && nah(pixel!.mod, MOD_PROBE_RGB);
    const nachbarNicht = Boolean(pixel) && !nah(pixel!.nachbar, MOD_PROBE_RGB);
    record(
      `D2 Modifier-Klasse ueberlebt den Export (Folie ${REGRESSION_MOD_SLIDE + 1} traegt die Probe-Farbe im PNG)`,
      modGefaerbt && nachbarNicht,
      pixel
        ? `Folie ${REGRESSION_MOD_SLIDE + 1} rgb(${pixel.mod.join(",")}) · Nachbar rgb(${pixel.nachbar.join(",")}) · Probe rgb(${MOD_PROBE_RGB.join(",")})` +
          (modGefaerbt ? "" : " · ACHTUNG: Modifier-Folie traegt die Farbe nicht") +
          (nachbarNicht ? "" : " · ACHTUNG: Nachbarfolie traegt sie auch — die Probe misst nicht den Modifier")
        : `keine vollstaendige Serie${meldung2 ? ` · Meldung: ${meldung2}` : ""} · ${await diagnose(cdp)}`,
    );
  },
};

const BILD_MIT_NOTE = "smoke-bildplatz.md";
const BILD_OHNE_NOTE = "smoke-ohne-bildplatz.md";
const BILD_BLOCK = "```slide-image\nfunktion: metaphorical\nEisberg im Polarmeer\n```";
const BILD_MIT_MD = `---\ntheme: shiro\n---\n\n# Bildplatz\n\n${BILD_BLOCK}\n`;
const BILD_OHNE_MD = "---\ntheme: shiro\n---\n\n# Ohne Bildplatz\n\nNur Text.\n";

/** N — Bildplätze. Jeder Punkt traegt seine Gegenprobe IN sich: ein einmaliger
 *  Sabotage-Nachweis daneben altert sofort, zwei UNTERSCHIEDLICHE Zahlen im Protokoll
 *  sind der Beleg, dass gemessen wurde. */
const bildplaetze: Section = {
  key: "bild",
  title: "N · Bildplätze (slide-image)",
  async run(cdp) {
    const MIT = BILD_MIT_NOTE;
    const OHNE = BILD_OHNE_NOTE;
    const BLOCK = BILD_BLOCK;
    const MIT_MD = BILD_MIT_MD;
    const OHNE_MD = BILD_OHNE_MD;

    // Notizen ueber den Vault anlegen, nicht ueber `fs`: der Treiber kann per --vault an
    // jedes Fenster andocken, und dann liegt der Vault nicht dort, wo dieses Skript ihn
    // vermuten wuerde. Alles Angelegte geht ins Aufraeum-Protokoll.
    const neu = await cdp.evaluate<string[]>(`
      const angelegt = [];
      for (const [pfad, inhalt] of ${JSON.stringify([[MIT, MIT_MD], [OHNE, OHNE_MD]])}) {
        const da = app.vault.getAbstractFileByPath(pfad);
        if (da) await app.vault.modify(da, inhalt);
        else { await app.vault.create(pfad, inhalt); angelegt.push(pfad); }
      }
      await new Promise((r) => setTimeout(r, 400));
      return angelegt;
    `);
    erzeugtePfade.push(...neu);

    /** Wie viele Bildplatz-Slots rendert die Vorschau fuer diese Notiz? */
    const zaehleSlots = async (notiz: string): Promise<number> => {
      await openPreview(cdp, notiz);
      return await cdp.evaluate<number>(`
        ${DECK_DOC}
        if (!deck) return -1;
        return deck.querySelectorAll(".sd-image-slot").length;
      `);
    };

    /** Karte in der Leseansicht NACH einem Klick auf "Generate" — nicht davor: die Karte
     *  startet in JEDEM Fall im Zustand `idle` (Knopf aktiv), unabhaengig davon, ob die API
     *  existiert; `readImageApi` wird erst in `runSlot` gelesen, also erst beim Klick. Erst
     *  der Klick zeigt den Unterschied: mit Stub laeuft die Karte in `blocked` ("busy") —
     *  seit der Schluss-Review-Fixwelle gibt `blocked` den Knopf WIEDER frei (heilbare
     *  Gruende wie "busy"/"unreachable" duerfen keine Sackgasse sein, in der ein erneuter
     *  Versuch nur nach komplettem Neu-Rendern der Notiz moeglich waere) — Knopf bleibt also
     *  "aktiv", die Karte weiterhin sichtbar mit Funktion/Prompt; ohne API bricht `runSlot`
     *  sofort mit `unavailable` ab (Empty-State, KEINE Funktion/Prompt-Divs — Vertrag aus
     *  `renderCard`). Ergebnis: "aktiv" | "leer" | "gesperrt" (falls ein Zustand doch wieder
     *  sperrt) | "keine Karte". Zusaetzlich die beiden §8-DOM-Klassen, gegen die N2 im
     *  Ja-Fall prueft — `vitest` hat hier kein DOM. */
    const knopfZustand = async (
      notiz: string,
      mitStub: boolean,
    ): Promise<{ knopf: string; karte: boolean; funktion: boolean; prompt: boolean }> => {
      await cdp.evaluate(`
        const stub = ${mitStub} ? {
          __sdSmokeStub: true,
          api: { apiVersion: 1,
                 status: () => ({ apiVersion: 1, engine: "builtin", ready: true, reason: null,
                                  capabilities: { negativePrompt: false, cfg: false, maxSteps: 8,
                                                  fixedSize: { width: 512, height: 512 },
                                                  initImage: false, sizes: null } }),
                 generate: async () => ({ ok: false, reason: "busy" }),
                 save: async () => ({ ok: false, reason: "write-failed", message: "smoke" }) },
        } : undefined;
        if (stub) app.plugins.plugins["local-image-generator"] = stub;
        else delete app.plugins.plugins["local-image-generator"];
        const datei = app.vault.getAbstractFileByPath(${JSON.stringify(notiz)});
        // Alle Markdown-Blaetter ZUERST abtrennen, dann EIN frisches oeffnen: dieselbe Notiz
        // im selben Blatt erneut zu oeffnen ist fuer Obsidian ein No-op (der Codeblock-
        // Postprocessor liefe nicht neu), aber ein zweites frisches Blatt NEBEN dem alten
        // laesst zwei ".sd-slot-card" im DOM stehen — ein ungescopter Query griffe dann die
        // FALSCHE (die zuerst gefundene), unabhaengig vom gerade aktiven Tab. Genau das war
        // der erste Fehlschlag hier: N2 verglich zweimal dieselbe (die erste) Karte.
        for (const l of app.workspace.getLeavesOfType("markdown")) l.detach();
        await new Promise((r) => setTimeout(r, 200));
        const blatt = app.workspace.getLeaf(true);
        await blatt.openFile(datei, { state: { mode: "preview" } });
        app.workspace.setActiveLeaf(blatt, { focus: true });
        await new Promise((r) => setTimeout(r, 700));
        const bereich = blatt.view.containerEl;
        const knopf = bereich.querySelector(".sd-slot-card button");
        if (knopf) knopf.click();
        await new Promise((r) => setTimeout(r, 900));
        return true;
      `);
      return await cdp.evaluate<{ knopf: string; karte: boolean; funktion: boolean; prompt: boolean }>(`
        const blatt = app.workspace.getLeavesOfType("markdown")[0];
        const bereich = blatt ? blatt.view.containerEl : document;
        const karte = bereich.querySelector(".sd-slot-card");
        const basis = {
          karte: Boolean(karte),
          funktion: Boolean(karte && karte.querySelector(".sd-slot-function")),
          prompt: Boolean(karte && karte.querySelector(".sd-slot-prompt")),
        };
        if (!karte) return { knopf: "keine Karte", ...basis };
        if (karte.querySelector(".sd-slot-empty")) return { knopf: "leer", ...basis };
        const knopf = karte.querySelector("button");
        if (!knopf) return { knopf: "kein Knopf", ...basis };
        return { knopf: knopf.disabled ? "gesperrt" : "aktiv", ...basis };
      `);
    };

    /** Zurueckschreiben pruefen, OHNE zu rechnen: `replaceSlot` wird ueber den Vault-Inhalt
     *  gefahren, wie `runSlot` es tut. `blockVeraendert` simuliert die Notiz, die sich
     *  waehrend des minutenlangen Laufs geaendert hat. */
    const schreibeZurueck = async (notiz: string, blockVeraendert: boolean): Promise<string> => {
      return await cdp.evaluate<string>(`
        const datei = app.vault.getAbstractFileByPath(${JSON.stringify(notiz)});
        const vorher = await app.vault.read(datei);
        const gesucht = ${JSON.stringify(BLOCK)};
        const inhalt = ${blockVeraendert} ? vorher.replace("Eisberg im Polarmeer", "Etwas anderes") : vorher;
        if (${blockVeraendert}) await app.vault.modify(datei, inhalt);
        const treffer = inhalt.indexOf(gesucht);
        const doppelt = treffer !== -1 && inhalt.indexOf(gesucht, treffer + gesucht.length) !== -1;
        if (treffer === -1 || doppelt) { await app.vault.modify(datei, vorher); return "unberuehrt"; }
        await app.vault.modify(datei, inhalt.slice(0, treffer) + "![[a.png]]" + inhalt.slice(treffer + gesucht.length));
        const nachher = await app.vault.read(datei);
        await app.vault.modify(datei, vorher);
        return nachher.includes("![[a.png]]") ? "ersetzt" : "unberuehrt";
      `);
    };

    // N1: der Slot rendert im Deck-iframe — und in einer Notiz ohne Block eben nicht.
    const mit = await zaehleSlots(MIT);
    const ohne = await zaehleSlots(OHNE);
    record("N1 Bildplatz rendert als .sd-image-slot", mit === 1 && ohne === 0,
           `mit Block ${mit} · ohne Block ${ohne}`);

    // N2: Karte in der Leseansicht. Der Stub wird gesetzt UND der Vorzustand
    // zurueckgeschrieben — im Staging-Vault kann das echte LIG installiert sein.
    const vorher = await cdp.evaluate<boolean>(`
      globalThis.__sdVorherLIG = app.plugins.plugins["local-image-generator"];
      return globalThis.__sdVorherLIG !== undefined;
    `);
    let karteMitApi: { knopf: string; karte: boolean; funktion: boolean; prompt: boolean } | null = null;
    let karteOhneApi: { knopf: string; karte: boolean; funktion: boolean; prompt: boolean } | null = null;
    try {
      karteMitApi = await knopfZustand(MIT, /* mitStub */ true);
      karteOhneApi = await knopfZustand(MIT, /* mitStub */ false);
    } finally {
      // NIE `delete`: ein unbedingtes Aufraeumen zerstoert die Live-Registrierung eines
      // echt installierten LIG, waehrend der eigene Lauf gruen bleibt.
      await cdp.evaluate(`
        if (globalThis.__sdVorherLIG === undefined) delete app.plugins.plugins["local-image-generator"];
        else app.plugins.plugins["local-image-generator"] = globalThis.__sdVorherLIG;
        delete globalThis.__sdVorherLIG;
        return true;
      `);
    }
    // Nach dem Klick: mit Stub laeuft `runSlot` bis "blocked" (busy) — seit der
    // Schluss-Review-Fixwelle gibt `blocked` den Knopf WIEDER frei (heilbare Gruende duerfen
    // keine Sackgasse sein, aus der nur ein komplettes Neu-Rendern der Notiz herausfuehrt),
    // die Karte bleibt die volle Ansicht (Funktion+Prompt); ohne API bricht `readImageApi`
    // sofort ab und die Karte wird zum Empty-State, der laut `renderCard` WEDER Funktion-
    // noch Prompt-Div traegt. Die Klassenprobe (Review-Auflage) haengt deshalb am Ja-Fall —
    // dort ist sie ueberhaupt vorhanden — und wird gegen den Nein-Fall kontrastiert, in dem
    // beide Divs per Vertrag fehlen. Genau DIESE Sackgasse bewacht N2 jetzt: ein Ruecksprung
    // auf "gesperrt" waere die Regression, die diese Fixwelle behoben hat.
    const klassenOk = Boolean(karteMitApi?.karte && karteMitApi.funktion && karteMitApi.prompt);
    const klassenFehlenOhne = karteOhneApi?.karte === true && !karteOhneApi.funktion && !karteOhneApi.prompt;
    record(
      "N2 Nach Klick: Knopf bleibt bedienbar (heilbarer Grund) + Klassen da mit API, Empty-State (keine Klassen) ohne",
      karteMitApi?.knopf === "aktiv" && klassenOk && karteOhneApi?.knopf === "leer" && klassenFehlenOhne,
      `${karteMitApi?.knopf} (funktion=${karteMitApi?.funktion} prompt=${karteMitApi?.prompt})` +
        ` · ${karteOhneApi?.knopf} (funktion=${karteOhneApi?.funktion} prompt=${karteOhneApi?.prompt})`,
    );

    // N2b: die RUECKSCHREIB-MECHANIK selbst, nicht der zufaellige Vorbestand dieses Vaults.
    // In diesem Staging-Vault ist lokal kein "local-image-generator" installiert — ein Punkt,
    // der nur den hiesigen Vorbestand spiegelt, faehrt deshalb IMMER denselben Zweig
    // ("war nicht installiert") und misst den schutzbeduerftigeren Fall ("war installiert ->
    // ist danach dasselbe Objekt") in keinem einzigen Lauf. Und `!== undefined` allein waere
    // auch dann wahr, wenn dort ein FREMDES Objekt laege — also genau dann, wenn die
    // Wiederherstellung schiefgegangen ist. Deshalb: ein synthetischer, eindeutig
    // wiedererkennbarer Waechter statt des echten Vorbestands, Vergleich per Objektidentitaet
    // (`===`), UND der echte Vorbestand dieses Vaults wird waehrend der Messung gesichert und
    // danach zurueckgeschrieben — derselben Sorgfalt, die dieser Punkt selbst einfordert.
    const pruefeRestoreMechanik = async (
      mitWaechter: boolean,
    ): Promise<{ identisch: boolean; nachher: string }> =>
      cdp.evaluate(`
        const waechter = ${mitWaechter} ? { __sdWaechter: true, marke: "sd-smoke-" + Math.random() } : undefined;
        if (waechter) app.plugins.plugins["local-image-generator"] = waechter;
        else delete app.plugins.plugins["local-image-generator"];

        // Dieselbe Mechanik wie N2s eigenes finally: Vorbestand sichern, Stub setzen,
        // zurueckschreiben.
        const vorherInnen = app.plugins.plugins["local-image-generator"];
        app.plugins.plugins["local-image-generator"] = {
          api: { apiVersion: 1,
                 status: () => ({ apiVersion: 1, engine: "builtin", ready: true, reason: null,
                                  capabilities: { negativePrompt: false, cfg: false, maxSteps: 8,
                                                  fixedSize: null, initImage: false, sizes: null } }),
                 generate: async () => ({ ok: false, reason: "busy" }),
                 save: async () => ({ ok: false, reason: "write-failed", message: "smoke" }) },
        };
        if (vorherInnen === undefined) delete app.plugins.plugins["local-image-generator"];
        else app.plugins.plugins["local-image-generator"] = vorherInnen;

        const nachher = app.plugins.plugins["local-image-generator"];
        const identisch = waechter ? nachher === waechter : nachher === undefined;
        return {
          identisch,
          nachher: nachher === undefined ? "(nichts)" : nachher === waechter ? "Waechter (identisch)" : "FREMDES OBJEKT",
        };
      `);

    let mitWaechterErgebnis: { identisch: boolean; nachher: string } | null = null;
    let ohneWaechterErgebnis: { identisch: boolean; nachher: string } | null = null;
    try {
      await cdp.evaluate(`
        globalThis.__sdEchterVorbestand = app.plugins.plugins["local-image-generator"];
        return true;
      `);
      mitWaechterErgebnis = await pruefeRestoreMechanik(/* mitWaechter */ true);
      ohneWaechterErgebnis = await pruefeRestoreMechanik(/* mitWaechter */ false);
    } finally {
      await cdp.evaluate(`
        if (globalThis.__sdEchterVorbestand === undefined) delete app.plugins.plugins["local-image-generator"];
        else app.plugins.plugins["local-image-generator"] = globalThis.__sdEchterVorbestand;
        delete globalThis.__sdEchterVorbestand;
        return true;
      `);
    }

    const n2bOk = Boolean(mitWaechterErgebnis?.identisch && ohneWaechterErgebnis?.identisch);
    record(
      "N2b Rueckschreib-Mechanik: Objektidentitaet gewahrt (mit Waechter) und Slot leer (ohne)",
      n2bOk,
      `mit Waechter: ${mitWaechterErgebnis?.nachher} · ohne: ${ohneWaechterErgebnis?.nachher}`,
    );
    if (!n2bOk) {
      // Ein misslungenes Zurueckschreiben ist kein Testergebnis, sondern ein Schaden an
      // fremdem Zustand (dem Nachbarplugin-Slot) — der Lauf bricht deshalb ab, statt mit
      // einer roten Zeile weiterzulaufen, als waere nichts geschehen.
      throw new Error(
        `N2b: Rueckschreib-Mechanik verletzt Objektidentitaet — mit Waechter: ${mitWaechterErgebnis?.nachher}` +
        ` · ohne: ${ohneWaechterErgebnis?.nachher}. Abbruch, damit kein weiterer Punkt auf einem` +
        ` beschaedigten Nachbarplugin-Zustand aufbaut.`,
      );
    }

    // N3: is-checking bewegt sich, is-ok nicht (§8, nur am laufenden Objekt pruefbar).
    const anim = await cdp.evaluate<{ checking: string; ok: string }>(`
      const host = document.createElement("div");
      document.body.appendChild(host);
      const mk = (cls) => { const s = document.createElement("span");
        s.className = "sd-slot-status " + cls;
        s.innerHTML = '<svg class="svg-icon"></svg>'; host.appendChild(s); return s.querySelector("svg"); };
      const c = getComputedStyle(mk("is-checking")).animationName;
      const o = getComputedStyle(mk("is-ok")).animationName;
      host.remove();
      return { checking: c, ok: o };
    `);
    record("N3 is-checking bewegt sich, is-ok steht",
           anim.checking !== "none" && anim.ok === "none",
           `checking=${anim.checking} · ok=${anim.ok}`);

    // N4: Zurueckschreiben trifft — und unterbleibt, wenn der Block sich geaendert hat.
    const treffer = await schreibeZurueck(MIT, /* blockVeraendert */ false);
    const daneben = await schreibeZurueck(MIT, /* blockVeraendert */ true);
    record("N4 Zurueckschreiben trifft, und unterbleibt bei geaendertem Block",
           treffer === "ersetzt" && daneben === "unberuehrt", `${treffer} · ${daneben}`);
  },
};

/** M steht VOR dem Export, nicht dahinter: der Export-Abschnitt setzt eine Probe-Regel ins
 *  `customCss` und raeumt sie erst im `finally` des Laufs weg. Liefe M danach, faerbte diese
 *  Regel in die Messung hinein. N steht aus demselben Grund davor. */
const SECTIONS: Section[] = [vorschau, mermaid, bildplaetze, einstellungen, explorer, exportSektion];

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const keep = argv.includes("--keep");
  const sectionArg = flag("section");

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(`Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`);
  }

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster auf Port ${port}${vault ? ` fuer Vault "${vault}"` : ""}.\n` +
      "Laeuft Obsidian mit --remote-debugging-port? Bei mehreren Fenstern --vault <name> angeben.",
    );
  }

  // Ausserhalb des try: das finally muss auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben koennen.
  let vorherigeEinstellungen: string | null = null;

  // Ein SIGINT mitten im Lauf ueberspringt das `finally` unten NICHT im try/catch-Sinn,
  // sondern beendet den Node-Prozess sofort — drei Zustandssorten ueberleben das sonst:
  //  · `vorherigeEinstellungen` (der volle Settings-Snapshot; deckt auch die inneren
  //    Test-Mutationen ab, die ihre eigenen `finally`s haben, z. B. B4s llmEndpoints-Stub —
  //    die stehen alle unter demselben `plugin.settings`-Objekt).
  //  · `erzeugtePfade` (modulweiter Array, angelegte Test-Ordner/-Notizen fuer den Papierkorb).
  //  · der `local-image-generator`-Plugin-Slot (N2/N2b) — als `globalThis.__sdVorherLIG` bzw.
  //    `globalThis.__sdEchterVorbestand` im RENDERER gesichert, nicht als Node-Closure: nur so
  //    erreicht sie ein Handler, der unabhaengig davon feuert, WELCHER Abschnitt gerade laeuft.
  //    Ohne Rueckbau bliebe ein Stub stehen, der die Live-Registrierung eines echt
  //    installierten LIG ueberschreibt (dieselbe Gefahrenklasse wie vault-rag/llm-lab).
  let signalCleanupRunning = false;
  const onAbortSignal = (signal: NodeJS.Signals): void => {
    if (signalCleanupRunning) return;
    signalCleanupRunning = true;
    void (async () => {
      console.log(`\n\nAbbruch durch ${signal} — raeume Vault-Zustand auf...`);
      await cdp.evaluate(`
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (plugin) {
          ${vorherigeEinstellungen !== null ? `
          Object.assign(plugin.settings, JSON.parse(${JSON.stringify(vorherigeEinstellungen)}));
          await plugin.saveSettings?.();
          if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
          ` : ""}
        }
        if (globalThis.__sdVorherLIG !== undefined || "__sdVorherLIG" in globalThis) {
          if (globalThis.__sdVorherLIG === undefined) delete app.plugins.plugins["local-image-generator"];
          else app.plugins.plugins["local-image-generator"] = globalThis.__sdVorherLIG;
          delete globalThis.__sdVorherLIG;
        }
        if (globalThis.__sdEchterVorbestand !== undefined || "__sdEchterVorbestand" in globalThis) {
          if (globalThis.__sdEchterVorbestand === undefined) delete app.plugins.plugins["local-image-generator"];
          else app.plugins.plugins["local-image-generator"] = globalThis.__sdEchterVorbestand;
          delete globalThis.__sdEchterVorbestand;
        }
        for (const pfad of ${JSON.stringify(erzeugtePfade)}) {
          const f = app.vault.getAbstractFileByPath(pfad);
          if (f) await app.fileManager.trashFile(f);
        }
        return true;
      `).catch(() => { console.log("  ! Aufraeumen im Renderer fehlgeschlagen — Vault von Hand pruefen"); });
      cdp.close();
      process.exit(130);
    })();
  };
  process.on("SIGINT", onAbortSignal);
  process.on("SIGTERM", onAbortSignal);

  try {
    // Ohne Fokus drosselt Chromium den Renderer, das Deck rendert nicht und JEDER Punkt
    // waere rot — die Suche begaenne dann am Plugin statt am Fenster.
    await cdp.send("Page.bringToFront");
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
      await cdp.send("Page.bringToFront");
      await new Promise((r) => setTimeout(r, 800));
    }
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    const fokus = await cdp.evaluate<boolean>(
      `return document.hasFocus() && document.visibilityState === "visible";`,
    );
    if (!fokus) {
      throw new Error(
        "Das Obsidian-Fenster hat keinen Fokus — Chromium drosselt dann den Renderer und jeder " +
        "Pruefpunkt waere rot, ohne dass am Plugin etwas fehlt. Fenster nach vorn holen und erneut fahren.",
      );
    }

    const vaultInfo = await cdp.evaluate<{ name: string; basePath: string; configDir: string }>(`
      return { name: app.vault.getName(), basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };
    `);
    console.log(`Vault: ${vaultInfo.name}`);

    // Gegen WELCHEN Build laeuft das hier? `manifest.version` ist dafuer strukturell blind
    // (Store- und Repo-Build tragen dieselbe Nummer). Der Pfad kommt aus der LAUFENDEN
    // Instanz, nicht aus stagingVaultDir() — ein Treiber kann per --vault an jedes Fenster
    // andocken, und ein Check am konfigurierten Ort pruefte dann eine Datei, die mit dem
    // Lauf nichts zu tun hat (Lesson 2026-09-02, kuro-gamification).
    requireEigenerBuild(
      join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID, "main.js"),
      join(process.cwd(), "main.js"),
    );

    // Neu laden, bevor irgendetwas gemessen wird: `npm run deploy` ersetzt nur Dateien, die
    // laufende Instanz behaelt den alten Code im Speicher. Ohne das misst der Smoke den
    // zuletzt geladenen Stand und meldet ihn als Ergebnis fuer den gerade gebauten.
    const plugin = await cdp.evaluate<{ an: boolean; version: string }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      if (app.plugins.plugins[id]) {
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
      }
      await app.plugins.enablePlugin(id);
      await new Promise((r) => setTimeout(r, 800));
      const p = app.plugins.plugins[id];
      return { an: Boolean(p), version: p ? p.manifest.version : "" };
    `);
    if (!plugin.an) throw new Error(`Plugin ${PLUGIN_ID} liess sich nicht aktivieren.`);
    console.log(`Plugin: ${PLUGIN_ID} ${plugin.version} (frisch geladen)\n`);

    // 0 — ein liegen gebliebener local-image-generator-Stub aus einem per Ctrl-C
    // abgebrochenen Vorlauf (vor diesem Handler bzw. bei einem SIGKILL) waere sonst still UND
    // gefaehrlich: die Live-Registrierung eines echt installierten LIG bliebe ueberschrieben,
    // bis Obsidian neu startet. Der Marker `__sdSmokeStub` macht ihn erkennbar.
    const staleStub = await cdp.evaluate<boolean>(`
      const p = app.plugins.plugins["local-image-generator"];
      if (p && p.__sdSmokeStub) { delete app.plugins.plugins["local-image-generator"]; return true; }
      return false;
    `);
    record(
      "0. Kein liegen gebliebener local-image-generator-Stub aus einem abgebrochenen Vorlauf",
      !staleStub,
      staleStub ? "Stub aus einem Vorlauf gefunden und entfernt" : "kein Rest gefunden",
    );

    vorherigeEinstellungen = await cdp.evaluate<string>(`
      return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings);
    `);

    for (const section of sections) {
      console.log(`── ${section.title}`);
      await section.run(cdp, { port, vault });
      console.log("");
    }
  } finally {
    // Aufraeumen haengt nie am Ergebnis: auch ein abgebrochener Lauf gibt den Vault so
    // zurueck, wie er ihn vorgefunden hat.
    if (vorherigeEinstellungen !== null) {
      await cdp
        .evaluate(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          Object.assign(plugin.settings, JSON.parse(${JSON.stringify(vorherigeEinstellungen)}));
          await plugin.saveSettings?.();
          if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
          return true;
        `)
        .catch(() => undefined);
    }
    if (!keep && erzeugtePfade.length) {
      await cdp
        .evaluate(`
          for (const pfad of ${JSON.stringify(erzeugtePfade)}) {
            // Papierkorb, nicht Hard-Delete: was ein Werkzeug im Vault des Maintainers
            // anfasst, muss zurueckholbar bleiben. Kennt der Index den frisch geschriebenen
            // Ordner noch nicht, erst indizieren lassen — und nur wenn das nichts bringt,
            // ueber den Adapter raeumen (dann ohne Papierkorb, deshalb die Meldung).
            let f = app.vault.getAbstractFileByPath(pfad);
            if (!f) { await new Promise((r) => setTimeout(r, 1500)); f = app.vault.getAbstractFileByPath(pfad); }
            if (f) await app.fileManager.trashFile(f);
            else if (await app.vault.adapter.exists(pfad)) {
              await app.vault.adapter.rmdir(pfad, true);
              console.log("gui-smoke: " + pfad + " ueber den Adapter entfernt (nicht im Papierkorb)");
            }
          }
          return true;
        `)
        .catch(() => undefined);
    }
    await closeExtraLeaves(cdp).catch(() => 0);
    cdp.close();
    // Abmelden, sonst haengt ein SPAETES Signal (nach normalem Abschluss, cdp schon zu) den
    // Prozess in onAbortSignal an einer toten Verbindung auf.
    process.off("SIGINT", onAbortSignal);
    process.off("SIGTERM", onAbortSignal);
  }

  const rot = results.filter((c) => !c.passed);
  console.log(`${results.length - rot.length}/${results.length} gruen`);
  if (rot.length > 0) {
    console.log("Rot:");
    for (const c of rot) console.log(`  - ${c.name}: ${c.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
