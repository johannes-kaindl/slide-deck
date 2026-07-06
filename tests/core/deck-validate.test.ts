import { describe, it, expect } from "vitest";
import { validateDeckOutput } from "../../src/core/llm/deck-validate";

describe("validateDeckOutput", () => {
  it("fatal for empty output", () => { expect(validateDeckOutput("   ").fatal).toBeTruthy(); });
  it("fatal for zero slides (frontmatter only)", () => {
    expect(validateDeckOutput("---\ntheme: dark\n---\n").fatal).toBeTruthy();
  });
  it("no fatal for a valid deck; returns the parsed deck", () => {
    const r = validateDeckOutput("# A\n\n---\n\n# B");
    expect(r.fatal).toBeUndefined();
    expect(r.deck.slides).toHaveLength(2);
  });
  it("collects a statically-checkable warning without blocking", () => {
    const r = validateDeckOutput("<!-- layout: nonesuch -->\n# A");
    expect(r.fatal).toBeUndefined();
    expect(r.warnings.some((w) => w.kind === "layout-unknown")).toBe(true);
  });
  it("does not flag overflow (stub fit)", () => {
    expect(validateDeckOutput("# A").warnings.some((w) => w.kind === "overflow")).toBe(false);
  });
});
