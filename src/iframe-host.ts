// Owns the isolated deck iframe: the pure document assembler (isolatedDeckHtml) and the
// runtime lifecycle helper (createIsolatedDeckIframe, added in Task 3). No .css/mermaid
// imports at module scope, so the pure part stays vitest-importable.

/** Assemble the full self-contained HTML for a deck iframe. `extraCss` (preview chrome or
 *  print CSS) is concatenated AFTER `css` so it can override deck tokens. */
export function isolatedDeckHtml(opts: { css: string; bodyHtml: string; extraCss?: string }): string {
  const { css, bodyHtml, extraCss = "" } = opts;
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${css}${extraCss}</style></head>` +
    `<body>${bodyHtml}</body></html>`
  );
}
