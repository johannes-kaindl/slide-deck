import { describe, it, expect } from "vitest";
import { normalizeFolder, buildHideCss } from "../../src/core/folder-hide";

describe("normalizeFolder", () => {
  it("trims and removes trailing slashes", () => {
    expect(normalizeFolder("  Themes/ ")).toBe("Themes");
  });
});

describe("buildHideCss", () => {
  it("is empty when hide is off or the path is blank", () => {
    expect(buildHideCss("Themes", false)).toBe("");
    expect(buildHideCss("", true)).toBe("");
  });
  it("hides the folder title and its children, escaping the path", () => {
    const css = buildHideCss("Slide-Deck-Themes", true);
    expect(css).toContain('.nav-folder-title[data-path="Slide-Deck-Themes"]');
    expect(css).toContain("+ .nav-folder-children");
    expect(css).toContain("display: none");
  });
});
