// src/core/directives.ts
export interface DirectiveWarning { kind: string; message: string; }
export interface DirectiveResult { layout: string; layoutExplicit: boolean; regions: string[]; warnings: DirectiveWarning[]; }

const FENCE_RE = /^\s*(```|~~~)/;
const LAYOUT_RE = /^<!--\s*layout\s*:\s*([A-Za-z-]+)\s*-->$/i;
const COLUMN_RE = /^<!--\s*column\s*-->$/i;
const LAYOUT_LIKE = /^<!--\s*layout\b/i;
const COLUMN_LIKE = /^<!--\s*column\b/i;
/** Catches any <!--word:--> comment that looks directive-like but wasn't recognized. */
const DIRECTIVE_LIKE = /^<!--\s*\w[\w-]*\s*:/i;

/** Parse per-slide directives. Fence-aware: directives inside ```/~~~ blocks are literal.
 *  Indented code blocks are intentionally NOT fence-protected (rare; documented limitation).
 *  CRLF line endings are normalized to LF internally before parsing. */
export function parseDirectives(slideMarkdown: string): DirectiveResult {
  const lines = slideMarkdown.replace(/\r\n/g, "\n").split("\n");
  const warnings: DirectiveWarning[] = [];
  let layout = "default";
  let layoutSet = false;
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
      if (!layoutSet) { layout = lm[1].toLowerCase(); layoutSet = true; }
      else warnings.push({ kind: "layout-multiple", message: "Multiple layout directives — using the first." });
      continue;
    }
    if (LAYOUT_LIKE.test(trimmed) || COLUMN_LIKE.test(trimmed) || DIRECTIVE_LIKE.test(trimmed)) {
      warnings.push({ kind: "directive-malformed", message: `Unrecognized directive: ${trimmed}` });
      continue;
    }
    push(line);
  }

  // Trim each region's leading/trailing blank lines (left by author formatting around directives).
  const regionStrings = regions.map((r) => r.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""));
  return { layout, layoutExplicit: layoutSet, regions: regionStrings, warnings };
}
