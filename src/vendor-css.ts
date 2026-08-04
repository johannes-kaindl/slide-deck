// Die vier CSS-Importe, die deck-core bewusst nicht selbst macht: ein `import x from "*.css"`
// ist eine Annahme über den Bundler (esbuild löst es über den Text-Loader in
// esbuild.config.mjs). Wir lesen sie, deck-core ordnet sie.
import katexCss from "katex/dist/katex.min.css";
import githubCss from "highlight.js/styles/github.css";
import githubDarkCss from "highlight.js/styles/github-dark.css";
import gruvboxDarkHardCss from "highlight.js/styles/base16/gruvbox-dark-hard.css";
import type { VendorCss } from "./vendor/deck-core/pure/deck-css";

export const VENDOR_CSS: VendorCss = {
  katex: katexCss,
  hljs: {
    github: githubCss,
    "github-dark": githubDarkCss,
    "gruvbox-dark-hard": gruvboxDarkHardCss,
  },
};
