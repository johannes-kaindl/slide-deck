// src/core/directives.ts
export interface DirectiveWarning { kind: string; message: string; }
export interface DirectiveResult { layout: string; layoutExplicit: boolean; modifiers: string[]; regions: string[]; warnings: DirectiveWarning[]; }

const FENCE_RE = /^\s*(```|~~~)/;
const LAYOUT_RE = /^<!--\s*layout\s*:\s*([A-Za-z][A-Za-z0-9 -]*?)\s*-->$/i;
const COLUMN_RE = /^<!--\s*column\s*-->$/i;
const LAYOUT_LIKE = /^<!--\s*layout\b/i;
const COLUMN_LIKE = /^<!--\s*column\b/i;
/** Catches any <!--word:--> comment that looks directive-like but wasn't recognized. */
const DIRECTIVE_LIKE = /^<!--\s*\w[\w-]*\s*:/i;

/** Recognized density modifiers (combine with any structural layout). */
const MODIFIERS = new Set(["compact", "code-heavy"]);

/** Forgiving aliases for layout names authors (and LLMs) naturally reach for. */
const LAYOUT_ALIASES: Record<string, string> = {
  cover: "cover-image",
  columns: "two-column",
  "two-col": "two-column",
  "3-column": "columns-3",
  "three-column": "columns-3",
  image: "image-focus",
};

/** Parse per-slide directives. Fence-aware: directives inside ```/~~~ blocks are literal.
 *  Indented code blocks are intentionally NOT fence-protected (rare; documented limitation).
 *  CRLF line endings are normalized to LF internally before parsing. */
export function parseDirectives(slideMarkdown: string): DirectiveResult {
  const lines = slideMarkdown.replace(/\r\n/g, "\n").split("\n");
  const warnings: DirectiveWarning[] = [];
  let layout = "default";
  let layoutSet = false;
  let layoutDirectiveSeen = false;
  const modifiers: string[] = [];
  let inFence = false;
  let fenceMarker = "";
  const regions: string[][] = [[]];
  const push = (line: string) => regions[regions.length - 1].push(line);

  for (const line of lines) {
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const marker = fm[1];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ""; }
      push(line);
      continue;
    }
    if (inFence) { push(line); continue; }

    const trimmed = line.trim();
    if (COLUMN_RE.test(trimmed)) { regions.push([]); continue; }
    const lm = LAYOUT_RE.exec(trimmed);
    if (lm) {
      if (!layoutDirectiveSeen) {
        layoutDirectiveSeen = true;
        const tokens = lm[1].toLowerCase().split(/\s+/).filter(Boolean);
        const structural = tokens.filter((t) => !MODIFIERS.has(t));
        for (const t of tokens) if (MODIFIERS.has(t) && !modifiers.includes(t)) modifiers.push(t);
        if (structural.length >= 1) { layout = LAYOUT_ALIASES[structural[0]] ?? structural[0]; layoutSet = true; }
        if (structural.length > 1) {
          warnings.push({ kind: "directive-malformed", message: `Unrecognized extra layout token(s): ${structural.slice(1).join(" ")}` });
        }
      } else {
        warnings.push({ kind: "layout-multiple", message: "Multiple layout directives — using the first." });
      }
      continue;
    }
    if (LAYOUT_LIKE.test(trimmed) || COLUMN_LIKE.test(trimmed) || DIRECTIVE_LIKE.test(trimmed)) {
      warnings.push({ kind: "directive-malformed", message: `Unrecognized directive: ${trimmed}` });
      continue;
    }
    push(line);
  }

  const regionStrings = regions.map((r) => r.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""));
  return { layout, layoutExplicit: layoutSet, modifiers, regions: regionStrings, warnings };
}
