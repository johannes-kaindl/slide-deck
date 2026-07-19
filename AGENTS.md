# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.
Workspace-weite Standards (comply-or-explain): siehe [`../_docs/CONVENTIONS.md`](../_docs/CONVENTIONS.md).

**Profil:** `ts-node` · `obsidian-plugin`.

## Project character

**Projekt:** `slide-deck` (Plugin-id) — Obsidian-Plugin, das eine **Markdown-Notiz** in eine
**Folienpräsentation** verwandelt und diese als PDF oder PNG-Bilderserie exportiert.
Desktop und Mobile, keine Cloud, keine externen Dienste. Autor: Johannes Kaindl.

**Warum es existiert:** Präsentationen direkt aus dem eigenen Wissens-Vault heraus erstellen —
ohne Format-Konvertierungen, Powerpoint, oder externe SaaS-Tools. Markdown-Notizen bleiben
kanonisch; die Folienansicht ist eine Projektion davon.

**Herkunft:** Eigenständige Neuentwicklung (md2pdf-Seed) mit der Absicht, langfristig einen
sauberen Core wiederzuverwenden (z.B. in einem Kommandozeilen-Tool zum Batch-Export). Die
Architektur ist von Anfang an auf die Pure-Core-Naht ausgelegt.

**Bewusste Designentscheidungen:**
- **Fit-or-warn statt clip:** Folien, die zu viel Inhalt für den Canvas haben, werden bis zur
  Lesbarkeits-Untergrenze (`minFontPx`) skaliert — unterschreitet der Bedarf diese Grenze,
  wird die Folie gewarnt, nicht stumm beschnitten. Der Autor soll den Inhalt selbst verdichten.
- **Feste Geometrie:** Der Canvas ist immer 1280×720 (16:9) oder 960×720 (4:3) px — nicht
  flüssig. Das vereinfacht den Export (keine Viewport-Abhängigkeit).
- **Accessible Callouts:** Bedeutung wird redundant kodiert (Rahmenfarbe + geometrische Form +
  Label-Wort), nicht nur per Farbe (erfüllt WCAG 1.4.1).
- **Phase-2-LLM bewusst geparkt:** Keine LLM-Integration im aktuellen Scope. Der Plan sieht
  Phase 2 (z.B. automatische Verdichtung via LLM) als separate Erweiterung vor.

## Architecture principles

### Pure-Core ↔ Obsidian-Adapter-Naht

Der Kern (`src/core/**`) ist **vollständig obsidian-frei** und Node-testbar ohne DOM-Mock.
Nur die Adapter-Schicht importiert Obsidian-APIs oder DOM:

