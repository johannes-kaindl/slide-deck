import { describe, it, expect } from "vitest";
import { loadSettings, DEFAULT_SETTINGS } from "../src/settings";

describe("loadSettings — endpoint migration", () => {
  it("turns a pre-0.7 string list into configs", () => {
    const out = loadSettings({ llmEndpoints: ["http://localhost:1234", "http://192.168.1.5:1234"] });
    expect(out.llmEndpoints).toEqual([
      { url: "http://localhost:1234" },
      { url: "http://192.168.1.5:1234" },
    ]);
  });

  it("keeps already-migrated configs including the key", () => {
    const eps = [{ url: "https://openrouter.ai/api", apiKey: "sk-x" }];
    expect(loadSettings({ llmEndpoints: eps }).llmEndpoints).toEqual(eps);
  });

  it("falls back to the default when the field is missing", () => {
    expect(loadSettings({}).llmEndpoints).toEqual(DEFAULT_SETTINGS.llmEndpoints);
  });

  it("drops blank entries instead of keeping a dead row", () => {
    expect(loadSettings({ llmEndpoints: ["", "  ", "http://a:1234"] }).llmEndpoints)
      .toEqual([{ url: "http://a:1234" }]);
  });
});
