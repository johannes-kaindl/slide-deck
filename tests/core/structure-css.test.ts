// tests/core/structure-css.test.ts
import { describe, it, expect } from "vitest";
import { STRUCTURE_CSS } from "../../src/core/presets/structure.css";

describe("STRUCTURE_CSS", () => {
  it("references tokens and keeps fit-critical rules", () => {
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; }");
    expect(STRUCTURE_CSS).toContain("overflow:hidden");
    expect(STRUCTURE_CSS).toContain("var(--sd-bg)");
    expect(STRUCTURE_CSS).toContain("var(--sd-fg)");
    expect(STRUCTURE_CSS).toContain("font-size:var(--sd-base)");
  });
  it("does NOT declare --sd-base (single source is presetTokensCss)", () => {
    expect(STRUCTURE_CSS).not.toContain("--sd-base:");
  });
  it("code blocks use a token bg and no hardcoded dark colors", () => {
    expect(STRUCTURE_CSS).toContain(".sd-slide pre.hljs");
    expect(STRUCTURE_CSS).toContain("background:var(--sd-code-bg)");
    expect(STRUCTURE_CSS).not.toContain("#0d1117");
    expect(STRUCTURE_CSS).not.toContain("#e6edf3");
  });
  it("keeps accessible callout shapes (icon ::before)", () => {
    expect(STRUCTURE_CSS).toContain(".sd-callout-warning");
    expect(STRUCTURE_CSS).toContain("::before");
  });
});

describe("STRUCTURE_CSS callout tokenization", () => {
  it("derives callout surface + text from tokens with current fallbacks", () => {
    expect(STRUCTURE_CSS).toContain("var(--sd-surface,#f4f6f8)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-fg,#16181d)");
  });
  it("derives each callout signal color from a token", () => {
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-note,#3b6db5)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-warning,#b58a1e)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-danger,#b5443b)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-tip,#2e8b6f)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-info,#3b6db5)");
  });
  it("no longer hardcodes the light callout surface hex directly", () => {
    expect(STRUCTURE_CSS).not.toContain("background:#f4f6f8");
  });
  it("base callout border keeps the original neutral grey fallback", () => {
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-base,#5b6470)");
    expect(STRUCTURE_CSS).not.toContain("6px solid var(--sd-callout-note");
  });
});

describe("STRUCTURE_CSS area model", () => {
  it("anchors absolutely-positioned slots", () => {
    expect(STRUCTURE_CSS).toContain("position:relative");           // on .sd-slide
    expect(STRUCTURE_CSS).toContain(".sd-slide-pagination");
    expect(STRUCTURE_CSS).toContain(".sd-slide-header");
    expect(STRUCTURE_CSS).toContain(".sd-slide-footer");
  });
  it("centers block media (no longer left-inline)", () => {
    expect(STRUCTURE_CSS).toContain("margin-inline:auto");
    expect(STRUCTURE_CSS).toContain("var(--sd-media-max-h,60%)");
  });
  it("defines cover-image background + scrim", () => {
    expect(STRUCTURE_CSS).toContain(".sd-cover-media");
    expect(STRUCTURE_CSS).toContain("object-fit:cover");
    expect(STRUCTURE_CSS).toContain("var(--sd-scrim,");
  });
  it("keeps .sd-content fill rule verbatim (fit-critical)", () => {
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; }");
  });
});
