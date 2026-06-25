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
});
