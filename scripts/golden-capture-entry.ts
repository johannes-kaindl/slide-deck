// Nimmt den erzeugten Stand des Renderers auf: geparstes Deck, Folien-HTML und
// Deck-CSS je Theme. Wird von scripts/golden-capture.mjs gebündelt und in Node
// ausgeführt — dieselbe esbuild-Einstellung wie der Plugin-Build, damit der
// CSS-Text-Loader greift.
import { readFileSync, writeFileSync } from "node:fs";
import { parseDeck } from "../src/core/slide-model";
import { renderMarkdown } from "../src/core/render/md2html";
import { mergeThemes, resolveTheme } from "../src/core/presets";
import { builtinThemeEntries, deckCss } from "../src/deck-css";

const THEMES = ["shiro", "kuro", "sumi", "kairo", "kurenai"];

const [outfile, ...decks] = process.argv.slice(2);
const registry = mergeThemes(builtinThemeEntries(), []).map;
const result: Record<string, unknown> = {};

for (const path of decks) {
  const deck = parseDeck(readFileSync(path, "utf8"));
  result[path] = {
    deck,
    slides: deck.slides.map((s) =>
      renderMarkdown({ markdown: s.markdown, resolveEmbed: () => null }),
    ),
    css: Object.fromEntries(
      THEMES.map((t) => [t, deckCss(resolveTheme(registry, t), "")]),
    ),
  };
}

writeFileSync(outfile, JSON.stringify(result, null, 2));
