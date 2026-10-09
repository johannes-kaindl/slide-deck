import { describe, it, expect } from "vitest";
import {
  modelFieldMode, initialModelSelection,
  statusKindKey, statusLabelParts,
} from "../../src/llm/ai-settings-model";

describe("modelFieldMode", () => {
  it("is a dropdown once models are loaded", () => {
    expect(modelFieldMode(["qwen3"])).toBe("dropdown");
  });
  it("falls back to freetext when offline / not yet loaded", () => {
    expect(modelFieldMode([])).toBe("freetext");
  });
});

describe("initialModelSelection", () => {
  it("keeps a saved model that is in the list preselected, list unchanged", () => {
    expect(initialModelSelection(["qwen3", "llama3"], "llama3")).toEqual({ options: ["qwen3", "llama3"], initial: "llama3" });
  });
  it("prepends and preselects a saved model absent from the list (UI-STANDARD §8 core rule)", () => {
    expect(initialModelSelection(["qwen3", "llama3"], "custom-model")).toEqual({ options: ["custom-model", "qwen3", "llama3"], initial: "custom-model" });
  });
  it("preselects the first server model when nothing is saved", () => {
    expect(initialModelSelection(["qwen3", "llama3"], "")).toEqual({ options: ["qwen3", "llama3"], initial: "qwen3" });
  });
  it("returns an empty initial without throwing when both list and saved model are empty", () => {
    expect(initialModelSelection([], "")).toEqual({ options: [], initial: "" });
  });
  it("keeps the saved model as the sole option when the server list is empty", () => {
    expect(initialModelSelection([], "custom-model")).toEqual({ options: ["custom-model"], initial: "custom-model" });
  });
});

describe("i18n key mappers", () => {
  it("maps a status kind to its key", () => {
    expect(statusKindKey("not-an-llm-api")).toBe("deck.settings.endpoint.status.not-an-llm-api");
  });
});

describe("statusLabelParts", () => {
  it("adds the raw detail as a suffix only for unknown WITH raw", () => {
    expect(statusLabelParts("unknown", "weird failure")).toEqual({
      key: "deck.settings.endpoint.status.unknown", suffix: "weird failure",
    });
  });
  it("drops the suffix for unknown WITHOUT raw", () => {
    expect(statusLabelParts("unknown", undefined)).toEqual({ key: "deck.settings.endpoint.status.unknown" });
  });
  it.each(["ok", "refused", "unknown-host", "timeout", "not-an-llm-api"] as const)(
    "never carries a suffix for kind %s, even when raw is set", (kind) => {
      expect(statusLabelParts(kind, "should be ignored")).toEqual({ key: statusKindKey(kind) });
    },
  );
});
