import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";

describe("embeds", () => {
  it("resolves ![[image]] to an <img> via resolveEmbed", () => {
    const { html, warnings } = renderMarkdown({
      markdown: "![[pic.png]]",
      resolveEmbed: (ref) => (ref === "pic.png" ? "data:image/png;base64,AAA" : null),
    });
    expect(html).toContain('<img');
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(warnings).toHaveLength(0);
  });

  it("warns on a missing embed and renders a placeholder", () => {
    const { html, warnings } = renderMarkdown({ markdown: "![[missing.png]]", resolveEmbed: () => null });
    expect(warnings).toEqual([{ kind: "missing-embed", message: expect.stringContaining("missing.png") }]);
    expect(html).toContain("sd-missing-embed");
  });
});
