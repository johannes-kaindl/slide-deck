import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { builtinThemeEntries, deckCss } from "../src/vendor/deck-core/pure/deck-css";
import { mergeThemes, resolveTheme } from "../src/vendor/deck-core/pure/presets";
import { parseDeck } from "../src/vendor/deck-core/pure/slide-model";
import { collectWarnings } from "../src/vendor/deck-core/pure/constraints/engine";

// agenda/threads/closing (Order from Traces) sind seit deck-core 0.12.0 eingebaute Layouts.
// Geprueft wird die Naht zum Consumer: das Beispiel-Deck parst auf die drei Namen, sie gelten
// nicht mehr als unbekannt, und das Deck-CSS, das dieses Plugin ausliefert, traegt ihre Regeln.
const LAYOUTS = ["agenda", "threads", "closing"] as const;
const VENDOR = { katex: "", hljs: { github: "", "github-dark": "" } };
const read = (p: string) => readFileSync(p, "utf8");
const NO_FIT = { scale: 1, overflow: false };

describe("Layouts agenda/threads/closing", () => {
  const deck = parseDeck(read("docs/themes/traces-layouts-deck.md"));

  it("das Beispiel-Deck setzt die drei Layouts in dieser Reihenfolge", () => {
    expect(deck.slides.map((s) => s.layout)).toEqual([...LAYOUTS]);
  });

  it("keine Folie meldet ihr Layout als unbekannt", () => {
    for (const slide of deck.slides) {
      expect(collectWarnings(slide, [], NO_FIT).map((w) => w.kind)).not.toContain("layout-unknown");
    }
  });

  const { map } = mergeThemes(builtinThemeEntries(VENDOR), []);
  for (const theme of ["kuro", "shiro", "sumi"]) {
    it(`das Deck-CSS von ${theme} traegt die Regeln aller drei`, () => {
      const css = deckCss(resolveTheme(map, theme));
      for (const l of LAYOUTS) expect(css).toContain(`.sd-layout-${l} .sd-region`);
    });
  }

  it("kuro und shiro legen den Schleier auf closing", () => {
    for (const theme of ["kuro", "shiro"]) {
      expect(deckCss(resolveTheme(map, theme))).toContain(".sd-slide.sd-layout-closing{");
    }
  });

  it("die Layout-Doku fuehrt alle drei in beiden Sprachen", () => {
    for (const p of ["docs/layouts.md", "docs/layouts.de.md"]) {
      for (const l of LAYOUTS) expect(read(p)).toContain(`| \`${l}\` |`);
    }
  });
});
