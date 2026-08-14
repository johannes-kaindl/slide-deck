// Umgezogen aus markdown-presentation/src/core/presets/ (Branch feat/marp-theme-import,
// 2026-07-11) — Presets leben seit dem deck-core-Schnitt 2026-08-03 hier.
/** Marp's type scale + spacing, rem→em normalised against Marp's 1.05rem body
 *  anchor (--kuro-fs-body).
 *
 *  ⚠ RESERVED FOR THE EBENE-B SCALE/RHYTHM PROJECT — deliberately NOT spread
 *  into the presets. The crimson prototype showed a fixed --sd-size-* in a
 *  theme is too large for slide-deck's canvas AND shadows structural
 *  mechanisms (the `compact` modifier stops shrinking headings). Scale/rhythm
 *  is global (Ebene B), not a per-theme token. Kept here (verified extraction)
 *  as the reference input for that project + a settings font-size override. */
export const MARP_SCALE_TOKENS: Record<string, string> = {
  "--sd-size-display": "5.71em", // hero 6.0rem
  "--sd-size-h1": "3.43em",      // 3.6rem
  "--sd-size-h2": "1.90em",      // 2.0rem
  "--sd-size-eyebrow": "0.67em", // caption 0.7rem
  "--sd-space-2xs": "0.38em",    // xs 0.4rem
  "--sd-space-xs": "0.71em",     // sm 0.75rem
  "--sd-space-s": "1.19em",      // md 1.25rem
  "--sd-space-m": "1.90em",      // lg 2.0rem
  "--sd-space-l": "2.86em",      // xl 3.0rem
  "--sd-space-xl": "4.29em",     // xxl 4.5rem
};
export const MARP_FONT_TOKENS: Record<string, string> = {
  "--sd-heading-font": "'EB Garamond', Georgia, 'Times New Roman', serif",
  "--sd-font": "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  "--sd-mono": "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
};
/** Marp's asymmetric padding (3.5rem 4rem). Also Ebene B — reserved, not spread. */
export const MARP_PAD = "56px 64px";

export interface MarpAtmosphereParams {
  scanlineOpacity: number; // 0 = off (lc modes)
  glowRem: number;         // 0 = off
  accent: string;
  scanlineInk: string;     // "r,g,b" for the scanline lines
}
/** Atmosphere-essence extraCss (additive, on .sd-slide). Scanline rides a
 *  background-image layer (::before is reserved for cover/media). Glow is a
 *  text-shadow on h1. Callout signature tint is derived from the accent. */
export function marpAtmosphere(p: MarpAtmosphereParams): string {
  const parts: string[] = [];
  if (p.scanlineOpacity > 0) {
    parts.push(`.sd-slide{ background-image:repeating-linear-gradient(0deg,` +
      `rgba(${p.scanlineInk},${p.scanlineOpacity}) 0,rgba(${p.scanlineInk},${p.scanlineOpacity}) 1px,` +
      `transparent 1px,transparent 3px); }`);
  }
  if (p.glowRem > 0) {
    parts.push(`.sd-slide h1{ text-shadow:0 0 ${p.glowRem}rem ${hexA(p.accent, 0.5)}; }`);
  }
  parts.push(`.sd-slide .sd-callout-danger{ border-left-color:${p.accent}; background:${hexA(p.accent, 0.09)}; }`);
  return parts.join("\n");
}
/** #rrggbb + alpha → rgba() string. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
