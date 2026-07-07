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

/* multi-column: title spans all columns; gaps from the space scale */
.sd-layout-two-column .sd-content{ display:grid; grid-template-columns:1fr 1fr; gap:var(--sd-space-l,1.5em); align-content:start; }
.sd-layout-columns-3 .sd-content{ display:grid; grid-template-columns:repeat(3,1fr); gap:var(--sd-space-m,1em); align-content:start; }
.sd-layout-two-column .sd-region-title,
.sd-layout-columns-3 .sd-region-title{ grid-column:1/-1; }

/* ── Hero/divider templates. Axiom 2: center the BLOCK, never the line —
   headings/paragraphs may center; lists/code/callouts stay start-aligned and
   are centered as a block. Axiom 3: content layouts keep a left edge (no rules needed). ── */
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content,
.sd-layout-stat .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:flex-start; }
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content{ align-items:center; }
.sd-layout-title .sd-region,.sd-layout-section .sd-region,.sd-layout-quote .sd-region{ text-align:center; max-width:85%; }
.sd-layout-title .sd-region :is(ul,ol),.sd-layout-section .sd-region :is(ul,ol),.sd-layout-quote .sd-region :is(ul,ol){
  text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }
.sd-layout-title .sd-region :is(pre,.sd-callout),.sd-layout-section .sd-region :is(pre,.sd-callout),.sd-layout-quote .sd-region :is(pre,.sd-callout){ text-align:start; }

/* display role on hero titles */
.sd-layout-title h1,.sd-layout-section h1,.sd-layout-cover-image h1{ font-size:var(--sd-size-display,2.44em); }

/* eyebrow: h2 in hero context is a small tracked kicker, not a heading */
.sd-layout-title h2,.sd-layout-section h2,.sd-layout-cover-image h2{
  font-family:var(--sd-eyebrow-font,var(--sd-font)); font-size:var(--sd-size-eyebrow,.68em);
  font-weight:600; font-style:normal; text-transform:uppercase;
  letter-spacing:var(--sd-eyebrow-tracking,.14em); color:var(--sd-eyebrow-fg,var(--sd-accent));
  line-height:var(--sd-lh-heading,1.2); }

/* quote keeps its serif voice on the scale */
.sd-layout-quote .sd-region{ font-size:var(--sd-size-h2,1.25em); font-style:italic; }

/* stat: oversized lead number */
.sd-layout-stat h1{ font-size:var(--sd-stat-size,4.5em); line-height:1; }

/* image-focus: media-dominant — the media fill is handled by .sd-has-media
   (structure.css); here we only center an optional title/caption. Axiom 1: the
   text-align:center is a BLOCK center — lists stay start-aligned (see carve-out below). */
.sd-layout-image-focus .sd-content{ text-align:center; }
.sd-layout-image-focus .sd-region :is(ul,ol){ text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }

/* cover-image: title overlays the full-bleed background, anchored bottom-left */
.sd-layout-cover-image .sd-content{ display:flex; flex-direction:column; justify-content:flex-end; }
.sd-cover-empty .sd-content{ justify-content:center; align-items:center; text-align:center; }
.sd-cover-empty .sd-region{ text-align:center; max-width:85%; }
.sd-cover-empty .sd-region :is(ul,ol){ text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }

/* density modifiers (combine with any layout) */
.sd-mod-compact .sd-content{ font-size:var(--sd-compact-scale,0.82em); line-height:1.3; }
.sd-mod-compact h1{ font-size:1.5em; }
.sd-mod-compact h2{ font-size:1.1em; }
.sd-mod-compact .sd-region > * + *{ margin-top:var(--sd-space-xs,.5em); }
.sd-mod-compact li + li{ margin-top:0; }
.sd-mod-code-heavy pre.hljs{ font-size:1em; }

/* compose-center: vertically center sparse, non-overflowing content */
.sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column .sd-content,
.sd-compose-center.sd-layout-columns-3 .sd-content{ align-content:center; }
`;
