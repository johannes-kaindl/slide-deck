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

import { parseDeck } from "../src/core/slide-model";
import { deckCss, builtinThemeEntries, userThemeEntry } from "../src/deck-css";
import { presetFor } from "../src/core/presets";
import { layoutFor } from "../src/core/presets/layouts.css";

// 1) Directive parsing through the real bundle
const deck = parseDeck("<!-- layout: two-column -->\n## L\n\n<!-- column -->\n\n## R\n");
if (deck.slides[0].layout !== "two-column" || deck.slides[0].regions.length !== 2) {
  console.error("bundle-smoke FAILED — directive parsing wrong:", JSON.stringify(deck.slides[0]));
  process.exit(3);
}

// 2) deckCss assembles for every builtin theme (+ custom CSS appended last), through the real .css text-loader
for (const entry of builtinThemeEntries()) {
  const css = deckCss(entry, ".sd-slide{ --sd-accent:#e63946 }");
  for (const needle of [".katex", ".hljs", ".sd-content", ".sd-layout-two-column", "--sd-base:", "#e63946"]) {
    if (!css.includes(needle)) {
      console.error(`bundle-smoke FAILED — theme "${entry.key}" CSS missing: ${needle}`);
      process.exit(4);
    }
  }
}

// 2b) a user .css theme injects its raw tokens
const userCss = deckCss(userThemeEntry("ocean", ".sd-slide{ --sd-bg:#012738 }"));
if (!userCss.includes("--sd-bg:#012738") || !userCss.includes(".katex")) {
  console.error("bundle-smoke FAILED — user theme CSS not assembled");
  process.exit(4);
}

// 3) presetFor/layoutFor totality
if (presetFor("nope").id !== "default" || layoutFor("nope").id !== "default") {
  console.error("bundle-smoke FAILED — presetFor/layoutFor not total");
  process.exit(5);
}

console.log("bundle-smoke OK — directives, every-theme deckCss, and totality work in the real bundle");
