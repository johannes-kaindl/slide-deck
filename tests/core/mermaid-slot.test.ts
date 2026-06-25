import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";
const noEmbed = () => null;

describe("mermaid slot", () => {
  it("emits a placeholder div with base64 source, no <svg> in core", () => {
    const src = "graph TD; A-->B";
    const { html } = renderMarkdown({ markdown: "```mermaid\n" + src + "\n```", resolveEmbed: noEmbed });
    expect(html).toContain('class="sd-mermaid"');
    expect(html).not.toContain("<svg");
    const b64 = Buffer.from(src).toString("base64");
    expect(html).toContain(`data-src="${b64}"`);
  });
});
