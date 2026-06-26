import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import katexImport from "@vscode/markdown-it-katex";
import hljs from "highlight.js";
import type { Warning } from "../constraints/engine";
import { calloutPlugin } from "./callouts";

// Interop guard: esbuild's CJS bundling exposes this package's default export as
// `{ default: fn }` at runtime, while vitest/ESM exposes the fn directly. Without
// this, `md.use(katexImport)` receives a non-callable object → "e.apply is not a
// function" at runtime (passes in vitest, fails in the real bundle). Normalize to
// the function so it works in both. (Verified via esbuild-bundle smoke.)
const katexPlugin = (katexImport as unknown as { default?: typeof katexImport }).default ?? katexImport;

export interface RenderInput {
  markdown: string;
  resolveEmbed: (ref: string) => string | null;
}

export interface RenderedSlide {
  html: string;
  warnings: Omit<Warning, "slideIndex">[];
}

function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function highlight(str: string, lang: string): string {
  const escaped = MarkdownIt().utils.escapeHtml(str);
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
    } catch {
      /* fallthrough */
    }
  }
  return `<pre class="hljs"><code>${escaped}</code></pre>`;
}

function buildMd(): MarkdownIt {
  const md = new MarkdownIt({ html: true, highlight });

  md.use(katexPlugin);
  md.use(calloutPlugin);

  // Mermaid fence override — emit placeholder div, no SVG in core
  const defaultFence = md.renderer.rules.fence!;
  const mermaidFence: RenderRule = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() === "mermaid") {
      // token.content includes a trailing newline added by markdown-it; strip it
      const b64 = toBase64Utf8(token.content.replace(/\n$/, ""));
      return `<div class="sd-mermaid" data-src="${b64}"></div>`;
    }
    return defaultFence(tokens, idx, opts, env, self);
  };
  md.renderer.rules.fence = mermaidFence;

  return md;
}

export function renderMarkdown(input: RenderInput): RenderedSlide {
  const md = buildMd();
  const warnings: Omit<Warning, "slideIndex">[] = [];

  // Pre-process ![[ref]] Obsidian embed syntax before markdown-it sees it
  const preprocessed = input.markdown.replace(/!\[\[([^\]]+?)\]\]/g, (_m, ref: string) => {
    const trimmed = ref.trim();
    const src = input.resolveEmbed(trimmed);
    if (src) {
      return `<img class="sd-embed" alt="${md.utils.escapeHtml(trimmed)}" src="${src}">`;
    }
    warnings.push({ kind: "missing-embed", message: `Embed not found: ${trimmed}` });
    return `<span class="sd-missing-embed">⟪ ${md.utils.escapeHtml(trimmed)} ⟫</span>`;
  });

  const html = md.render(preprocessed);
  return { html, warnings };
}
