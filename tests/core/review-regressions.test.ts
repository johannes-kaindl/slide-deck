import { describe, it, expect, vi } from "vitest";
import { parseDeck } from "../../src/core/slide-model";
import { renderMarkdown } from "../../src/core/render/md2html";
import { deckCss, builtinThemeEntries } from "../../src/deck-css";
import { mergeThemes, resolveTheme } from "../../src/core/presets";

const noEmbed = () => null;

/** Regression guards for the concrete bugs surfaced across the 2026-07 design-review
 *  rounds. Each test encodes the ACTUAL fixed behaviour, not the shorthand it was
 *  reported as. */
describe("review-round regressions", () => {
  // (a) A bare top-level `---` is ALWAYS a slide separator (never an <hr>); an
  // in-body horizontal rule must be written as literal `<hr />`. The R3 regression
  // lost content around these — guard both directions.
  describe("--- separates slides, <hr /> is an in-body rule, no content lost", () => {
    it("a bare --- after a list splits slides and keeps the list", () => {
      const { slides } = parseDeck("# One\n\n- a\n- b\n\n---\n\n# Two\n\nbody");
      expect(slides).toHaveLength(2);
      expect(slides[0].markdown).toContain("- a");
      expect(slides[0].markdown).toContain("- b");
      expect(slides[1].markdown).toContain("# Two");
      expect(slides[1].markdown).toContain("body");
    });
    it("an in-body <hr /> after a list renders as a rule, content on both sides kept", () => {
      const { html } = renderMarkdown({ markdown: "- a\n- b\n\n<hr />\n\nafter", resolveEmbed: noEmbed });
      expect(html).toContain("<li>a</li>");
      expect(html).toContain("<hr");
      expect(html).toContain("after");
    });
  });

  // (b) Embed ref extraction preserves spaces + an em-dash in the filename (the
  // testdeck note itself is "Slide-Deck — Testdeck"); the ref reaches resolveEmbed
  // verbatim (trimmed) and the resolved src is embedded.
  it("resolves an ![[embed]] whose filename has spaces and an em-dash", () => {
    const spy = vi.fn((ref: string) => (ref === "Foo — Bar Baz.png" ? "data:image/png;base64,OK" : null));
    const { html, warnings } = renderMarkdown({ markdown: "![[Foo — Bar Baz.png]]", resolveEmbed: spy });
    expect(spy).toHaveBeenCalledWith("Foo — Bar Baz.png");
    expect(html).toContain('src="data:image/png;base64,OK"');
    expect(warnings).toHaveLength(0);
  });

  // (c) Callout hues live in the THEME (themeCss) and override the neutral
  // structure.css fallback purely by cascade order — they are not hard-coded in
  // STRUCTURE_CSS. This is the invariant that made "warm callouts" a theme concern.
  it("callout colour comes from themeCss and wins the cascade over structure.css", () => {
    const { map } = mergeThemes(builtinThemeEntries(), []);
    const css = deckCss(resolveTheme(map, "kuro"));
    const structureFallback = css.indexOf(".sd-callout-info{ border-left-color:var(--sd-callout-info");
    const themeOverride = css.indexOf(".sd-callout-info{ border-left-color:#8faa7e");
    expect(structureFallback).toBeGreaterThanOrEqual(0);
    expect(themeOverride).toBeGreaterThanOrEqual(0);
    // The theme rule (`.sd-slide .sd-callout-info`) is both more specific than the
    // structure fallback (`.sd-callout-info`) AND assembled later — guard the order
    // so a future cascade reshuffle can't silently resurrect the neutral fallback.
    expect(themeOverride).toBeGreaterThan(structureFallback);
  });
});
