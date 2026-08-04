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

/** Read optional `sd-hljs`, `sd-mermaid` and `sd-label` header directives from a
 *  theme's CSS (analogous to parseBaseFontPx). hljs is returned raw (validated against the
 *  HLJS map by the adapter); mermaid is validated against the MermaidTheme union here;
 *  label is a free-text display name (spaces + unicode allowed, single line). */
export function parseThemeMeta(css: string): { hljs?: string; mermaid?: MermaidTheme; label?: string } {
  const out: { hljs?: string; mermaid?: MermaidTheme; label?: string } = {};
  const h = HLJS_META_RE.exec(css);
  if (h) out.hljs = h[1];
  const m = MERMAID_META_RE.exec(css);
  if (m) {
    const v = m[1].toLowerCase();
    if (MERMAID_VALUES.includes(v)) out.mermaid = v as MermaidTheme;
  }
  const l = LABEL_META_RE.exec(css);
  if (l) out.label = l[1].trim();
  return out;
}
