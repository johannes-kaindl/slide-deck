---
paths:
  - "src/adapter.ts"
  - "tests/adapter.test.ts"
  - "src/theme-registry.ts"
  - "src/theme-source.ts"
  - "src/frontmatter-writer.ts"
  - "src/preview-view.ts"
  - "src/vendor/deck-core/pure/presets/**"
  - "src/vendor/deck-core/pure/deck-css.ts"
  - "docs/themes/**"
---

# Themes, Warnungen und Modifier — Gotchas

Gotchas zu Theme-Registry, Theme-CSS, Warnungen und `sd-modifiers`.

- **Warnungen färbt der Consumer nach `severity`, nie nach `kind`.** Seit `deck-core` 0.5.0
  trägt jede `Warning` eine Schwere (`error`/`warn`/`info`) aus einem **totalen**
  `Record<WarningKind, WarningSeverity>` — eine neue Warnungsart ohne Einstufung bricht dort
  den Build. Wer die kind-Liste im Consumer nachbaut, muss jede Erweiterung des Kerns neu
  lernen; die erste, die das gekostet hat, war `layout-unknown`. Ein Theme **darf** eigene
  Layoutnamen und Modifier definieren, der Kern reicht sie durch — die alte kind-Färbung
  meldete genau diesen vorgesehenen Erweiterungsweg als Defekt (amber Streifen an der Folie).
  `info` heißt „durchgereicht, nicht verstanden" und bekommt keinen Streifen. `preview-view.ts`
  stellt zusätzlich ein Formzeichen voran (▲/●/ℹ): eine reine Farbunterscheidung wäre ein
  selbst eingebauter WCAG-1.4.1-Verstoß, während die Callouts nebenan Redundanz zusagen.
  Die drei Schwere-Wörter liegen in `i18n.ts` (EN+DE) mit Vollständigkeits-Record im Test.
- **`/* sd-modifiers: … */` — ein Theme erklärt seine eigenen Modifier** (deck-core 0.10.0).
  Ohne die Erklärung meldet ein Theme mit planmäßig eigenen Varianten auf jeder zweiten Folie
  einen Zustand, der genau so gewollt ist (`modifier-unknown`, Schwere `info`).
  **Die Kette läuft über vier Module und zwei Repos, und die Naht dazwischen ist nur hier
  geprüft** (`tests/adapter.test.ts` § „Consumer-Kette", mit Gegenprobe): Theme-CSS →
  `parseThemeMeta()` → `ThemeEntry.modifiers` → `knownModifiersFor()` →
  `parseDeck(src, defaults, { knownModifiers })`.
  `knownModifiersFor` liegt bewusst **außerhalb** von `loadDeck`: dort bräuchte ein Test einen
  App-Mock, hier genügt eine Registry — dieselbe Naht wie `mermaidConfig` im Kern.
  ⓘ **Welches Theme zählt, steht vor dem Parsen fest**, ohne das Deck anzufassen: Obsidian hat
  die Frontmatter bereits geparst (`metadataCache.getFileCache().frontmatter.theme`). Ein
  ausdrücklicher `themeKey` (Export-Override) schlägt sie, weil damit gerendert wird.
  ⚠️ **Ein Dropdown-Wechsel in der Vorschau ändert die Meldungen nicht:** `rerenderTheme()`
  rendert neu, parst aber nicht erneut — die Modifier-Meldungen bleiben die des **geladenen**
  Themes. Folgenlos (`info`, kein Streifen), aber beim Anprobieren eines fremden Themes sichtbar.
- **Themes/Tokens-Invariante:** Themes setzen nur Tokens; Struktur/Layout-CSS ist theme-unantastbar (fit-kritisch). `--sd-base` lebt einzig in `presetTokensCss`.
- **Theme-Registry:** Themes sind `ThemeEntry { key, label?, source, themeCss, hljs, katex, mermaid, mermaidVars?, mermaidPinned?, mermaidVarOverrides?, modifiers?, baseFontPx, overridesBuiltin? }`.
  `katex` ist Pflicht (vom Host hereingereichtes Fremd-CSS, s. `docs/internal/architecture.md`); `label`,
  `mermaidVars` und `overridesBuiltin` sind optional.
  **Die drei Mermaid-Felder sind nicht austauschbar** und entstehen zu verschiedenen Zeiten:
  `mermaidVars` trägt ein *eingebautes* Theme aus seinem Token-Record (Registry-Zeit);
  ein Ordner-Theme hat keinen und bekommt seine Werte in der DOM-Ebene aus der Kaskade
  (`mermaidVarsFromDocument`); `mermaidVarOverrides` sind die per
  `/* sd-mermaid-var: name wert */` deklarierten Einzelwerte und werden **zuletzt**
  darübergelegt. `mermaidPinned` sagt, dass die Datei ihr Grundthema selbst genannt hat —
  dann bleibt dieses erhalten und trägt die Overrides als `themeVariables` (`dark` plus ein
  justierter Wert bleibt dark). Die Entscheidung darüber ist eine einzige totale Funktion,
  `mermaidConfig()` in `pure/presets/index.ts` — nicht über den Renderer verteilt.
  `ThemeStore` (`theme-registry.ts`) merged Built-ins (`builtinThemeEntries`) mit User-`.css` aus
  `settings.themesFolder` (`scanThemeFiles`). Frontmatter `theme:` = SoT der Notiz (Settings-`defaultTheme`
  nur für Notizen ohne `theme:`). Das Preview-Dropdown schaltet ephemer; „Setzen" schreibt via
  `setNoteTheme` (`processFrontMatter`). Ohne eigene `sd-hljs`-/`sd-mermaid`-Angabe fallen User-Themes auf das kami-Preset zurück (`userThemeEntry` in `deck-css.ts`); eine Angabe in der Datei überschreibt es.
- **Themes-Ordner ausblenden:** liegt seit Welle 18 im Kit (`src/vendor/kit/folder-hide.ts` pur, `src/vendor/kit-obsidian/folder-hide.ts` mit `installFolderHide`); `main.applyFolderHide()` ist nur der Wrapper (`rootSplit.doc` als Ziel-Dokument, nie `activeDocument` — die Realm-Falle aus 0.4.0/0.5.0/0.6.1, bewacht vom GUI-Smoke C3 mit fokussiertem Pop-out). `data-path` ist internes Obsidian-Markup — bricht es, taucht der Ordner nur kosmetisch wieder auf. `normalizeFolder` (auch in `theme-source.ts`) kommt aus demselben Kit-Modul.
