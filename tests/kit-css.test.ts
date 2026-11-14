import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findVendoredCss, missingKitCss } from "./vendor/kit/kit-css";

// Kit-Vertrag: vendort wird das Verhalten, die Darstellung (`*_CSS`) ist eine Kopie in styles.css.
describe("Kit-CSS in styles.css", () => {
  const vendorDir = "src/vendor/kit-obsidian";
  it("der Waechter findet gevendorte Konstanten", () => {
    expect(findVendoredCss(vendorDir).length).toBeGreaterThan(0);
  });
  // Eine Kit-Konstante, die `${…}` im Template einsetzt, landet beim Rohtext-Kopieren als ungueltiges `${…}` in styles.css (Store-Befund svg-studio 0.1.3, „Unknown word COPY_BUTTON_CSS“);
  // `missingKitCss` liest nur Konstanten ohne `${` und `\`, `css_baseline` meldet es nicht.
  it("styles.css traegt kein `${` (kein ungeaufloester Template-Platzhalter aus einer kopierten Kit-Konstante)", () => {
    const css = readFileSync("styles.css", "utf8");
    expect(css.includes("$" + "{")).toBe(false);
    // Gegenprobe: der Wachter erkennt ein `${` ueberhaupt.
    expect(`.a { content: "${"$"}{X}"; }`.includes("$" + "{")).toBe(true);
  });
  it("jede steht wortgleich in styles.css", () => {
    expect(missingKitCss(vendorDir, readFileSync("styles.css", "utf8"))).toEqual([]);
  });
});
