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
  it("knows the new templates with region counts", () => {
    expect(layoutFor("columns-3").regions).toBe(3);
    expect(layoutFor("stat").regions).toBe(1);
    expect(layoutFor("cover-image").regions).toBe(1);
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
  it("centers single-column composed content with flex (excluding grids)", () => {
    expect(LAYOUTS_CSS).toContain(".sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3) .sd-content");
    expect(LAYOUTS_CSS).toContain("justify-content:center");
  });
  it("centers grid composed content via align-content", () => {
    expect(LAYOUTS_CSS).toContain(".sd-layout-columns-3 .sd-content");
    expect(LAYOUTS_CSS).toContain("align-content:center");
  });
});

describe("LAYOUTS_CSS templates & modifiers", () => {
  it("spans titles across columns and defines new templates", () => {
    expect(LAYOUTS_CSS).toContain(".sd-region-title");
    expect(LAYOUTS_CSS).toContain("grid-column:1/-1");
    expect(LAYOUTS_CSS).toContain(".sd-layout-columns-3 .sd-content");
    expect(LAYOUTS_CSS).toContain(".sd-layout-stat");
    expect(LAYOUTS_CSS).toContain(".sd-layout-cover-image .sd-content");
  });
  it("defines combinable modifiers", () => {
    expect(LAYOUTS_CSS).toContain(".sd-mod-compact");
    expect(LAYOUTS_CSS).toContain(".sd-mod-code-heavy");
  });
});
