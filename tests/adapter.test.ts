import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { knownModifiersFor, loadDeck } from "../src/adapter";
import { renderMarkdown } from "../src/vendor/deck-core/pure/render/md2html";
import { mergeThemes, type ThemeEntry, type ThemeRegistry } from "../src/vendor/deck-core/pure/presets";
import { builtinThemeEntries, userThemeEntry } from "../src/vendor/deck-core/pure/deck-css";
import { parseDeck } from "../src/vendor/deck-core/pure/slide-model";

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

// ---------------------------------------------------------------------------
// loadDeck: Embed-Größe. deck-core schneidet `|48` ab und fragt `resolveEmbed` nur mit dem
// Pfad; der Adapter sammelt die Refs vorab und muss seinen Cache am selben Pfad schlüsseln.
// ---------------------------------------------------------------------------
describe("loadDeck: Embed mit Größe lädt das Bild", () => {
  const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>").buffer;

  // Die echte TFile hat keinen Konstruktor-Parameter; der Mock-Konstruktor setzt Pfad und Endung.
  const tfile = (path: string): TFile => {
    const f = Object.create(TFile.prototype) as TFile;
    return Object.assign(f, { path, name: path.split("/").pop()!, extension: path.split(".").pop()! });
  };

  function fakeApp(note: string, looked: string[]) {
    const dest = tfile("assets/a.svg");
    return {
      vault: {
        read: async () => note,
        readBinary: async () => svg,
      },
      metadataCache: {
        getFileCache: () => null,
        getFirstLinkpathDest: (ref: string) => { looked.push(ref); return ref === "a.svg" ? dest : null; },
      },
    } as unknown as App;
  }
  const note = tfile("deck.md");

  for (const [name, source] of [
    ["ohne Größe", "# T\n\n![[a.svg]]"],
    ["|48", "# T\n\nText ![[a.svg|48]] im Fluss"],
    ["|48x30", "# T\n\n![[a.svg|48x30]]"],
    ["|Alt Text", "# T\n\n![[a.svg|Alt Text]]"],
    ["\\|48 in der Tabellenzelle", "# T\n\n| a | b |\n|---|---|\n| ![[a.svg\\|48]] | x |"],
  ] as const) {
    it(`${name}: resolveEmbed("a.svg") liefert eine Data-URL, gesucht wird nur der Pfad`, async () => {
      const looked: string[] = [];
      const loaded = await loadDeck(fakeApp(source, looked), note);
      expect(loaded).not.toBeNull();
      expect(looked).toEqual(["a.svg"]);
      expect(loaded!.resolveEmbed("a.svg")).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  }

  it("die Ausgabe trägt das Bild mit Größe (Kette Adapter -> Kern)", async () => {
    const loaded = await loadDeck(fakeApp("# T\n\n![[a.svg|48]]", []), note);
    const out = renderMarkdown({ markdown: "![[a.svg|48]]", resolveEmbed: loaded!.resolveEmbed } as never);
    expect(out.html).toContain('width="48"');
    expect(out.warnings.filter((w) => w.kind === "missing-embed")).toEqual([]);
  });
});
