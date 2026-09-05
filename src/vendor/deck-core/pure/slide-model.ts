import { parseDirectives, type DirectiveWarning } from "./directives";
import { inferLayout } from "./infer-layout";

export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; header?: string; footer?: string; paginate?: boolean; modifiers?: string[]; sender?: string; }
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
    else if (key === "sender") d.sender = val.replace(/^["']|["']$/g, "");
    else if (key === "paginate") d.paginate = /^(true|yes|on)$/i.test(val);
    else if (key === "modifiers") d.modifiers = val.split(/[\s,]+/).map((m) => m.toLowerCase()).filter(Boolean);
  }
  return { directives: d, bodyStart: end + 1, hasFrontmatter: true };
}

const FENCE_RE = /^\s*(```|~~~)/;

/** Parser options. Deliberately not part of DeckDirectives: `knownModifiers` is what the
 *  THEME declared, not what the deck asked for — folding it into the directives would
 *  hang theme knowledge off every parsed deck. */
export interface ParseOptions { knownModifiers?: readonly string[]; }

export function parseDeck(source: string, defaults?: Partial<DeckDirectives>, opts?: ParseOptions): SlideDeck {
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
      const d = parseDirectives(md, opts?.knownModifiers);
      const layout = d.layoutExplicit ? d.layout : inferLayout(d.regions);
      // Deck-wide modifiers lead, per-slide ones follow; a name declared in both appears
      // once. The order carries no cascade meaning — class order in the attribute does not
      // decide anything in CSS — it only keeps the shared prefix stable across slides.
      const deckMods = (directives.modifiers ?? []).filter((m) => !d.modifiers.includes(m));
      slides.push({
        index: slides.length, markdown: d.regions.join("\n"), startLine: slideStart,
        layout, modifiers: [...deckMods, ...d.modifiers], regions: d.regions, directiveWarnings: d.warnings,
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
