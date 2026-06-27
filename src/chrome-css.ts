// Preview-only and print-only CSS, injected into the ISOLATED deck iframes (never the
// themed parent). Hardcoded colors mirror styles.css's var(..., fallback) values, because
// inside the iframe there are no Obsidian theme variables to resolve.

/** Stacking + card + overflow-stripe chrome for the live PREVIEW iframe only.
 *  Wraps slides as <div class="sd-deck-inner">…</div>. Warn classes ride inert in the
 *  serialized slidesHtml; without these rules (i.e. in export) they render nothing. */
export const PREVIEW_CHROME_CSS = `
body { margin: 0; }
.sd-deck-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  width: max-content;
}
.sd-deck-inner .sd-slide {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  border: 1px solid #ddd;
  border-radius: 8px;
  flex: none;
}
.sd-deck-inner .sd-slide-warn {
  box-shadow: inset 12px 0 0 0 #e5534b, 0 2px 12px rgba(0, 0, 0, 0.18);
}
.sd-deck-inner .sd-slide-warn-soft {
  box-shadow: inset 12px 0 0 0 #c98a00, 0 2px 12px rgba(0, 0, 0, 0.18);
}
`;

/** Print CSS for the PDF iframe. The iframe document contains ONLY slides, so no
 *  "hide everything else" hack is needed (unlike the old top-document printRootCss). */
export function PRINT_CSS(w: number, h: number): string {
  // print-color-adjust:exact forces the browser to render background colours and
  // images when printing. Without it, the slide's themed background (.sd-slide
  // { background:var(--sd-bg) }) is dropped unless the user ticks "Background
  // graphics" in the print dialog (off by default) — so a dark theme prints on a
  // white page and its light text washes out. exact makes every theme print true.
  return (
    `@page { size: ${w}px ${h}px; margin: 0; }\n` +
    `html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n` +
    `.sd-slide { break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n` +
    `.sd-slide:last-child { break-after: auto; }`
  );
}
