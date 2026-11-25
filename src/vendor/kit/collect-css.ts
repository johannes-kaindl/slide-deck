// vendored from code-kit@0.93.0, src/ts/web/collect-css.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Collect the CSS of a live document into one string that a separate document can carry.
 *
 *  Origin: written for `obsidian-paperize` (desktop PDF export, plan 2026-11-08, Task 1): the
 *  export renders a note in the live window, then prints it in a blank `<webview>` that sees none
 *  of the window's style sheets. This module reads them out of the CSSOM (`document.styleSheets`).
 *  It assumes nothing about Obsidian; any `{ styleSheets }` shaped object works, which is why it
 *  sits in `web/` (needs a CSSOM at run time) and why the types are structural ("Like").
 *
 *  What it does, and what it deliberately does not:
 *  - **Rules that apply only to print are dropped** (`@media print`, `only print`): the target is
 *    a print run whose look should come from the screen styles. A rule is dropped when *every*
 *    comma-separated query of its `media` starts with `print` (`screen, print` and `not print`
 *    stay). Nested `@media print` inside another rule is not looked into.
 *  - **A sheet that cannot be read is skipped and counted** (`skippedSheets`): reading `cssRules`
 *    of a cross-origin sheet (a foreign `@import`) throws; one bad sheet must not cost the export.
 *  - **Urls that point into the host are inlined** (fonts and, since Welle 34, images), only `url("…")` with double quotes (the CSSOM always
 *    writes double quotes; measured in Obsidian 1.15.1). A value is a candidate when it starts with a prefix and ends in an extension
 *    (case-insensitive; a query or a fragment behind the extension means it does not end in one, such a url stays and is not counted):
 *      fonts   `/` (exactly one) or `app:`  + `woff`, `woff2`, `ttf`, `otf`;
 *      images  `./`, `/` (exactly one) or `app:`  + `svg`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `avif`.
 *    Never a candidate: `//host/…` (a scheme-relative url names a foreign authority; before Welle 34 a font url of that shape was taken),
 *    `http:`, `https:`, `file:`, `data:`, `blob:`, `../`. **Why fonts do not take `./`:** in Obsidian 1.15.1 the CSSOM writes the seven host
 *    fonts as `./public/…` (1 449 064 bytes, about 1.93 MB as Base64 in every print document), so they are not inlined, and whether a print
 *    run needs them is not measured; the only host image is the link arrow `./public/external-link.svg` (315 bytes) and its right-to-left
 *    twin (278 bytes). The caller supplies `inlineUrl` (a fetch plus base64 in its world) and gets the url exactly as the CSS writes it, so a
 *    `./public/…` is resolved against the caller's document base (`app://obsidian.md/index.html`; a relative `fetch` there answers 200).
 *    Size and MIME type are the caller's: `null` means "not possible" (also "too large"). `null`, a missing resolver, a throw, a rejected
 *    promise and **a value that is not safe to put into `url("…")`** leave the url untouched and count it in `unresolvedUrls`. Safe is a
 *    string that starts with `data:` and holds no `"`, no backslash, no `)`, no line break and no control character (anything else could
 *    leave the quotes and become CSS rules of its own). `data:` and `https:` urls are never touched. Each distinct url is resolved once, in
 *    the order of its first occurrence, fonts and images together; `unresolvedUrls` counts distinct urls, not occurrences.
 */

export interface CssRuleLike {
  readonly cssText: string;
  readonly media?: { readonly mediaText: string };
  /** The sheet an `@import` rule loaded (`CSSImportRule.styleSheet`); `null` when it did not load. Read by `collectFontFaces` (`web/font-faces`) only. */
  readonly styleSheet?: CssSheetLike | null;
}
export interface CssSheetLike {
  readonly cssRules: ArrayLike<CssRuleLike>;
  /** Where the sheet came from (`null` for a `<style>` element). Read by `collectFontFaces` (`web/font-faces`) only. */
  readonly href?: string | null;
}
export interface StyleSheetSource {
  readonly styleSheets: ArrayLike<CssSheetLike>;
  /** The document's base for relative urls. Read by `collectFontFaces` (`web/font-faces`) only. */
  readonly baseURI?: string;
}
export interface CollectCssOptions {
  /** Resolve a host url (as the CSS writes it) to a `data:` url, or `null` when that is not possible or the file is too large. Only a string that
   *  starts with `data:` and holds no `"`, backslash, `)`, line break or control character is put into the CSS; anything else counts as `null`. */
  inlineUrl?: (url: string) => Promise<string | null>;
}
export interface CollectedCss {
  css: string;
  skippedSheets: number;
  /** Distinct host urls that were candidates and stayed (no resolver, `null`, a throw, or a value that is not safe). */
  unresolvedUrls: number;
}

