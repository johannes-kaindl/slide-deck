import { defaultPreset } from "./default";
import { darkPreset } from "./dark";
import { serifPreset } from "./serif";
import { highContrastPreset } from "./high-contrast";

export type MermaidTheme = "default" | "dark" | "neutral" | "forest";

export interface Preset {
  id: string;
  label: string;
  baseFontPx: number;
  tokens: Record<string, string>;
  hljs: string;
  mermaid: MermaidTheme;
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

export interface ThemeEntry {
  key: string;
  source: "builtin" | "user";
  themeCss: string;
  hljs: string;
  mermaid: MermaidTheme;
  baseFontPx: number;
  overridesBuiltin?: boolean;
}
export type ThemeRegistry = Map<string, ThemeEntry>;

/** TOTAL — unknown key falls back to the always-present "default" builtin. */
export function resolveTheme(reg: ThemeRegistry, key: string): ThemeEntry {
  return reg.get(key) ?? reg.get("default")!;
}

/** Built-ins first (in PRESETS order), then user themes alphabetically. */
export function listThemes(reg: ThemeRegistry): ThemeEntry[] {
  const all = [...reg.values()];
  const order = Object.keys(PRESETS);
  const builtins = all.filter((e) => e.source === "builtin").sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const users = all.filter((e) => e.source === "user").sort((a, b) => a.key.localeCompare(b.key));
  return [...builtins, ...users];
}
