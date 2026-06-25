import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleDeckCss, presetCss } from "../src/core/presets/default.css";

describe("deck css assembly", () => {
  it("bundles katex, hljs token theme, and preset styles together", () => {
    const katex = readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
    const hljs = readFileSync("node_modules/highlight.js/styles/github-dark.css", "utf8");
    const css = assembleDeckCss([katex, hljs, presetCss("default")]);
    expect(katex).toContain(".katex");          // the dep really ships math CSS
    expect(hljs).toMatch(/\.hljs/);             // the theme really ships token rules
    expect(css).toContain(".katex");
    expect(css).toContain(".hljs");
    expect(css).toContain(".sd-slide");         // preset present
  });
});
