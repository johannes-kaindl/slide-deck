// src/core/presets/structure.css.ts
/** Shared, theme-independent structural CSS. References only var(--sd-*) tokens.
 *  Holds the fit-critical invariants (fixed box, .sd-content fills the padded area).
 *  Declares NO --sd-base (single source is presetTokensCss). Code text colors are
 *  owned by the per-theme hljs stylesheet — only the wrapper background is tokenized.
 *  Type roles, spacing scale, and vertical rhythm (owl selector) live here as tokens;
 *  themes override token VALUES only — never re-declare margins or heading rules. */
export const STRUCTURE_CSS = `
.sd-slide{ width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:var(--sd-pad,64px); overflow:hidden; position:relative; background:var(--sd-bg); color:var(--sd-fg);
  font-size:var(--sd-base); line-height:var(--sd-lh-body,1.45); font-family:var(--sd-font); }

/* ── Type roles — modular scale, ratio 1.25 (see docs/themes/THEMING-GUIDE.md).
   Themes override token VALUES only; the display treatment (italic serif etc.)
   comes from --sd-display-* treatment tokens, never from theme h1/h2 rules. ── */
.sd-slide h1{ font-family:var(--sd-heading-font); font-size:var(--sd-size-h1,1.95em);
  line-height:var(--sd-lh-display,1.08); font-style:var(--sd-display-style,normal);
  font-weight:var(--sd-display-weight,700); letter-spacing:var(--sd-display-tracking,normal); }
.sd-slide h2{ font-family:var(--sd-heading-font); font-size:var(--sd-size-h2,1.25em);
  line-height:var(--sd-lh-heading,1.2); font-weight:600; }
.sd-slide a{ color:var(--sd-accent); text-decoration:underline; text-underline-offset:2px; }

/* ── Vertical rhythm: blocks own NO margins; space comes from adjacency (owl).
   More air before a new section, tight binding after a heading. ── */
.sd-slide h1,.sd-slide h2,.sd-slide p,.sd-slide ul,.sd-slide ol,.sd-slide pre,.sd-slide blockquote{ margin:0; }
.sd-region > * + *{ margin-top:var(--sd-space-s,.75em); }
/* Panels (code, callouts) are visually heavy boxes — they breathe on both
   sides. :where() keeps specificity flat so heading rules below still win. */
.sd-region > * + :where(pre,.sd-callout),
.sd-region > :where(pre,.sd-callout) + *{ margin-top:var(--sd-space-m,1em); }
.sd-region > * + h2{ margin-top:var(--sd-space-xl,2.25em); }
/* Headings get ~0.7× their own size as separation below, or they read as
   line 1 of their content. The h1+h2 subtitle pair binds tighter. */
.sd-region > h2 + *{ margin-top:var(--sd-space-m,1em); }
.sd-region > h1 + *{ margin-top:var(--sd-space-l,1.5em); }
.sd-region > h1 + h2{ margin-top:var(--sd-space-s,.75em); }
.sd-slide ul,.sd-slide ol{ padding-left:1.2em; }
/* List items read as units: compact within (tighter line-height than body
   prose), clear air between — otherwise a wrapped item merges with its
   neighbour and the list looks like undifferentiated lines. */
.sd-slide li{ margin:0; line-height:var(--sd-lh-list,1.35); }
.sd-slide li + li{ margin-top:var(--sd-space-xs,.5em); }
/* Nested lists: bound to their parent item and tighter than top-level items,
   so list levels read as hierarchy instead of one undifferentiated column. */
.sd-slide li > ul,.sd-slide li > ol{ margin-top:var(--sd-space-2xs,.25em); }
.sd-slide li li + li{ margin-top:var(--sd-space-2xs,.25em); }

/* Content fills the slide's padded area so overflow is measurable (scrollHeight > clientHeight).
   transform-origin pins the per-slide fit-scale (set inline in render-dom) to the top-left corner. */
.sd-content{ width:100%; height:100%; transform-origin:top left; }

/* ── Code ── */
.sd-slide pre.hljs{ font-size:.8em; padding:var(--sd-space-xs,.5em) var(--sd-space-s,.75em); border-radius:8px;
  background:var(--sd-code-bg); overflow:hidden;
  font-family:var(--sd-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace); }
.sd-slide :not(pre) > code{ font-family:var(--sd-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);
  font-size:.88em; background:var(--sd-code-bg); padding:.08em .34em; border-radius:4px; }

/* ── Character defaults, tokenized — a 7-token user theme looks finished out of the box. ── */
.sd-slide blockquote{ padding:var(--sd-space-2xs,.25em) 0 var(--sd-space-2xs,.25em) var(--sd-space-m,1em);
  border-left:3px solid var(--sd-accent); font-family:var(--sd-heading-font); font-style:italic;
  color:var(--sd-muted,inherit); }
.sd-slide hr{ border:none; height:2px; width:min(200px,30%);
  background:linear-gradient(to right,var(--sd-accent),transparent); }
.sd-slide li::marker{ color:var(--sd-accent); }

/* Block media: centered + contain. On a media-bearing single-region slide,
   render-dom marks .sd-content with .sd-has-media → the media cell fills the
   remaining vertical space via flex, so media sizing is independent of raster
   image decode timing and never relies on (unresolved) percentage heights. */
.sd-embed{ display:block; margin-inline:auto; max-width:100%; max-height:100%; object-fit:contain; }
.sd-mermaid{ text-align:center; }
.sd-mermaid svg{ display:block; margin-inline:auto; max-width:100%; max-height:100%; }
.sd-content.sd-has-media{ display:flex; flex-direction:column; }
.sd-content.sd-has-media > .sd-region{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
.sd-content.sd-has-media .sd-region > p:has(> img.sd-embed:only-child),
.sd-content.sd-has-media .sd-region > .sd-media-cell,
.sd-content.sd-has-media .sd-region > .sd-mermaid{ flex:1 1 0; min-height:0; margin:var(--sd-space-xs,.5em) 0; }
.sd-content.sd-has-media .sd-region > p > img.sd-embed:only-child,
.sd-content.sd-has-media .sd-region > .sd-media-cell > img.sd-embed,
.sd-content.sd-has-media .sd-region > .sd-mermaid > svg{ width:100%; height:100%; object-fit:contain; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }

/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort.
   Surface/Text sind tokenisiert; dunkle Themes setzen --sd-surface/--sd-callout-fg. */
.sd-callout{ border-left:3px solid var(--sd-callout-base,#5b6470); background:var(--sd-surface,#f4f6f8);
  padding:var(--sd-space-xs,.5em) var(--sd-space-s,.75em); border-radius:8px; color:var(--sd-callout-fg,#16181d); }
.sd-callout-title{ display:flex; align-items:center; gap:var(--sd-space-xs,.5em); font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:var(--sd-callout-note,#3b6db5); } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:var(--sd-callout-warning,#b58a1e); } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:var(--sd-callout-danger,#b5443b); } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:var(--sd-callout-tip,#2e8b6f); } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:var(--sd-callout-info,#3b6db5); } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }

/* Floating slots — live in the padding margin, outside the scaled .sd-content.
   They speak the deck's metadata voice (the eyebrow register): small, mono,
   tracked — framing the slide instead of competing with body text. */
.sd-slide-header,.sd-slide-footer,.sd-slide-pagination{ position:absolute; z-index:4;
  font-size:var(--sd-slot-size,var(--sd-size-eyebrow,.68em)); color:var(--sd-slot-fg,var(--sd-muted,#6b7280));
  font-family:var(--sd-slot-font,var(--sd-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));
  letter-spacing:.08em; }
.sd-slide-header{ top:24px; right:32px; text-transform:uppercase; }
.sd-slide-footer{ bottom:24px; left:32px; }
.sd-slide-pagination{ bottom:24px; right:32px; }

/* cover-image: full-bleed background + readability scrim behind the content. */
.sd-cover-media{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.sd-cover-scrim{ position:absolute; inset:0; z-index:1;
  background:var(--sd-scrim,linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,.12) 60%,transparent)); }
.sd-layout-cover-image .sd-content{ position:relative; z-index:3; }
`;
