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
    // spike-export.ts: De-risk spike; all innerHTML writes are self-generated, isolated export-HTML (never user input).
    // Inline positioning and console.log are intentional: off-screen canvas staging + Devtools smoke verification.
    // Entire file deleted by Task 17 once the spike findings are absorbed into production export code.
    files: ["src/spike-export.ts"],
    rules: {
      "no-unsanitized/property": "off",       // innerHTML: self-generated export HTML, not user input
      "@microsoft/sdl/no-inner-html": "off",  // same reason as above
      "obsidianmd/no-static-styles-assignment": "off", // fixed off-screen staging geometry, not theme styles
      "obsidianmd/rule-custom-message": "off", // console.log for Devtools smoke verification during spike
    },
  },
);
