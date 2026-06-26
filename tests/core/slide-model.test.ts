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

  it("merges passed defaults (lowest precedence), with frontmatter overriding them", () => {
    // no frontmatter: passed defaults win over DEFAULTS
    const noFm = parseDeck("# A", { theme: "dark", minFontPx: 30 });
    expect(noFm.directives).toEqual({ theme: "dark", aspect: "16:9", minFontPx: 30 });

    // frontmatter present: frontmatter overrides passed defaults
    const withFm = parseDeck("---\ntheme: light\n---\n# A", { theme: "dark", minFontPx: 30 });
    expect(withFm.directives).toEqual({ theme: "light", aspect: "16:9", minFontPx: 30 });
  });
});

describe("parseDeck — directives & fences", () => {
  it("does NOT split on --- inside a fenced code block", () => {
    const src = "# A\n\n```yaml\nfoo: 1\n---\nbar: 2\n```\n";
    const deck = parseDeck(src);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].markdown).toContain("foo: 1");
    expect(deck.slides[0].markdown).toContain("bar: 2");
  });

  it("populates layout and regions per slide", () => {
    const src = "<!-- layout: two-column -->\n## L\n\n<!-- column -->\n\n## R\n";
    const deck = parseDeck(src);
    expect(deck.slides[0].layout).toBe("two-column");
    expect(deck.slides[0].regions).toEqual(["## L", "## R"]);
    expect(deck.slides[0].directiveWarnings).toEqual([]);
  });

  it("retains a directive-only slide (section divider)", () => {
    const src = "# A\n\n---\n\n<!-- layout: section -->\n\n---\n\n# B\n";
    const deck = parseDeck(src);
    expect(deck.slides.map((s) => s.layout)).toEqual(["default", "section", "default"]);
    expect(deck.slides[1].regions).toEqual([""]);
  });

  it("defaults layout/regions for plain slides", () => {
    const deck = parseDeck("# A");
    expect(deck.slides[0].layout).toBe("default");
    expect(deck.slides[0].regions).toEqual(["# A"]);
  });
});
