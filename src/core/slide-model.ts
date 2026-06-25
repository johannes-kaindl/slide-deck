export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; }
export interface Slide { index: number; markdown: string; speakerNotes?: string; startLine: number; }
export interface SlideDeck { directives: DeckDirectives; slides: Slide[]; }

const DEFAULTS: DeckDirectives = { theme: "default", aspect: "16:9", minFontPx: 24 };

function parseFrontmatter(lines: string[]): { directives: DeckDirectives; bodyStart: number } {
  if (lines[0] !== "---") return { directives: { ...DEFAULTS }, bodyStart: 0 };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { directives: { ...DEFAULTS }, bodyStart: 0 };
  const d: DeckDirectives = { ...DEFAULTS };
  for (let i = 1; i < end; i++) {
    const m = /^(\w+):\s*(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "theme") d.theme = val;
    else if (key === "aspect" && (val === "16:9" || val === "4:3")) d.aspect = val;
    else if (key === "minFontPx") { const n = Number(val); if (Number.isFinite(n) && n > 0) d.minFontPx = n; }
  }
  return { directives: d, bodyStart: end + 1 };
}

export function parseDeck(source: string): SlideDeck {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const { directives, bodyStart } = parseFrontmatter(lines);
  const slides: Slide[] = [];
  let buf: string[] = [];
  let slideStart: number | null = null;
  const flush = (endLine: number) => {
    const md = buf.join("\n");
    if (md.trim().length > 0 && slideStart !== null) slides.push({ index: slides.length, markdown: md, startLine: slideStart });
    void endLine;
  };
  for (let i = bodyStart; i < lines.length; i++) {
    if (lines[i].trim() === "---") { flush(i); buf = []; slideStart = null; }
    else {
      if (slideStart === null && lines[i].trim() !== "") slideStart = i;
      buf.push(lines[i]);
    }
  }
  flush(lines.length);
  return { directives, slides };
}
