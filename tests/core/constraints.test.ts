import { describe, it, expect } from "vitest";
import { collectWarnings, collectDeckWarnings } from "../../src/core/constraints/engine";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";
import type { Slide, SlideDeck } from "../../src/core/slide-model";
import { type ThemeEntry, type ThemeRegistry } from "../../src/core/presets";
import { parseDeck } from "../../src/core/slide-model";

const slide = (over: Partial<Slide>): Slide => ({
  index: 2, markdown: "", startLine: 40, layout: "default", regions: [""], directiveWarnings: [], ...over,
});

function themeReg(...keys: string[]): ThemeRegistry {
  const m: ThemeRegistry = new Map();
  for (const k of keys) {
    const e: ThemeEntry = { key: k, source: k === "default" ? "builtin" : "user", themeCss: "", hljs: "", mermaid: "default", baseFontPx: 28 };
    m.set(k, e);
  }
  return m;
}

describe("collectWarnings", () => {
  it("tags slideIndex/sourceLine, includes render + overflow warnings", () => {
    const w = collectWarnings(slide({}), [{ kind: "missing-embed", message: "x" }], { scale: 0.5, overflow: true });
    expect(w).toContainEqual({ slideIndex: 2, kind: "missing-embed", message: "x", sourceLine: 40 });
    expect(w).toContainEqual({ slideIndex: 2, kind: "overflow", message: expect.any(String), sourceLine: 40 });
  });
  it("surfaces parse-time directive warnings", () => {
    const w = collectWarnings(slide({ directiveWarnings: [{ kind: "layout-multiple", message: "m" }] }), [], { scale: 1, overflow: false });
    expect(w).toContainEqual({ slideIndex: 2, kind: "layout-multiple", message: "m", sourceLine: 40 });
  });
  it("warns on unknown layout", () => {
    const w = collectWarnings(slide({ layout: "bogus" }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "layout-unknown")).toBe(true);
  });
  it("warns on region-count mismatch (column in a 1-region layout)", () => {
    const w = collectWarnings(slide({ layout: "title", regions: ["a", "b"] }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "region-count")).toBe(true);
  });
  it("no region warning when count matches", () => {
    const w = collectWarnings(slide({ layout: "two-column", regions: ["a", "b"] }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "region-count")).toBe(false);
  });
  it("passes through a cover-no-image render warning", () => {
    const slide_obj = { index: 0, startLine: 0, layout: "cover-image", modifiers: [], regions: [""], directiveWarnings: [], markdown: "" };
    const out = collectWarnings(slide_obj as any, [{ kind: "cover-no-image", message: "cover-image without an image" }], { scale: 1, overflow: false });
    expect(out.some((w) => w.kind === "cover-no-image")).toBe(true);
  });
});

describe("collectDeckWarnings (registry-aware)", () => {
  it("does not warn for a builtin theme in the registry", () => {
    const deck = parseDeck("---\ntheme: default\n---\n# A\n");
    expect(collectDeckWarnings(deck, themeReg("default", "dark"))).toEqual([]);
  });
  it("does not warn for a user theme present in the registry", () => {
    const deck = parseDeck("---\ntheme: ocean\n---\n# A\n");
    expect(collectDeckWarnings(deck, themeReg("default", "ocean"))).toEqual([]);
  });
  it("warns theme-unknown for a key absent from the registry", () => {
    const deck = parseDeck("---\ntheme: ghost\n---\n# A\n");
    const w = collectDeckWarnings(deck, themeReg("default"));
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe("theme-unknown");
  });
});

describe("authoring contract", () => {
  it("exposes geometry, floor and supported features", () => {
    const c = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });
    expect(c.geometry).toEqual({ width: 1280, height: 720 });
    expect(c.minFontPx).toBe(24);
    expect(c.slideSeparator).toBe("---");
    expect(contractToPrompt(c)).toContain("1280");
  });
  it("lists available layouts and themes", () => {
    const c = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });
    expect(c.themes).toContain("dark");
    expect(c.layouts).toContain("two-column");
    expect(contractToPrompt(c)).toContain("two-column");
  });
});
