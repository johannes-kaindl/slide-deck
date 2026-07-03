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

  it("normalizes CRLF input (layout + clean region, no stray \\r)", () => {
    const r = parseDirectives("<!-- layout: two-column -->\r\n## L\r\n\r\n<!-- column -->\r\n\r\n## R\r\n");
    expect(r.layout).toBe("two-column");
    expect(r.regions).toEqual(["## L", "## R"]);
  });

  it("warns on a layout directive with a missing colon", () => {
    const r = parseDirectives("<!-- layout two-column -->\n# T");
    expect(r.layout).toBe("default");
    expect(r.warnings).toEqual([{ kind: "directive-malformed", message: expect.any(String) }]);
  });

  it("warns on a malformed column directive (extra token, no colon)", () => {
    const r = parseDirectives("<!-- column foo -->\n# T");
    expect(r.warnings).toEqual([{ kind: "directive-malformed", message: expect.any(String) }]);
  });

  it("parses a structural template plus modifiers", () => {
    const r = parseDirectives("<!-- layout: two-column compact -->\n## A");
    expect(r.layout).toBe("two-column");
    expect(r.layoutExplicit).toBe(true);
    expect(r.modifiers).toEqual(["compact"]);
  });

  it("collects multiple modifiers, order preserved, no dupes", () => {
    const r = parseDirectives("<!-- layout: default code-heavy compact code-heavy -->\nx");
    expect(r.layout).toBe("default");
    expect(r.modifiers).toEqual(["code-heavy", "compact"]);
  });

  it("modifier-only directive: layout stays inferable, modifier still applies", () => {
    const r = parseDirectives("<!-- layout: compact -->\n# T\n\nbody");
    expect(r.layout).toBe("default");      // placeholder; slide-model will infer
    expect(r.layoutExplicit).toBe(false);
    expect(r.modifiers).toEqual(["compact"]);
  });

  it("no directive → empty modifiers", () => {
    expect(parseDirectives("# Hi").modifiers).toEqual([]);
  });

  it("warns on an extra unrecognized structural token but keeps the first", () => {
    const r = parseDirectives("<!-- layout: title bogus -->\n# T");
    expect(r.layout).toBe("title");
    expect(r.modifiers).toEqual([]);
    expect(r.warnings).toEqual([{ kind: "directive-malformed", message: expect.any(String) }]);
  });

  it("resolves forgiving layout aliases (cover → cover-image)", () => {
    expect(parseDirectives("<!-- layout: cover -->\n# A").layout).toBe("cover-image");
    expect(parseDirectives("<!-- layout: columns -->\n# A").layout).toBe("two-column");
  });
});
