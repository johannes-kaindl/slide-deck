import { describe, it, expect } from "vitest";
import { parseErrorEnvelope } from "../../src/core/llm/error-envelope";

describe("parseErrorEnvelope", () => {
  it("{error:{message}} → message", () => {
    expect(parseErrorEnvelope('{"error":{"message":"model X is not loaded"}}')).toBe("model X is not loaded");
  });
  it("{error:'…'} → string", () => { expect(parseErrorEnvelope('{"error":"bad request"}')).toBe("bad request"); });
  it("{detail} (no choices) → detail", () => { expect(parseErrorEnvelope('{"detail":"not found"}')).toBe("not found"); });
  it("{message} (no choices) → message", () => { expect(parseErrorEnvelope('{"message":"server busy"}')).toBe("server busy"); });
  it("valid completion (even empty) → null", () => {
    expect(parseErrorEnvelope('{"choices":[{"message":{"content":"x"}}]}')).toBeNull();
    expect(parseErrorEnvelope('{"choices":[]}')).toBeNull();
  });
  it("empty / non-JSON / HTML → null", () => {
    expect(parseErrorEnvelope("")).toBeNull();
    expect(parseErrorEnvelope("<html>oops</html>")).toBeNull();
  });
  it("ignores top-level message/detail when choices present", () => {
    expect(parseErrorEnvelope('{"choices":[{"message":{"content":"x"}}],"message":"stray"}')).toBeNull();
  });
  it("{error} wins even with choices present", () => {
    expect(parseErrorEnvelope('{"choices":[],"error":{"message":"real error"}}')).toBe("real error");
  });
});
