// src/core/presets/layouts.css.ts
export interface LayoutSpec { id: string; regions: number; }

export const LAYOUTS: Record<string, LayoutSpec> = {
  default: { id: "default", regions: 1 },
  title: { id: "title", regions: 1 },
  section: { id: "section", regions: 1 },
  quote: { id: "quote", regions: 1 },
  "image-focus": { id: "image-focus", regions: 1 },
  "two-column": { id: "two-column", regions: 2 },
  "columns-3": { id: "columns-3", regions: 3 },
  stat: { id: "stat", regions: 1 },
  "cover-image": { id: "cover-image", regions: 1 },
};

/** TOTAL — unknown layout id falls back to default. */
export function layoutFor(id: string): LayoutSpec {
  return LAYOUTS[id] ?? LAYOUTS.default;
}

/** Shared, theme-independent layout CSS. References only tokens (no colors here). */
export const LAYOUTS_CSS = `
.sd-region{ min-width:0; min-height:0; }

/* multi-column: title spans all columns */
.sd-layout-two-column .sd-content{ display:grid; grid-template-columns:1fr 1fr; gap:48px; align-content:start; }
.sd-layout-columns-3 .sd-content{ display:grid; grid-template-columns:repeat(3,1fr); gap:36px; align-content:start; }
.sd-layout-two-column .sd-region-title,
.sd-layout-columns-3 .sd-region-title{ grid-column:1/-1; }

/* centered hero/divider templates */
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content,
.sd-layout-stat .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:flex-start; }
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content{ align-items:center; text-align:center; }
.sd-layout-quote .sd-region{ font-size:1.4em; font-style:italic; max-width:80%; }
.sd-layout-section .sd-region{ font-size:1.2em; }
.sd-layout-title h1{ font-size:3em; }

/* stat: oversized lead number */
.sd-layout-stat h1{ font-size:var(--sd-stat-size,4.5em); line-height:1; margin:0; }

/* image-focus: media-dominant — the media fill is handled by .sd-has-media
   (structure.css); here we only center an optional title/caption. */
.sd-layout-image-focus .sd-content{ text-align:center; }

/* cover-image: title overlays the full-bleed background, anchored bottom-left */
.sd-layout-cover-image .sd-content{ display:flex; flex-direction:column; justify-content:flex-end; }

/* density modifiers (combine with any layout) */
.sd-mod-compact .sd-content{ font-size:var(--sd-compact-scale,0.88em); line-height:1.3; }
.sd-mod-compact li{ margin:.12em 0; }
.sd-mod-code-heavy pre.hljs{ font-size:1em; }

/* compose-center: vertically center sparse, non-overflowing content */
.sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column .sd-content,
.sd-compose-center.sd-layout-columns-3 .sd-content{ align-content:center; }
`;
