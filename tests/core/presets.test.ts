import { describe, it, expect } from "vitest";
import { presetCss } from "../../src/core/presets/default.css";

describe("presetCss", () => {
  it("returns default for unknown names and includes callout shapes", () => {
    const css = presetCss("nope");
    expect(css).toContain(".sd-slide");
    expect(css).toContain(".sd-callout-warning");
    expect(css).toContain("::before"); // Form-Redundanz, nicht nur Farbe
  });
});
