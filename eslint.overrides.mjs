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
    // Kit-Pin-Sprung 0.26.0 -> 0.35.0 (Welle 2, 2026-09-15): `effectiveModel` traegt seit
    // einer der uebersprungenen Versionen ein @deprecated (endpoint_config.ts) — dieses
    // Repo (frueher markdown-presentation) ist einer der fuenf im Kit namentlich genannten
    // Konsumenten, die noch ein globales Modellfeld statt eines Zeilen-Overrides fahren
    // (Migration ist eine eigene UI-Aufgabe, nicht Teil der Streaming-Antwortbereich-Welle).
    // Kein Faehigkeitsmangel dieses Repos, sondern angekuendigte, noch nicht abgearbeitete
    // Kit-Migrationsschuld — an obsidian-plugins-3d gemeldet statt hier durchgeprügelt.
    files: ["src/llm-client.ts"],
    rules: { "@typescript-eslint/no-deprecated": "off" },
  },
];
