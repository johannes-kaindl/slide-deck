const DEFAULT = `
.sd-slide{ --sd-base: 28px; width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:64px; overflow:hidden; background:#ffffff; color:#16181d; font-size:var(--sd-base);
  line-height:1.4; font-family: ui-sans-serif, system-ui, sans-serif; }
.sd-slide h1{ font-size:2.2em; margin:0 0 .4em; }
.sd-slide h2{ font-size:1.7em; margin:0 0 .4em; }
.sd-slide ul,.sd-slide ol{ margin:0; padding-left:1.2em; }
.sd-slide li{ margin:.25em 0; }
.sd-slide pre.hljs{ font-size:.8em; padding:.6em .8em; border-radius:8px; background:#0d1117; color:#e6edf3; overflow:hidden; }
.sd-embed{ max-width:100%; max-height:60%; object-fit:contain; }
.sd-mermaid svg{ max-width:100%; max-height:60%; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }
/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort */
.sd-callout{ border-left:6px solid #5b6470; background:#f4f6f8; padding:.5em .8em; border-radius:6px; margin:.4em 0; }
.sd-callout-title{ display:flex; align-items:center; gap:.4em; font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:#3b6db5; } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:#b58a1e; } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:#b5443b; } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:#2e8b6f; } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:#3b6db5; } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }
`;
export const PRESETS: Record<string, string> = { default: DEFAULT };
export function presetCss(name: string): string { return PRESETS[name] ?? PRESETS.default; }
