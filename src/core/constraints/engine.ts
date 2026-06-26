// src/core/constraints/engine.ts
import type { FitResult } from "../layout/fit";
import type { Slide, SlideDeck } from "../slide-model";
import { LAYOUTS, layoutFor } from "../presets/layouts.css";
import { PRESETS } from "../presets";

export type WarningKind =
  | "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast"
  | "layout-unknown" | "layout-multiple" | "directive-malformed" | "region-count"
  | "theme-unknown";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }
export type SlideWarning = Omit<Warning, "slideIndex">;

export function collectDeckWarnings(deck: SlideDeck): Warning[] {
  const out: Warning[] = [];
  if (!(deck.directives.theme in PRESETS)) {
    out.push({ slideIndex: 0, kind: "theme-unknown", message: `Unknown theme "${deck.directives.theme}" — using default.`, sourceLine: 0 });
  }
  return out;
}

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
