import { describe, it, expect } from "vitest";
import { parseLmStudioContext, parseOllamaContext, estimateTokens, contextOverflow } from "../../src/core/llm/model-info";

describe("parseLmStudioContext", () => {
  it("reads max + loaded context length for the matching model", () => {
    const json = { data: [{ id: "qwen3", max_context_length: 32768, loaded_context_length: 8192 }] };
    expect(parseLmStudioContext(json, "qwen3")).toEqual({ maxContextLength: 32768, loadedContextLength: 8192 });
  });
  it("returns null when the model is absent", () => {
    expect(parseLmStudioContext({ data: [{ id: "other" }] }, "qwen3")).toBeNull();
  });
  it("omits non-numeric fields", () => {
    expect(parseLmStudioContext({ data: [{ id: "m" }] }, "m")).toEqual({});
  });
});

describe("parseOllamaContext", () => {
  it("finds the *.context_length key in model_info", () => {
    const json = { model_info: { "qwen3.context_length": 40960, "general.architecture": "qwen3" } };
    expect(parseOllamaContext(json)).toEqual({ maxContextLength: 40960 });
  });
  it("returns null without a context_length key", () => {
    expect(parseOllamaContext({ model_info: { "general.architecture": "x" } })).toBeNull();
    expect(parseOllamaContext({})).toBeNull();
  });
});

describe("estimateTokens", () => {
  it("uses ~3.5 chars per token, rounded up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(7)).toBe(2);
    expect(estimateTokens(8)).toBe(3);
  });
});

describe("contextOverflow", () => {
  it("true when input + maxTokens exceeds a known limit", () => {
    expect(contextOverflow(7000, 2000, 8192)).toBe(true);
  });
  it("false when it fits", () => {
    expect(contextOverflow(1000, 2000, 8192)).toBe(false);
  });
  it("false when the limit is unknown", () => {
    expect(contextOverflow(999999, 2000, undefined)).toBe(false);
  });
});
