import type { Preset } from "./index";
export const darkPreset: Preset = {
  id: "dark", label: "Dark", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#1a1b26", "--sd-fg": "#c0caf5", "--sd-accent": "#7aa2f7",
    "--sd-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-heading-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-code-bg": "#16161e",
  },
  hljs: "github-dark", mermaid: "dark",
};
