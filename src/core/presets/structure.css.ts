// src/core/presets/structure.css.ts
/** Shared, theme-independent structural CSS. References only var(--sd-*) tokens.
 *  Holds the fit-critical invariants (fixed box, .sd-content fills the padded area).
 *  Declares NO --sd-base (single source is presetTokensCss). Code text colors are
 *  owned by the per-theme hljs stylesheet — only the wrapper background is tokenized. */
export const STRUCTURE_CSS = `
.sd-slide{ width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:64px; overflow:hidden; background:var(--sd-bg); color:var(--sd-fg); font-size:var(--sd-base);
  line-height:1.4; font-family:var(--sd-font); }
.sd-slide h1{ font-family:var(--sd-heading-font); font-size:2.2em; margin:0 0 .4em; }
.sd-slide h2{ font-family:var(--sd-heading-font); font-size:1.7em; margin:0 0 .4em; }
.sd-slide a{ color:var(--sd-accent); }
.sd-slide ul,.sd-slide ol{ margin:0; padding-left:1.2em; }
.sd-slide li{ margin:.25em 0; }
/* Content fills the slide's padded area so overflow is measurable (scrollHeight > clientHeight). */
.sd-content{ width:100%; height:100%; }
.sd-slide pre.hljs{ font-size:.8em; padding:.6em .8em; border-radius:8px; background:var(--sd-code-bg); overflow:hidden; }
.sd-embed{ max-width:100%; max-height:60%; object-fit:contain; }
.sd-mermaid svg{ max-width:100%; max-height:480px; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }
/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort */
.sd-callout{ border-left:6px solid var(--sd-callout-note,#3b6db5); background:var(--sd-surface,#f4f6f8); padding:.5em .8em; border-radius:6px; margin:.4em 0; color:var(--sd-callout-fg,#16181d); }
.sd-callout-title{ display:flex; align-items:center; gap:.4em; font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:var(--sd-callout-note,#3b6db5); } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:var(--sd-callout-warning,#b58a1e); } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:var(--sd-callout-danger,#b5443b); } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:var(--sd-callout-tip,#2e8b6f); } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:var(--sd-callout-info,#3b6db5); } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }
`;
