import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { mergeSettings } from "../src/vendor/kit/settings";

describe("image suffix settings", () => {
  it("starts empty — an empty override means 'use the default'", () => {
    expect(DEFAULT_SETTINGS.imageSuffixes).toEqual({});
  });

  it("survives a merge with an old data.json that predates the field", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { defaultTheme: "kogane" } as never);
    expect(merged.imageSuffixes).toEqual({});
  });
});
