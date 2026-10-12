import { describe, it, expect } from "vitest";
import { estimateTokens, contextOverflow } from "../../src/llm/model-info";

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
