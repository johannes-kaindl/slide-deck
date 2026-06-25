import { describe, it, expect } from "vitest";
import { collectWarnings } from "../../src/core/constraints/engine";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";

describe("collectWarnings", () => {
  it("tags slideIndex and overflow", () => {
    const w = collectWarnings(2, { html: "", warnings: [{ kind: "missing-embed", message: "x" }] },
      { scale: 0.5, overflow: true }, 40);
    expect(w).toEqual([
      { slideIndex: 2, kind: "missing-embed", message: "x", sourceLine: 40 },
      { slideIndex: 2, kind: "overflow", message: expect.any(String), sourceLine: 40 },
    ]);
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
