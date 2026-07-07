import katexCss from "katex/dist/katex.min.css";
import githubCss from "highlight.js/styles/github.css";
import githubDarkCss from "highlight.js/styles/github-dark.css";
import gruvboxDarkHardCss from "highlight.js/styles/base16/gruvbox-dark-hard.css";
import { PRESETS, presetFor, presetTokensCss, assembleDeckCss, mermaidVarsFor, type ThemeEntry } from "./core/presets";
import { parseBaseFontPx, parseThemeMeta } from "./core/theme-key";
import { STRUCTURE_CSS } from "./core/presets/structure.css";
import { LAYOUTS_CSS } from "./core/presets/layouts.css";

const HLJS: Record<string, string> = { github: githubCss, "github-dark": githubDarkCss, "gruvbox-dark-hard": gruvboxDarkHardCss };

/** The five nordstern built-in themes as registry entries (token block + extraCss + their hljs + mermaid). */
export function builtinThemeEntries(): ThemeEntry[] {
  return Object.values(PRESETS).map((p) => ({
    key: p.id,
    label: p.label,
    source: "builtin" as const,
    themeCss: presetTokensCss(p) + (p.extraCss ? "\n" + p.extraCss : ""),
    hljs: HLJS[p.hljs] ?? HLJS["github-dark"],
    mermaid: p.mermaid,
    mermaidVars: mermaidVarsFor(p.tokens),
    baseFontPx: p.baseFontPx,
  }));
}

/** A user .css theme as a registry entry. Code/Mermaid scheme come from the file's optional
 *  `/* sd-hljs / sd-mermaid *\/` directives (falling back to the shiro builtin); baseFontPx
 *  from the file's --sd-base if present, else the shiro builtin's. */
export function userThemeEntry(key: string, fileCss: string): ThemeEntry {
  const d = presetFor("shiro");
  const meta = parseThemeMeta(fileCss);
  return {
    key,
    label: meta.label,
    source: "user" as const,
    themeCss: fileCss,
    hljs: HLJS[meta.hljs ?? ""] ?? HLJS[d.hljs] ?? HLJS["github-dark"],
    mermaid: meta.mermaid ?? d.mermaid,
    baseFontPx: parseBaseFontPx(fileCss) ?? d.baseFontPx,
  };
}

/** Full self-contained CSS for a rendered deck: math + per-theme code theme + structural CSS
 *  + layout CSS + the theme's token/user CSS + optional global custom CSS (last, overrides all). */
export function deckCss(entry: ThemeEntry, customCss = ""): string {
  return assembleDeckCss([katexCss, entry.hljs, STRUCTURE_CSS, LAYOUTS_CSS, entry.themeCss, customCss]);
}