```
src/core/          Reiner Kern — kein obsidian-Import, kein DOM. Vollständig unit-testbar.
  slide-model.ts     parseDeck() — Frontmatter + ---Trenner → SlideDeck. Typen: Slide,
                     SlideDeck, DeckDirectives, Aspect.
  geometry.ts        geometryFor(aspect) → SlideGeometry {width, height}.
  layout/
    fit.ts           computeFit(measured, geo, minScale) → FitResult {scale, overflow}.
  render/
    md2html.ts       renderMarkdown(md, resolveEmbed) → html-String (markdown-it + KaTeX +
                     highlight.js + Callout-Präprozessor + Mermaid-Slot).
    callouts.ts      calloutHtml(type, title, body) — barrierefreies Callout-HTML (icon+label).
  constraints/
    contract.ts      collectWarnings(results) → Warning[]. Validierungs-Vertrag.
    engine.ts        Constraint-Engine — führt FitResult → Warning zusammen.
  directives.ts     parseDirectives() — fence-aware Per-Folie-Direktiven (<!-- layout -->,
                    <!-- column -->) → { layout, regions, warnings }.
  theme-key.ts       keyFromFilename(filename) → Theme-Key (Dateiname ohne .css);
                     parseBaseFontPx(css) → baseFontPx-Token aus CSS.
  folder-hide.ts     normalizeFolder(raw) — kanonische Pfadform; buildHideCss(folder, hide) —
                     CSS, das einen Vault-Ordner im Datei-Explorer ausblendet (vault-rag-Muster,
                     data-path-Attribut, activeDocument.adoptedStyleSheets in main.applyFolderHide()).
  llm/
    deck-prompt.ts        buildDeckPrompt(sourceBody, opts, contract) → ChatMessage[] — System+User-
                          Prompt, der eine Notiz in Deck-Markdown verwandelt (contractToPrompt ohne
                          Theme-Zeile — das Theme wird deterministisch gesetzt, nie vom Modell
                          gewählt). stripNoteFrontmatter() kappt die Notiz-eigene Frontmatter.
    deck-sanitize.ts      Nachbearbeitung generierter Deck-Markdown (Frontmatter-Range-Erkennung,
                          bare `<think>`-Reste kappen, …).
    deck-validate.ts      validateDeckOutput(md) → DeckValidation — parseDeck() + Warnings; fatal
                          nur bei leerer Ausgabe oder 0 Folien (fit-or-warn, sonst nie blockierend).
    error-envelope.ts     parseErrorEnvelope(text) — erkennt OpenAI-kompatible Fehler-Envelopes in
                          HTTP-200-Bodies (LM Studio antwortet Fehlern oft ohne Fehlerstatus).
    model-info.ts         Re-Export von Kits parseLmStudioContext/parseOllamaContext/ModelContext
                          (model-context.ts) + eigene estimateTokens(chars), contextOverflow(...).
    ai-settings-model.ts  Pure Zustandslogik der KI-Settings: applyEndpointEdit,
                          activeIndexFromStatuses, modelFieldMode, initialModelSelection (+ Typ
                          ModelSelection — hält einen serverseitig nicht mehr gelisteten,
                          gespeicherten Modellwert als Extra-Option statt ihn stumm zu verlieren),
                          thinkToggleView, effectiveSuppress, statusKindKey/warnRuleKey.
  presets/
    index.ts        Preset-Typ + PRESETS-Registry; presetFor() (total); presetTokensCss();
                    assembleDeckCss().
    default.ts · dark.ts · serif.ts · high-contrast.ts   je ein Preset (Token-Block + hljs/mermaid).
    structure.css.ts  geteiltes, theme-unabhängiges Struktur-CSS (var(--sd-*); kein --sd-base).
    layouts.css.ts    LAYOUTS/layoutFor() + geteiltes Layout-CSS (.sd-layout-*, .sd-region).

src/               Obsidian-Adapter-Schicht — importiert obsidian / DOM.
  main.ts            Plugin-Entry: Commands (open-preview, export-pdf, export-images),
                     SettingTab, View-Registration, Sprach-Detektion.
  adapter.ts         loadActiveDeck(app, defaults) — liest die aktive Notiz, löst Embeds
                     zu data-URLs auf (resolveEmbed-Closure), gibt SlideDeck zurück.
  iframe-host.ts     Isoliertes Deck-iframe: isolatedDeckHtml({css,bodyHtml,extraCss?})
                     (reiner HTML-String-Assembler) + createIsolatedDeckIframe(ownerDoc, opts)
                     (async Lifecycle: erzeugt sandbox="allow-same-origin"-iframe, injiziert via
                     srcdoc, löst nach load + contentDoc.fonts.ready auf; nutzt
                     ownerDoc.defaultView für Popout-sichere Timer). Gibt {iframe,contentDoc,dispose}.
  chrome-css.ts      PREVIEW_CHROME_CSS (Card-Schatten + Overflow-Stripes + Deck-Inner-Stacking,
                     theme-freie Hardcoded-Farben) und PRINT_CSS(w,h) (@page + Seitenumbruch
                     pro Folie). Beide werden in Iframes injiziert — nie ins themed Eltern-Dokument.
  render-dom.ts      buildIsolatedDeck(ownerDoc, deck, resolveEmbed, customCss?) — rendert und
                     misst im Off-Screen-Staging-iframe (theme-isoliert), serialisiert
                     {slidesHtml, css, warnings}. renderDeckToContainer() ist realm-sicher
                     (ausschließlich native DOM: doc.createElement/classList/replaceChildren, keine
                     Obsidian-Augmentierungen) und zweiphasig (alle Folien bauen → fonts.ready →
                     alle messen). renderMermaidSlots() — Mermaid SVG-Rendering (async, DOM-abhängig).
  preview-view.ts    SlideDeckView (ItemView, rechte Seitenleiste) — Live-Vorschau mit
                     Warn-Badges und Source-Jump-Link. Deck wird in einem persistenten
                     isolierten iframe dargestellt; Preview-Zoom wirkt auf das <iframe>-Element;
                     PREVIEW_CHROME_CSS wird in den iframe injiziert.
  export.ts          exportPdf() — plattformabhängige PDF-Weiche: Desktop druckt den isolierten
                     iframe via `contentWindow.print()` (sandbox="allow-same-origin allow-modals");
                     Mobile schreibt `isolatedDeckHtml` (mit `PRINT_CSS`) in den Export-Ordner
                     und übergibt die Datei via `app.openWithDefaultApp` ans OS (Nutzer druckt/
                     teilt von dort als PDF). `window.print()` ist im Mobile-WebView ein No-op.
                     exportImages() — PNG-Capture via `modern-screenshot` (`domToCanvas`) innerhalb
                     eines isolierten iframes; ersetzt html2canvas (Wortabstände wurden zusammen-
                     geklebt). Beide konsumieren buildIsolatedDeck() für ein einheitliches Artefakt.
  dom-safe.ts        Popout-sichere DOM-Helfer (activeDocument, activeWindow).
  i18n.ts            t(key, ...args) · pickLang · setLang/getLang. EN kanonisch, DE übersetzt.
  ai-settings-ui.ts  Render der KI-Settings-Bausteine (UI-STANDARD §8): paintStatus (gemeinsame
                     Status-Icon-Vokabel — Form + Farbe + State-Klasse + aria-label, WCAG 1.4.1),
                     renderEndpointEditor (Zeilen-Editor, mutiert bei blur + Live-Probe + Presets),
                     renderModelField (Dropdown aus listModels()/modelContext() + Freitext-Fallback
                     + Kontextlängen-Anzeige), renderThinkingRow (Toggle + Live-Suppress-Test via
                     echtem Minimal-Call). Die render*-Funktionen sind settings.ts-exklusiv;
                     paintStatus wird zusätzlich von generate-deck-view.ts importiert (identische
                     Icon-Sprache in Settings und Generate-View).
  settings.ts        SlideDeckSettings (defaultTheme, minFontPx, imageScale, themesFolder,
                     hideThemesFolder) + SettingTab (inkl. „Verfügbare Themes"-Referenz,
                     Open-in-Finder-Button, Export-as-.css-Button, Ordner-Ausblenden-Toggle).
  theme-registry.ts  ThemeStore — merged Built-ins + User-.css-Themes aus dem konfigurierten
                     Ordner. refresh() scannt via scanThemeFiles(); resolve(key) → ThemeEntry.
  theme-source.ts    scanThemeFiles() — listet *.css im Themes-Ordner; writeThemeCss() —
                     exportiert ein Theme als editierbare .css-Datei; revealFolder() — öffnet
                     den Ordner im System-Dateimanager (Electron shell.openPath).
  frontmatter-writer.ts  setNoteTheme(app, file, key) — schreibt theme: in die Frontmatter der
                         Notiz (via processFrontMatter), legt den YAML-Block an falls nötig.
```

