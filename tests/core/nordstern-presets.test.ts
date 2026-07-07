import { describe, it, expect } from "vitest";
import { shiroPreset } from "../../src/core/presets/shiro";
import { kuroPreset } from "../../src/core/presets/kuro";
import { sumiPreset } from "../../src/core/presets/sumi";
import { kairoPreset } from "../../src/core/presets/kairo";
import { kurenaiPreset } from "../../src/core/presets/kurenai";

const all = [shiroPreset, kuroPreset, sumiPreset, kairoPreset, kurenaiPreset];

describe("nordstern presets", () => {
  it("carry complete token contracts + japanese labels", () => {
    for (const p of all) {
      for (const t of ["--sd-bg", "--sd-fg", "--sd-accent", "--sd-code-bg", "--sd-font", "--sd-heading-font",
        "--sd-mono", "--sd-muted", "--sd-surface", "--sd-callout-fg",
        "--sd-display-style", "--sd-display-weight", "--sd-display-tracking", "--sd-eyebrow-font"])
        expect(p.tokens[t], `${p.id} missing ${t}`).toBeTruthy();
      expect(p.label).toMatch(/·/);
    }
  });
  it("dark presets use a dark code + mermaid scheme", () => {
    for (const p of [kuroPreset, sumiPreset, kairoPreset, kurenaiPreset]) {
      expect(p.mermaid).toBe("dark");
    }
    // kuro speaks a WARM code palette (gruvbox) so highlighting stays in the deck's world
    expect(kuroPreset.hljs).toBe("gruvbox-dark-hard");
    for (const p of [sumiPreset, kairoPreset, kurenaiPreset]) expect(p.hljs).toBe("github-dark");
    expect(shiroPreset.hljs).toBe("github");
    expect(shiroPreset.mermaid).toBe("default");
  });
  it("sumi keeps its higher legibility floor", () => {
    expect(sumiPreset.baseFontPx).toBe(32);
    for (const p of [shiroPreset, kuroPreset, kairoPreset, kurenaiPreset]) expect(p.baseFontPx).toBe(28);
  });
  it("kuro carries the design-template atmosphere (glow, veil, vignette, h1 text glow)", () => {
    const extra = kuroPreset.extraCss ?? "";
    expect(extra).toContain("radial-gradient");
    expect(extra).toContain("box-shadow: inset");
    expect(extra).toContain("text-shadow");
    expect(extra).toContain("rgba(199, 154, 74, 0.16)");
    // per-type callout hues, warm-shifted + desaturated to sit inside the
    // cream/gold/brown world (no cold cyan) — type stays readable at a glance
    expect(extra).toContain(".sd-callout-note{ border-left-color:#86a69b;");
    expect(extra).toContain(".sd-callout-danger{ border-left-color:#c9574a;");
    expect(extra).not.toContain("#4ac8d8"); // kaltes Circuit-Cyan gehört kairo, nicht kuro
  });
  it("sumi stays atmosphere-free by design (high contrast)", () => {
    expect(sumiPreset.extraCss ?? "").not.toContain("background-image");
  });
  it("extraCss never overrides the type scale", () => {
    for (const p of all) {
      const extra = p.extraCss ?? "";
      expect(extra).not.toMatch(/font-size/);
      expect(extra).not.toMatch(/letter-spacing/);
      expect(extra).not.toMatch(/◉|\\25c9/); // kein ◉-Ornament mehr
    }
  });
});
