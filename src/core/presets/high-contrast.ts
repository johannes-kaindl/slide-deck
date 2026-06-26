import type { Preset } from "./index";
export const highContrastPreset: Preset = {
  id: "high-contrast", label: "High contrast", baseFontPx: 30,
  tokens: {
    "--sd-bg": "#ffffff", "--sd-fg": "#000000", "--sd-accent": "#0b3d91",
    "--sd-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-heading-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-code-bg": "#eeeeee",
  },
  hljs: "github", mermaid: "default",
};
