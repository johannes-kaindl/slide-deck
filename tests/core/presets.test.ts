import { describe, it, expect } from "vitest";
import { PRESETS, presetFor, presetTokensCss, assembleDeckCss } from "../../src/core/presets";

describe("presetFor", () => {
  it("ships the four built-in presets", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["dark", "default", "high-contrast", "serif"]);
  });
  it("is total — unknown id falls back to default", () => {
    expect(presetFor("nope").id).toBe("default");
  });
  it("every preset declares the required tokens", () => {
    for (const p of Object.values(PRESETS)) {
      for (const key of ["--sd-bg", "--sd-fg", "--sd-accent", "--sd-font", "--sd-code-bg", "--sd-heading-font"]) {
        expect(p.tokens[key], `${p.id} missing ${key}`).toBeDefined();
      }
      expect(p.baseFontPx).toBeGreaterThan(0);
    }
  });
});

describe("presetTokensCss", () => {
  it("emits a .sd-slide rule with --sd-base equal to baseFontPx, exactly once", () => {
    const css = presetTokensCss(presetFor("default"));
    expect(css).toContain(".sd-slide{");
    expect(css).toContain("--sd-base:28px");
    expect((css.match(/--sd-base:/g) ?? []).length).toBe(1);
    expect(css).toContain("--sd-bg:");
  });
});

describe("assembleDeckCss", () => {
  it("joins parts with newlines", () => {
    expect(assembleDeckCss(["a", "b"])).toBe("a\nb");
  });
});
