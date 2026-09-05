import { describe, it, expect } from "vitest";
import {
  IMAGE_FUNCTIONS,
  DEFAULT_SUFFIXES,
  DEFAULT_NEGATIVES,
  isImageFunction,
  composePrompt,
  type ImageFunction,
} from "../src/image/functions";
import { t, setLang } from "../src/i18n";

describe("image functions", () => {
  it("has exactly the six declared ids", () => {
    expect([...IMAGE_FUNCTIONS]).toEqual([
      "documentary",
      "analytical",
      "metaphorical",
      "emotional",
      "navigational",
      "decorative",
    ]);
  });

  it("carries a suffix and a negative for every id — totality, not a lookup", () => {
    // Ein Record<ImageFunction, string> ist zur Laufzeit nicht total, wenn jemand ihn
    // per Cast befuellt hat. Der Test misst, was der Typ verspricht.
    for (const fn of IMAGE_FUNCTIONS) {
      expect(DEFAULT_SUFFIXES[fn].length).toBeGreaterThan(0);
      expect(typeof DEFAULT_NEGATIVES[fn]).toBe("string");
    }
  });

  it("rejects unknown values", () => {
    expect(isImageFunction("metaphorical")).toBe(true);
    expect(isImageFunction("metaphorisch-symbolisch")).toBe(false);
    expect(isImageFunction("")).toBe(false);
  });

  it("appends suffix parts comma-separated and skips duplicates", () => {
    expect(composePrompt("Eisberg", "symbolic illustration, uncluttered composition")).toBe(
      "Eisberg, symbolic illustration, uncluttered composition"
    );
    expect(composePrompt("Eisberg, symbolic illustration", "symbolic illustration, minimal")).toBe(
      "Eisberg, symbolic illustration, minimal"
    );
    expect(composePrompt("Eisberg", "")).toBe("Eisberg");
    expect(composePrompt("", "minimal")).toBe("minimal");
  });

  it("has an EN and a DE label for every id", () => {
    for (const lang of ["en", "de"] as const) {
      setLang(lang);
      for (const fn of IMAGE_FUNCTIONS) {
        expect(t(`image.fn.${fn}.name`)).not.toBe(`image.fn.${fn}.name`); // kein Schluessel-Fallback
        expect(t(`image.fn.${fn}.desc`)).not.toBe(`image.fn.${fn}.desc`);
      }
    }
    setLang("en");
  });
});
