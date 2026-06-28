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
  it("two regions → two-column", () => {
    expect(inferLayout(["## L", "## R"])).toBe("two-column");
  });
  it("three or more regions → columns-3", () => {
    expect(inferLayout(["a", "b", "c"])).toBe("columns-3");
    expect(inferLayout(["a", "b", "c", "d"])).toBe("columns-3");
  });
  it("single image embed → image-focus", () => {
    expect(inferLayout(["![[diagram.png]]"])).toBe("image-focus");
    expect(inferLayout(["![alt](pic.jpg)"])).toBe("image-focus");
  });
  it("single mermaid fence → image-focus", () => {
    expect(inferLayout(["```mermaid\ngraph TD; A-->B\n```"])).toBe("image-focus");
  });
  it("image plus caption text → default (not lone media)", () => {
    expect(inferLayout(["![[d.png]]\n\nA caption"])).toBe("default");
  });
  it("empty or whitespace region → default", () => {
    expect(inferLayout([""])).toBe("default");
    expect(inferLayout(["   \n  "])).toBe("default");
  });
  it("mixed quote and text → default (not a pure pull-quote)", () => {
    expect(inferLayout(["> quote\n\nand a caption"])).toBe("default");
  });
});
