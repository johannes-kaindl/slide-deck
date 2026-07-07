import type { Preset } from "./index";
export const kuroPreset: Preset = {
  id: "kuro", label: "Kuro · 黒 — the chamber", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#100e0c", "--sd-fg": "#ece4d3", "--sd-accent": "#c79a4a",
    "--sd-code-bg": "#1b1712",
    "--sd-font": '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    "--sd-heading-font": '"EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    "--sd-mono": '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    "--sd-muted": "#a99e89",
    "--sd-surface": "#17140f",
    "--sd-callout-fg": "#ece4d3",
    "--sd-display-style": "italic",
    "--sd-display-weight": "500",
    "--sd-display-tracking": "-0.02em",
    "--sd-eyebrow-font": "var(--sd-mono)",
  },
  hljs: "github-dark", mermaid: "dark",
};
