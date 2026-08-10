// Explicit highlight.js language set.
//
// `import hljs from "highlight.js"` pulls in every one of its ~190 grammars —
// roughly 1 MB minified. A host that ships as a single bundled file pays that in
// full, and no bundler can shake it out: the grammars are registered by side
// effect. Registering a chosen set costs ~105 KB for the twenty below.
//
// An unlisted language is not an error: `renderMarkdown` checks `getLanguage`
// and falls back to escaped plain code, so a deck using something exotic still
// renders — just without colour. Adding one here costs 2–5 KB.
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const GRAMMARS = {
  bash, cpp, csharp, css, diff, go, java, javascript, json, kotlin,
  markdown, php, python, ruby, rust, sql, swift, typescript, xml, yaml,
};

for (const [name, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, grammar);

/** The languages this renderer highlights. Everything else degrades to plain code. */
export const HLJS_LANGUAGES: readonly string[] = Object.keys(GRAMMARS);

export default hljs;
