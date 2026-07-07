import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleDeckCss, presetFor, presetTokensCss, type ThemeEntry } from "../src/core/presets";
import { STRUCTURE_CSS } from "../src/core/presets/structure.css";
import { LAYOUTS_CSS } from "../src/core/presets/layouts.css";
import { builtinThemeEntries, userThemeEntry } from "../src/deck-css";

// Mirror deckCss(entry) assembly using filesystem-read CSS (vitest cannot import .css via the
// esbuild text-loader; the real deckCss() is exercised end-to-end in bundle-smoke).
describe("deck css assembly (entry-based)", () => {
  const katex = readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
  const hljs = readFileSync("node_modules/highlight.js/styles/github.css", "utf8");

  function mirror(entry: ThemeEntry, customCss = ""): string {
    return assembleDeckCss([katex, entry.hljs, STRUCTURE_CSS, LAYOUTS_CSS, entry.themeCss, customCss]);
  }

  it("bundles katex, hljs, structure, layouts, theme tokens in order for a builtin", () => {
    const p = presetFor("default");
    const entry: ThemeEntry = { key: "default", source: "builtin", themeCss: presetTokensCss(p), hljs, mermaid: p.mermaid, baseFontPx: p.baseFontPx };
    const css = mirror(entry, ".sd-slide{ --sd-accent:#e63946 }");
    expect(css).toContain(".katex");
    expect(css).toContain(".hljs");
    expect(css).toContain(".sd-content");
    expect(css).toContain(".sd-layout-two-column");
    expect(css).toContain("--sd-base:28px");
    expect(css).toContain("#e63946");
  });

  it("uses the raw file css for a user theme entry", () => {
    const entry: ThemeEntry = { key: "ocean", source: "user", themeCss: ".sd-slide{ --sd-bg:#012 }", hljs, mermaid: "default", baseFontPx: 30 };
    const css = mirror(entry);
    expect(css).toContain("--sd-bg:#012");
  });
});

describe("builtin and user theme entries", () => {
  it("builtin entries append the preset's extraCss after the token block", () => {
    const kairo = builtinThemeEntries().find((e) => e.key === "kairo")!;
    expect(kairo.themeCss).toContain("--sd-accent:#4ac8d8");
    expect(kairo.themeCss).toContain("text-shadow");
    expect(kairo.themeCss.indexOf("--sd-accent")).toBeLessThan(kairo.themeCss.indexOf("text-shadow"));
  });
  it("user themes inherit code/mermaid scheme from shiro", () => {
    const u = userThemeEntry("mytheme", ".sd-slide{ --sd-bg:#123 }");
    expect(u.mermaid).toBe("default");
    expect(u.baseFontPx).toBe(28);
  });
});
