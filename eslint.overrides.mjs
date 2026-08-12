// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
export default [
  {
    // Type-aware Linting braucht das Build-tsconfig des Repos. Achtung Falle
    // (json_viewer 1.9.0): ein obsidian→Mock-paths-Alias im referenzierten tsconfig
    // laesst die type-aware Regeln auf einen losen Mock aufloesen → no-unsafe-*-Kaskade.
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
];
