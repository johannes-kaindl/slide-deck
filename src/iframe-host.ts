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
  dispose: () => void;
}

/** Create an isolated, same-origin deck iframe and resolve once it is loaded AND fonts
 *  have decoded (KaTeX glyph metrics). `offscreen` parks it at left:-99999px (NOT
 *  display:none, which suppresses layout and breaks scrollWidth measurement). */
export async function createIsolatedDeckIframe(
  ownerDoc: Document,
  opts: { css: string; bodyHtml: string; extraCss?: string; offscreen: boolean; width?: number; fontsTimeoutMs?: number },
): Promise<IsolatedIframe> {
  const iframe = ownerDoc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.border = "0";
  if (opts.offscreen) {
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
  }
  if (opts.width !== undefined) iframe.style.width = `${opts.width}px`;

  const loaded = new Promise<void>((resolve) => {
    const onLoad = () => { iframe.removeEventListener("load", onLoad); resolve(); };
    iframe.addEventListener("load", onLoad);
  });
  ownerDoc.body.appendChild(iframe);
  iframe.srcdoc = isolatedDeckHtml(opts);
  await loaded;

  const contentDoc = iframe.contentDocument!;
  // Wait for fonts, but never hang on a stuck decode; clear the timer once the race settles
  // so no stray timeout lingers after fonts.ready wins.
  let fontsTimer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { fontsTimer = setTimeout(r, opts.fontsTimeoutMs ?? 3000); });
  await Promise.race([contentDoc.fonts.ready.then(() => undefined), timeout]);
  if (fontsTimer !== undefined) clearTimeout(fontsTimer);

  return { iframe, contentDoc, dispose: () => iframe.remove() };
}
