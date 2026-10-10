import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { secondPassDeck } from "../src/deck-second-pass";
import { neutralizeRemoteResources } from "../src/vendor/kit/safe-markdown";

// Ohne Seitenladen: das Dokument ist inert, happy-dom darf auch fuer iframes nichts holen.
const win = new Window({ settings: { disableIframePageLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
const parseHtml = (html: string): Document => new win.DOMParser().parseFromString(html, "text/html") as unknown as Document;
const deps = { parseHtml };

const FRONT = "---\ntheme: dark\n---\n";
const SVG = '<svg><rect fill="url(https://evil.invalid/s.svg#a)"/></svg>';

describe("secondPassDeck", () => {
  it("Fall 1: eine Fernquelle, die die erste Schicht faengt, kommt gar nicht erst an — das Deck bleibt byte-gleich", () => {
    const first = neutralizeRemoteResources(`${FRONT}# A\n\n![x](https://evil.invalid/x.png)\n\n---\n\n# B`);
    expect(first).toContain("x (https://evil.invalid/x.png)"); // Bild wurde zu Text
    const r = secondPassDeck(first, deps);
    expect(r.markdown).toBe(first);
    expect(r.replaced).toEqual([]);
    expect(r.remaining).toEqual([]);
  });

  it("Fall 2: eine Quelle, die nur der DOM-Durchgang faengt (SVG fill=url(https://…) umgeht die Regex), ersetzt genau diese Folie", () => {
    const deck = `${FRONT}# A\n\ntext\n\n---\n\n# B\n\n${SVG}\n\n---\n\n# C\n`;
    expect(neutralizeRemoteResources(deck)).toBe(deck); // Voraussetzung: die erste Schicht sieht nichts
    const r = secondPassDeck(deck, deps);
    expect(r.replaced).toEqual([2]);
    expect(r.findings.map((f) => f.slide)).toEqual([2]);
    expect(r.remaining).toEqual([]);
    expect(r.markdown).toContain("&lt;svg>");
    expect(r.markdown).not.toContain("<svg>");
    // Folie 1, 3 und das Frontmatter sind unberuehrt
    expect(r.markdown.startsWith(`${FRONT}# A\n\ntext\n\n---\n\n`)).toBe(true);
    expect(r.markdown.endsWith("\n\n---\n\n# C\n")).toBe(true);
  });

  it("der Fund nennt Tag und Attribut, nie die Quelle (sie kann ein wiederhergestelltes Geheimnis sein)", () => {
    const r = secondPassDeck(`# A\n\n${SVG}`, deps);
    expect(JSON.stringify(r.findings)).not.toContain("evil.invalid");
    expect(r.findings[0]).toMatchObject({ slide: 1, attr: "fill" });
  });

  it("Fall 3: bleibt nach der Folien-Entschaerfung ein Fund, steht er in `remaining`", () => {
    const r = secondPassDeck(`# A\n\n${SVG}`, { ...deps, neutralizeSlide: (m) => m });
    expect(r.replaced).toEqual([1]);
    expect(r.remaining).toHaveLength(1);
  });

  it("ein Deck mit Mermaid, Direktiven, Embed, relativem Bild, data:-Bild und Link bleibt byte-gleich (auch mit CRLF)", () => {
    const deck = [
      "---", "theme: dark", "aspect: 16:9", "---", "",
      "<!-- layout: columns -->", "# A", "", "![[logo.png]]", "", "![rel](img/a.png)", "",
      "![d](data:image/png;base64,AAAA)", "", "[Link](https://example.com)", "",
      "```mermaid", "graph TD; A-->B", "```", "", "---", "", "# B", "",
    ].join("\r\n");
    const r = secondPassDeck(deck, deps);
    expect(r.replaced).toEqual([]);
    expect(r.markdown).toBe(deck);
  });

  it("ein `---` in einem Code-Fence trennt keine Folie", () => {
    const deck = `# A\n\n\`\`\`yaml\n---\nk: v\n---\n\`\`\`\n\n${SVG}\n\n---\n\n# B`;
    const r = secondPassDeck(deck, deps);
    expect(r.replaced).toEqual([1]);
    expect(r.markdown.endsWith("\n\n---\n\n# B")).toBe(true);
  });

  it("ein Embed mit Fern-URL ergibt keinen Fund und keine Anfrage (er rendert als Hinweis-Text)", () => {
    const deck = "# A\n\n![[https://evil.invalid/x.png]]\n";
    const r = secondPassDeck(deck, deps);
    expect(r.replaced).toEqual([]);
  });

  it("Mutationsprobe: ohne den DOM-Durchgang (Fall 2) wuerde die Fernquelle durchgehen", () => {
    // Die Gegenprobe ist die Voraussetzung in Fall 2: die Regex-Schicht laesst SVG fill=url(https://…) stehen.
    expect(neutralizeRemoteResources(SVG)).toBe(SVG);
    expect(secondPassDeck(SVG, deps).replaced).toEqual([1]);
  });

  describe("Fixture aus code-kit 0.18.0 (tests/fixtures/remote-sources.json, wortgleich, Tag 0.18.0)", () => {
    const cases = JSON.parse(readFileSync(new URL("./fixtures/remote-sources.json", import.meta.url), "utf8")) as { name: string; kind: string; html?: string; markdown?: string }[];
    it("jeder Fall, den die Regex-Schicht stehen laesst und der als `attack` gilt, wird von der zweiten Schicht ersetzt", () => {
      // happy-dom parst diese Faelle anders als Chromium (code-kit fuehrt sie als „happy-dom-blind"); dort misst der GUI-Smoke.
      const blind = new Set(JSON.parse(readFileSync(new URL("./fixtures/happy-dom-blind.json", import.meta.url), "utf8")) as string[]);
      const missed = cases.filter((c) => c.kind === "attack" && c.html !== undefined && !blind.has(c.name) && neutralizeRemoteResources(c.html) === c.html);
      expect(missed.length).toBeGreaterThan(50);
      const notCaught = missed.filter((c) => secondPassDeck(c.html as string, deps).remaining.length > 0 || secondPassDeck(c.html as string, deps).replaced.length === 0);
      expect(notCaught.map((c) => c.name)).toEqual([]);
    });
  });
});
