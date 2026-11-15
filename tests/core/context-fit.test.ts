import { describe, expect, it } from "vitest";
import { contextOverflow, estimateTokens } from "../../src/vendor/kit/model-context";

// Differentialtest gegen die frühere eigene Fassung (src/llm/model-info.ts bis 0.22.0): gleiche Antworten, wo die Grenze bekannt und größer 0 ist.
const oldEstimate = (chars: number): number => Math.ceil(chars / 3.5);
const oldOverflow = (input: number, max: number, limit: number | undefined): boolean => limit != null && input + max > limit;

describe("Kontext-Schätzung über das Kit (model-context)", () => {
  it("'cautious' ist die frühere Schätzung: 3,5 Zeichen je Token, aufgerundet", () => {
    for (const chars of [0, 1, 7, 8, 100, 3500, 30_000, 123_457]) expect(estimateTokens(chars, "cautious")).toBe(oldEstimate(chars));
  });
  it("contextOverflow mit max_tokens als Reserve entscheidet wie die frühere Fassung (Grenze bekannt, größer 0)", () => {
    for (const limit of [4096, 8192, 32_768]) {
      for (const input of [0, 1000, 6000, 8192, 40_000]) {
        for (const max of [0, 2000, 8192]) {
          expect(contextOverflow(input, limit, max) !== null, `${input}+${max} gegen ${limit}`).toBe(oldOverflow(input, max, limit));
        }
      }
    }
  });
  it("unbekannte Grenze: keine Warnung (auch keine ab 30 000 Zeichen mehr, dafür gab es keinen Grund); Grenze 0 zählt als unbekannt", () => {
    expect(contextOverflow(999_999, undefined, 2000)).toBeNull();
    expect(contextOverflow(999_999, null, 2000)).toBeNull();
    expect(contextOverflow(10, 0, 0)).toBeNull();
  });
});
