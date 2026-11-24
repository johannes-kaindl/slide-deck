import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/vendor/deck-core/pure/render/md2html";
import { WARNING_SEVERITY, type WarningKind } from "../src/vendor/deck-core/pure/constraints/engine";

// Der Balken-Codeblock kommt aus deck-core (ab 0.16.0); dieser Test hält fest, dass der Vendor ihn trägt und die
// Warnungen mit einer Schwere ankommen, nach der die Vorschau färbt. Rot gegen den Vendor 0.15.2.
describe("Codeblock bars (deck-core 0.16.0)", () => {
  const render = (body: string) => renderMarkdown({ markdown: "```bars\n" + body + "\n```", resolveEmbed: () => null });

  it("rendert die Balken relativ zum größten Wert", () => {
    const { html, warnings } = render("Alpha | 50\nBeta | 200 | accent\nGamma | 117");
    expect(warnings).toEqual([]);
    expect(html).toContain('<div class="sd-bars">');
    expect(html).toContain('<div class="sd-bar-row sd-bar-accent">');
    expect(html).toContain('style="--sd-bar: 25%"');
    expect(html).toContain('style="--sd-bar: 58.5%"');
  });

  it("„1.234“ liest deutsch und warnt; ein unlesbarer Wert warnt", () => {
    const { warnings } = render("A | 1.234\nB | viel");
    const kinds = warnings.map((w) => w.kind as WarningKind);
    expect(kinds.sort()).toEqual(["bars-ambiguous", "bars-malformed"]);
    for (const k of kinds) expect(WARNING_SEVERITY[k]).toBe("warn");
  });
});
