import { describe, it, expect } from "vitest";
import { shouldCenterCompose, COMPOSE_CENTER_THRESHOLD } from "../../src/core/layout/compose";

describe("shouldCenterCompose", () => {
  it("centers a sparse, non-overflowing slide (low fill ratio)", () => {
    // 200px content in a 600px box at scale 1 → ratio .33 < .7
    expect(shouldCenterCompose(200, 600, { scale: 1, overflow: false })).toBe(true);
  });
  it("does NOT center a well-filled slide", () => {
    expect(shouldCenterCompose(560, 600, { scale: 1, overflow: false })).toBe(false);
  });
  it("never centers an overflowing slide", () => {
    expect(shouldCenterCompose(100, 600, { scale: 0.5, overflow: true })).toBe(false);
  });
  it("uses post-scale height for the ratio", () => {
    // 1000px content scaled to .5 → 500px effective; 500/600 = .83 ≥ .7 → no center
    expect(shouldCenterCompose(1000, 600, { scale: 0.5, overflow: false })).toBe(false);
  });
  it("guards against a zero/empty box", () => {
    expect(shouldCenterCompose(0, 0, { scale: 1, overflow: false })).toBe(false);
  });
  it("exposes a tunable default threshold", () => {
    expect(COMPOSE_CENTER_THRESHOLD).toBe(0.7);
  });
});
