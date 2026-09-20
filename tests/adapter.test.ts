import { describe, it, expect } from "vitest";
import { binaryToDataUrl, knownModifiersFor } from "../src/adapter";
import { mergeThemes, type ThemeEntry, type ThemeRegistry } from "../src/vendor/deck-core/pure/presets";
import { builtinThemeEntries, userThemeEntry } from "../src/vendor/deck-core/pure/deck-css";
import { parseDeck } from "../src/vendor/deck-core/pure/slide-model";

describe("binaryToDataUrl", () => {
  it("builds a data url from bytes + extension", () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(binaryToDataUrl(bytes, "png")).toMatch(/^data:image\/png;base64,/);
  });
});

// Die Modifier-Auflösung ist bewusst aus `loadDeck` herausgezogen: dort bräuchte ein Test
// einen App-Mock, hier reicht eine Registry. Dieselbe Naht wie `mermaidConfig` im Kern.
describe("knownModifiersFor", () => {
  const reg = new Map<string, ThemeEntry>([
    ["kami", { key: "kami", source: "builtin", themeCss: "", hljs: "", katex: "", mermaid: "default", baseFontPx: 24 }],
    ["gruene", { key: "gruene", source: "user", themeCss: "", hljs: "", katex: "", mermaid: "default", baseFontPx: 24, modifiers: ["sand", "halb"] }],
  ]) as ThemeRegistry;

  it("liefert die Modifier des Themes aus der Frontmatter", () => {
    expect(knownModifiersFor(reg, "gruene")).toEqual(["sand", "halb"]);
  });

  it("liefert undefined fuer ein Theme, das keine deklariert", () => {
    expect(knownModifiersFor(reg, "kami")).toBeUndefined();
  });

  // resolveTheme ist total und faellt auf kami zurueck — ein Tippfehler im `theme:` darf
  // nicht die Modifier eines fremden Themes erben.
  it("erbt bei unbekanntem Schluessel die Modifier des Fallbacks, nicht die des letzten Themes", () => {
    expect(knownModifiersFor(reg, "gibt-es-nicht")).toBeUndefined();
  });

  it("kommt ohne Schluessel klar", () => {
    expect(knownModifiersFor(reg, undefined)).toBeUndefined();
  });
});

// Die ganze Consumer-Kette an einem Stueck: Theme-CSS -> userThemeEntry -> Registry ->
// knownModifiersFor -> parseDeck. Sie laeuft ueber vier Module und zwei Repos (der Kern ist
// vendoriert); jedes fuer sich ist drueben getestet, die NAHT dazwischen nur hier.
describe("sd-modifiers erreicht den Parser (Consumer-Kette)", () => {
  const themeCss = "/* sd-modifiers: sand halb */\n.sd-slide{ --sd-fg:#111 }";
  const VENDOR = { katex: "", hljs: { github: "", "github-dark": "" } };
  const deckMd = "---\ntheme: gruene\n---\n\n<!-- layout: bildfolie sand -->\n# Titel\n";

  const registry = mergeThemes(
    builtinThemeEntries(VENDOR),
    [userThemeEntry("gruene", themeCss, VENDOR)],
  ).map;

  it("traegt die deklarierten Modifier bis in den ThemeEntry", () => {
    expect(registry.get("gruene")?.modifiers).toEqual(["sand", "halb"]);
  });

  it("stellt die modifier-unknown-Meldung still, wenn das Theme sie deklariert", () => {
    const known = knownModifiersFor(registry, "gruene");
    const slide = parseDeck(deckMd, undefined, known ? { knownModifiers: known } : undefined).slides[0];
    expect(slide.modifiers).toEqual(["sand"]);
    expect(slide.directiveWarnings).toEqual([]);
  });

  // Die Gegenprobe gehoert in denselben Test: ohne die Weitergabe MUSS die Meldung kommen.
  // Sonst belegt der Punkt darueber nur, dass irgendetwas keine Warnung erzeugt.
  it("meldet denselben Modifier, wenn die Liste NICHT durchgereicht wird", () => {
    const slide = parseDeck(deckMd).slides[0];
    expect(slide.directiveWarnings.map((w) => w.kind)).toEqual(["modifier-unknown"]);
  });
});
