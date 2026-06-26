import { defaultPreset } from "./default";
import { darkPreset } from "./dark";
import { serifPreset } from "./serif";
import { highContrastPreset } from "./high-contrast";

export interface Preset {
  id: string;
  label: string;
  baseFontPx: number;
  tokens: Record<string, string>;
  hljs: string;
  mermaid: "default" | "dark" | "neutral" | "forest";
}

export const PRESETS: Record<string, Preset> = {
  default: defaultPreset,
  dark: darkPreset,
  serif: serifPreset,
  "high-contrast": highContrastPreset,
};

/** TOTAL — unknown id falls back to default. Never throws. */
export function presetFor(id: string): Preset {
  return PRESETS[id] ?? PRESETS.default;
}

/** Emit the preset's tokens as a .sd-slide rule. --sd-base is derived from baseFontPx
 *  here and NOWHERE else (single source for the legibility floor). */
export function presetTokensCss(preset: Preset): string {
  const decls = Object.entries(preset.tokens).map(([k, v]) => `${k}:${v};`).join(" ");
  return `.sd-slide{ ${decls} --sd-base:${preset.baseFontPx}px; }`;
}

export function assembleDeckCss(parts: string[]): string { return parts.join("\n"); }
