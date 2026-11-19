import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import katexImport from "@vscode/markdown-it-katex";
import hljs from "./hljs";
import type { SlideWarning } from "../constraints/engine";
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
  /** Levels to lift every heading by: `h<max(1, level - headingShift)>`. A deck without any `#`
   *  passes `deckHeadingShift(allRegions)` here so its highest level becomes the title. Unset,
   *  0 or negative leaves headings as written. */
  headingShift?: number;
}

export interface RenderedSlide {
  html: string;
  warnings: SlideWarning[];
}

export function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Inverse of toBase64Utf8. atob() alone yields one char per byte (Latin-1), so every
 *  non-ASCII character comes out as mojibake ("geprüft" -> "geprÃ¼ft"); the bytes must be
 *  decoded as UTF-8. */
export function fromBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
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

  // Heading shift: after block parsing every heading_open/heading_close is retagged, so the
  // output of a deck written from `##` down reads as if it had been written from `#` down.
  // Block tokens only — a `#` in a fence or in HTML never became a heading token.
  md.core.ruler.after("block", "sd_heading_shift", (state) => {
    const shift = (state.env as { headingShift?: number } | undefined)?.headingShift ?? 0;
    if (!(shift > 0)) return;
    for (const t of state.tokens) {
      if (t.type !== "heading_open" && t.type !== "heading_close") continue;
      t.tag = "h" + Math.max(1, Number(t.tag.slice(1)) - shift);
    }
  });

  // Mermaid fence override — emit placeholder div, no SVG in core
  const defaultFence = md.renderer.rules.fence!;
  const mermaidFence: RenderRule = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() === "mermaid") {
      // token.content includes a trailing newline added by markdown-it; strip it
      const b64 = toBase64Utf8(token.content.replace(/\n$/, ""));
      return `<div class="sd-mermaid" data-src="${b64}"></div>`;
    }
    if (token.info.trim() === "slide-image") {
      // Der Kern reicht den Rohtext durch und parst ihn NICHT: die Feld-Grammatik ist
      // Doktrin des Consumers und wird sich ändern; ein Kern-Release würde sie einfrieren.
      const raw = token.content.replace(/\n$/, "");
      return `<div class="sd-image-slot"><pre>${md.utils.escapeHtml(raw)}</pre></div>`;
    }
    return defaultFence(tokens, idx, opts, env, self);
  };
  md.renderer.rules.fence = mermaidFence;

  // Markdown images get the same media class as ![[embeds]] so the centered/
  // contain media CSS + image-focus sizing apply to both syntaxes.
  const defaultImage = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (token.attrIndex("class") < 0) token.attrPush(["class", "sd-embed"]);
    return defaultImage(tokens, idx, opts, env, self);
  };

  return md;
}

interface EmbedRef {
  path: string;
  size: { width: number; height: number | null } | null;
  alt: string | null;
}

/** Split `path|48`, `path|48x30` or `path|Alt Text` at the first pipe, as Obsidian reads it.
 *  The part after the pipe is a width, a width and height, or else the alt text. In a table cell
 *  the pipe is written `\|`; the backslash belongs to the table syntax, not to the path. */
function splitEmbedRef(ref: string): EmbedRef {
  const bar = ref.indexOf("|");
  if (bar < 0) return { path: ref.trim(), size: null, alt: null };
  const path = ref.slice(0, bar).replace(/\\$/, "").trim();
  const rest = ref.slice(bar + 1).trim();
  const wh = /^(\d+)(?:x(\d+))?$/.exec(rest);
  if (wh) return { path, size: { width: Number(wh[1]), height: wh[2] !== undefined ? Number(wh[2]) : null }, alt: null };
  return { path, size: null, alt: rest === "" ? null : rest };
}

const EMBED_RE = /!\[\[([^\]]+?)\]\]/g;

/** Apply `replacer` to every ![[ref]] that is not inside code. Block code comes from
 *  `md.parse` (`fence` and `code_block` carry their line range in `map`); those lines are left
 *  untouched. On the remaining lines code spans are skipped. Embeds stay a text pre-processing
 *  step on purpose: a lone `![[x]]` line becomes a bare <img> HTML block (no <p>), and image
 *  slots, `cover` and the media cells in render-dom depend on that DOM. */
