// Obsidian-Guideline-Gate (PROF-OBS-08): type-checked gegen ECHTE obsidian-Typen.
// KEIN Inline-`// eslint-disable` — genuin unvermeidbare Ausnahmen NUR als file-scoped
// Override unten, mit Begruendung (Review verbietet Inline-disables).
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/", "tests/__mocks__/"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // --- file-scoped Overrides (Beispiel, auskommentiert) ---------------------
  // {
  //   files: ["src/streaming.ts"],
  //   rules: { "obsidianmd/no-restricted-globals": "off" }, // SSE via activeWindow.fetch, requestUrl kann nicht streamen
  // },
  {
    // export.ts: innerHTML writes are self-generated, isolated export-HTML (never user input).
    // Inline positioning is intentional: fixed off-screen staging geometry for html2canvas capture.
    files: ["src/export.ts"],
    rules: {
      "no-unsanitized/property": "off",       // innerHTML: self-generated export HTML, not user input
      "no-unsanitized/method": "off",         // insertAdjacentHTML: self-generated export HTML, not user input
      "@microsoft/sdl/no-inner-html": "off",  // same reason as above
      "obsidianmd/no-static-styles-assignment": "off", // fixed off-screen staging geometry, not theme styles
    },
  },
  {
    // render-dom.ts: innerHTML writes are self-generated HTML from controlled core renderer (renderMarkdown),
    // never user input. Per-slide inline styles (--sd-w/--sd-h, transform:scale) are genuinely dynamic
    // (per-slide geometry from computeFit), not static theme styles. Off-screen staging div uses fixed
    // positioning to measure layout outside the viewport.
    files: ["src/render-dom.ts"],
    rules: {
      "no-unsanitized/property": "off",
      "@microsoft/sdl/no-inner-html": "off",
      "obsidianmd/no-static-styles-assignment": "off",
    },
  },
  {
    // preview-view.ts: a <style> element is required to inject the full deck CSS (katex + hljs + preset)
    // into the live preview leaf so that math, code highlighting, and slide layout are correctly rendered.
    // styles.css is insufficient here because the CSS content is dynamic (theme-dependent) and assembled
    // at render time — it cannot be a static file loaded by Obsidian.
    files: ["src/preview-view.ts"],
    rules: {
      "obsidianmd/no-forbidden-elements": "off",
      // dynamic `zoom` scales the deck to the pane width at render time (not a static theme style)
      "obsidianmd/no-static-styles-assignment": "off",
    },
  },
  {
    // iframe-host.ts: off-screen staging geometry (position:fixed; left:-99999px) and the
    // iframe reset (border:0) are fixed layout-measurement styles, not theme styles —
    // same rationale as export.ts / render-dom.ts. (Dynamic width/zoom are set as template
    // strings elsewhere, which the rule already allows.)
    files: ["src/iframe-host.ts"],
    rules: {
      "obsidianmd/no-static-styles-assignment": "off",
    },
  },
);
