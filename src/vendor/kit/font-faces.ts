// vendored from code-kit@0.93.0, src/ts/web/font-faces.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { decodeCssEscapes, parseCssRules, readCssUrls, type CssRule } from "./css-rules";
import type { CssRuleLike, CssSheetLike, StyleSheetSource } from "./collect-css";

// Origin: order K5 of slide-deck (Welle 38, ck38a). Written into `web/collect-css.ts` first (code-kit 5ae3c63), moved into its own module the
// same night so that `collect-css` keeps no runtime import: obsidian-paperize vendors `collect-css` flat and must not need `css-rules` and
// `safe-markdown` for a job it does not have. Only the structural TYPES come from `collect-css` (`import type`, erased at run time).

/** The `@font-face` rules of a live document for the families in `families`, with every relative `url()` made absolute.
 *
 *  Origin: order K5 of slide-deck (Welle 38). Its slide export draws a slide into an SVG `foreignObject` (modern-screenshot); there a
 *  `system-ui` falls back to a wider substitute font, measured in Obsidian 1.15.1: preview 590.8 px, PNG 666.5 px (+12.8 %), while Inter,
 *  whose `@font-face` the export carries along, is set true. The caller hands these rules to the image; the library inlines the font files
 *  itself, so nothing is inlined here.
 *
 *  - **Which rules:** a `@font-face` whose `font-family` names one of `families`. Names compare without their quotes and after CSS escapes
 *    are decoded, case-insensitively for ASCII only, as CSS matches family names (`"Inter"`, `Inter`, `'INTER'` are one family; `İ` is not
 *    `i`). An unquoted name of several words matches with its words joined by one space. Every subset of a family stays (`unicode-range`).
 *  - **Where they may stand:** at the top level of a sheet, inside `@media`, `@supports`, `@layer` and the other group rules (the wrapper is
 *    kept, so a condition still applies), and in a sheet loaded by `@import` (`rule.styleSheet`), read through the CSSOM, not the text.
 *  - **Urls:** only the urls of the `src` descriptor, read with `readCssUrls` of `pure/css-rules` (CSS white space, escapes and quotes as a
 *    browser reads them; no regex here). A url with a scheme (`data:`, `https:`, `app:` …) stays as written. Any other is resolved against
 *    the `href` of the sheet it stands in (an `@import`ed sheet: its own `href`, resolved against the importing sheet), else against
 *    `doc.baseURI`; Obsidian 1.15.1 writes Inter as `./public/…woff2`. The result is written as `url("…")` with `"`, backslash and line
 *    breaks escaped. A url that cannot be resolved (no base) stays as written. `local(…)` and `format(…)` are not urls and stay.
 *  - **The output is rebuilt from the declarations**, `@font-face { name: value; … }`, one rule per line: comments are gone, the values are
 *    the ones the CSSOM wrote.
 *  - **A sheet that cannot be read** (cross-origin, `cssRules` throws) is counted in `skippedSheets`, never thrown. An `@import` that did
 *    not load (`styleSheet` null) has nothing to read and is not counted. A sheet already read (an import cycle in a fake) is not read twice.
 */
export function collectFontFaces(doc: StyleSheetSource, families: readonly string[]): { css: string; skippedSheets: number } {
  const wanted = new Set(families.map(familyKey).filter((k) => k !== ""));
  const out: string[] = [];
  const seen = new Set<CssSheetLike>();
  let skippedSheets = 0;

  const readSheet = (sheet: CssSheetLike, parentBase: string | undefined): void => {
    if (seen.has(sheet)) return;
    seen.add(sheet);
    const base = resolveAgainst(sheet.href ?? null, parentBase) ?? parentBase;
    let rules: ArrayLike<CssRuleLike>;
    try {
      rules = sheet.cssRules;
      void rules.length;
    } catch {
      skippedSheets++;
      return;
    }
    for (let j = 0; j < rules.length; j++) {
      const r = rules[j];
      if (!r) continue;
      if (r.styleSheet) { readSheet(r.styleSheet, base); continue; }
      if (wanted.size === 0) continue;
      out.push(...fontFacesOf(parseCssRules(r.cssText).rules, wanted, base));
    }
  };

  for (let i = 0; i < doc.styleSheets.length; i++) {
    const sheet = doc.styleSheets[i];
    if (sheet) readSheet(sheet, doc.baseURI);
  }
  return { css: out.join("\n"), skippedSheets };
}

function fontFacesOf(rules: readonly CssRule[], wanted: ReadonlySet<string>, base: string | undefined): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (rule.kind === "group") {
      const inner = fontFacesOf(rule.rules, wanted, base);
      if (inner.length > 0) out.push(`${rule.prelude} { ${inner.join(" ")} }`);
      continue;
    }
    if (rule.kind !== "font-face") continue;
    let family = "";
    for (const d of rule.declarations) if (d.name === "font-family") family = d.value;
    if (!wanted.has(familyKey(family))) continue;
    const body = rule.declarations.map((d) => `${d.rawName}: ${d.name === "src" ? absoluteUrls(d.value, base) : d.value};`);
    out.push(`@font-face { ${body.join(" ")} }`);
  }
  return out;
}

const isCssSpace = (c: number): boolean => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c;

/** A family name as CSS compares it: quotes off, escapes decoded, the words of an unquoted name joined by one space, ASCII lower case. */
function familyKey(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && isCssSpace(raw.charCodeAt(start))) start++;
  while (end > start && isCssSpace(raw.charCodeAt(end - 1))) end--;
  const s = raw.slice(start, end);
  const q = s[0];
  let name: string;
  if ((q === '"' || q === "'") && s.length >= 2 && s[s.length - 1] === q) {
    name = decodeCssEscapes(s.slice(1, -1));
  } else {
    const words: string[] = [];
    let w = "";
    for (let i = 0; i < s.length; i++) {
      if (isCssSpace(s.charCodeAt(i))) { if (w !== "") { words.push(w); w = ""; } continue; }
      if (s[i] === "\\" && i + 1 < s.length) {
        // an escape is part of the word, and so is the one white space that ends a hex escape (`I\6e ter` is `Inter`)
        let j = i + 1;
        while (j < s.length && j < i + 7 && /[0-9a-fA-F]/.test(s[j] ?? "")) j++;
        if (j === i + 1) j++;
        else if (j < s.length && isCssSpace(s.charCodeAt(j))) j++;
        w += s.slice(i, j);
        i = j - 1;
        continue;
      }
      w += s[i];
    }
    if (w !== "") words.push(w);
    name = words.map(decodeCssEscapes).join(" ");
  }
  return name.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** `href` resolved against `base`; `undefined` when there is no `href` or it cannot be resolved. */
function resolveAgainst(href: string | null, base: string | undefined): string | undefined {
  if (href === null || href === "") return undefined;
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}

const HAS_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** `"`, backslash and line breaks escaped so the string cannot leave `url("…")`. */
const cssString = (s: string): string => s.replace(/[\\"\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);

/** The `url()` calls of a `src` value with every relative url made absolute against `base`. */
function absoluteUrls(value: string, base: string | undefined): string {
  let out = "";
  let at = 0;
  for (const call of readCssUrls(value).calls) {
    if (!call.closed || HAS_SCHEME.test(call.value) || base === undefined) continue;
    let abs: string;
    try {
      abs = new URL(call.value, base).href;
    } catch {
      continue;
    }
    out += value.slice(at, call.start) + `url("${cssString(abs)}")`;
    at = call.end;
  }
  return out + value.slice(at);
}