function replaceEmbedsOutsideCode(
  md: MarkdownIt,
  source: string,
  replacer: (match: string, ref: string) => string,
): string {
  if (!source.includes("![[")) return source;
  const codeLines = new Set<number>();
  for (const t of md.parse(source, {})) {
    if ((t.type === "fence" || t.type === "code_block") && t.map) {
      for (let l = t.map[0]; l < t.map[1]; l++) codeLines.add(l);
    }
  }
  // Even indexes are lines, odd indexes their separators (kept, so the text round-trips).
  const parts = source.split(/(\r\n|\r|\n)/);
  const out: string[] = [];
  let run: string[] = []; // consecutive prose lines with their separators, until a blank/code line
  const flush = () => {
    if (run.length) out.push(replaceOutsideCodeSpans(run.join(""), replacer));
    run = [];
  };
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const sep = parts[i + 1] ?? "";
    if (codeLines.has(i / 2)) {
      flush();
      out.push(line, sep);
    } else if (line.trim() === "") {
      // a blank line ends the paragraph, and with it any code span
      flush();
      out.push(line, sep);
    } else {
      run.push(line, sep);
    }
  }
  flush();
  return out.join("");
}

/** Replace embeds in `text` except inside code spans. A span opens at a backtick run of n and
 *  closes at the next run of exactly n; an unclosed run is literal text. A backslash escapes the
 *  next character outside spans, like in markdown-it. */
function replaceOutsideCodeSpans(
  text: string,
  replacer: (match: string, ref: string) => string,
): string {
  let out = "";
  let plain = 0; // start of the pending non-code stretch
  let i = 0;
  const flushPlain = (end: number) => {
    out += text.slice(plain, end).replace(EMBED_RE, replacer);
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c !== "`") {
      i++;
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n++;
    let j = i + n;
    let close = -1;
    while (j < text.length) {
      if (text[j] !== "`") {
        j++;
        continue;
      }
      let m = 0;
      while (text[j + m] === "`") m++;
      if (m === n) {
        close = j + m;
        break;
      }
      j += m;
    }
    if (close < 0) {
      i += n; // no closer: the run is literal
      continue;
    }
    flushPlain(i);
    out += text.slice(i, close);
    plain = close;
    i = close;
  }
  flushPlain(text.length);
  return out;
}

/** How far to lift the headings of a whole deck: 0 if any region holds an h1 (or no heading at
 *  all), else the lowest level found minus 1. Headings are found with `md.parse` of the SAME
 *  markdown-it configuration `renderMarkdown` uses, so Setext headings, headings in quotes and
 *  callouts count, and fences, indented code and HTML blocks do not. Pass the regions of ALL
 *  slides: one `#` anywhere (say `# Danke` at the end) keeps the whole deck on the plain reading. */
export function deckHeadingShift(regions: readonly string[]): number {
  const md = buildMd();
  let lowest = 7;
  for (const region of regions) {
    for (const t of md.parse(region, {})) {
      if (t.type !== "heading_open") continue;
      const level = Number(t.tag.slice(1));
      if (level < lowest) lowest = level;
    }
  }
  return lowest === 7 ? 0 : lowest - 1;
}

export function renderMarkdown(input: RenderInput): RenderedSlide {
  const md = buildMd();
  const warnings: SlideWarning[] = [];

  // Pre-process ![[ref]] Obsidian embed syntax before markdown-it sees it — but never inside
  // code. Block code (fence, indented) is found by parsing with THIS markdown-it instance and
  // reading the line ranges of its tokens; code spans are skipped by `mapOutsideCodeSpans`.
  const preprocessed = replaceEmbedsOutsideCode(md, input.markdown, (_m, ref: string) => {
    const { path, size, alt } = splitEmbedRef(ref);
    const src = input.resolveEmbed(path);
    if (src) {
      const attrs = size
        ? `class="sd-embed sd-embed-sized" width="${size.width}"${size.height !== null ? ` height="${size.height}"` : ""}`
        : `class="sd-embed"`;
      return `<img ${attrs} alt="${md.utils.escapeHtml(alt ?? path)}" src="${src}">`;
    }
    warnings.push({ kind: "missing-embed", message: `Embed not found: ${path}` });
    return `<span class="sd-missing-embed">⟪ ${md.utils.escapeHtml(path)} ⟫</span>`;
  });

  // Bind an inline element (e.g. a KaTeX "→") to the code chip that follows it:
  // a chain like `a` → `b` must never break AFTER the arrow, or the arrow's
  // target starts a line alone ("orphaned arrow"). Chips themselves are
  // nowrap via CSS; the joining space becomes non-breaking here.
  const html = md.render(preprocessed, { headingShift: input.headingShift ?? 0 }).replace(/(<\/span>) +(<code)/g, "$1&nbsp;$2");
  return { html, warnings };
}
