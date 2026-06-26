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
