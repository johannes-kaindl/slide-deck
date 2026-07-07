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

describe("alignment axioms & eyebrow context", () => {
  it("hero layouts center the block, never list lines (axiom 2)", () => {
    expect(LAYOUTS_CSS).toContain(
      ".sd-layout-title .sd-region :is(ul,ol),.sd-layout-section .sd-region :is(ul,ol),.sd-layout-quote .sd-region :is(ul,ol){\n  text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }"
    );
    expect(LAYOUTS_CSS).toContain("max-width:85%");
  });
  it("image-focus and cover-empty center the block, never list lines (axiom 1)", () => {
    expect(LAYOUTS_CSS).toContain(".sd-layout-image-focus .sd-region :is(ul,ol){ text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }");
    expect(LAYOUTS_CSS).toContain(".sd-cover-empty .sd-region :is(ul,ol){ text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }");
  });
  it("h1 on hero layouts uses the display role", () => {
    expect(LAYOUTS_CSS).toContain(".sd-layout-title h1,.sd-layout-section h1,.sd-layout-cover-image h1{ font-size:var(--sd-size-display,2.44em); }");
  });
  it("h2 on hero layouts becomes a small tracked eyebrow", () => {
    expect(LAYOUTS_CSS).toContain("font-size:var(--sd-size-eyebrow,.68em)");
    expect(LAYOUTS_CSS).toContain("letter-spacing:var(--sd-eyebrow-tracking,.14em)");
    expect(LAYOUTS_CSS).toContain("color:var(--sd-eyebrow-fg,var(--sd-accent))");
  });
  it("column gaps come from the space scale", () => {
    expect(LAYOUTS_CSS).toContain("gap:var(--sd-space-l,1.5em)");
    expect(LAYOUTS_CSS).toContain("gap:var(--sd-space-m,1em)");
  });
});
