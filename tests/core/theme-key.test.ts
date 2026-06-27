import { describe, it, expect } from "vitest";
import { keyFromFilename, parseBaseFontPx } from "../../src/core/theme-key";

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
