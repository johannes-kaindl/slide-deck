import { describe, it, expect } from "vitest";
import { isolatedDeckHtml } from "../src/iframe-host";

describe("isolatedDeckHtml", () => {
  it("builds a doctype document with css in head and body html in body", () => {
    const html = isolatedDeckHtml({ css: ".sd-slide{color:red}", bodyHtml: "<div class='sd-slide'>x</div>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>.sd-slide{color:red}</style>");
    expect(html).toContain("<body><div class='sd-slide'>x</div></body>");
  });

  it("appends extraCss after the base css (so chrome/print overrides win)", () => {
    const html = isolatedDeckHtml({ css: "BASE", bodyHtml: "", extraCss: "EXTRA" });
    expect(html.indexOf("BASE")).toBeLessThan(html.indexOf("EXTRA"));
    expect(html).toContain("<style>BASEEXTRA</style>");
  });
});
