import type { MermaidTheme } from "./presets";

/** Theme key = the .css file's name without its extension, verbatim (frontmatter "theme:" value). */
export function keyFromFilename(filename: string): string {
  return filename.trim().replace(/\.css$/i, "");
}

/** Read the --sd-base legibility-floor token (in px) from a theme's CSS, if it declares one. */
export function parseBaseFontPx(css: string): number | undefined {
  const m = /--sd-base\s*:\s*([\d.]+)px/.exec(css);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const HLJS_META_RE = /\/\*\s*sd-hljs\s*:\s*([A-Za-z0-9-]+)\s*\*\//i;
const MERMAID_META_RE = /\/\*\s*sd-mermaid\s*:\s*([A-Za-z]+)\s*\*\//i;
const LABEL_META_RE = /\/\*\s*sd-label\s*:\s*(.+?)\s*\*\//i;
const MERMAID_VALUES = ["default", "dark", "neutral", "forest"];
/** Global on purpose — the directive may appear any number of times. Read with `matchAll`,
 *  never `.exec` in a loop: a module-level /g/ regex carries `lastIndex` between calls. */
const MERMAID_VAR_RE = /\/\*\s*sd-mermaid-var\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s+([^*]+?)\s*\*\//gi;
const MODIFIERS_META_RE = /\/\*\s*sd-modifiers\s*:\s*([^*]+?)\s*\*\//i;

/** Read optional `sd-hljs`, `sd-mermaid` and `sd-label` header directives from a
 *  theme's CSS (analogous to parseBaseFontPx). hljs is returned raw (validated against the
 *  HLJS map by the adapter); mermaid is validated against the MermaidTheme union here;
 *  label is a free-text display name (spaces + unicode allowed, single line). */
export function parseThemeMeta(
  css: string,
): { hljs?: string; mermaid?: MermaidTheme; label?: string; mermaidVars?: Record<string, string>; modifiers?: string[] } {
  const out: { hljs?: string; mermaid?: MermaidTheme; label?: string; mermaidVars?: Record<string, string>; modifiers?: string[] } = {};
  const h = HLJS_META_RE.exec(css);
  if (h) out.hljs = h[1];
  const m = MERMAID_META_RE.exec(css);
  if (m) {
    const v = m[1].toLowerCase();
    if (MERMAID_VALUES.includes(v)) out.mermaid = v as MermaidTheme;
  }
  const l = LABEL_META_RE.exec(css);
  if (l) out.label = l[1].trim();
  const vars: Record<string, string> = {};
  for (const v of css.matchAll(MERMAID_VAR_RE)) vars[v[1]] = v[2].trim();
  // Absent, not empty: the other three fields are optional too, and a caller that spreads
  // this object must not gain an `mermaidVars: {}` that reads as "the theme declared none".
  if (Object.keys(vars).length > 0) out.mermaidVars = vars;
  const mods = MODIFIERS_META_RE.exec(css);
  if (mods) {
    const list = mods[1].split(/[\s,]+/).map((m) => m.toLowerCase()).filter(Boolean);
    if (list.length > 0) out.modifiers = list;
  }
  return out;
}
