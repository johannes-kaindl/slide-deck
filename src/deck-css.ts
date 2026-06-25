import katexCss from "katex/dist/katex.min.css";
import hljsCss from "highlight.js/styles/github-dark.css";
import { presetCss, assembleDeckCss } from "./core/presets/default.css";

/** Full self-contained CSS for a rendered deck: math + code theme + preset. */
export function deckCss(theme: string): string {
  return assembleDeckCss([katexCss, hljsCss, presetCss(theme)]);
}
