import { describe, it, expect } from "vitest";
import { PRESETS, presetFor, presetTokensCss, assembleDeckCss, resolveTheme, listThemes, mergeThemes, type ThemeEntry, type ThemeRegistry } from "../../src/core/presets";

describe("presetFor", () => {
  it("registers exactly the five nordstern presets", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["kairo", "kurenai", "kuro", "shiro", "sumi"]);
  });
  it("is total — unknown id falls back to shiro", () => {
    expect(presetFor("nope").id).toBe("shiro");
  });
  it("resolves legacy keys via aliases (silent)", () => {
    expect(presetFor("default").id).toBe("shiro");
    expect(presetFor("dark").id).toBe("kuro");
    expect(presetFor("serif").id).toBe("shiro");
    expect(presetFor("high-contrast").id).toBe("sumi");
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
    const r = reg(entry("shiro", "builtin"), entry("mine", "user"));
    expect(resolveTheme(r, "mine").key).toBe("mine");
  });
  it("falls back to shiro for an unknown key", () => {
    const r = reg(entry("shiro", "builtin"), entry("kuro", "builtin"));
    expect(resolveTheme(r, "nope").key).toBe("shiro");
  });
});

describe("registry aliases", () => {
  it("resolveTheme follows aliases, exact user key wins over alias", () => {
    const r = reg(entry("shiro", "builtin"), entry("kuro", "builtin"), entry("dark", "user"));
    expect(resolveTheme(r, "default").key).toBe("shiro");
    expect(resolveTheme(r, "dark").key).toBe("dark"); // User-Theme "dark" schattet den Alias
    expect(resolveTheme(r, "nope").key).toBe("shiro");
  });
  it("aliases never appear in listThemes", () => {
    const r = reg(entry("shiro", "builtin"), entry("kuro", "builtin"));
    expect(listThemes(r).map((e) => e.key)).toEqual(["shiro", "kuro"]);
  });
});

describe("listThemes", () => {
  it("lists builtins first, then user themes alphabetically", () => {
    const r = reg(entry("shiro", "builtin"), entry("zeta", "user"), entry("alpha", "user"));
    expect(listThemes(r).map((e) => e.key)).toEqual(["shiro", "alpha", "zeta"]);
  });
});

describe("mergeThemes", () => {
  it("keeps all builtins when there are no user themes", () => {
    const { map, warnings } = mergeThemes([entry("shiro", "builtin"), entry("kuro", "builtin")], []);
    expect([...map.keys()].sort()).toEqual(["kuro", "shiro"]);
    expect(warnings).toEqual([]);
  });
  it("user theme overrides a builtin of the same key (overridesBuiltin)", () => {
    const u = { ...entry("kuro", "user"), themeCss: ".sd-slide{--sd-bg:#000}" };
    const { map } = mergeThemes([entry("shiro", "builtin"), entry("kuro", "builtin")], [u]);
    expect(map.get("kuro")!.source).toBe("user");
    expect(map.get("kuro")!.overridesBuiltin).toBe(true);
    expect(map.get("kuro")!.themeCss).toContain("#000");
  });
  it("first user wins on user/user key collision and warns", () => {
    const a = { ...entry("mine", "user"), themeCss: "A" };
    const b = { ...entry("mine", "user"), themeCss: "B" };
    const { map, warnings } = mergeThemes([entry("shiro", "builtin")], [a, b]);
    expect(map.get("mine")!.themeCss).toBe("A");
    expect(warnings.some((w) => w.includes("mine"))).toBe(true);
  });
});

describe("mermaidVarsFor", () => {
  it("maps preset tokens onto mermaid themeVariables (diagrams speak the theme)", async () => {
    const { mermaidVarsFor } = await import("../../src/core/presets");
    const vars = mermaidVarsFor({
      "--sd-bg": "#100e0c", "--sd-fg": "#ece4d3", "--sd-font": "Inter, sans-serif",
      "--sd-muted": "#a99e89", "--sd-surface": "#17140f",
    });
    expect(vars.fontFamily).toBe("Inter, sans-serif");
    expect(vars.primaryColor).toBe("#17140f");
    expect(vars.primaryTextColor).toBe("#ece4d3");
    expect(vars.lineColor).toBe("#a99e89");
  });
  it("falls back to code-bg when a preset has no surface token", async () => {
    const { mermaidVarsFor } = await import("../../src/core/presets");
    expect(mermaidVarsFor({ "--sd-code-bg": "#eee" }).primaryColor).toBe("#eee");
  });
});
