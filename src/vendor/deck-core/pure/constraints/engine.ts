// src/core/constraints/engine.ts
import type { FitResult } from "../layout/fit";
import type { Slide, SlideDeck } from "../slide-model";
import { LAYOUTS, layoutFor } from "../presets/layouts.css";
import { THEME_ALIASES, type ThemeRegistry } from "../presets";

export type WarningKind =
  | "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast"
  | "layout-unknown" | "modifier-unknown" | "layout-multiple" | "directive-malformed" | "region-count"
  | "theme-unknown" | "cover-no-image";
/** How loud a warning may be. `error` costs legibility and must be seen; `warn` means the
 *  deck renders but something the author asked for did not happen; `info` reports that the
 *  core did not recognise a name and passed it through — the documented extension path for
 *  themes, not a fault. Consumers colour by this, never by kind: a consumer that rebuilds
 *  the kind list has to relearn every addition here. */
export type WarningSeverity = "error" | "warn" | "info";

/** TOTAL over WarningKind on purpose — adding a kind without ranking it breaks the build
 *  instead of silently defaulting to the loudest colour. */
export const WARNING_SEVERITY: Record<WarningKind, WarningSeverity> = {
  overflow: "error",
  belowFloor: "error",
  "missing-embed": "warn",
  "mermaid-error": "warn",
  "low-contrast": "warn",
  "layout-multiple": "warn",
  "directive-malformed": "warn",
  "region-count": "warn",
  "theme-unknown": "warn",
  "cover-no-image": "warn",
  "layout-unknown": "info",
  "modifier-unknown": "info",
};

export interface Warning { slideIndex: number; kind: WarningKind; message: string; severity: WarningSeverity; sourceLine?: number; }
export type SlideWarning = Omit<Warning, "slideIndex" | "severity">;

export function collectDeckWarnings(deck: SlideDeck, registry: ThemeRegistry): Warning[] {
  const out: Warning[] = [];
  const t = deck.directives.theme;
  if (!registry.has(t) && !registry.has(THEME_ALIASES[t] ?? "")) {
    out.push({ slideIndex: 0, kind: "theme-unknown", severity: WARNING_SEVERITY["theme-unknown"], message: `Unknown theme "${t}" — using shiro.`, sourceLine: 0 });
  }
  return out;
}

export function collectWarnings(slide: Slide, renderWarnings: SlideWarning[], fit: FitResult): Warning[] {
  const out: Warning[] = [];
  const at = (kind: WarningKind, message: string) =>
    out.push({ slideIndex: slide.index, kind, severity: WARNING_SEVERITY[kind], message, sourceLine: slide.startLine });

  for (const w of slide.directiveWarnings) at(w.kind as WarningKind, w.message);
  for (const w of renderWarnings) out.push({ ...w, slideIndex: slide.index, severity: WARNING_SEVERITY[w.kind], sourceLine: slide.startLine });

  const known = slide.layout in LAYOUTS;
  if (slide.layout !== "default" && !known) {
    at("layout-unknown", `Unknown layout "${slide.layout}" — passed through as .sd-layout-${slide.layout}; no built-in geometry.`);
  }
  // Only a layout we know has an expected region count. Claiming one for a theme's own
  // layout name would report the extension path as a defect — the same false alarm as
  // layout-unknown, one level down.
  if (known) {
    const expected = layoutFor(slide.layout).regions;
    if (slide.regions.length !== expected) {
      at("region-count", `Layout ${slide.layout} expects ${expected} region(s), found ${slide.regions.length}.`);
    }
  }
  if (fit.overflow) {
    at("overflow", "Content overflows at the legibility floor — condense this slide.");
  }
  return out;
}
