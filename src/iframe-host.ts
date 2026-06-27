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

export interface IsolatedIframe {
  iframe: HTMLIFrameElement;
  contentDoc: Document;
  reveal: () => void;
  dispose: () => void;
}

/** Create an isolated, same-origin deck iframe inside `mount` (default: ownerDoc.body) and
 *  resolve once it is loaded AND fonts have decoded (KaTeX glyph metrics). The iframe is
 *  parked offscreen (position:fixed; left:-99999px — NOT display:none, which would suppress
 *  the layout that scrollHeight/scrollWidth measurement needs) so it never flashes during
 *  load. It is created in its FINAL parent: never re-parent an iframe after load, because
 *  moving it in the DOM makes the browser reload it and blank its srcdoc. Offscreen
 *  consumers (export/staging) just dispose; the live preview calls reveal() after sizing +
 *  zooming to clear the offscreen positioning and show the iframe in place. */
export async function createIsolatedDeckIframe(
  ownerDoc: Document,
  opts: { css: string; bodyHtml: string; extraCss?: string; mount?: HTMLElement; width?: number; fontsTimeoutMs?: number },
): Promise<IsolatedIframe> {
  const iframe = ownerDoc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.border = "0";
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  if (opts.width !== undefined) iframe.style.width = `${opts.width}px`;

  const loaded = new Promise<void>((resolve) => {
    const onLoad = () => { iframe.removeEventListener("load", onLoad); resolve(); };
    iframe.addEventListener("load", onLoad);
  });
  // Set srcdoc BEFORE connecting the iframe. Appending an iframe with no srcdoc first loads
  // about:blank and fires `load` for it, so awaiting that load would capture the empty
  // about:blank document (scrollHeight 0, no styles) instead of the srcdoc content — a blank
  // deck. With srcdoc set first, the only load is the srcdoc navigation and contentDocument
  // is the populated, styled document.
  iframe.srcdoc = isolatedDeckHtml(opts);
  (opts.mount ?? ownerDoc.body).appendChild(iframe);
  await loaded;

  const contentDoc = iframe.contentDocument!;
  const win = ownerDoc.defaultView!;
  // Wait for fonts, but never hang on a stuck decode; clear the timer once the race settles
  // so no stray timeout lingers after fonts.ready wins. Use the document's own window so
  // timers are correct when the leaf lives in a popout window.
  let fontsTimer: ReturnType<typeof win.setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { fontsTimer = win.setTimeout(r, opts.fontsTimeoutMs ?? 3000); });
  await Promise.race([contentDoc.fonts.ready.then(() => undefined), timeout]);
  if (fontsTimer !== undefined) win.clearTimeout(fontsTimer);

  const reveal = () => {
    iframe.style.position = "";
    iframe.style.left = "";
    iframe.style.top = "";
  };
  return { iframe, contentDoc, reveal, dispose: () => iframe.remove() };
}
