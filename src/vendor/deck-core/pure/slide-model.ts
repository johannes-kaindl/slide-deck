import { parseDirectives, type DirectiveWarning } from "./directives";
import { inferLayout } from "./infer-layout";

export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; header?: string; footer?: string; paginate?: boolean; }
export interface Slide {
  index: number; markdown: string; speakerNotes?: string; startLine: number;
  layout: string; modifiers: string[]; regions: string[]; directiveWarnings: DirectiveWarning[];
}
export interface SlideDeck { directives: DeckDirectives; slides: Slide[]; }

/** Does this slide pull its first image into a full-bleed background layer?
 *
 *  Two ways to say so: the built-in `cover-image` layout, or the `cover` modifier on any
 *  layout name. The modifier exists because the built-in way is a name comparison, and a
 *  theme's own layouts do not inherit from a name — so a theme with its own picture slides
 *  had to run them as `cover-image` plus modifiers instead of under their own names, which
 *  reads worse in the markdown than it needs to.
 *
 *  One function rather than the comparison repeated at each site: the renderer asks three
 *  times (extract the image; do NOT mark an in-flow media cell; same for multi-region), and
 *  the three have to agree. Two of them ask it negated, which is exactly where a fourth site
 *  would eventually disagree. */
export function wantsCover(slide: Pick<Slide, "layout" | "modifiers">): boolean {
  return slide.layout === "cover-image" || slide.modifiers.includes("cover");
}

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
    else if (key === "header") d.header = val.replace(/^["']|["']$/g, "");
    else if (key === "footer") d.footer = val.replace(/^["']|["']$/g, "");
    else if (key === "paginate") d.paginate = /^(true|yes|on)$/i.test(val);
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
      const layout = d.layoutExplicit ? d.layout : inferLayout(d.regions);
      slides.push({
        index: slides.length, markdown: d.regions.join("\n"), startLine: slideStart,
        layout, modifiers: d.modifiers, regions: d.regions, directiveWarnings: d.warnings,
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
