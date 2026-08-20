import { describe, it, expect } from "vitest";
import { errorMessageFromText } from "../../src/vendor/kit/error_body";

/** Pinnt die Semantik der BEIDEN Produktions-Aufrufstellen in `src/llm-client.ts`
 *  (`generateNonStreaming` vor der Status-Pruefung, `throwIfEnvelope` auf dem SSE-Rohtext).
 *  Beide fahren `bodyMayBeSuccess: true` — deshalb steht die Option hier an jedem Aufruf:
 *  ohne sie liest ein Streufeld `message`/`detail` neben einer gueltigen Completion
 *  als Fehler, und ein intakter Generierungslauf stirbt. Der Fall haengt an genau
 *  einem `expect` („ignores top-level message/detail when choices present"). */
const OPTS = { bodyMayBeSuccess: true } as const;

describe("errorMessageFromText (vendored kit/error_body)", () => {
  it("{error:{message}} → message", () => {
    expect(errorMessageFromText('{"error":{"message":"model X is not loaded"}}', OPTS)).toBe("model X is not loaded");
  });
  it("{error:'…'} → string", () => { expect(errorMessageFromText('{"error":"bad request"}', OPTS)).toBe("bad request"); });
  it("{detail} (no choices) → detail", () => { expect(errorMessageFromText('{"detail":"not found"}', OPTS)).toBe("not found"); });
  it("{message} (no choices) → message", () => { expect(errorMessageFromText('{"message":"server busy"}', OPTS)).toBe("server busy"); });
  it("valid completion (even empty) → null", () => {
    expect(errorMessageFromText('{"choices":[{"message":{"content":"x"}}]}', OPTS)).toBeNull();
    expect(errorMessageFromText('{"choices":[]}', OPTS)).toBeNull();
  });
  it("empty / non-JSON / HTML → null", () => {
    expect(errorMessageFromText("", OPTS)).toBeNull();
    expect(errorMessageFromText("<html>oops</html>", OPTS)).toBeNull();
  });
  it("ignores top-level message/detail when choices present", () => {
    expect(errorMessageFromText('{"choices":[{"message":{"content":"x"}}],"message":"stray"}', OPTS)).toBeNull();
  });
  it("{error} wins even with choices present", () => {
    expect(errorMessageFromText('{"choices":[],"error":{"message":"real error"}}', OPTS)).toBe("real error");
  });
});
