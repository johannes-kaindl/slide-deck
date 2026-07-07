import type { Preset } from "./index";
export const kurenaiPreset: Preset = {
  id: "kurenai", label: "Kurenai · 紅 — danger signal", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#100e0c", "--sd-fg": "#ece4d3", "--sd-accent": "#e8455c",
    "--sd-code-bg": "#1b1411",
    "--sd-font": '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    "--sd-heading-font": '"EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    "--sd-mono": '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    "--sd-muted": "#a99e89",
    "--sd-surface": "#181210",
    "--sd-callout-fg": "#ece4d3",
    "--sd-display-style": "italic",
    "--sd-display-weight": "500",
    "--sd-display-tracking": "-0.02em",
    "--sd-eyebrow-font": "var(--sd-mono)",
  },
  extraCss: `
.sd-slide{
  background-color: var(--sd-bg);
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E"),
    radial-gradient(125% 85% at 16% -8%, rgba(212,32,58,0.14) 0%, transparent 46%),
    radial-gradient(100% 70% at 85% 110%, rgba(212,32,58,0.06) 0%, transparent 55%);
  background-size: 150px 150px, cover, cover;
  background-position: 0 0, center, center;
  background-repeat: repeat, no-repeat, no-repeat;
  box-shadow: inset 0 0 240px 26px rgba(0,0,0,0.5);
}
.sd-slide h1{ text-shadow: 0 0 34px rgba(212,32,58,0.14); }
.sd-slide pre.hljs{ border:1px solid rgba(232,69,92,0.24); border-left:3px solid var(--sd-accent); }
.sd-slide .sd-callout{ border-left-color:var(--sd-accent); }
.sd-slide .sd-callout-note{ border-left-color:#7ab8c4; background:rgba(122,184,196,0.07); } .sd-slide .sd-callout-note .sd-callout-title{ color:#7ab8c4; }
.sd-slide .sd-callout-info{ border-left-color:#4ac8d8; background:rgba(74,200,216,0.07); } .sd-slide .sd-callout-info .sd-callout-title{ color:#4ac8d8; }
.sd-slide .sd-callout-tip{ border-left-color:#8bbf87; background:rgba(139,191,135,0.07); } .sd-slide .sd-callout-tip .sd-callout-title{ color:#8bbf87; }
.sd-slide .sd-callout-warning{ border-left-color:#ffb442; background:rgba(255,180,66,0.07); } .sd-slide .sd-callout-warning .sd-callout-title{ color:#ffb442; }
.sd-slide .sd-callout-danger{ border-left-color:#e8455c; background:rgba(212,32,58,0.1); } .sd-slide .sd-callout-danger .sd-callout-title{ color:#e8455c; }
`,
  hljs: "github-dark", mermaid: "dark",
};
