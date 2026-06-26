// Smoke entry — bundled by scripts/bundle-smoke.mjs with the SAME esbuild settings as
// the plugin build, then executed in Node. Reproduces the ESM/CJS interop that vitest's
// Vite resolution hides: e.g. @vscode/markdown-it-katex's default export becoming
// `{ default: fn }` in the real bundle, which made `md.use(...)` throw at runtime while
// unit tests stayed green (LESSONS 2026-06-23 — a real bundle smoke catches what unit
// tests cannot). Lives outside src/ and tests/ so it touches no other gate.
import { renderMarkdown } from "../src/core/render/md2html";

const md = [
  "$E=mc^2$",
  "",
  "# Title",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "> [!warning] Heads up",
  "> body",
  "",
  "```mermaid",
  "graph TD;A-->B",
  "```",
  "",
].join("\n");

const r = renderMarkdown({ markdown: md, resolveEmbed: () => null });
const required = ["katex", "hljs", "sd-callout", "sd-mermaid"];
const missing = required.filter((c) => !r.html.includes(c));
if (missing.length > 0) {
  console.error("bundle-smoke FAILED — missing in rendered HTML:", missing.join(", "));
  process.exit(2);
}
console.log("bundle-smoke OK — render path works in the real esbuild bundle");
