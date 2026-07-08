// Browser-IIFE: von scripts/visual-smoke.mjs gebündelt und in eine Headless-Chrome-Seite
// injiziert. Rendert ein Deck durch die ECHTE Pipeline (parseDeck → renderDeckToContainer
// inkl. Fit-Messung, compose-center, Titel-Hoist) mit dem echten deckCss.
import { parseDeck } from "../src/core/slide-model";
import { mergeThemes, resolveTheme } from "../src/core/presets";
import { builtinThemeEntries, deckCss } from "../src/deck-css";
import { renderDeckToContainer } from "../src/render-dom";

declare global { interface Window { __DECK_MD__: string; __THEME__: string; __EXTRA_CSS__?: string; __DONE__?: boolean } }

(async () => {
  const deck = parseDeck(window.__DECK_MD__);
  deck.directives.theme = window.__THEME__;
  const { map } = mergeThemes(builtinThemeEntries(), []);
  const entry = resolveTheme(map, deck.directives.theme);
  const style = document.createElement("style");
  // __EXTRA_CSS__ (optional): appended last so it can override token/theme rules —
  // used to preview candidate token values without editing a preset.
  style.textContent = deckCss(entry) + (window.__EXTRA_CSS__ ? "\n" + window.__EXTRA_CSS__ : "");
  document.head.appendChild(style);
  document.body.style.margin = "0";
  const container = document.createElement("div");
  document.body.appendChild(container);
  await renderDeckToContainer(document, container, deck, () => null, map);
  window.__DONE__ = true;
})();
