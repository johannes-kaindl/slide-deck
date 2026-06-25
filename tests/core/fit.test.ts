import { describe, it, expect } from "vitest";
import { computeFit } from "../../src/core/layout/fit";

const GEO = { width: 1280, height: 720 };

describe("computeFit", () => {
  it("scale 1 when content fits", () => {
    expect(computeFit({ contentWidth: 1000, contentHeight: 600 }, GEO, 0.5)).toEqual({ scale: 1, overflow: false });
  });
  it("scales down to fit, no overflow", () => {
    // content 1.2x too tall -> needs scale ~0.833, above floor 0.5
    const r = computeFit({ contentWidth: 1280, contentHeight: 864 }, GEO, 0.5);
    expect(r.overflow).toBe(false);
    expect(r.scale).toBeCloseTo(720 / 864, 3);
  });
  it("clamps at minScale and flags overflow", () => {
    const r = computeFit({ contentWidth: 1280, contentHeight: 2000 }, GEO, 0.7);
    expect(r).toEqual({ scale: 0.7, overflow: true });
  });
});
