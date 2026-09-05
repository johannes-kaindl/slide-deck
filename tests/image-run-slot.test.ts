import { describe, it, expect } from "vitest";
import { buildRequest } from "../src/image/functions";
import { parseSlot } from "../src/image/slot-format";

const caps = (negativePrompt: boolean) => ({
  negativePrompt, cfg: false, maxSteps: 8, fixedSize: null, initImage: false, sizes: null,
});

describe("buildRequest", () => {
  it("appends the function's building block to the prompt", () => {
    const r = buildRequest(parseSlot("funktion: navigational\nKompass"), caps(true), {});
    expect(r.prompt).toContain("Kompass");
    expect(r.prompt).toContain("simple pictogram");
  });

  it("prefers an edited building block over the default", () => {
    const r = buildRequest(parseSlot("funktion: navigational\nKompass"), caps(true),
                           { navigational: "line art" });
    expect(r.prompt).toBe("Kompass, line art");
  });

  it("sends no negative prompt when the backend cannot do it — no dummy control", () => {
    expect(buildRequest(parseSlot("funktion: emotional\nSturm"), caps(false), {}).negativePrompt)
      .toBeUndefined();
    expect(buildRequest(parseSlot("funktion: emotional\nSturm"), caps(true), {}).negativePrompt)
      .toContain("watermark");
  });

  it("sends the bare prompt when no function is set", () => {
    const r = buildRequest(parseSlot("Nur Text"), caps(true), {});
    expect(r.prompt).toBe("Nur Text");
    expect(r.negativePrompt).toBeUndefined();
  });
});
