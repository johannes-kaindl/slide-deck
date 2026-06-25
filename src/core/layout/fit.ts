import type { SlideGeometry } from "../geometry";
export interface Measured { contentWidth: number; contentHeight: number; }
export interface FitResult { scale: number; overflow: boolean; }

export function computeFit(measured: Measured, geo: SlideGeometry, minScale: number): FitResult {
  const needed = Math.min(geo.width / measured.contentWidth, geo.height / measured.contentHeight);
  if (needed >= 1) return { scale: 1, overflow: false };
  if (needed >= minScale) return { scale: needed, overflow: false };
  return { scale: minScale, overflow: true };
}
