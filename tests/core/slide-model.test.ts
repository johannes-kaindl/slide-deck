import { describe, it, expect } from "vitest";
import { parseDeck } from "../../src/core/slide-model";

describe("parseDeck", () => {
  it("splits on standalone --- lines and tracks start lines", () => {
    const src = "# A\n\ntext\n\n---\n\n# B\n";
    const deck = parseDeck(src);
    expect(deck.slides.map(s => s.index)).toEqual([0, 1]);
    expect(deck.slides[0].markdown.trim()).toBe("# A\n\ntext");
    expect(deck.slides[1].markdown.trim()).toBe("# B");
    expect(deck.slides[1].startLine).toBe(6); // 0-based line of "# B"
  });

  it("reads frontmatter directives with defaults", () => {
    const src = "---\ntheme: dark\naspect: 4:3\nminFontPx: 30\n---\n# Only\n";
    const deck = parseDeck(src);
    expect(deck.directives).toEqual({ theme: "dark", aspect: "4:3", minFontPx: 30 });
    expect(deck.slides).toHaveLength(1);
  });

  it("applies defaults when no frontmatter", () => {
    expect(parseDeck("# A").directives).toEqual({ theme: "default", aspect: "16:9", minFontPx: 24 });
  });
});
