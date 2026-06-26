import { parseDirectives, type DirectiveWarning } from "./directives";

export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; }
export interface Slide {
  index: number; markdown: string; speakerNotes?: string; startLine: number;
  layout: string; regions: string[]; directiveWarnings: DirectiveWarning[];
}
export interface SlideDeck { directives: DeckDirectives; slides: Slide[]; }

const DEFAULTS: DeckDirectives = { theme: "default", aspect: "16:9", minFontPx: 24 };

function parseFrontmatter(lines: string[], base: DeckDirectives): { directives: DeckDirectives; bodyStart: number; hasFrontmatter: boolean } {
  if (lines[0] !== "---") return { directives: { ...base }, bodyStart: 0, hasFrontmatter: false };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { directives: { ...base }, bodyStart: 0, hasFrontmatter: false };
  const d: DeckDirectives = { ...base };
  for (let i = 1; i < end; i++) {
    const m = /^(\w+):\s*(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "theme") d.theme = val;
    else if (key === "aspect" && (val === "16:9" || val === "4:3")) d.aspect = val;
    else if (key === "minFontPx") { const n = Number(val); if (Number.isFinite(n) && n > 0) d.minFontPx = n; }
  }
  return { directives: d, bodyStart: end + 1, hasFrontmatter: true };
}

const FENCE_RE = /^\s*(```|~~~)/;

export function parseDeck(source: string, defaults?: Partial<DeckDirectives>): SlideDeck {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const base: DeckDirectives = { ...DEFAULTS, ...defaults };
  const { directives, bodyStart } = parseFrontmatter(lines, base);
  const slides: Slide[] = [];
  let buf: string[] = [];
  let slideStart: number | null = null;
  let inFence = false;
  let fenceMarker = "";
  const flush = () => {
    const md = buf.join("\n");
    if (md.trim().length > 0 && slideStart !== null) {
      const d = parseDirectives(md);
      slides.push({
        index: slides.length, markdown: d.regions.join("\n"), startLine: slideStart,
        layout: d.layout, regions: d.regions, directiveWarnings: d.warnings,
      });
    }
  };
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const marker = fm[1];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ""; }
      if (slideStart === null && line.trim() !== "") slideStart = i;
      buf.push(line);
      continue;
    }
    if (!inFence && line.trim() === "---") { flush(); buf = []; slideStart = null; }
    else {
      if (slideStart === null && line.trim() !== "") slideStart = i;
      buf.push(line);
    }
  }
  flush();
  return { directives, slides };
}
