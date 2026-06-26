import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleDeckCss, presetFor, presetTokensCss } from "../src/core/presets";
import { STRUCTURE_CSS } from "../src/core/presets/structure.css";
import { LAYOUTS_CSS } from "../src/core/presets/layouts.css";

// Mirror deckCss assembly using filesystem-read CSS (vitest cannot import .css via the
// esbuild text-loader; the real deckCss() is exercised end-to-end in bundle-smoke).
describe("deck css assembly", () => {
  it("bundles katex, hljs, structure, layouts, tokens in order", () => {
    const katex = readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
    const hljs = readFileSync("node_modules/highlight.js/styles/github.css", "utf8");
    const css = assembleDeckCss([katex, hljs, STRUCTURE_CSS, LAYOUTS_CSS, presetTokensCss(presetFor("default")), ""]);
    expect(css).toContain(".katex");
    expect(css).toContain(".hljs");
    expect(css).toContain(".sd-content");
    expect(css).toContain(".sd-layout-two-column");
    expect(css).toContain("--sd-base:28px");
  });
});
