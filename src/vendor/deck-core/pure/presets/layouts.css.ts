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
  agenda: { id: "agenda", regions: 1 },
  threads: { id: "threads", regions: 1 },
  closing: { id: "closing", regions: 1 },
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
/* Optical center: exact geometric centering reads as "hanging" — lift the
   hero block slightly above the middle (padding participates in centering). */
.sd-layout-title .sd-region,.sd-layout-section .sd-region,.sd-cover-empty .sd-region{ padding-bottom:var(--sd-space-2xl,3.5em); }
/* Kicker pattern (design template): the eyebrow renders ABOVE the title.
   flex+order is display-only — DOM order (h1 then h2) stays untouched. */
.sd-layout-title .sd-region,.sd-layout-section .sd-region,.sd-layout-cover-image .sd-region,.sd-cover-empty .sd-region{ display:flex; flex-direction:column; }
.sd-layout-title .sd-region > h2,.sd-layout-section .sd-region > h2,.sd-layout-cover-image .sd-region > h2,.sd-cover-empty .sd-region > h2{
  order:-1; margin-top:0; margin-bottom:var(--sd-space-xs,.5em); }
/* Hero paragraphs balance their line breaks (no single-word orphans). */
.sd-layout-title .sd-region p,.sd-layout-section .sd-region p,.sd-cover-empty .sd-region p{ text-wrap:balance; }
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

/* quote keeps its serif voice on the scale. The whole region is a centered,
   start-aligned fit-content block — quote and attribution share a left edge. */
.sd-layout-quote .sd-region{ font-size:var(--sd-size-h2,1.25em); font-style:italic; max-width:85%; width:fit-content; text-align:start; }
/* The blockquote IS the quote: full ink, bar hugging the text. Any paragraph
   after it is the attribution — the small muted meta voice, aligned to the
   quote's TEXT edge (bar 3px + 1em padding). */
.sd-layout-quote .sd-region blockquote{ color:var(--sd-fg); }
.sd-layout-quote .sd-region blockquote ~ p{ font-family:var(--sd-eyebrow-font,var(--sd-font)); font-size:.75em;
  font-style:normal; letter-spacing:.08em; color:var(--sd-muted,inherit);
  padding-left:calc(var(--sd-space-m,1em) / 0.75 + 3px); }

/* stat: oversized lead number as a deliberate accent moment, caption tightly coupled */
.sd-layout-stat h1{ font-size:var(--sd-stat-size,4.5em); line-height:1; color:var(--sd-stat-fg,var(--sd-accent)); }
.sd-layout-stat .sd-region > h1 + *{ margin-top:var(--sd-space-xs,.5em); }

/* image-focus: media-dominant — the media fill is handled by .sd-has-media
   (structure.css); here we only center an optional title/caption. Axiom 1: the
   text-align:center is a BLOCK center — lists stay start-aligned (see carve-out below). */
.sd-layout-image-focus .sd-content{ text-align:center; }
.sd-layout-image-focus .sd-region :is(ul,ol){ text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }

/* cover-image: title overlays the full-bleed background, anchored bottom-left,
   with clearance above the footer zone */
.sd-layout-cover-image .sd-content{ display:flex; flex-direction:column; justify-content:flex-end; }
.sd-layout-cover-image .sd-region{ padding-bottom:var(--sd-space-m,1em); }
/* Die Tinte gehört zum Scrim, nicht zum Theme: über dem abgedunkelten Bildrand ist
   --sd-fg auf hellen Themes dunkel auf dunkel (drei von neun, darunter das Default-Theme).
   Nur mit Bild — ohne Bild gibt es keinen Scrim und die Theme-Tinte stimmt wieder. */
.sd-layout-cover-image:not(.sd-cover-empty) .sd-content{ color:var(--sd-cover-fg); }
/* Der Kicker (h2) trägt sonst --sd-accent und bliebe dunkel, während der Titel schon sitzt. */
.sd-layout-cover-image:not(.sd-cover-empty) .sd-content h2{ color:inherit; }
.sd-cover-empty .sd-content{ justify-content:center; align-items:center; text-align:center; }
.sd-cover-empty .sd-region{ text-align:center; max-width:85%; }
.sd-cover-empty .sd-region :is(ul,ol){ text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }

/* ── agenda · threads · closing — the Order-from-Traces slide specimens.
   Markdown: a level-1 title, then a level-2 eyebrow (shown above, like the hero kicker), then
   agenda: an ordered list, a trailing inline code span is the row's meta;
   threads: an ordered list, each item \`**Card title** text\`;
   closing: a bullet list of \`**key** value\` contact lines. ── */
