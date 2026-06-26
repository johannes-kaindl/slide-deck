import katexCss from "katex/dist/katex.min.css";
import githubCss from "highlight.js/styles/github.css";
import githubDarkCss from "highlight.js/styles/github-dark.css";
import { presetFor, presetTokensCss, assembleDeckCss } from "./core/presets";
import { STRUCTURE_CSS } from "./core/presets/structure.css";
import { LAYOUTS_CSS } from "./core/presets/layouts.css";

const HLJS: Record<string, string> = { github: githubCss, "github-dark": githubDarkCss };

/** Full self-contained CSS for a rendered deck: math + per-theme code theme +
 *  structural CSS + layout CSS + preset tokens + optional user custom CSS (last). */
export function deckCss(presetId: string, customCss = ""): string {
  const preset = presetFor(presetId);
  const hljs = HLJS[preset.hljs] ?? HLJS["github-dark"];
  return assembleDeckCss([katexCss, hljs, STRUCTURE_CSS, LAYOUTS_CSS, presetTokensCss(preset), customCss]);
}
