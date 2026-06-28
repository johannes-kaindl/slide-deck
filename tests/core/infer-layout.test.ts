import { describe, it, expect } from "vitest";
import { inferLayout } from "../../src/core/infer-layout";

describe("inferLayout", () => {
  it("single blockquote → quote", () => {
    expect(inferLayout(["> a lone pull quote"])).toBe("quote");
    expect(inferLayout(["> line one\n> line two"])).toBe("quote");
  });
  it("single ATX heading → section", () => {
    expect(inferLayout(["# A"])).toBe("section");
    expect(inferLayout(["###### deep heading"])).toBe("section");
  });
  it("heading plus body → default", () => {
    expect(inferLayout(["# A\n\ntext"])).toBe("default");
  });
  it("multi-region (columns) → default", () => {
    expect(inferLayout(["## L", "## R"])).toBe("default");
  });
  it("empty or whitespace region → default", () => {
    expect(inferLayout([""])).toBe("default");
    expect(inferLayout(["   \n  "])).toBe("default");
  });
  it("mixed quote and text → default (not a pure pull-quote)", () => {
    expect(inferLayout(["> quote\n\nand a caption"])).toBe("default");
  });
});
