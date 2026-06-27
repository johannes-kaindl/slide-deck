import { describe, it, expect } from "vitest";
import { PRESETS, presetFor, presetTokensCss, assembleDeckCss, resolveTheme, listThemes, mergeThemes, type ThemeEntry, type ThemeRegistry } from "../../src/core/presets";

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

function entry(key: string, source: "builtin" | "user"): ThemeEntry {
  return { key, source, themeCss: "", hljs: "", mermaid: "default", baseFontPx: 28 };
}
function reg(...e: ThemeEntry[]): ThemeRegistry { return new Map(e.map((x) => [x.key, x])); }

describe("resolveTheme", () => {
  it("returns the entry for a known key", () => {
    const r = reg(entry("default", "builtin"), entry("mine", "user"));
    expect(resolveTheme(r, "mine").key).toBe("mine");
  });
  it("falls back to default for an unknown key", () => {
    const r = reg(entry("default", "builtin"), entry("dark", "builtin"));
    expect(resolveTheme(r, "nope").key).toBe("default");
  });
});

describe("listThemes", () => {
  it("lists builtins first, then user themes alphabetically", () => {
    const r = reg(entry("default", "builtin"), entry("zeta", "user"), entry("alpha", "user"));
    expect(listThemes(r).map((e) => e.key)).toEqual(["default", "alpha", "zeta"]);
  });
});

describe("mergeThemes", () => {
  it("keeps all builtins when there are no user themes", () => {
    const { map, warnings } = mergeThemes([entry("default", "builtin"), entry("dark", "builtin")], []);
    expect([...map.keys()].sort()).toEqual(["dark", "default"]);
    expect(warnings).toEqual([]);
  });
  it("user theme overrides a builtin of the same key (overridesBuiltin)", () => {
    const u = { ...entry("dark", "user"), themeCss: ".sd-slide{--sd-bg:#000}" };
    const { map } = mergeThemes([entry("default", "builtin"), entry("dark", "builtin")], [u]);
    expect(map.get("dark")!.source).toBe("user");
    expect(map.get("dark")!.overridesBuiltin).toBe(true);
    expect(map.get("dark")!.themeCss).toContain("#000");
  });
  it("first user wins on user/user key collision and warns", () => {
    const a = { ...entry("mine", "user"), themeCss: "A" };
    const b = { ...entry("mine", "user"), themeCss: "B" };
    const { map, warnings } = mergeThemes([entry("default", "builtin")], [a, b]);
    expect(map.get("mine")!.themeCss).toBe("A");
    expect(warnings.some((w) => w.includes("mine"))).toBe(true);
  });
});
