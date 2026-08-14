// Umgezogen aus markdown-presentation/src/core/presets/ (Branch feat/marp-theme-import,
// 2026-07-11) — Presets leben seit dem deck-core-Schnitt 2026-08-03 hier.
import type { Preset } from "./index";
import { MARP_FONT_TOKENS, marpAtmosphere } from "./_marp-shared";

/* Ebene A = colours + fonts (incl. the Mono body) + atmosphere ONLY. The Marp
 * type scale / spacing are deliberately NOT set here: the prototype showed a
 * fixed --sd-size-* in the theme is too large for slide-deck's canvas AND
 * shadows structural mechanisms like the `compact` modifier. Scale/rhythm is
 * Ebene B (its own project — see MARP_SCALE_TOKENS in _marp-shared.ts). */

function crimson(id: string, label: string, baseFontPx: number,
  c: { bg: string; surface: string; fg: string; muted: string; accent: string; scanline: number; glow: number; ink: string },
  mermaid: "dark" | "default"): Preset {
  return {
    id, label, baseFontPx,
    tokens: {
      ...MARP_FONT_TOKENS,
      "--sd-bg": c.bg, "--sd-surface": c.surface, "--sd-code-bg": c.surface,
      "--sd-fg": c.fg, "--sd-callout-fg": c.fg, "--sd-muted": c.muted,
      "--sd-accent": c.accent,
      "--sd-display-style": "italic", "--sd-display-weight": "500",
      "--sd-eyebrow-font": "var(--sd-mono)",
    },
    extraCss: marpAtmosphere({ scanlineOpacity: c.scanline, glowRem: c.glow, accent: c.accent, scanlineInk: c.ink }),
    hljs: mermaid === "dark" ? "gruvbox-dark-hard" : "github", mermaid,
  };
}
export const crimsonDark = crimson("crimson-dark", "Crimson · 紅 — dark", 28,
  { bg: "#0f0808", surface: "#130b0b", fg: "#e8e4d8", muted: "#8a8478", accent: "#d4203a", scanline: 0.035, glow: 1.0, ink: "232,228,216" }, "dark");
export const crimsonDarkLc = crimson("crimson-dark-lc", "Crimson · 紅 — dark (low-contrast)", 28,
  { bg: "#180e0e", surface: "#130b0b", fg: "#a8a49a", muted: "#6a6760", accent: "#d4203a", scanline: 0.020, glow: 0.6, ink: "168,164,154" }, "dark");
export const crimsonLight = crimson("crimson-light", "Crimson · 紅 — light", 28,
  { bg: "#faf5f5", surface: "#f2eaea", fg: "#1a1814", muted: "#4a4640", accent: "#B54545", scanline: 0, glow: 0, ink: "26,24,20" }, "default");
export const crimsonLightLc = crimson("crimson-light-lc", "Crimson · 紅 — light (low-contrast)", 28,
  { bg: "#f8f5ee", surface: "#f2eaea", fg: "#3d2b1f", muted: "#7a6352", accent: "#B54545", scanline: 0, glow: 0, ink: "61,43,31" }, "default");
