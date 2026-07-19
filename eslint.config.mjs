// Obsidian-Guideline-Gate (PROF-OBS-08): type-checked gegen ECHTE obsidian-Typen.
// KEIN Inline-`// eslint-disable` — genuin unvermeidbare Ausnahmen NUR als file-scoped
// Override unten, mit Begruendung (Review verbietet Inline-disables).
//
// Diese Regel ist seit 0.6.1 ERZWUNGEN: `scripts/check-no-inline-disables.mjs` laeuft als
// erster Schritt von `npm run lint`. Vorher war sie nur dieser Kommentar — und wurde in 0.6.0
// zweimal verletzt, was den Store-Review scheitern liess (0.3.1 war bereits derselbe Fall).
//
// Stand 0.3.1: die fruheren Overrides fuer export.ts / render-dom.ts / iframe-host.ts /
// preview-view.ts / frontmatter-writer.ts wurden ENTFERNT, weil der Code jetzt die von den
// Regeln empfohlene Form nutzt: `el.style.setProperty(...)` statt `el.style.x = …`
// (no-static-styles-assignment) und ein DOMParser-basierter `setHtml()`-Helfer statt
// `innerHTML` (no-unsanitized / no-inner-html). Es bleiben nur zwei genuin unvermeidbare
// Ausnahmen (theme-source.ts, settings.ts), jeweils begruendet.
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
  {
    // theme-source.ts: revealFolder uses a dynamic require("electron") because this is a
    // desktop-only plugin and electron is marked external by esbuild. The dynamic require
    // is intentionally lazy (avoids a hard import that would break mobile builds). No types
    // for electron are available in this project, so the unsafe-* rules must be suppressed
    // for this one call site. The try/catch ensures graceful fallback if electron is absent.
    files: ["src/theme-source.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",     // dynamic require("electron") — esbuild external, desktop-only
      "@typescript-eslint/no-unsafe-assignment": "off",   // electron shell has no @types/electron here
      "@typescript-eslint/no-unsafe-call": "off",         // shell.openPath — no types available
      "@typescript-eslint/no-unsafe-member-access": "off",// shell.openPath — no types available
    },
  },
);
