import { describe, it, expect } from "vitest";
import { extractDeckMarkdown, setDeckTheme, setDeckSource } from "../../src/core/llm/deck-sanitize";
import { parseDeck } from "../../src/core/slide-model";

describe("extractDeckMarkdown", () => {
  it("passes clean deck markdown through unchanged (modulo trim)", () => {
    const md = "---\ntheme: dark\n---\n# A\n\n---\n\n# B";
    expect(extractDeckMarkdown(`  ${md}  `)).toBe(md);
  });

  it("strips a preamble chatter line ending in a colon", () => {
    const out = extractDeckMarkdown("Here is your deck:\n\n---\ntheme: dark\n---\n# A");
    expect(out).toBe("---\ntheme: dark\n---\n# A");
  });

  it("unwraps an enclosing ```markdown fence", () => {
    const out = extractDeckMarkdown("```markdown\n# A\n\n---\n\n# B\n```");
    expect(out).toBe("# A\n\n---\n\n# B");
  });

  it("cuts a bare </think> residue (no opener) up to and including its line", () => {
    const out = extractDeckMarkdown("okay let me think\n</think>\n# A\n\n---\n\n# B");
    expect(out).toBe("# A\n\n---\n\n# B");
  });

  it("leaves a properly paired <think>…</think> for downstream handling", () => {
    const raw = "<think>reason</think>\n# A";
    expect(extractDeckMarkdown(raw)).toBe("<think>reason</think>\n# A");
  });

  it("strips a leading --- that is NOT valid frontmatter (blocker fix)", () => {
    const raw = "---\n# First slide\n\n---\n\n# Second slide";
    const out = extractDeckMarkdown(raw);
    expect(parseDeck(out).slides.map((s) => s.markdown.trim())).toEqual(["# First slide", "# Second slide"]);
  });

  it("keeps a leading --- that IS valid frontmatter", () => {
    const raw = "---\ntheme: dark\naspect: 16:9\n---\n# A";
    const out = extractDeckMarkdown(raw);
    expect(out.startsWith("---\ntheme: dark")).toBe(true);
    expect(parseDeck(out).directives.theme).toBe("dark");
  });

  it("normalizes separator whitespace (`--- ` → `---`) outside fences", () => {
    const out = extractDeckMarkdown("# A\n--- \n# B");
    expect(parseDeck(out).slides).toHaveLength(2);
  });

  it("does NOT normalize a `--- ` line inside a code fence", () => {
    const raw = "# A\n\n```yaml\n--- \nx: 1\n```";
    const out = extractDeckMarkdown(raw);
    expect(out).toContain("--- \nx: 1");
    expect(parseDeck(out).slides).toHaveLength(1);
  });

  it("normalizes quotes around aspect/theme frontmatter values", () => {
    const raw = '---\ntheme: "dark"\naspect: "16:9"\n---\n# A';
    const d = parseDeck(extractDeckMarkdown(raw)).directives;
    expect(d.theme).toBe("dark");
    expect(d.aspect).toBe("16:9");
  });

  it("drops a slide that is a repeated key:-only frontmatter block", () => {
    const raw = "---\ntheme: dark\n---\n# A\n\n---\n\ntheme: dark\naspect: 16:9\n\n---\n\n# B";
    const slides = parseDeck(extractDeckMarkdown(raw)).slides.map((s) => s.markdown.trim());
    expect(slides).toEqual(["# A", "# B"]);
  });

  // v2 corrections (C1–C3)
  it("keeps no-space frontmatter (theme:dark)", () => {
    expect(parseDeck(extractDeckMarkdown("---\ntheme:dark\n---\n# A")).directives.theme).toBe("dark");
  });
  it("does NOT unwrap a deck whose slides are code fences", () => {
    const raw = "```python\nprint(1)\n```\n\n---\n\n```python\nprint(2)\n```";
    expect(parseDeck(extractDeckMarkdown(raw)).slides).toHaveLength(2);
  });
  it("does NOT strip a heading that ends with a colon", () => {
    const out = extractDeckMarkdown("# Agenda:\n- Intro\n\n---\n\n# Details");
    const slides = parseDeck(out).slides;
    expect(slides).toHaveLength(2);
    expect(slides[0].markdown).toContain("# Agenda:");
  });
  it("keeps a Name:/Role: content slide (not a directive echo)", () => {
    const raw = "# A\n\n---\n\nName: Ada\nRole: programmer";
    const slides = parseDeck(extractDeckMarkdown(raw)).slides;
    expect(slides).toHaveLength(2);
    expect(slides[1].markdown).toContain("Name: Ada");
  });
});

describe("setDeckTheme", () => {
  it("replaces an existing theme: inside the frontmatter block", () => {
    const out = setDeckTheme("---\ntheme: dark\naspect: 16:9\n---\n# A", "serif");
    expect(out).toBe("---\ntheme: serif\naspect: 16:9\n---\n# A");
  });
  it("injects a frontmatter block when none exists", () => {
    expect(setDeckTheme("# A\n\n---\n\n# B", "dark")).toBe("---\ntheme: dark\n---\n# A\n\n---\n\n# B");
  });
  it("adds theme: to a frontmatter block that lacks it", () => {
    expect(setDeckTheme("---\naspect: 4:3\n---\n# A", "dark")).toBe("---\ntheme: dark\naspect: 4:3\n---\n# A");
  });
  it("does NOT touch a theme: line in a slide body / code fence", () => {
    const src = "---\ntheme: dark\n---\n# A\n\n---\n\n```yaml\ntheme: light\n```";
    const out = setDeckTheme(src, "serif");
    expect(out).toContain("theme: serif");
    expect(out).toContain("theme: light");
  });
});

describe("setDeckSource", () => {
  it("injects a quoted wikilink into an existing frontmatter block", () => {
    const out = setDeckSource("---\ntheme: dark\n---\n# A", "[[Original]]");
    expect(out).toBe('---\nsource: "[[Original]]"\ntheme: dark\n---\n# A');
  });
  it("creates a frontmatter block when none exists", () => {
    expect(setDeckSource("# A", "[[Original]]")).toBe('---\nsource: "[[Original]]"\n---\n# A');
  });
  it("replaces an existing source: line", () => {
    const out = setDeckSource('---\nsource: "[[Old]]"\ntheme: dark\n---\n# A', "[[New]]");
    expect(out).toBe('---\nsource: "[[New]]"\ntheme: dark\n---\n# A');
  });
});
