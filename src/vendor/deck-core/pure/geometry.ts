import type { Aspect } from "./slide-model";
export interface SlideGeometry { width: number; height: number; }
export function geometryFor(aspect: Aspect): SlideGeometry {
  return aspect === "4:3" ? { width: 960, height: 720 } : { width: 1280, height: 720 };
}
