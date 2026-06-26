import { describe, it, expect } from "vitest";
import { collectWarnings } from "../../src/core/constraints/engine";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";
import type { Slide } from "../../src/core/slide-model";

const slide = (over: Partial<Slide>): Slide => ({
  index: 2, markdown: "", startLine: 40, layout: "default", regions: [""], directiveWarnings: [], ...over,
});

describe("collectWarnings", () => {
  it("tags slideIndex/sourceLine, includes render + overflow warnings", () => {
    const w = collectWarnings(slide({}), [{ kind: "missing-embed", message: "x" }], { scale: 0.5, overflow: true });
    expect(w).toContainEqual({ slideIndex: 2, kind: "missing-embed", message: "x", sourceLine: 40 });
    expect(w).toContainEqual({ slideIndex: 2, kind: "overflow", message: expect.any(String), sourceLine: 40 });
  });
  it("surfaces parse-time directive warnings", () => {
    const w = collectWarnings(slide({ directiveWarnings: [{ kind: "layout-multiple", message: "m" }] }), [], { scale: 1, overflow: false });
    expect(w).toContainEqual({ slideIndex: 2, kind: "layout-multiple", message: "m", sourceLine: 40 });
  });
  it("warns on unknown layout", () => {
    const w = collectWarnings(slide({ layout: "bogus" }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "layout-unknown")).toBe(true);
  });
  it("warns on region-count mismatch (column in a 1-region layout)", () => {
    const w = collectWarnings(slide({ layout: "title", regions: ["a", "b"] }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "region-count")).toBe(true);
  });
  it("no region warning when count matches", () => {
    const w = collectWarnings(slide({ layout: "two-column", regions: ["a", "b"] }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "region-count")).toBe(false);
  });
});

describe("authoring contract", () => {
  it("exposes geometry, floor and supported features", () => {
    const c = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });
    expect(c.geometry).toEqual({ width: 1280, height: 720 });
    expect(c.minFontPx).toBe(24);
    expect(c.slideSeparator).toBe("---");
    expect(contractToPrompt(c)).toContain("1280");
  });
});
