// tests/core/layouts.test.ts
import { describe, it, expect } from "vitest";
import { layoutFor, LAYOUTS, LAYOUTS_CSS } from "../../src/core/presets/layouts.css";

describe("layoutFor", () => {
  it("knows the five layouts plus default with correct region counts", () => {
    expect(layoutFor("default").regions).toBe(1);
    expect(layoutFor("title").regions).toBe(1);
    expect(layoutFor("section").regions).toBe(1);
    expect(layoutFor("quote").regions).toBe(1);
    expect(layoutFor("image-focus").regions).toBe(1);
    expect(layoutFor("two-column").regions).toBe(2);
  });
  it("is total — unknown id falls back to default", () => {
    expect(layoutFor("nope")).toEqual(LAYOUTS.default);
    expect(layoutFor("").id).toBe("default");
  });
});

describe("LAYOUTS_CSS", () => {
  it("defines region and layout selectors without theme colors", () => {
    expect(LAYOUTS_CSS).toContain(".sd-region");
    expect(LAYOUTS_CSS).toContain(".sd-layout-two-column");
    expect(LAYOUTS_CSS).toContain("grid-template-columns");
    expect(LAYOUTS_CSS).toContain(".sd-layout-title");
    // theme colors live in tokens, not here
    expect(LAYOUTS_CSS).not.toContain("#");
  });
});

describe("LAYOUTS_CSS compose-center", () => {
  it("centers single-column composed content with flex", () => {
    expect(LAYOUTS_CSS).toContain(".sd-compose-center:not(.sd-layout-two-column) .sd-content");
    expect(LAYOUTS_CSS).toContain("justify-content:center");
  });
  it("centers two-column composed content via grid align-content", () => {
    expect(LAYOUTS_CSS).toContain(".sd-compose-center.sd-layout-two-column .sd-content");
    expect(LAYOUTS_CSS).toContain("align-content:center");
  });
});
