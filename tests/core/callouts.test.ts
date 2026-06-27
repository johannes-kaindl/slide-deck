import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";
const noEmbed = () => null;

describe("callouts", () => {
  it("renders a [!warning] callout with icon, type class and label", () => {
    const { html } = renderMarkdown({ markdown: "> [!warning] Heads up\n> be careful", resolveEmbed: noEmbed });
    expect(html).toContain('sd-callout-warning');
    expect(html).toContain('data-icon="warning"');
    expect(html).toContain("Heads up");
    expect(html).toContain("be careful");
  });

  it("falls back to the type as label when no title given", () => {
    const { html } = renderMarkdown({ markdown: "> [!note]\n> body", resolveEmbed: noEmbed });
    expect(html).toContain("Note");
  });

  it("renders a multi-line callout body exactly once (no inline re-parse doubling)", () => {
    // The plugin runs after the "block" rule, then markdown-it's "inline" rule parses each
    // inline token's content into its children. Pre-parsing into the same children array
    // would make the inline rule APPEND a second copy → the body renders twice.
    const { html } = renderMarkdown({
      markdown: "> [!tip] Title\n> first line `code`\n> second **bold** line",
      resolveEmbed: noEmbed,
    });
    expect(html).toContain("sd-callout-body");
    expect((html.match(/first line/g) ?? []).length).toBe(1);
    expect((html.match(/second/g) ?? []).length).toBe(1);
  });
});
