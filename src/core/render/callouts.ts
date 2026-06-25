import type MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.mjs";

const RE = /^\[!(\w+)\]([+-]?)\s*(.*)$/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function calloutPlugin(md: MarkdownIt): void {
  md.core.ruler.after("block", "sd_callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      // find first inline token inside the blockquote
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "inline") j++;
      if (j >= tokens.length) continue;
      // match only against the first line of the inline content (content can be multi-line)
      const lines = tokens[j].content.split("\n");
      const m = RE.exec(lines[0]);
      if (!m) continue;
      const [, typeRaw, , title] = m;
      const type = typeRaw.toLowerCase();
      const label = title.trim() || cap(type);

      // Convert blockquote_open to callout opening HTML
      tokens[i].type = "html_block";
      tokens[i].content =
        `<div class="sd-callout sd-callout-${type}" role="note">` +
        `<div class="sd-callout-title">` +
        `<span class="sd-callout-icon" data-icon="${type}"></span>` +
        `<span class="sd-callout-label">${md.utils.escapeHtml(label)}</span>` +
        `</div>` +
        `<div class="sd-callout-body">`;
      tokens[i].tag = "";

      // Replace the inline token: remove the [!type] title line, keep body lines
      const bodyLines = lines.slice(1);
      const bodyContent = bodyLines.join("\n").trim();
      tokens[j].content = bodyContent;

      // Re-parse children from remaining body content
      if (bodyContent) {
        const innerTokens: Token[] = [];
        state.md.inline.parse(bodyContent, state.md, state.env, innerTokens);
        tokens[j].children = innerTokens;
      } else {
        tokens[j].children = [];
      }

      // Find matching blockquote_close and convert to closing HTML
      let depth = 0;
      for (let k = i + 1; k < tokens.length; k++) {
        if (tokens[k].type === "blockquote_open") depth++;
        else if (tokens[k].type === "blockquote_close") {
          if (depth === 0) {
            tokens[k].type = "html_block";
            tokens[k].content = `</div></div>`;
            tokens[k].tag = "";
            break;
          }
          depth--;
        }
      }
    }
    return true;
  });
}
