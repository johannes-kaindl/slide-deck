import type { Preset } from "./index";
export const serifPreset: Preset = {
  id: "serif", label: "Serif (academic)", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#fbfaf7", "--sd-fg": "#1f1b16", "--sd-accent": "#7a5c1e",
    "--sd-font": "Georgia, 'Times New Roman', serif",
    "--sd-heading-font": "Georgia, 'Times New Roman', serif",
    "--sd-code-bg": "#f0ece4",
  },
  hljs: "github", mermaid: "neutral",
};
