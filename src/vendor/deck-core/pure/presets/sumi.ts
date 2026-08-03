import type { Preset } from "./index";
export const sumiPreset: Preset = {
  id: "sumi", label: "Sumi · 墨 — ink on void", baseFontPx: 32,
  tokens: {
    "--sd-bg": "#000000", "--sd-fg": "#f4efe2", "--sd-accent": "#d8b264",
    "--sd-code-bg": "#0d0c0a",
    "--sd-font": '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    "--sd-heading-font": '"EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    "--sd-mono": '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    "--sd-muted": "#c2b694",
    "--sd-surface": "#0e0d0b",
    "--sd-callout-fg": "#f4efe2",
    "--sd-display-style": "italic",
    "--sd-display-weight": "500",
    "--sd-display-tracking": "-0.02em",
    "--sd-eyebrow-font": "var(--sd-mono)",
  },
  extraCss: `
.sd-slide pre.hljs{ border:1px solid rgba(216,178,100,0.3); border-left:3px solid var(--sd-accent); }
.sd-slide .sd-callout{ border-left-color:var(--sd-accent); }
.sd-slide .sd-callout-note{ border-left-color:#8fcfdb; } .sd-slide .sd-callout-note .sd-callout-title{ color:#8fcfdb; }
.sd-slide .sd-callout-info{ border-left-color:#6fd6e6; } .sd-slide .sd-callout-info .sd-callout-title{ color:#6fd6e6; }
.sd-slide .sd-callout-tip{ border-left-color:#9fd49a; } .sd-slide .sd-callout-tip .sd-callout-title{ color:#9fd49a; }
.sd-slide .sd-callout-warning{ border-left-color:#ffc25e; } .sd-slide .sd-callout-warning .sd-callout-title{ color:#ffc25e; }
.sd-slide .sd-callout-danger{ border-left-color:#f4566c; } .sd-slide .sd-callout-danger .sd-callout-title{ color:#f4566c; }
`,
  hljs: "github-dark", mermaid: "dark",
};
