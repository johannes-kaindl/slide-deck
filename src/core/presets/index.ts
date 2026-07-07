import { shiroPreset } from "./shiro";
import { kuroPreset } from "./kuro";
import { sumiPreset } from "./sumi";
import { kairoPreset } from "./kairo";
import { kurenaiPreset } from "./kurenai";

export type MermaidTheme = "default" | "dark" | "neutral" | "forest";

export interface Preset {
  id: string;
  label: string;
  baseFontPx: number;
  tokens: Record<string, string>;
  /** Optional character/atmosphere CSS appended after the token block.
   *  MUST NOT set font-size/font-family/letter-spacing/margins — the scale is token-only. */
  extraCss?: string;
  hljs: string;
  mermaid: MermaidTheme;
}

export const PRESETS: Record<string, Preset> = {
  shiro: shiroPreset, kuro: kuroPreset, sumi: sumiPreset, kairo: kairoPreset, kurenai: kurenaiPreset,
};

/** Legacy 0.4.x keys resolve silently to their nordstern successor. */
export const THEME_ALIASES: Record<string, string> = {
  default: "shiro", dark: "kuro", serif: "shiro", "high-contrast": "sumi",
};

/** TOTAL — legacy keys alias, unknown ids fall back to shiro. Never throws. */
export function presetFor(id: string): Preset {
  return PRESETS[id] ?? PRESETS[THEME_ALIASES[id] ?? ""] ?? PRESETS.shiro;
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
  label?: string; // human-readable display name; UIs fall back to key when absent
  source: "builtin" | "user";
  themeCss: string;
  hljs: string;
  mermaid: MermaidTheme;
  /** Mermaid themeVariables derived from the preset tokens (mermaid inlines
   *  colors into its SVG, so CSS vars can't reach it). Absent for user themes
   *  → render falls back to the named `mermaid` theme. */
  mermaidVars?: Record<string, string>;
  baseFontPx: number;
  overridesBuiltin?: boolean;
}
export type ThemeRegistry = Map<string, ThemeEntry>;

/** Map preset tokens onto mermaid themeVariables so diagrams speak the theme
 *  (font, panel surfaces, muted lines, ink) instead of mermaid's default look. */
export function mermaidVarsFor(tokens: Record<string, string>): Record<string, string> {
  const fg = tokens["--sd-fg"] ?? "#16181d";
  const muted = tokens["--sd-muted"] ?? fg;
  const surface = tokens["--sd-surface"] ?? tokens["--sd-code-bg"] ?? "#f4f6f8";
  const bg = tokens["--sd-bg"] ?? surface;
  return {
    fontFamily: tokens["--sd-font"] ?? "sans-serif",
    primaryColor: surface, primaryTextColor: fg, primaryBorderColor: muted,
    lineColor: muted, textColor: fg,
    secondaryColor: surface, tertiaryColor: bg,
    clusterBkg: surface, edgeLabelBackground: bg,
  };
}

/** TOTAL — exact key first (a user theme may shadow a legacy name), then alias, then shiro. */
export function resolveTheme(reg: ThemeRegistry, key: string): ThemeEntry {
  return reg.get(key) ?? reg.get(THEME_ALIASES[key] ?? "") ?? reg.get("shiro")!;
}

/** Built-ins first (in PRESETS order), then user themes alphabetically. */
export function listThemes(reg: ThemeRegistry): ThemeEntry[] {
  const all = [...reg.values()];
  const order = Object.keys(PRESETS);
  const builtins = all.filter((e) => e.source === "builtin").sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const users = all.filter((e) => e.source === "user").sort((a, b) => a.key.localeCompare(b.key));
  return [...builtins, ...users];
}

/** Merge built-in entries with user entries. A user key matching a builtin overrides it
 *  (overridesBuiltin); two user entries with the same key → first wins + a warning. */
export function mergeThemes(builtins: ThemeEntry[], users: ThemeEntry[]): { map: ThemeRegistry; warnings: string[] } {
  const map: ThemeRegistry = new Map();
  const warnings: string[] = [];
  for (const b of builtins) map.set(b.key, b);
  for (const u of users) {
    const existing = map.get(u.key);
    if (existing && existing.source === "user") { warnings.push(`Duplicate theme "${u.key}" ignored.`); continue; }
    map.set(u.key, { ...u, overridesBuiltin: existing?.source === "builtin" });
  }
  return { map, warnings };
}