**Invariante:** `src/core/**` darf niemals `obsidian` importieren. Ein purity-Check-Skript
(`scripts/check-core-purity.mjs`) erzwingt das als Teil von `npm test`.

**Realm-Invariante:** `src/render-dom.ts` darf keine Obsidian-DOM-Augmentierungen verwenden
(`createDiv`/`createEl`/`createSpan`/`empty`/`addClass`/`removeClass`/`setText`/`setAttr`).
Ein Gate-Skript (`scripts/check-render-realm.mjs`) erzwingt das als zweiter Schritt von
`npm test` (nach check-core-purity.mjs).

**md2pdf-Seed:** Die Architektur ist bewusst so aufgebaut, dass `src/core/**` + ein
CLI-Adapter in einem zukünftigen `md2pdf`-Tool wiederverwendet werden kann, ohne die
Obsidian-Schicht zu benötigen.

## Commands

```bash
npm install                       # Deps installieren
npm run dev                       # esbuild watch (Entwicklung)
npm run build                     # tsc --noEmit + esbuild prod → main.js
npm run deploy                    # build + nach $OBSIDIAN_PLUGIN_DIR kopieren
npm run lint                      # inline-disable-Gate + eslint src (reproduziert Community-Review-Checks)
npm test                          # Core-Purity-Check + vitest run + bundle-smoke (every-theme deckCss)
npm run typecheck                 # tsc --noEmit (separat von vitest)
npm run version                   # Version bumpen (package.json/manifest.json/versions.json synct)
```

