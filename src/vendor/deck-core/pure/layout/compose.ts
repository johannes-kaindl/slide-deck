import type { FitResult } from "./fit";

/** Below this vertical fill ratio, a non-overflowing slide is vertically centered
 *  ("fit-or-warn-or-fill"). Tunable; calibrated by manual smoke. */
export const COMPOSE_CENTER_THRESHOLD = 0.7;

/** Decide whether to vertically center a slide's content. Pure: takes measured heights
 *  + the computed fit. Centering is applied by toggling `.sd-compose-center` in render-dom. */
export function shouldCenterCompose(
  contentHeight: number,
  clientHeight: number,
  fit: FitResult,
  threshold = COMPOSE_CENTER_THRESHOLD,
): boolean {
  if (fit.overflow) return false;
  if (clientHeight <= 0) return false;
  return (contentHeight * fit.scale) / clientHeight < threshold;
}
