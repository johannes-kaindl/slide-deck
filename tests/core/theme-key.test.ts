import { describe, it, expect } from "vitest";
import { keyFromFilename, parseBaseFontPx, parseThemeMeta } from "../../src/core/theme-key";

describe("keyFromFilename", () => {
  it("strips the .css extension verbatim", () => {
    expect(keyFromFilename("My Theme.css")).toBe("My Theme");
  });
  it("is case-insensitive on the extension and trims", () => {
    expect(keyFromFilename("  ocean.CSS  ")).toBe("ocean");
  });
  it("leaves a name without extension untouched", () => {
    expect(keyFromFilename("plain")).toBe("plain");
  });
});

describe("parseBaseFontPx", () => {
  it("reads --sd-base from a token block", () => {
    expect(parseBaseFontPx(".sd-slide{ --sd-base:32px; --sd-bg:#000 }")).toBe(32);
  });
  it("returns undefined when absent or non-positive", () => {
    expect(parseBaseFontPx(".sd-slide{ --sd-bg:#000 }")).toBeUndefined();
    expect(parseBaseFontPx("--sd-base:0px")).toBeUndefined();
  });
});

describe("parseThemeMeta", () => {
  it("reads sd-hljs and sd-mermaid header directives", () => {
    const css = "/* sd-hljs: github-dark */\n/* sd-mermaid: dark */\n.sd-slide{ --sd-bg:#000 }";
    expect(parseThemeMeta(css)).toEqual({ hljs: "github-dark", mermaid: "dark" });
  });
  it("tolerates whitespace and case on the mermaid value", () => {
    expect(parseThemeMeta("/*  sd-mermaid : Forest */").mermaid).toBe("forest");
  });
  it("drops an unknown mermaid value but keeps a valid hljs", () => {
    const r = parseThemeMeta("/* sd-hljs: github */\n/* sd-mermaid: bogus */");
    expect(r).toEqual({ hljs: "github" });
  });
  it("returns an empty object when no directives present", () => {
    expect(parseThemeMeta(".sd-slide{ --sd-bg:#000 }")).toEqual({});
  });
  it("reads an sd-label header directive (spaces + unicode allowed)", () => {
    expect(parseThemeMeta("/* sd-label: Kuro · 黒 — the chamber */").label).toBe("Kuro · 黒 — the chamber");
  });
});
