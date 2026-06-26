// src/core/constraints/engine.ts
import type { FitResult } from "../layout/fit";
import type { Slide } from "../slide-model";
import { LAYOUTS, layoutFor } from "../presets/layouts.css";

export type WarningKind =
  | "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast"
  | "layout-unknown" | "layout-multiple" | "directive-malformed" | "region-count";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }
export type SlideWarning = Omit<Warning, "slideIndex">;

export function collectWarnings(slide: Slide, renderWarnings: SlideWarning[], fit: FitResult): Warning[] {
  const out: Warning[] = [];
  const at = (kind: WarningKind, message: string) =>
    out.push({ slideIndex: slide.index, kind, message, sourceLine: slide.startLine });

  for (const w of slide.directiveWarnings) at(w.kind as WarningKind, w.message);
  for (const w of renderWarnings) out.push({ ...w, slideIndex: slide.index, sourceLine: slide.startLine });

  if (slide.layout !== "default" && !(slide.layout in LAYOUTS)) {
    at("layout-unknown", `Unknown layout "${slide.layout}" — using default.`);
  }
  const expected = layoutFor(slide.layout).regions;
  if (slide.regions.length !== expected) {
    at("region-count", `Layout ${slide.layout} expects ${expected} region(s), found ${slide.regions.length}.`);
  }
  if (fit.overflow) {
    at("overflow", "Content overflows at the legibility floor — condense this slide.");
  }
  return out;
}
