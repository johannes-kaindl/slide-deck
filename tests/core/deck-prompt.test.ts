import { describe, it, expect } from "vitest";
import { buildDeckPrompt, buildRetryFeedback, stripNoteFrontmatter } from "../../src/core/llm/deck-prompt";
import { getAuthoringContract } from "../../src/core/constraints/contract";

const contract = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });

describe("buildDeckPrompt", () => {
  it("returns a system+user pair", () => {
    const msgs = buildDeckPrompt("Some prose.", { slideTarget: "auto", hint: "" }, contract);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"]);
  });
  it("embeds the contract lines but NOT the theme line (includeTheme:false)", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract);
    expect(system.content).toContain("Separate slides with a line containing only");
    expect(system.content).not.toContain('Deck theme via frontmatter "theme:"');
  });
  it("states the core rules: no preamble, never start with a separator, no quotes, condense, no invention", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract);
    expect(system.content).toMatch(/ONLY the deck markdown/i);
    expect(system.content).toMatch(/never (begin|start).*separator/i);
    expect(system.content).toMatch(/do not.*quote/i);
    expect(system.content).toMatch(/condense/i);
    expect(system.content).toMatch(/do not invent/i);
    expect(system.content).toMatch(/same language as the (note|source)/i);
  });
  it("auto target asks for content-driven count (typically 5–12)", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract);
    expect(system.content).toMatch(/5.?12/);
  });
  it("numeric target asks for that many slides", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: 6, hint: "" }, contract);
    expect(system.content).toMatch(/6 slides/);
  });
  it("puts the source body in the user message", () => {
    const [, user] = buildDeckPrompt("MY SOURCE PROSE", { slideTarget: "auto", hint: "" }, contract);
    expect(user.content).toContain("MY SOURCE PROSE");
  });
  it("adds the hint to the user message when present, omits it when empty", () => {
    const withHint = buildDeckPrompt("x", { slideTarget: "auto", hint: "focus on architecture" }, contract)[1];
    expect(withHint.content).toContain("focus on architecture");
    const noHint = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract)[1];
    expect(noHint.content).not.toMatch(/hint/i);
  });
  // v2 correction (C5): source frontmatter stripped before embedding
  it("strips the source note frontmatter before embedding (body-only)", () => {
    const [, user] = buildDeckPrompt("---\ntitle: X\ntags: [a]\n---\nReal body.", { slideTarget: "auto", hint: "" }, contract);
    expect(user.content).toContain("Real body.");
    expect(user.content).not.toContain("title: X");
  });
});

describe("stripNoteFrontmatter", () => {
  it("returns the body unchanged when there is no frontmatter", () => {
    expect(stripNoteFrontmatter("Just body")).toBe("Just body");
  });
  it("removes a leading frontmatter block", () => {
    expect(stripNoteFrontmatter("---\ntheme: x\n---\nBody here")).toBe("Body here");
  });
});

describe("buildRetryFeedback", () => {
  it("returns an assistant echo (truncated) + a corrective user turn naming the reason", () => {
    const long = "Z".repeat(5000);
    const [assistant, user] = buildRetryFeedback(long, "0 slides after sanitizing");
    expect(assistant.role).toBe("assistant");
    expect(assistant.content.length).toBeLessThanOrEqual(2000);
    expect(user.role).toBe("user");
    expect(user.content).toContain("0 slides after sanitizing");
    expect(user.content).toMatch(/ONLY the deck markdown/i);
  });
});
