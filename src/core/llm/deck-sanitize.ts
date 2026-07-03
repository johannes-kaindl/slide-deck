const FENCE_RE = /^\s*(```|~~~)/;
// General frontmatter key grammar — mirrors slide-model.ts parseFrontmatter (`\s*` allows `theme:dark`).
const FM_KEY_RE = /^\w+:\s*\S/;
// Recognized deck directive keys — used ONLY to drop echoed frontmatter blocks mid-deck.
const DIRECTIVE_KEY_RE = /^(theme|aspect|minFontPx|header|footer|paginate):\s*\S/;

/** Line-0 `---` … next `---`. Returns the closing delimiter index, or null if there is no block. */
export function frontmatterRange(lines: string[]): { end: number } | null {
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.indexOf("---", 1);
  return end === -1 ? null : { end };
}

function cutBareThink(md: string): string {
  const close = md.indexOf("</think>");
  if (close === -1) return md;
  const open = md.indexOf("<think>");
  if (open !== -1 && open < close) return md; // properly paired
  const nl = md.indexOf("\n", close);
  return nl === -1 ? "" : md.slice(nl + 1);
}

function stripPreambleChatter(md: string): string {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const l = lines[i]?.trim() ?? "";
  const isBlock = /^([#>|`]|[-*+]\s|\d+[.)]\s|---)/.test(l) || FM_KEY_RE.test(l);
  if (i < lines.length && !isBlock && /\S\s.*:$/.test(l)) {
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    return lines.slice(i).join("\n");
  }
  return md;
}

/** Unwrap ONLY a true whole-output code fence (```markdown … ``` or bare ``` … ```) with no
 *  interior fence line — a deck whose slides are themselves code fences is left intact. */
function unwrapFence(md: string): string {
  const lines = md.split("\n");
  const openM = /^(```|~~~)(markdown|md)?[ \t]*$/.exec(lines[0] ?? "");
  if (!openM || lines.length < 2) return md;
  const marker = openM[1];
  const closeIdx = lines.length - 1;
  if (lines[closeIdx].trim() !== marker) return md;
  for (let i = 1; i < closeIdx; i++) if (lines[i].trim() === marker) return md; // interior fence → real code
  return lines.slice(1, closeIdx).join("\n");
}

function fixLeadingSeparator(md: string): string {
  const lines = md.split("\n");
  if (lines[0]?.trim() !== "---") return md;
  const range = frontmatterRange(lines);
  if (!range) return md; // no closing delimiter → a lone leading --- yields no phantom slide
  const inner = lines.slice(1, range.end);
  const isFrontmatter = inner.every((l) => l.trim() === "" || FM_KEY_RE.test(l.trim()));
  return isFrontmatter ? md : lines.slice(1).join("\n"); // stray leading separator before content → strip
}

/** Fence-aware final pass: quote-normalize aspect/theme in frontmatter, normalize body
 *  separator whitespace, and drop key:-only slides (repeated frontmatter blocks). */
function finalPass(md: string): string {
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  const fmEnd = range ? range.end : -1;

  if (fmEnd !== -1) {
    for (let i = 1; i < fmEnd; i++) {
      const m = /^(aspect|theme):\s*(.+?)\s*$/.exec(lines[i]);
      if (m) lines[i] = `${m[1]}: ${m[2].replace(/^["']|["']$/g, "")}`;
    }
  }

  const head = fmEnd === -1 ? [] : lines.slice(0, fmEnd + 1);
  const body = lines.slice(fmEnd === -1 ? 0 : fmEnd + 1);

  const slides: string[][] = [[]];
  let inFence = false, marker = "";
  for (const line of body) {
    const fm = FENCE_RE.exec(line);
    if (fm) {
      if (!inFence) { inFence = true; marker = fm[1]; }
      else if (fm[1] === marker) { inFence = false; marker = ""; }
      slides[slides.length - 1].push(line);
      continue;
    }
    if (!inFence && line.trim() === "---") slides.push([]);
    else slides[slides.length - 1].push(line);
  }
  const kept = slides.filter((s) => {
    const nonEmpty = s.map((l) => l.trim()).filter(Boolean);
    if (nonEmpty.length === 0) return true;
    return !nonEmpty.every((l) => DIRECTIVE_KEY_RE.test(l)); // drop only echoed directive blocks
  });
  const bodyOut = kept.map((s) => s.join("\n")).join("\n---\n");
  return head.length ? `${head.join("\n")}\n${bodyOut}` : bodyOut;
}

/** Turn a raw LLM response into clean slide-deck Markdown (deterministic; see Spec §6.1). */
export function extractDeckMarkdown(raw: string): string {
  let md = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  md = cutBareThink(md).trim();
  md = stripPreambleChatter(md).trim();
  md = unwrapFence(md).trim();
  md = fixLeadingSeparator(md).trim();
  md = finalPass(md).trim();
  return md;
}

/** Set the deck theme inside the frontmatter block only (mirrors parseFrontmatter's scope).
 *  Injects a fresh block if none exists. Run AFTER extractDeckMarkdown. */
export function setDeckTheme(md: string, key: string): string {
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  if (!range) return `---\ntheme: ${key}\n---\n${md}`;
  for (let i = 1; i < range.end; i++) {
    if (/^theme:\s/.test(lines[i])) { lines[i] = `theme: ${key}`; return lines.join("\n"); }
  }
  lines.splice(1, 0, `theme: ${key}`);
  return lines.join("\n");
}

const SLOT_KEY_RE = /^(header|footer|paginate):\s*\S/;

/** Move deck-slot lines (header:/footer:/paginate:) the model emitted as leading BODY content
 *  into the frontmatter block, where parseFrontmatter reads them (otherwise they render as stray
 *  text on slide 1). Assumes a frontmatter block exists (run after setDeckTheme). No-op otherwise. */
export function hoistDeckSlots(md: string): string {
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  if (!range) return md;
  const slots: string[] = [];
  let k = range.end + 1;
  while (k < lines.length) {
    const l = lines[k].trim();
    if (l === "") { k++; continue; }
    if (SLOT_KEY_RE.test(l)) { slots.push(l); k++; continue; }
    break; // first real content → stop
  }
  if (slots.length === 0) return md;
  const fm = [...lines.slice(0, range.end), ...slots, lines[range.end]]; // insert before closing ---
  const body = lines.slice(k).join("\n").replace(/^\n+/, "");
  return `${fm.join("\n")}\n${body}`;
}

/** Set a `source:` frontmatter link back to the origin note (Obsidian frontmatterLinks →
 *  backlink/graph). `link` is a wikilink like `[[Note]]`; it MUST be quoted, otherwise YAML
 *  reads `[[Note]]` as a nested sequence. Injects a block if none exists. Run AFTER setDeckTheme. */
export function setDeckSource(md: string, link: string): string {
  const value = `source: "${link}"`;
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  if (!range) return `---\n${value}\n---\n${md}`;
  for (let i = 1; i < range.end; i++) {
    if (/^source:\s/.test(lines[i])) { lines[i] = value; return lines.join("\n"); }
  }
  lines.splice(1, 0, value);
  return lines.join("\n");
}