const PRINT_QUERY = /^\s*(only\s+)?print\b/i;
const HOST_URL = /url\("([^"]*)"\)/g;
const FONT_FILE = /^(?:\/(?!\/)|app:)[^"]*\.(?:woff2?|ttf|otf)$/i;
const IMAGE_FILE = /^(?:\.\/|\/(?!\/)|app:)[^"]*\.(?:svg|png|jpe?g|gif|webp|avif)$/i;
/** True when `s` holds a character that must not stand between the quotes of `url("…")`: `"`, the backslash, `)`, the C0 controls
 *  U+0000 to U+001F, DEL and the C1 controls U+007F to U+009F, U+2028 and U+2029 (UTF-16 code units, like a regex class without
 *  the `u` flag). A loop instead of a character class: the control range in a regex trips `no-control-regex`, and the plugins'
 *  lint refuses an inline disable (`check-no-inline-disables.mjs`, K14). `tests/collect-css.test.ts` holds it against the old
 *  class for every code unit 0 to 0xFFFF. */
export function hasUnsafeUrlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x22 || c === 0x5c || c === 0x29 || c === 0x2028 || c === 0x2029) return true;
  }
  return false;
}

const isHostCandidate = (url: string): boolean => FONT_FILE.test(url) || IMAGE_FILE.test(url);
/** Something the caller returned that may go between the quotes of `url("…")`. */
const isSafeDataUrl = (value: unknown): value is string => typeof value === "string" && value.startsWith("data:") && !hasUnsafeUrlChar(value);

function isPrintOnly(mediaText: string | undefined): boolean {
  if (mediaText === undefined || mediaText.trim() === "") return false;
  return mediaText.split(",").every((q) => PRINT_QUERY.test(q));
}

export async function collectDocumentCss(doc: StyleSheetSource, options: CollectCssOptions = {}): Promise<CollectedCss> {
  const parts: string[] = [];
  let skippedSheets = 0;
  for (let i = 0; i < doc.styleSheets.length; i++) {
    const sheet = doc.styleSheets[i];
    if (!sheet) continue;
    let rules: ArrayLike<CssRuleLike>;
    try {
      rules = sheet.cssRules;
      // Touch the length inside the try: some engines throw on first access of the list itself.
      void rules.length;
    } catch {
      skippedSheets++;
      continue;
    }
    for (let j = 0; j < rules.length; j++) {
      const r = rules[j];
      if (!r || isPrintOnly(r.media?.mediaText)) continue;
      parts.push(r.cssText);
    }
  }

  let css = parts.join("\n");
  const resolved = new Map<string, string | null>();
  const urls = new Set<string>();
  for (const m of css.matchAll(HOST_URL)) {
    const url = m[1] ?? "";
    if (isHostCandidate(url)) urls.add(url);
  }
  let unresolvedUrls = 0;
  for (const url of urls) {
    let data: string | null = null;
    if (options.inlineUrl) {
      try {
        const value: unknown = await options.inlineUrl(url);
        data = isSafeDataUrl(value) ? value : null;
      } catch {
        data = null;
      }
    }
    resolved.set(url, data);
    if (data === null) unresolvedUrls++;
  }
  css = css.replace(HOST_URL, (whole, url: string) => {
    const data = resolved.get(url);
    return data ? `url("${data}")` : whole;
  });
  return { css, skippedSheets, unresolvedUrls };
}
