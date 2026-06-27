// tests/chrome-css.test.ts
import { describe, it, expect } from "vitest";
import { PREVIEW_CHROME_CSS, PRINT_CSS } from "../src/chrome-css";

describe("PREVIEW_CHROME_CSS", () => {
  it("stacks slides and carries hardcoded (theme-free) card + warn colors", () => {
    expect(PREVIEW_CHROME_CSS).toContain(".sd-deck-inner");
    expect(PREVIEW_CHROME_CSS).toContain("gap: 24px");
    expect(PREVIEW_CHROME_CSS).toContain("box-shadow"); // card
    expect(PREVIEW_CHROME_CSS).toContain("#e5534b");    // overflow stripe (red), no var()
    expect(PREVIEW_CHROME_CSS).toContain("#c98a00");    // soft-warn stripe (amber)
    expect(PREVIEW_CHROME_CSS).not.toContain("var(--"); // iframe has no Obsidian theme vars
  });
});

describe("PRINT_CSS", () => {
  it("sets the page to slide geometry and breaks one slide per page", () => {
    const css = PRINT_CSS(1280, 720);
    expect(css).toContain("@page");
    expect(css).toContain("size: 1280px 720px");
    expect(css).toContain("margin: 0");
    expect(css).toContain("break-after: page");
  });
});
