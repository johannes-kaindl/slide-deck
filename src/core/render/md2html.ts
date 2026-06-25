import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import katex from "@vscode/markdown-it-katex";
import hljs from "highlight.js";
import type { Warning } from "../constraints/engine";
import { calloutPlugin } from "./callouts";

export interface RenderInput {
  markdown: string;
  resolveEmbed: (ref: string) => string | null;
}

export interface RenderedSlide {
  html: string;
  warnings: Omit<Warning, "slideIndex">[];
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

  md.use(katex);
  md.use(calloutPlugin);

  // Mermaid fence override — emit placeholder div, no SVG in core
  const defaultFence = md.renderer.rules.fence!;
  const mermaidFence: RenderRule = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() === "mermaid") {
      // token.content includes a trailing newline added by markdown-it; strip it
      const b64 = Buffer.from(token.content.replace(/\n$/, ""), "utf8").toString("base64");
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
