// src/core/presets/structure.css.ts
/** Shared, theme-independent structural CSS. References only var(--sd-*) tokens.
 *  Holds the fit-critical invariants (fixed box, .sd-content fills the padded area).
 *  Declares NO --sd-base (single source is presetTokensCss). Code text colors are
 *  owned by the per-theme hljs stylesheet — only the wrapper background is tokenized. */
export const STRUCTURE_CSS = `
.sd-slide{ width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:64px; overflow:hidden; position:relative; background:var(--sd-bg); color:var(--sd-fg); font-size:var(--sd-base);
  line-height:1.4; font-family:var(--sd-font); }
.sd-slide h1{ font-family:var(--sd-heading-font); font-size:2.2em; margin:0 0 .4em; }
.sd-slide h2{ font-family:var(--sd-heading-font); font-size:1.7em; margin:0 0 .4em; }
.sd-slide a{ color:var(--sd-accent); }
.sd-slide ul,.sd-slide ol{ margin:0; padding-left:1.2em; }
.sd-slide li{ margin:.25em 0; }
/* Content fills the slide's padded area so overflow is measurable (scrollHeight > clientHeight). */
.sd-content{ width:100%; height:100%; }
.sd-slide pre.hljs{ font-size:.8em; padding:.6em .8em; border-radius:8px; background:var(--sd-code-bg); overflow:hidden; }
/* Block media: centered + contain. On a media-bearing single-region slide,
   render-dom marks .sd-content with .sd-has-media → the media cell fills the
   remaining vertical space via flex, so media sizing is independent of raster
   image decode timing and never relies on (unresolved) percentage heights. */
.sd-embed{ display:block; margin-inline:auto; max-width:100%; max-height:100%; object-fit:contain; }
.sd-mermaid{ text-align:center; }
.sd-mermaid svg{ display:block; margin-inline:auto; max-width:100%; max-height:100%; }
.sd-content.sd-has-media{ display:flex; flex-direction:column; }
.sd-content.sd-has-media > .sd-region{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
/* The block-media cell grows into the remaining vertical space. Obsidian
   ![[embeds]] are a bare <img> that render-dom wraps into .sd-media-cell;
   markdown ![](…) images come pre-wrapped in markdown-it's <p>. */
.sd-content.sd-has-media .sd-region > p:has(> img.sd-embed:only-child),
.sd-content.sd-has-media .sd-region > .sd-media-cell,
.sd-content.sd-has-media .sd-region > .sd-mermaid{ flex:1 1 0; min-height:0; margin:.4em 0; }
/* The media element fills its cell, contained + centered. */
.sd-content.sd-has-media .sd-region > p > img.sd-embed:only-child,
.sd-content.sd-has-media .sd-region > .sd-media-cell > img.sd-embed,
.sd-content.sd-has-media .sd-region > .sd-mermaid > svg{ width:100%; height:100%; object-fit:contain; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }
/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort */
.sd-callout{ border-left:6px solid var(--sd-callout-base,#5b6470); background:var(--sd-surface,#f4f6f8); padding:.5em .8em; border-radius:6px; margin:.4em 0; color:var(--sd-callout-fg,#16181d); }
.sd-callout-title{ display:flex; align-items:center; gap:.4em; font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:var(--sd-callout-note,#3b6db5); } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:var(--sd-callout-warning,#b58a1e); } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:var(--sd-callout-danger,#b5443b); } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:var(--sd-callout-tip,#2e8b6f); } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:var(--sd-callout-info,#3b6db5); } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }
/* Floating slots — live in the 64px margin, outside the scaled .sd-content. */
.sd-slide-header,.sd-slide-footer,.sd-slide-pagination{ position:absolute; z-index:4;
  font-size:var(--sd-slot-size,0.6em); color:var(--sd-slot-fg,var(--sd-muted,#6b7280)); letter-spacing:.04em; }
.sd-slide-header{ top:24px; right:32px; text-transform:uppercase; }
.sd-slide-footer{ bottom:24px; left:32px; }
.sd-slide-pagination{ bottom:24px; right:32px; }
/* cover-image: full-bleed background + readability scrim behind the content. */
.sd-cover-media{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.sd-cover-scrim{ position:absolute; inset:0; z-index:1;
  background:var(--sd-scrim,linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,.12) 60%,transparent)); }
.sd-layout-cover-image .sd-content{ position:relative; z-index:3; }
`;