**Obsidian-Commands (registriert via `this.addCommand`):**

| Command-ID | Name (EN) |
|---|---|
| `open-preview` | Open presentation preview |
| `export-pdf` | Export presentation to PDF |
| `export-images` | Export presentation to image series |

## Conventions

- **TS strict + `noImplicitAny`** — keine `any`-Casts für neue Typen.
- **Tests:** vitest läuft mit `environment: "node"` — **kein DOM, kein happy-dom**.
  Obsidian-Mock unter `tests/__mocks__/obsidian.ts` für reine Logik-Tests.
  DOM/iframe/Layout-Verhalten wird durch `bundle-smoke.mjs` + manuellen Pallas-Smoke abgedeckt.
  Nach jeder Änderung müssen alle vitest-Tests grün bleiben. `npx tsc --noEmit` separat laufen
  (vitest ≠ tsc).
- **Core-Purity:** `scripts/check-core-purity.mjs` läuft als erster Schritt von `npm test` —
  schlägt fehl, wenn `src/core/**` einen `obsidian`-Import enthält.
- **Keine Inline-`eslint-disable` in `src/`:** `scripts/check-no-inline-disables.mjs` läuft als
  erster Schritt von `npm run lint`. Der Community-Store wertet ein Inline-disable einer
  `obsidianmd/*`-Regel als **Error** — egal wie gut begründet (0.3.1 und 0.6.1 waren beide reine
  Wartungs-Releases genau dafür). Wer eine Regel nicht erfüllen kann: entweder den Code auflösen,
  oder einen **file-scoped Override mit Begründung** in `eslint.config.mjs` eintragen — dort ist
  die Ausnahme sichtbar und reviewbar. Beides ist store-tauglich, das Inline-disable nicht.
- **Realm-Safety:** `scripts/check-render-realm.mjs` läuft als zweiter Schritt von `npm test` —
  schlägt fehl, wenn `src/render-dom.ts` eine Obsidian-DOM-Augmentierung
  (`createDiv`/`addClass`/etc.) verwendet. Render-DOM muss gegen jedes Realm (inkl. iframe-
  contentDocument) lauffähig sein.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien
  stagen.** Trailer bei substanziellem AI-Beitrag:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n:** nutzersichtbare Strings via `t()` aus `i18n.ts` (EN kanonisch, EN/DE nach
  App-Sprache). Keine Literal-UI-Strings in `main.ts`/`preview-view.ts`.
- **Workspace-Standards:** PROF-OBS-03 (pure core), PROF-OBS-07 (i18n), CORE-META-01 (README),
  CORE-AGENT-01 (AGENTS.md).

## Gotchas

