import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";

const noEmbed = () => null;

describe("renderMarkdown", () => {
  it("renders headings and emphasis", () => {
    const { html } = renderMarkdown({ markdown: "# Title\n\n**bold**", resolveEmbed: noEmbed });
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders inline KaTeX", () => {
    const { html } = renderMarkdown({ markdown: "$E=mc^2$", resolveEmbed: noEmbed });
    expect(html).toContain("katex");
  });

  it("binds an inline math arrow to the code chip that follows it (no orphaned arrows)", () => {
    const { html } = renderMarkdown({ markdown: "$\\rightarrow$ `summarize`", resolveEmbed: noEmbed });
    expect(html).toContain("&nbsp;<code");
    expect(html).not.toMatch(/<\/span> +<code/);
  });

  it("highlights fenced code", () => {
    const { html } = renderMarkdown({ markdown: "```js\nconst x=1\n```", resolveEmbed: noEmbed });
    expect(html).toContain("hljs");
  });

  it("adds sd-embed class to standard markdown images", () => {
    const { html } = renderMarkdown({ markdown: "![a photo](pic.png)", resolveEmbed: noEmbed });
    expect(html).toContain('class="sd-embed"');
    expect(html).toContain('src="pic.png"');
  });
});
