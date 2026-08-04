import { PRESETS, presetFor, presetTokensCss, assembleDeckCss, mermaidVarsFor, type ThemeEntry } from "./presets";
import { parseBaseFontPx, parseThemeMeta } from "./theme-key";
import { STRUCTURE_CSS } from "./presets/structure.css";
import { LAYOUTS_CSS } from "./presets/layouts.css";

/** The third-party CSS this package refuses to import itself: importing a `.css` file is a
 *  bundler assumption (esbuild needs a text loader, Vite `?inline`, plain tsc cannot at all),
 *  and deck-core makes no assumptions about its host. The host reads them, we arrange them. */
export interface VendorCss {
  katex: string;
  /** highlight.js styles by name: `github`, `github-dark`, `gruvbox-dark-hard`. */
  hljs: Record<string, string>;
}

function hljsFor(vendor: VendorCss, name: string | undefined): string {
  return vendor.hljs[name ?? ""] ?? vendor.hljs["github-dark"];
}

/** The five nordstern built-in themes as registry entries (token block + extraCss + their hljs + mermaid). */
export function builtinThemeEntries(vendor: VendorCss): ThemeEntry[] {
  return Object.values(PRESETS).map((p) => ({
    key: p.id,
    label: p.label,
    source: "builtin" as const,
    themeCss: presetTokensCss(p) + (p.extraCss ? "\n" + p.extraCss : ""),
    hljs: hljsFor(vendor, p.hljs),
    katex: vendor.katex,
    mermaid: p.mermaid,
    mermaidVars: mermaidVarsFor(p.tokens),
    baseFontPx: p.baseFontPx,
  }));
}

/** A user .css theme as a registry entry. Code/Mermaid scheme come from the file's optional
 *  `sd-hljs` / `sd-mermaid` directives (falling back to the shiro builtin); baseFontPx from
 *  the file's --sd-base if present, else the shiro builtin's. */
export function userThemeEntry(key: string, fileCss: string, vendor: VendorCss): ThemeEntry {
  const d = presetFor("shiro");
  const meta = parseThemeMeta(fileCss);
  return {
    key,
    label: meta.label,
    source: "user" as const,
    themeCss: fileCss,
    // Drei Stufen, und die mittlere ist die wichtige: ein unbekanntes `sd-hljs`
    // fällt auf das Schema des shiro-Presets zurück (`github`, hell) — nicht auf
    // `github-dark`. Wer das verkürzt, gibt einem hellen Nutzer-Theme mit
    // vertippter Angabe dunkle Code-Blöcke.
    hljs: vendor.hljs[meta.hljs ?? ""] ?? hljsFor(vendor, d.hljs),
    katex: vendor.katex,
    mermaid: meta.mermaid ?? d.mermaid,
    baseFontPx: parseBaseFontPx(fileCss) ?? d.baseFontPx,
  };
}

/** Full self-contained CSS for a rendered deck: math + per-theme code theme + structural CSS
 *  + layout CSS + the theme's token/user CSS + optional global custom CSS (last, overrides all). */
export function deckCss(entry: ThemeEntry, customCss = ""): string {
  return assembleDeckCss([entry.katex, entry.hljs, STRUCTURE_CSS, LAYOUTS_CSS, entry.themeCss, customCss]);
}