- **Themes/Tokens-Invariante:** Themes setzen nur Tokens; Struktur/Layout-CSS ist theme-unantastbar (fit-kritisch). `--sd-base` lebt einzig in `presetTokensCss`.
- **Theme-Registry:** Themes sind `ThemeEntry { key, source, themeCss, hljs, mermaid, baseFontPx }`.
  `ThemeStore` (`theme-registry.ts`) merged Built-ins (`builtinThemeEntries`) mit User-`.css` aus
  `settings.themesFolder` (`scanThemeFiles`). Frontmatter `theme:` = SoT der Notiz (Settings-`defaultTheme`
  nur für Notizen ohne `theme:`). Das Preview-Dropdown schaltet ephemer; „Setzen" schreibt via
  `setNoteTheme` (`processFrontMatter`). User-Themes erben Code-/Mermaid-Theme des `default`-Built-ins.
- **Themes-Ordner ausblenden:** `buildHideCss` (vault-rag-Muster) via `activeDocument.adoptedStyleSheets`
  in `main.applyFolderHide()`. `data-path` ist internes Obsidian-Markup — bricht es, taucht der Ordner
  nur kosmetisch wieder auf.
- **iframe-Isolation:** Folien rendern in einem `sandbox="allow-same-origin"`-iframe — das
  aktive Obsidian-Theme erreicht den iframe-Inhalt nicht. Obsidians `createDiv`/`addClass`/etc.
  sind Prototype-Patches des Eltern-Realms und werfen auf iframe-Knoten. Deshalb ist der gesamte
  iframe-Pfad (renderDeckToContainer, buildIsolatedDeck) ausschließlich native DOM + String-
  Injektion. Messung wartet auf `load` + `contentDoc.fonts.ready` (KaTeX-Glyph-Metriken).
  Off-Screen-Staging: `position: fixed; left: -99999px` statt `display: none` —
  `display:none` unterdrückt das Layout und bricht scrollWidth-Messungen.
- **Export-Pfade plattformabhängig:** PNG nutzt `modern-screenshot` (foreignObject →
  natives Text-Layout; html2canvas wurde wegen zusammenklebender Wortabstände
  ersetzt). PDF verzweigt auf `Platform.isDesktopApp`: Desktop druckt den isolierten
  iframe (`contentWindow.print()`), Mobile schreibt `isolatedDeckHtml` in den
  Export-Ordner und ruft `app.openWithDefaultApp` (window.print ist im Mobile-WebView
  ein No-op — letterhead-Muster). `print-color-adjust: exact` in `PRINT_CSS` erzwingt
  den Theme-Hintergrund im Druck.
- **PDF via window.print (Desktop):** Der Desktop-PDF-Export druckt den isolierten iframe via
  `contentWindow.print()`. Obsidian-Themes, Browser-Erweiterungen und Systemdruck-Einstellungen
  können das Ergebnis beeinflussen. Die `@page`-CSS-Regel setzt die Seitengröße auf die
  Foliengröße.
- **Fit-or-warn — Overflow ist beabsichtigt:** Folien werden bei `minFontPx` gewarnt, nicht
  beschnitten. Das ist kein Bug — der Nutzer soll den Inhalt verdichten.
- **Mermaid-IDs müssen eindeutig sein:** `render-dom.ts` vergibt eindeutige IDs per Folie
  (`sd-mermaid-{slideIndex}-{blockIndex}`). Mermaid initialisiert sich global; doppelte IDs
  führen zu stummen Render-Fehlern.
- **`data.json`** — von Obsidian persistierte Plugin-Config — git-ignored, nie committen.
- **`main.js`** — Build-Artefakt — git-ignored, nie manuell editieren.
- **Deploy:** `npm run deploy` setzt `$OBSIDIAN_PLUGIN_DIR` voraus (Pfad zum Plugin-Ordner
  im Vault). Ohne diese Variable schlägt das Kommando explizit fehl.
- **Release-CI ist GitHub-only:** `.github/workflows/release.yml` läuft auf dem GitHub-Mirror
  (Codeberg/Forgejo ignoriert `.github/`). SemVer-Tag pushen → Mirror trägt ihn zu GitHub →
  Pipeline baut + attestiert + legt das GitHub-Release an. Das Codeberg-Release (kanonisch)
  bleibt manuell via Forgejo-API.
