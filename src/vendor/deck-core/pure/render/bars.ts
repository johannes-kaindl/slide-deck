// src/pure/render/bars.ts
/** The ```bars code block: one row per line, `Label | Value` and optionally `| Variant`.
 *  Static on purpose — the bar has a visible effect in preview, PDF and PNG; growing and
 *  counting need a presentation mode the consumers do not have yet. The width is written as
 *  `--sd-bar` on the fill (a width, not a scaleX: the PNG export drops a prefixless property
 *  that equals its UA default, see AGENTS.md), so CSS can draw what the text alone cannot. */

export type BarValue = { ok: true; value: number; ambiguous: boolean } | { ok: false };

export interface BarRow {
  /** Plain text, `\|` already turned into `|`. Escaped on output, never parsed as Markdown. */
  label: string;
  /** The value field as written — shown as is in `.sd-bar-value`. */
  raw: string;
  value: BarValue;
  /** Normalised to `[a-z0-9-]`, becomes the class `sd-bar-<variant>`; null when none. */
  variant: string | null;
}

export interface BarsBlock {
  rows: BarRow[];
  /** One line per dropped row or rejected variant, naming the 1-based line of the block. */
  problems: string[];
}

/** Read a bar value the German way: `,` is the decimal mark, `.` groups thousands. A unit or `%`
 *  after the number is ignored. With both marks the LAST one is the decimal mark, so `1,234.5`
 *  (English) reads right too. Exactly one `.` followed by exactly three digits (`1.234`) is
 *  ambiguous: read as 1234 and flagged, so the author sees the assumption. Thousands groups
 *  must have three digits; anything else is invalid rather than guessed. */
export function parseBarValue(raw: string): BarValue {
  const m = /^\s*([+\-−]?)(\d[\d.,]*)(.*)$/s.exec(raw);
  if (!m) return { ok: false };
  const [, sign, num, rest] = m;
  if (/^\s*\d/.test(rest)) return { ok: false };
  if (!/\d$/.test(num)) return { ok: false };
  const neg = sign === "-" || sign === "−";
  const done = (v: number, ambiguous = false): BarValue =>
    Number.isFinite(v) ? { ok: true, value: neg ? -v : v, ambiguous } : { ok: false };

  const dots = (num.match(/\./g) ?? []).length;
  const commas = (num.match(/,/g) ?? []).length;
  if (dots === 0 && commas === 0) return done(Number(num));

  if (dots > 0 && commas > 0) {
    const decimal = num.lastIndexOf(".") > num.lastIndexOf(",") ? "." : ",";
    const group = decimal === "." ? "," : ".";
    const at = num.lastIndexOf(decimal);
    const intPart = num.slice(0, at);
    const frac = num.slice(at + 1);
    if (intPart.includes(decimal) || frac.includes(group) || !/^\d+$/.test(frac)) return { ok: false };
    const int = ungroup(intPart, group);
    return int === null ? { ok: false } : done(Number(`${int}.${frac}`));
  }

  if (commas > 0) {
    if (commas > 1) return { ok: false };
    const [int, frac] = num.split(",");
    return /^\d+$/.test(int) && /^\d+$/.test(frac) ? done(Number(`${int}.${frac}`)) : { ok: false };
  }

  if (dots > 1) {
    const int = ungroup(num, ".");
    return int === null ? { ok: false } : done(Number(int));
  }
  const [int, frac] = num.split(".");
  if (!/^\d+$/.test(int) || !/^\d+$/.test(frac)) return { ok: false };
  if (frac.length === 3) return done(Number(int + frac), true);
  return done(Number(`${int}.${frac}`));
}

/** `1.234.567` → `1234567`; null unless every group after the first has three digits. */
function ungroup(s: string, sep: string): string | null {
  const groups = s.split(sep);
  if (!/^\d{1,3}$/.test(groups[0])) return null;
  for (const g of groups.slice(1)) if (!/^\d{3}$/.test(g)) return null;
  return groups.join("");
}

/** Variant names that would turn a row into a structure element (`sd-bar-fill` on the row). */
const RESERVED_VARIANTS = new Set(["row", "label", "track", "fill", "value"]);

function normaliseVariant(s: string): string | null {
  const v = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return v === "" ? null : v;
}

/** Split a line at every `|` that is not written `\|`; `\|` becomes a literal `|`. */
function splitFields(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "|") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

export function parseBarsBlock(source: string): BarsBlock {
  const rows: BarRow[] = [];
  const problems: string[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  lines.forEach((line, i) => {
    if (line.trim() === "") return;
    const n = i + 1;
    const fields = splitFields(line);
    if (fields.length < 2 || fields.length > 3 || fields[1] === "") {
      problems.push(`bars line ${n}: expected "Label | Value" or "Label | Value | Variant" — row skipped.`);
      return;
    }
    let variant = fields.length === 3 ? normaliseVariant(fields[2]) : null;
    if (variant !== null && RESERVED_VARIANTS.has(variant)) {
      problems.push(`bars line ${n}: variant "${variant}" is reserved for the bar structure — ignored.`);
      variant = null;
    }
    rows.push({ label: fields[0], raw: fields[1], value: parseBarValue(fields[1]), variant });
  });
  return { rows, problems };
}

export interface RenderedBars {
  html: string;
  /** Unreadable or negative values (the row stays, with an empty bar). */
  problems: string[];
  /** Values read the German way although they could be English (`1.234`). */
  ambiguous: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function percent(v: number, max: number): string {
  if (!(max > 0) || !(v > 0)) return "0%";
  return `${Number(((v / max) * 100).toFixed(2))}%`;
}

/** Rows → `.sd-bars > .sd-bar-row > (.sd-bar-label, .sd-bar-track > .sd-bar-fill, .sd-bar-value)`.
 *  Widths are relative to the largest readable value; unreadable and negative values draw 0. */
export function renderBarsHtml(rows: readonly BarRow[]): RenderedBars {
  const problems: string[] = [];
  const ambiguous: string[] = [];
  let max = 0;
  for (const r of rows) if (r.value.ok && r.value.value > max) max = r.value.value;
  const out = rows.map((r) => {
    let width = "0%";
    if (!r.value.ok) {
      problems.push(`bars: value "${r.raw}" of "${r.label}" is not a number — empty bar.`);
    } else if (r.value.value < 0) {
      problems.push(`bars: value "${r.raw}" of "${r.label}" is negative — bar drawn as 0.`);
    } else {
      width = percent(r.value.value, max);
      if (r.value.ambiguous) {
        ambiguous.push(`bars: "${r.raw}" read as ${r.value.value} (German: "." groups thousands). Write it without the dot, or with a comma for decimals.`);
      }
    }
    const cls = r.variant ? `sd-bar-row sd-bar-${r.variant}` : "sd-bar-row";
    return `<div class="${cls}"><span class="sd-bar-label">${escapeHtml(r.label)}</span>`
      + `<span class="sd-bar-track"><span class="sd-bar-fill" style="--sd-bar: ${width}"></span></span>`
      + `<span class="sd-bar-value">${escapeHtml(r.raw)}</span></div>`;
  });
  return { html: `<div class="sd-bars">${out.join("")}</div>`, problems, ambiguous };
}
