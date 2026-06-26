import type { Preset } from "./index";
export const defaultPreset: Preset = {
  id: "default", label: "Default (light)", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#ffffff", "--sd-fg": "#16181d", "--sd-accent": "#3b6db5",
    "--sd-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-heading-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-code-bg": "#f4f6f8",
  },
  hljs: "github", mermaid: "default",
};