- **Kit-Vendoring:** `src/vendor/kit/**` sind **verbatim** Kopien aus `obsidian-kit/src/pure/` —
  nie hier editieren, sondern vom gepinnten sha neu vendoren (`src/vendor/VENDOR.json` hält
  `version` + `sha`). Das Purity-Gate walkt `src/core` **und** `src/vendor/kit`; deshalb darf
  Core aus vendor importieren, ohne dass ein unpure gewordenes Kit-Modul still durchschlägt.
- **Kit-Klartexte sind deutsch:** `EndpointStatus.klartext` ist im Kit hartkodiert deutsch.
  Dieses Plugin ist EN-kanonisch → nie `klartext` rendern, immer über `kind` →
  `statusKindKey(kind)` → `t(key)`. Einzige Ausnahme: `kind === "unknown"` (dort trägt `raw`
  die einzige Information).
- **Endpoint-Zeilen-Editor mutiert bei `blur`, nie bei `onChange`** (UI-STANDARD §8) — sonst
  persistiert jeder Tastendruck und der Adder sammelt `h`, `ht`, `htt`.
- **`ping()` ist nicht `status===200`:** LM Studio antwortet auf `/v1/v1/...` mit HTTP 200 +
  Fehler-Body. `probe()` gibt das Rohsignal an `classifyEndpointStatus`, das erst die API-Form
  (`data`-Array) prüft — deshalb erkennt es `not-an-llm-api`.

## Memory

- **Projekt-Memory:** `~/.claude/projects/-Users-Shared-code-markdown-presentation/memory/`
- **SDD-Artefakte (ab 2026-07-16):** **Cockpit**, nicht Repo — `$VAULT/25_Coding/markdown-presentation/_SDD/`
  (CORE-META-14). Specs/Plans tragen Arbeitskontext (Vault-Pfade, Schwester-Repo-Interna), der in
  einem public Repo niemandem nützt. Das Repo behält die Design-Essenz in dieser Datei + `CHANGELOG.md`.
  `.superpowers/sdd/` bleibt der git-ignorierte Scratch-Ort für laufende Ledger/Reports.
- **Alt-Bestand:** `docs/superpowers/{specs,plans}/` (bis 2026-07-16) bleibt liegen, bis ein bewusster
  Hygiene-Sweep ihn zieht — s. `../../_docs/SEED-repo-hygiene-internals.md`. Nichts Neues dort ablegen.
- **Nie im Repo:** absolute Pfade außerhalb des Repos (`/Users/…`, Vault-Pfade) — Platzhalter nutzen
  (`$VAULT/…`). Herkunftsnachweise als Repo-Name + `Datei:Zeile` (`// vault-rag pattern`) sind dagegen
  erwünscht: sie begründen Design-Entscheidungen.

## Abweichungen von der Leitkonvention

Stand 2026-06-25 — **vor erstem Release 0.1.0**. Bewusste, begründete Abweichungen
(comply-or-explain):

- **`isDesktopOnly: false`** — das Plugin läuft auf Mobile. Alle Desktop-only-APIs sind
  bewacht: PDF-Export verzweigt auf `Platform.isDesktopApp` (Desktop: `contentWindow.print()`;
  Mobile: HTML-Datei schreiben + `openWithDefaultApp`); „Im Finder anzeigen" prüft
  `FileSystemAdapter` und fällt auf einen `Notice`-Fallback zurück.
- **PROF-OBS-06** — SettingTab nutzt `display()` (deklarative `getSettingDefinitions`-API ist
  Obsidian 1.13+). *Grund:* Recommendation, kein Blocker; minAppVersion bleibt 1.8.7. Eigener
  Upgrade-Zyklus.
- **Kein Codeberg-`origin` / GitHub-Mirror** — Remotes noch nicht eingerichtet (pre-release).
  Einzurichten vor dem ersten Tag.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `/Users/Shared/code/obsidian-plugins/`.
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
