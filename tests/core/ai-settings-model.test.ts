import { describe, it, expect } from "vitest";
import {
  applyEndpointEdit, activeIndexFromStatuses, modelFieldMode,
  thinkToggleView, effectiveSuppress, statusKindKey, warnRuleKey,
} from "../../src/core/llm/ai-settings-model";

describe("applyEndpointEdit", () => {
  it("appends a non-empty value from the adder row", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "http://b:2", true)).toEqual(["http://a:1", "http://b:2"]);
  });
  it("is a no-op when the adder row is left empty", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "   ", true)).toEqual(["http://a:1"]);
  });
  it("replaces an existing row in place", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "http://z:9", false)).toEqual(["http://z:9", "http://b:2"]);
  });
  it("removes an existing row that was cleared", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "", false)).toEqual(["http://b:2"]);
  });
  it("trims the value", () => {
    expect(applyEndpointEdit([], 0, "  http://a:1  ", true)).toEqual(["http://a:1"]);
  });
  it("never persists blank entries", () => {
    expect(applyEndpointEdit(["http://a:1", "  "], 0, "http://z:9", false)).toEqual(["http://z:9"]);
  });
});

describe("activeIndexFromStatuses", () => {
  it("picks the first ok — resolveActiveEndpoint semantics", () => {
    expect(activeIndexFromStatuses(["refused", "ok", "ok"])).toBe(1);
  });
  it("returns -1 when nothing is reachable", () => {
    expect(activeIndexFromStatuses(["refused", "timeout"])).toBe(-1);
  });
  it("treats not-yet-probed (null) as not active, not as an error", () => {
    expect(activeIndexFromStatuses([null, null])).toBe(-1);
  });
});

describe("modelFieldMode", () => {
  it("is a dropdown once models are loaded", () => {
    expect(modelFieldMode(["qwen3"])).toBe("dropdown");
  });
  it("falls back to freetext when offline / not yet loaded", () => {
    expect(modelFieldMode([])).toBe("freetext");
  });
});

describe("thinkToggleView", () => {
  it("shows an always-on model as disabled", () => {
    expect(thinkToggleView("gpt-oss-20b", true)).toEqual({ labelKey: "deck.settings.thinking.always", cls: "is-disabled", disabled: true });
  });
  it("shows suppressed thinking as off", () => {
    expect(thinkToggleView("qwen3", true)).toEqual({ labelKey: "deck.settings.thinking.off", cls: "is-off", disabled: false });
  });
  it("shows unsuppressed thinking as on", () => {
    expect(thinkToggleView("qwen3", false)).toEqual({ labelKey: "deck.settings.thinking.on", cls: "", disabled: false });
  });
});

describe("effectiveSuppress", () => {
  it("suppresses a normal model when asked", () => {
    expect(effectiveSuppress("qwen3", true)).toBe(true);
  });
  it("never suppresses an always-on model — it rejects reasoning_effort:none", () => {
    expect(effectiveSuppress("gpt-oss-20b", true)).toBe(false);
  });
  it("does not suppress when the user does not want it", () => {
    expect(effectiveSuppress("qwen3", false)).toBe(false);
  });
});

describe("i18n key mappers", () => {
  it("maps a status kind to its key", () => {
    expect(statusKindKey("not-an-llm-api")).toBe("deck.settings.endpoint.status.not-an-llm-api");
  });
  it("maps a warn rule to its key", () => {
    expect(warnRuleKey("port")).toBe("deck.settings.endpoint.warn.port");
  });
});
