const FENCE_RE = /^\s*(```|~~~)/;
// General frontmatter key grammar — mirrors slide-model.ts parseFrontmatter (`\s*` allows `theme:dark`).
const FM_KEY_RE = /^\w+:\s*\S/;
// Any YAML top-level key a model may put into a frontmatter block (`cover-image:`, `og:image:`, `"banner":`,
// empty value before a list). Linear: the segments are separated by the literal `:`.
const ANY_FM_KEY_RE = /^(?:"[^"]*"|'[^']*'|[\w-]+(?::[\w-]+)*):/;
// Recognized deck directive keys — used ONLY to drop echoed frontmatter blocks mid-deck.
const DIRECTIVE_KEY_RE = /^(theme|aspect|minFontPx|header|footer|paginate|sender|modifiers):\s*\S/;

// The deck's own frontmatter keys — exactly what parseFrontmatter (slide-model.ts) reads. Any other
// top-level key a model emits (banner, cover, cover-image, og:image, "banner", …) is dropped: Obsidian
// loads such values as images in reading view through third-party plugins.
const DECK_FM_KEY_RE = /^(theme|aspect|minFontPx|header|footer|paginate|sender|modifiers):/;

/** Positive list over the frontmatter lines (without the `---` delimiters): only blank lines and
 *  top-level lines of a deck key survive. Indented, `- ` item and comment lines are dropped too —
 *  parseFrontmatter ignores them, and keeping them would let a continuation of a kept key carry
 *  a foreign key past the filter in a YAML reader that folds it. */
function keepDeckFrontmatter(lines: string[]): string[] {
  return lines.filter((line) => line.trim() === "" || DECK_FM_KEY_RE.test(line));
}

/** Make the leading block's delimiters exactly `---` (trailing blanks, a BOM, or YAML's `...`
 *  end marker would otherwise let parseFrontmatter and Obsidian disagree about where it ends). */
function normalizeFrontmatterDelimiters(lines: string[]): void {
  if (lines[0]?.trim() !== "---") return;
  const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)[ \t]*$/.test(l));
  if (close === -1) return;
  lines[0] = "---";
  lines[close] = "---";
}

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
  const content = inner.filter((l) => l.trim() !== "");
  // A frontmatter block opens with a key and holds only keys, indented/`- ` continuations and comments.
  const isFrontmatter = content.length > 0 && ANY_FM_KEY_RE.test(content[0]) &&
    content.every((l) => /^[ \t#]|^-(\s|$)/.test(l) || ANY_FM_KEY_RE.test(l));
  return isFrontmatter ? md : lines.slice(1).join("\n"); // stray leading separator before content → strip
}

/** Fence-aware final pass: quote-normalize aspect/theme in frontmatter, normalize body
 *  separator whitespace, and drop key:-only slides (repeated frontmatter blocks). */
function finalPass(md: string): string {
  const lines = md.split("\n");
  normalizeFrontmatterDelimiters(lines);
  const range = frontmatterRange(lines);
  let fmEnd = range ? range.end : -1;

  if (fmEnd !== -1) {
    const kept = keepDeckFrontmatter(lines.slice(1, fmEnd));
    lines.splice(1, fmEnd - 1, ...kept);
    fmEnd = kept.length + 1;
  }

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

const SLOT_KEY_RE = /^(header|footer|paginate|sender|modifiers):\s*\S/;

/** Move deck-directive lines the model emitted as leading BODY content into the frontmatter
 *  block, where parseFrontmatter reads them (otherwise they render as stray text on slide 1).
 *  Every key parseFrontmatter understands and a model might emit belongs in SLOT_KEY_RE:
 *  the loop stops at the first line it does not recognise, so ONE unknown key drags every
 *  slot behind it down into the body too. Assumes a frontmatter block exists (run after
 *  setDeckTheme). No-op otherwise. */
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

/** Record the model that generated the deck as a `model:` frontmatter line (unquoted plain
 *  string — a model id has no YAML-hostile chars). Injects a block if none exists. Run AFTER
 *  setDeckTheme. */
export function setDeckModel(md: string, model: string): string {
  const value = `model: ${model}`;
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  if (!range) return `---\n${value}\n---\n${md}`;
  for (let i = 1; i < range.end; i++) {
    if (/^model:\s/.test(lines[i])) { lines[i] = value; return lines.join("\n"); }
  }
  lines.splice(1, 0, value);
  return lines.join("\n");
}
