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
.sd-layout-two-column .sd-content{ display:grid; grid-template-columns:1fr 1fr; gap:48px; align-content:start; }
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
.sd-layout-quote .sd-region{ font-size:1.4em; font-style:italic; max-width:80%; }
.sd-layout-section .sd-region{ font-size:1.2em; }
.sd-layout-image-focus .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
.sd-layout-image-focus .sd-embed{ max-height:80%; }
.sd-compose-center:not(.sd-layout-two-column) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column .sd-content{ align-content:center; }
`;
