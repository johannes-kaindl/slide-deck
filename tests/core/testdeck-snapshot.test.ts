import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDeck } from "../../src/core/slide-model";
import { renderMarkdown } from "../../src/core/render/md2html";
import { PRESETS, presetTokensCss } from "../../src/core/presets";
import { STRUCTURE_CSS } from "../../src/core/presets/structure.css";
import { LAYOUTS_CSS } from "../../src/core/presets/layouts.css";

const fixture = readFileSync(fileURLToPath(new URL("../fixtures/testdeck.md", import.meta.url)), "utf8");
// Deterministic stub so the per-slide HTML snapshot never depends on real assets.
const stubEmbed = (ref: string) => `stub://${ref}`;

/** Snapshot regression net over the canonical testdeck (mirrors the Pallas smoke
 *  deck, every layout + modifier + slot). Per-slide HTML catches content / parse /
 *  callout-markup drift; the owned-CSS snapshot makes any STRUCTURE_CSS / LAYOUTS_CSS
 *  / preset-token change surface immediately. Regenerate intentionally with
 *  `npx vitest -u` and review the diff. */
describe("testdeck fixture snapshots", () => {
  const { slides, directives } = parseDeck(fixture);

  it("parses into every layout the smoke deck exercises", () => {
    expect(directives.theme).toBe("kuro");
    expect(slides.length).toBeGreaterThanOrEqual(13);
    // sanity: the layouts we care about are all present
    const layouts = new Set(slides.map((s) => s.layout));
    for (const l of ["cover-image", "title", "section", "two-column", "columns-3", "quote", "stat", "image-focus"]) {
      expect(layouts.has(l)).toBe(true);
    }
  });

  it("renders each slide to stable HTML", () => {
    const rendered = slides.map((s, i) => ({
      i,
      layout: s.layout,
      modifiers: s.modifiers,
      html: renderMarkdown({ markdown: s.markdown, resolveEmbed: stubEmbed }).html,
    }));
    expect(rendered).toMatchSnapshot();
  });

  it("owned CSS (structure + layouts + preset tokens) is stable", () => {
    const ownedCss = {
      structure: STRUCTURE_CSS,
      layouts: LAYOUTS_CSS,
      presets: Object.fromEntries(
        Object.values(PRESETS).map((p) => [p.id, presetTokensCss(p) + (p.extraCss ?? "")]),
      ),
    };
    expect(ownedCss).toMatchSnapshot();
  });
});