.sd-layout-agenda .sd-region,.sd-layout-threads .sd-region,.sd-layout-closing .sd-region{ display:flex; flex-direction:column; }
.sd-layout-agenda .sd-region > h2,.sd-layout-threads .sd-region > h2,.sd-layout-closing .sd-region > h2{
  order:-1; margin:0 0 var(--sd-space-xs,.5em);
  font-family:var(--sd-eyebrow-font,var(--sd-font)); font-size:var(--sd-size-eyebrow,.68em);
  font-weight:600; font-style:normal; text-transform:uppercase;
  letter-spacing:var(--sd-eyebrow-tracking,.14em); color:var(--sd-eyebrow-fg,var(--sd-accent));
  line-height:var(--sd-lh-heading,1.2); }
.sd-layout-agenda .sd-region > h1,.sd-layout-threads .sd-region > h1{ margin:0 0 .7em; }
.sd-layout-agenda ol,.sd-layout-threads ol,.sd-layout-closing ul{ list-style:none; margin:0; padding:0; }
.sd-layout-agenda ol{ counter-reset:sd-agenda; border-bottom:1px solid color-mix(in srgb,var(--sd-accent) 14%,transparent); }
.sd-layout-agenda ol > li{ counter-increment:sd-agenda; display:flex; align-items:baseline; gap:1.1em; margin:0;
  padding:.75em 0; border-top:1px solid color-mix(in srgb,var(--sd-accent) 14%,transparent); font-size:.9em; font-weight:600; }
.sd-layout-agenda ol > li::before{ content:counter(sd-agenda, decimal-leading-zero); flex:none; width:2.2em;
  font-family:var(--sd-mono,monospace); font-size:.68em; font-weight:400; letter-spacing:.1em; color:var(--sd-accent); }
.sd-layout-agenda ol > li > code:last-child{ margin-left:auto; padding:0; border:none; background:none;
  font-size:.56em; font-weight:400; letter-spacing:.08em; color:color-mix(in srgb,var(--sd-muted,var(--sd-fg)) 72%,var(--sd-bg)); }
.sd-layout-threads ol{ counter-reset:sd-threads; display:grid; grid-template-columns:repeat(2, 1fr); gap:.7em; }
.sd-layout-threads ol > li{ counter-increment:sd-threads; margin:0; padding:.9em 1em;
  background:var(--sd-surface,var(--sd-code-bg)); border:1px solid color-mix(in srgb,var(--sd-accent) 14%,transparent);
  border-radius:14px; font-size:.58em; line-height:1.5; color:var(--sd-muted,var(--sd-fg)); }
.sd-layout-threads ol > li::before{ content:counter(sd-threads, decimal-leading-zero); display:block;
  font-family:var(--sd-mono,monospace); font-size:.94em; letter-spacing:.1em; color:var(--sd-accent); }
.sd-layout-threads ol > li > strong:first-child,.sd-layout-threads ol > li > p > strong:first-child{
  display:block; margin:.45em 0 .3em; font-size:1.38em; font-weight:600; line-height:1.25; color:var(--sd-fg); }
.sd-layout-threads ol > li > p{ margin:0; }
.sd-layout-closing .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-layout-closing .sd-region > h1{ font-size:var(--sd-size-display,2.44em); line-height:1.06; max-width:16ch; margin:0; }
.sd-layout-closing ul{ display:flex; flex-direction:column; gap:.35em; margin-top:1.4em; }
.sd-layout-closing ul > li{ display:flex; gap:.9em; margin:0; font-family:var(--sd-mono,monospace);
  font-size:.64em; letter-spacing:.02em; color:var(--sd-muted,var(--sd-fg)); }
.sd-layout-closing ul > li::before{ content:none; }
.sd-layout-closing ul > li > strong:first-child{ flex:none; width:7.8em; font-weight:400;
  color:color-mix(in srgb,var(--sd-muted,var(--sd-fg)) 72%,var(--sd-bg)); }
.sd-layout-closing a{ color:inherit; text-decoration:none; }

/* density modifiers (combine with any layout) */
.sd-mod-compact .sd-content{ font-size:var(--sd-compact-scale,0.82em); line-height:1.3; }
.sd-mod-compact h1{ font-size:1.5em; }
.sd-mod-compact h2{ font-size:1.1em; }
.sd-mod-compact .sd-region > * + *{ margin-top:var(--sd-space-xs,.5em); }
.sd-mod-compact li + li{ margin-top:0; }
.sd-mod-code-heavy pre.hljs{ font-size:1em; }

/* compose-center: vertically center sparse, non-overflowing content — but only
   on TITLE-LESS slides. A slide with an h1 keeps its title on the fixed top
   baseline (titles must not jump between slides); spare room runs out below. */
.sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3):not(:has(h1)) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column:not(:has(h1)) .sd-content,
.sd-compose-center.sd-layout-columns-3:not(:has(h1)) .sd-content{ align-content:center; }
`;
