// tests/core/directives.test.ts
import { describe, it, expect } from "vitest";
import { parseDirectives } from "../../src/core/directives";

describe("parseDirectives", () => {
  it("defaults to layout=default, one region, when no directives", () => {
    const r = parseDirectives("# Hello\n\ntext");
    expect(r.layout).toBe("default");
    expect(r.regions).toEqual(["# Hello\n\ntext"]);
    expect(r.warnings).toEqual([]);
  });

  it("extracts layout and lowercases the value", () => {
    const r = parseDirectives("<!-- layout: Two-Column -->\n\n## A");
    expect(r.layout).toBe("two-column");
    expect(r.regions).toEqual(["## A"]);
  });

  it("tolerates whitespace variants and uppercase keyword", () => {
    expect(parseDirectives("<!--layout:title-->\n# T").layout).toBe("title");
    expect(parseDirectives("<!--  LAYOUT :  section  -->\nx").layout).toBe("section");
  });

  it("splits regions at <!-- column --> and drops the markers", () => {
    const r = parseDirectives("<!-- layout: two-column -->\n## L\n\n<!-- column -->\n\n## R");
    expect(r.layout).toBe("two-column");
    expect(r.regions).toEqual(["## L", "## R"]);
  });

  it("first layout wins; extra layout directives warn", () => {
    const r = parseDirectives("<!-- layout: title -->\n<!-- layout: section -->\n# T");
    expect(r.layout).toBe("title");
    expect(r.warnings).toEqual([{ kind: "layout-multiple", message: expect.any(String) }]);
  });

  it("warns on a malformed directive-like comment and removes it (no leak)", () => {
    const r = parseDirectives("<!-- layuot: title -->\n# T");
    expect(r.layout).toBe("default");
    expect(r.regions).toEqual(["# T"]);
    expect(r.warnings).toEqual([{ kind: "directive-malformed", message: expect.any(String) }]);
  });

  it("ignores directives INSIDE a fenced code block (literal content)", () => {
    const src = "## A\n\n```\n<!-- column -->\n<!-- layout: title -->\n```\n";
    const r = parseDirectives(src);
    expect(r.layout).toBe("default");
    expect(r.regions).toHaveLength(1);
    expect(r.regions[0]).toContain("<!-- column -->");
    expect(r.regions[0]).toContain("<!-- layout: title -->");
  });

  it("a directive-only slide cleans to a single empty region", () => {
    const r = parseDirectives("<!-- layout: section -->");
    expect(r.layout).toBe("section");
    expect(r.regions).toEqual([""]);
  });

  it("dropping a directive does not insert a blank line", () => {
    const r = parseDirectives("# Title\n<!-- layout: title -->\nbody");
    expect(r.layout).toBe("title");
    expect(r.regions).toEqual(["# Title\nbody"]);
  });
});
