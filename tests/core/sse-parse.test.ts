import { describe, it, expect } from "vitest";
import { parseSSE } from "../../src/vendor/kit/sse";

describe("parseSSE", () => {
  it("extracts content deltas", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"Hal"}}]}\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n');
    expect(r.content).toEqual(["Hal", "lo"]);
    expect(r.reasoning).toEqual([]);
    expect(r.done).toBe(false);
    expect(r.rest).toBe("");
  });
  it("extracts reasoning_content deltas", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"reasoning_content":"den"}}]}\n');
    expect(r.reasoning).toEqual(["den"]);
    expect(r.content).toEqual([]);
  });
  it("sets done on [DONE]", () => { expect(parseSSE("data: [DONE]\n").done).toBe(true); });
  it("keeps an incomplete last line in rest", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"x"}}]}\ndata: {"cho');
    expect(r.content).toEqual(["x"]);
    expect(r.rest).toBe('data: {"cho');
  });
  it("reads model from the first chunk only", () => {
    const r = parseSSE('data: {"model":"qwen3","choices":[{"delta":{"content":"a"}}]}\ndata: {"model":"other","choices":[{"delta":{"content":"b"}}]}\n');
    expect(r.model).toBe("qwen3");
  });
  it("captures the first non-null finish_reason (NEW extension)", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"a"},"finish_reason":null}]}\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}\n');
    expect(r.finishReason).toBe("length");
  });
  it("finishReason is undefined when never present", () => {
    expect(parseSSE('data: {"choices":[{"delta":{"content":"a"}}]}\n').finishReason).toBeUndefined();
  });
});
