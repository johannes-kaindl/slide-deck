import type { RenderedSlide } from "../render/md2html";
import type { FitResult } from "../layout/fit";

export type WarningKind = "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }

export function collectWarnings(slideIndex: number, render: RenderedSlide, fit: FitResult, startLine: number): Warning[] {
  const out: Warning[] = render.warnings.map((w) => ({ ...w, slideIndex, sourceLine: startLine }));
  if (fit.overflow) {
    out.push({ slideIndex, kind: "overflow", message: "Content overflows at the legibility floor — condense this slide.", sourceLine: startLine });
  }
  return out;
}
