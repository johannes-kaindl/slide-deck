import { describe, it, expect } from "vitest";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";

const contract = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });

describe("contractToPrompt", () => {
  it("includes the theme line by default (backward compatible)", () => {
    expect(contractToPrompt(contract)).toContain('Deck theme via frontmatter "theme:"');
  });
  it("omits the theme line when includeTheme is false", () => {
    const p = contractToPrompt(contract, { includeTheme: false });
    expect(p).not.toContain('Deck theme via frontmatter "theme:"');
    expect(p).toContain("Separate slides with a line containing only");
    expect(p).toContain("Per-slide layout");
  });
});
