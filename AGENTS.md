# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, `../../_docs` relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

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

Der Kern (`src/vendor/deck-core/pure/**`) ist **vollständig obsidian-frei** und
Node-testbar ohne DOM-Mock — vendoriert aus `deck-core`, s. „Der Folienkern liegt
nicht mehr hier" weiter unten für Grund und Grenze. Nur die Adapter-Schicht
importiert Obsidian-APIs oder DOM:

```
src/vendor/deck-core/pure/   Vendorierter Kern — kein obsidian-Import, kein DOM. Vollständig
                     unit-testbar.
  slide-model.ts     parseDeck() — Frontmatter + ---Trenner → SlideDeck. Typen: Slide,
                     SlideDeck, DeckDirectives, Aspect.
  geometry.ts        geometryFor(aspect) → SlideGeometry {width, height}.
  infer-layout.ts    inferLayout(regions) → Layout-Key aus der Regionenzahl/-form einer Folie.
  layout/
    fit.ts           computeFit(measured, geo, minScale) → FitResult {scale, overflow}.
    compose.ts       COMPOSE_CENTER_THRESHOLD + shouldCenterCompose(...) — wann eine
                     Compose-Region zentriert statt oben ausgerichtet wird.
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
  deck-css.ts        Die API-Naht zum Fremd-CSS (VendorCss: katex, hljs je Schema) — der Host
                     reicht es herein, deck-core importiert keine .css-Datei selbst.
                     builtinThemeEntries(vendor) → ThemeEntry[] der fünf eingebauten Themes;
                     userThemeEntry(key, fileCss, vendor) → ThemeEntry aus einer Nutzer-.css;
                     deckCss(entry, customCss?) → vollständiges Deck-CSS (Mathe, Code, Struktur,
                     Layout, Theme, eigenes — in dieser Reihenfolge).
  llm/
    deck-prompt.ts        buildDeckPrompt(sourceBody, opts, contract) → ChatMessage[] — System+User-
                          Prompt, der eine Notiz in Deck-Markdown verwandelt (contractToPrompt ohne
                          Theme-Zeile — das Theme wird deterministisch gesetzt, nie vom Modell
                          gewählt). stripNoteFrontmatter() kappt die Notiz-eigene Frontmatter.
    deck-sanitize.ts      Nachbearbeitung generierter Deck-Markdown (Frontmatter-Range-Erkennung,
                          bare `<think>`-Reste kappen, …).
    deck-validate.ts      validateDeckOutput(md) → DeckValidation — parseDeck() + Warnings; fatal
                          nur bei leerer Ausgabe oder 0 Folien (fit-or-warn, sonst nie blockierend).
  presets/
    index.ts        Preset-Typ + PRESETS-Registry; presetFor() (total); presetTokensCss();
                    assembleDeckCss().
    kairo.ts · kurenai.ts · kuro.ts · shiro.ts · sumi.ts   je ein Preset (Token-Block + hljs/mermaid).
    crimson.ts         die Crimson-Familie (4 Modi) aus dem Marp-Import — Ebene A: Farben,
                       Fonts, Atmosphäre. Keine Skala/Spacing (die ist global, s. _marp-shared).
    _marp-shared.ts    marpAtmosphere() + der normalisierte Marp-Token-Vorrat. MARP_SCALE_TOKENS
                       und MARP_PAD sind bewusst NICHT verdrahtet — Vorrat fürs Ebene-B-Projekt.
    structure.css.ts  geteiltes, theme-unabhängiges Struktur-CSS (var(--sd-*); kein --sd-base).
    layouts.css.ts    LAYOUTS/layoutFor() + geteiltes Layout-CSS (.sd-layout-*, .sd-region).

src/vendor/deck-core/dom/    Ebenfalls vendoriert aus `deck-core` — importiert DOM, aber kein
                     Obsidian (eigenes Realm-Invariant, s. u.).
  host-document.ts   HostDocument/HostWindow — der Port, den die DOM-Ebene vom Host verlangt
                     (createElement, body, defaultView, fonts, querySelectorAll, importNode).
                     Ein echtes Document erfüllt ihn strukturell; er hält den Kern host-agnostisch
                     und hält zugleich obsidianmd/prefer-create-el von ihm fern.
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

src/               Obsidian-Adapter-Schicht — importiert obsidian / DOM.
  main.ts            Plugin-Entry: Commands (open-preview, export-pdf, export-images),
                     SettingTab, View-Registration, Sprach-Detektion.
  adapter.ts         loadActiveDeck(app, defaults) — liest die aktive Notiz, löst Embeds
                     zu data-URLs auf (resolveEmbed-Closure), gibt SlideDeck zurück.
  folder-hide.ts     normalizeFolder(raw) — kanonische Pfadform; buildHideCss(folder, hide) —
                     CSS, das einen Vault-Ordner im Datei-Explorer ausblendet (vault-rag-Muster,
                     data-path-Attribut, activeDocument.adoptedStyleSheets in main.applyFolderHide()).
  llm/
                          (die frühere error-envelope.ts ist seit dem Kit-0.27.0-Vendoring
                          `src/vendor/kit/error_body.ts` → errorMessageFromText, beide
                          Aufrufstellen in llm-client.ts mit `bodyMayBeSuccess: true`.)
    model-info.ts         Re-Export von Kits parseLmStudioContext/parseOllamaContext/ModelContext
                          (model-context.ts) + eigene estimateTokens(chars), contextOverflow(...).
    ai-settings-model.ts  Pure Zustandslogik der KI-Settings: applyEndpointEdit,
                          activeIndexFromStatuses, modelFieldMode, initialModelSelection (+ Typ
                          ModelSelection — hält einen serverseitig nicht mehr gelisteten,
                          gespeicherten Modellwert als Extra-Option statt ihn stumm zu verlieren),
                          thinkToggleView, effectiveSuppress, statusKindKey/warnRuleKey.
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
                     endpointListStrings (Übersetzungs-Adapter für den vendorierten Kit-Zeilen-
                     Editor buildEndpointList — das Kit formuliert nicht, jeder Text kommt von
                     hier durch t()),
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

**Invariante:** `src/vendor/deck-core/pure/**` darf niemals `obsidian` importieren.
Ein purity-Check-Skript (`scripts/check-core-purity.mjs`) erzwingt das als Teil von
`npm test` — es walkt `src/vendor/deck-core/pure` **und** `src/vendor/kit`.

**Realm-Invariante:** `src/vendor/deck-core/dom/render-dom.ts` darf keine
Obsidian-DOM-Augmentierungen verwenden (`createDiv`/`createEl`/`createSpan`/`empty`/
`addClass`/`removeClass`/`setText`/`setAttr`). Das Gate dafür lebt seit Task 9 in
`deck-core` selbst, nicht mehr hier — `scripts/check-render-realm.mjs` gibt es in
diesem Repo nicht mehr, und `npm test` ruft es nicht auf.

**md2pdf-Seed:** Die Architektur ist bewusst so aufgebaut, dass `src/vendor/deck-core/pure/**`
+ ein CLI-Adapter in einem zukünftigen `md2pdf`-Tool wiederverwendet werden kann, ohne die
Obsidian-Schicht zu benötigen.

## Der Folienkern liegt nicht mehr hier

`src/core/` gibt es seit 2026-08-03 nicht mehr. Modell, Renderer, Themes, Layout
und der Deck-Prompt leben in [`deck-core`](https://git.jkaindl.de/jkaindl/deck-core)
und liegen hier als gepinnte Kopie unter `src/vendor/deck-core/`.

**Dort nicht bearbeiten.** Änderungen gehören nach `deck-core`, danach neu
vendorieren und `VENDOR.json` (`version`, `sha`, `vendored`) nachziehen.

⚠️ **Beim Auflösen eines deck-core-Tags immer `<tag>^{}` nehmen, nie den Tag allein.**
Die Tags dort sind gemischt — `git rev-parse 0.10.0` liefert bei einem **annotated** Tag das
Tag-Objekt statt des Commits, und der landet dann falsch in `VENDOR.json`. Gemessen am
2026-09-05: 0.7.0/0.8.0 sind lightweight, 0.5.0/0.9.0/0.10.0 annotated. `rev-parse` ohne
`^{}` stimmt also meistens — was die Falle stellt, weil der Fehler erst auftritt, wenn man
ihn für ausgeschlossen hält. `git archive <tag>` löst dagegen von sich aus korrekt auf. Der Abgleich
Kopie-gegen-Quelle ist bislang **Handarbeit** — `drift-audit` deckt nur
Kit-Doppelungen zwischen den Plugin-Repos ab; `deck-core` liegt außerhalb seines
Wirkungskreises.

Was hier blieb, kennt Obsidian, das Kit oder den Endpunkt: `adapter`,
`theme-registry`, `export`, `main`, die Ansichten, die Einstellungen, `llm-client`,
`folder-hide`, `llm/ai-settings-model`, `llm/model-info`.

Dazu `vendor-css.ts`: die vier `import … from "*.css"`, die `deck-core` bewusst
nicht selbst macht — ein CSS-Import ist eine Annahme über den Bundler.

Der Grund für die Trennung ist die Lizenz, nicht die Größe: derselbe Kern soll ein
AGPL-Plugin, eine AGPL-Pipeline und eine spätere Store-App bedienen, deren
Bedingungen mit der AGPL unvereinbar sind.

## Commands

```bash
npm install                       # Deps installieren
npm run dev                       # esbuild watch (Entwicklung)
npm run build                     # tsc --noEmit + esbuild prod → main.js
npm run deploy                    # build + nach $OBSIDIAN_PLUGIN_DIR kopieren
npm run lint                      # inline-disable-Gate + eslint src (reproduziert Community-Review-Checks)
npm test                          # check-no-abs-paths + Core-Purity-Check + bundle-smoke (every-theme deckCss) + vitest run
npm run typecheck                 # tsc --noEmit (separat von vitest)
npm run version-bump              # Version bumpen (package.json/manifest.json/versions.json synct)
npm run visual-smoke              # Deck headless rendern -> _visual/<theme>.png (Default: demo-deck)
npm run shots                     # README-Bilder: Folien headless in Chrome, OHNE Obsidian
npm run shots:obsidian            # README-Bilder, die Obsidians Oberflaeche zeigen (CDP)
npm run shots:check               # Vertrag <-> Dateien <-> README-Einbettungen abgleichen
npm run smoke:gui                 # Checkliste aus docs/SMOKE.md gegen ein LAUFENDES Obsidian
```

**README-Bilder:** Der Aufnahme-Vertrag steht in `docs/images/README.md` — was jedes Bild
zeigen muss, beide Aufnahme-Wege, zehn dokumentierte Fallen und die Befunde am Pruefling.
Die Trennung folgt der Pure-Core-Naht: Folien entstehen in `deck-core`, also braucht ihre
Aufnahme kein Obsidian; nur Vorschau-Pane, Overflow-Warnung und Einstellungen brauchen es.
`shots:obsidian` setzt `$STAGING_VAULTS_DIR` und ein mit `--remote-debugging-port=9222`
gestartetes Obsidian voraus.

**GUI-Smoke (CORE-TEST-02 b):** `scripts/gui-smoke.ts` faehrt zweiundzwanzig Pruefpunkte per CDP gegen
ein laufendes Obsidian — die Naht, die `vitest` mit `environment: "node"` strukturell nicht
sieht: iframe-Isolation, Schrift-Metriken, Explorer-Markup, Bilder-Export. Checkliste,
Hand-Runde und Durchlauf-Vermerke in `docs/SMOKE.md`; die CDP-Bruecke kommt aus
`tools/obsidian-cdp/` (nicht vendoriert). Vault ist der Staging-Vault aus demselben Fixture wie
die README-Bilder (`npm run shots:obsidian -- --setup`), nie der Arbeitsvault — `requireEigenerBuild`
prueft vor dem ersten Punkt per sha1, dass der Lauf ueberhaupt gegen den Repo-Stand geht.
**Ein gruener Lauf zaehlt erst nach einer Gegenprobe:** die erste hier hat einen Fehler im
Treiber aufgedeckt, nicht im Plugin (`\b` gegen zusammengeklebtes `textContent`, s. `docs/SMOKE.md`).
Die zweite Runde ebenso: B4 war rot, weil auf dem Rechner ein LLM-Server antwortete und das
Modellfeld deshalb ein Dropdown ohne Placeholder war — **ein Pruefpunkt stellt seinen Gegenstand
selbst her** (Endpunkt auf toten Port), statt ihn von der Umgebung zu erwarten. Der Pruefling fuer
Warn-Schwere und Modifier-Export ist `docs/themes/regression-deck.md`, zur Laufzeit in den Vault
geschrieben, nicht als zweite Kopie im Fixture.
**Abschnitt M misst seit dem 2026-09-05 je zwei Faelle in EINEM Punkt** (M3 `sd-mermaid-var` am
geschriebenen PNG, M4 `sender:`, M5 `sd-modifiers`) — weil der Theme-Wechsel dazwischen ueber
`modify` laeuft und `modify` die Neuregistrierung NICHT ausloest. Ohne `refreshThemes()` misst
der zweite Fall das Theme des ersten und ist gruen, ohne seinen Gegenstand gesehen zu haben.
**Zwei verschiedene Zahlen im Protokoll sind deshalb der Beleg, dass gemessen wurde** —
identische waeren der stille Fehlschlag, egal welches Vorzeichen sie tragen.

**Regressions-Deck:** `docs/themes/regression-deck.md` ist kein Demo, sondern ein Prüfling —
jede seiner fünf Folien hat einen Defekt ausgelöst, der in `deck-core` 0.5.0 behoben wurde
(Bild in Spalten unbegrenzt, eigener Layoutname als Fehlalarm, verworfener Modifier). Aufnahme
mit `node scripts/visual-smoke.mjs docs/themes/regression-deck.md shiro`. Die Bilder stecken
als `data:`-URI darin, damit er ohne Vault und ohne Netz läuft — **SVG geht dafür nicht**,
markdown-its `validateLink` lässt von `data:` nur gif/png/jpeg/webp durch und rendert ein
`data:image/svg+xml` als Literaltext. Wer die Klassen statt der Pixel prüfen will, nimmt
Chromes `--dump-dom` gegen denselben Entry (`scripts/visual-smoke-entry.ts`).

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
  schlägt fehl, wenn `src/vendor/deck-core/pure/**` oder `src/vendor/kit/**` einen
  `obsidian`-Import enthält.
- **Der Store-Scanner ist `eslint-plugin-obsidianmd` — er muss aktuell gehalten werden.** Bis
  2026-08-10 stand hier `"latest"`, installiert war aber 0.3.0, während der Store 0.4.1 fuhr:
  `npm run lint` lief grün, während der Review `obsidianmd/prefer-create-el` meldete. Eine
  Store-Prüfung, die lokal blind ist, ist keine Prüfung — dieselbe Lehre wie bei den
  Inline-disables (0.3.1/0.6.1), nur eine Ebene tiefer. Jetzt auf `^0.4.1` gepinnt.
  **Sollzustand ist null — Warnungen zählen als Befund, nicht als Rauschen.** Bis 2026-08-12
  standen hier neun `prefer-create-el`-Warnungen als „erwarteter Reststand", begründet damit,
  dass Warnungen den Review nicht blockieren. Diese Schwelle ist zu niedrig: sie hat die
  Meldung über Monate zum Grundrauschen gemacht. Aufgelöst hat sie ein Port-Typ in
  `deck-core` 0.3.0 (`HostDocument` statt `Document`) — die Regel spricht jeden Empfänger
  vom Typ `Document` an, und die DOM-Ebene braucht davon nur sechs Member. Kein
  `eslint-disable`, keine Verhaltensänderung. Der Autofix des Scanners (`doc.win.createEl`)
  war nie gangbar: `.win` ist eine Obsidian-Augmentierung, und der Code rendert in fremde
  Realms. **Taucht eine neue Warnung auf, wird sie behoben, nicht dokumentiert** — und der
  Fix gehört nach `deck-core`, wenn die Fundstelle unter `src/vendor/` liegt.
- **Keine Inline-`eslint-disable` in `src/`:** `scripts/check-no-inline-disables.mjs` läuft als
  erster Schritt von `npm run lint`. Der Community-Store wertet ein Inline-disable einer
  `obsidianmd/*`-Regel als **Error** — egal wie gut begründet (0.3.1 und 0.6.1 waren beide reine
  Wartungs-Releases genau dafür). Wer eine Regel nicht erfüllen kann: entweder den Code auflösen,
  oder einen **file-scoped Override mit Begründung** in `eslint.config.mjs` eintragen — dort ist
  die Ausnahme sichtbar und reviewbar. Beides ist store-tauglich, das Inline-disable nicht.
- **Realm-Safety:** `src/vendor/deck-core/dom/render-dom.ts` darf keine Obsidian-DOM-
  Augmentierung (`createDiv`/`addClass`/etc.) verwenden — muss gegen jedes Realm (inkl.
  iframe-contentDocument) lauffähig sein. Das Gate dafür läuft seit Task 9 in `deck-core`
  selbst; hier gibt es kein `scripts/check-render-realm.mjs` mehr, und `npm test` prüft es
  nicht.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien
  stagen.** Trailer bei substanziellem AI-Beitrag:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n:** nutzersichtbare Strings via `t()` aus `i18n.ts` (EN kanonisch, EN/DE nach
  App-Sprache). Keine Literal-UI-Strings in `main.ts`/`preview-view.ts`.
- **Workspace-Standards:** PROF-OBS-03 (pure core), PROF-OBS-07 (i18n), CORE-META-01 (README),
  CORE-AGENT-01 (AGENTS.md).

## Gotchas

**BEHOBEN (2026-08-28, ursprünglich gemessen 2026-08-16): die Statusklasse `unauthorized`
fehlte im Wörterbuch.** Der vendorte `endpoint_diagnostics.ts` kennt sie (Kit 0.24.0), dieses
Repo führt die Endpunkt-Statusklassen aber selbst über `t()` — und dort fehlte der Schlüssel.
`t()` fällt bei unbekanntem Schlüssel auf den **Schlüssel** zurück, nicht auf EN: in der
Oberfläche stand ``deck.settings.endpoint.status.unauthorized`` und sah aus wie ein
plausibler String, nicht wie ein Fehler. Getroffen wurde ausgerechnet der Fall, für den die
Klasse eingeführt wurde — ein gehosteter Endpunkt mit fehlendem oder falschem API-Schlüssel
(401/403).

**Fix (zwei Zeilen + ein Wächter):** Schlüssel ``deck.settings.endpoint.status.unauthorized``
in EN **und** DE ergänzt (PROF-OBS-07), dazu den Vollständigkeits-`Record<EndpointStatusKind, true>`
in `tests/i18n.test.ts` selbst vervollständigt — der war ebenfalls nicht total (fehlte
`unauthorized`) und `typecheck:test` lief bis dahin **gar nicht**: `tsconfig.test.json` lag
im Repo, aber kein Script rief es auf. Jetzt `"typecheck:test": "tsc -p tsconfig.test.json
--noEmit"` in `package.json`, eingehängt in `npm run gate` — der Wächter bricht künftig
tatsächlich, sobald das nächste Kit-Update eine weitere Klasse mitbringt. Referenz-
Implementierung: `obsidian-transmute/tests/i18n-status-keys.test.ts`. Verbindlich als
**CORE-TEST-04**. Gefunden beim Consumer-Sweep, nicht vom Gate — die Lehre bleibt: ein
Vollständigkeits-Record, den niemand typecheckt, ist keine Absicherung, sondern eine Notiz.

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
- **Theme-Registry:** Themes sind `ThemeEntry { key, label?, source, themeCss, hljs, katex, mermaid, mermaidVars?, mermaidPinned?, mermaidVarOverrides?, baseFontPx, overridesBuiltin? }`.
  `katex` ist Pflicht (vom Host hereingereichtes Fremd-CSS, s. `deck-css.ts` oben); `label`,
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
- **Der PNG-Export verliert eine CSS-Regel, die eine PREFIXLOSE Eigenschaft auf den
  UA-Default ihres Tags zurücksetzt.** `modern-screenshot` klont die Folie und schreibt
  berechnete Stile inline — aber nur die, die vom Default **abweichen** (`getDiffStyle`:
  `if (defaultStyle.get(name) === value && !priority) return`). Die `priority`-Hälfte greift
  nie: `getComputedStyle().getPropertyPriority()` liefert für berechnete Stile immer `""`,
  weil `!important` ein Merkmal der Kaskade ist und im Ergebnis nicht mehr existiert. Wer
  also im Theme gegen eine mitgeklonte Fremd-CSS anschreibt (Mermaid legt sein `<style>`
  **in** das SVG), darf den Default nicht als Korrekturwert nehmen: `opacity: 1 !important`
  wirkt in der Ansicht und **verschwindet im PNG**, `transform: none`, `filter: none` und
  `visibility: visible` genauso. Gleiche Bauart, gleiche Falle: `isolation`,
  `mix-blend-mode`, `clip-path`, `perspective`.
  Gemessen 2026-09-04 an einem Mermaid-`pie`: Ansicht `opacity: 1`, PNG exakt Alpha 0.70 —
  und mit `opacity: 0.99 !important` (kein Default) kommt derselbe Wert sauber durch, 525.266
  voll deckende Pixel gegen 0. **Der saubere Weg steht seit deck-core 0.7.0 bereit:**
  `/* sd-mermaid-var: pieOpacity 1 */` im Kopf der Theme-CSS — dann schreibt Mermaid den
  Wert gar nicht erst, und es gibt nichts zu überschreiben. `0.999` bleibt ein Workaround
  für alles, was keine Mermaid-Variable ist. Bewacht seit 2026-09-05 durch GUI-Smoke **M3**
  (am geschriebenen PNG, mit Gegenprobe im selben Punkt).
  ⚠️ **Zwei Präzisierungen, ohne die diese Regel zu breit warnt** (deck-core-Session
  2026-09-05, an `modern-screenshot@4.7.0/dist/index.mjs` **gelesen**, nicht am PNG belegt —
  dieselbe Beweislage wie die `includeStyleProperties`-Notiz):
  1. **Der Bezugswert ist der UA-Default des Tags, nicht der CSS-Initialwert.**
     `getDefaultStyle` (Z. 691) erzeugt *dasselbe Tag* in einem Sandbox-iframe ohne Host-CSS
     (`srcdoc` mit leerem `<body>`, Z. 672) und liest dessen berechneten Stil. Ein `<hr>`
     bekommt vom UA-Stylesheet einen Rahmen — `border: none` **weicht** dort also ab und wird
     geschrieben, obwohl `none` der Initialwert ist.
  2. **`applyTo` rettet Longhand-Familien über einen Prefix-Baum** (Z. 753–770).
     Eigenschaften mit `-` werden nach Prefix gruppiert; weicht **eine** Longhand ab, landen
     über `prefixs.push(prefix)` **alle** Geschwister der Gruppe im Ergebnis — auch die, die
     dem Default entsprechen. `border-*`, `background-*` und `font-*` sind dadurch weitgehend
     geschützt, solange ein Geschwister abweicht.

     Deshalb steht oben **prefixlos**: die kurzen Namen haben keine Familie, die sie rettet.
     Gegenprobe am eigenen Bestand (2026-09-05, 15 Dateien — alle `pure/presets/*.ts` inkl.
     Struktur-/Layout-CSS und der neun Themes, alle `dom/*.ts`, dazu `styles.css`): **keine
     ausführbare Regel dieser Art**. Der einzige Treffer eines breiteren Musters ist
     `.sd-slide hr { border: none }` in `structure.css.ts` — und der fällt aus **beiden**
     Gründen heraus.
  Volle Messung in der deck-core-Task „Export ≠ Ansicht“.
- **PDF via window.print (Desktop):** Der Desktop-PDF-Export druckt den isolierten iframe via
  `contentWindow.print()`. Obsidian-Themes, Browser-Erweiterungen und Systemdruck-Einstellungen
  können das Ergebnis beeinflussen. Die `@page`-CSS-Regel setzt die Seitengröße auf die
  Foliengröße.
- **Fit-or-warn — Overflow ist beabsichtigt:** Folien werden bei `minFontPx` gewarnt, nicht
  beschnitten. Das ist kein Bug — der Nutzer soll den Inhalt verdichten.
- **Mermaid-IDs müssen eindeutig sein:** `src/vendor/deck-core/dom/render-dom.ts` vergibt
  eindeutige IDs per Folie (`sd-mermaid-{slideIndex}-{blockIndex}`). Mermaid initialisiert
  sich global; doppelte IDs führen zu stummen Render-Fehlern.
- **`data.json`** — von Obsidian persistierte Plugin-Config — git-ignored, nie committen.
- **`main.js`** — Build-Artefakt — git-ignored, nie manuell editieren.
- **Deploy:** `npm run deploy` setzt `$OBSIDIAN_PLUGIN_DIR` voraus (Pfad zum Plugin-Ordner
  im Vault). Ohne diese Variable schlägt das Kommando explizit fehl.
- **Release-CI ist GitHub-only:** `.github/workflows/release.yml` läuft auf dem GitHub-Mirror
  (Forgejo ignoriert `.github/`). SemVer-Tag pushen → Mirror trägt ihn zu GitHub →
  Pipeline baut + attestiert + legt das GitHub-Release an. Das Forgejo-Release (kanonisch)
  bleibt manuell via Forgejo-API.
- **Kit-Vendoring:** `src/vendor/kit/**` sind **verbatim** Kopien aus `obsidian-kit/src/pure/`,
  `src/vendor/kit-obsidian/**` aus `obsidian-kit/src/obsidian/` (die importieren `obsidian` und
  würden das Purity-Gate reißen, läge sie unter `kit/`). Einzige erlaubte Abweichung vom
  Verbatim: in `kit-obsidian/` werden kit-interne `../pure/`-Importe auf `../kit/` umgeschrieben
  — mechanisch, bei jedem Re-Vendoring identisch zu wiederholen (dokumentiert im dortigen
  `VENDOR.json`). Sonst gilt: nie hier editieren, sondern vom gepinnten sha neu vendoren
  (das `VENDOR.json` des jeweiligen Ordners hält `version` + `sha` je Modul).
  Das Purity-Gate walkt `src/vendor/deck-core/pure` **und**
  `src/vendor/kit`; deshalb darf Core aus vendor importieren, ohne dass ein unpure
  gewordenes Kit-Modul still durchschlägt.
- **Der Endpunkt-Zeilen-Editor gehört dem Kit:** die Liste (URL · Schlüssel · Modell-Override
  je Zeile, Adder, Status-Icon, Rollenzeile, Presets) ist `buildEndpointList` aus
  `src/vendor/kit-obsidian/endpoint-list.ts` — hier steht nur noch der Strings-Adapter
  (`endpointListStrings` in `ai-settings-ui.ts`) und die Verdrahtung in `settings.ts`.
  Zwei Pflichten liegen dabei beim Consumer, und keine davon meldet sich, wenn sie fehlt:
  (1) **`hide()` muss `modelCache.clear()` rufen** — der Cache hält Promises und überlebt jeden
  Tab-Neuaufbau bewusst; ohne den Aufruf bleibt ein einmal als „nicht erreichbar" gemessener
  Endpunkt die ganze Sitzung lang so stehen. (2) `ENDPOINT_LIST_CSS` (Präfix `okit-`) lebt als
  Kopie in `styles.css` und muss bei jedem Re-Vendoring mitgezogen werden — das Kit liefert
  seine Regeln als exportierten String, nicht als `.css` (ein CSS-Import wäre eine Annahme
  über den Bundler).
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
  Gate: `scripts/check-no-abs-paths.mjs` (Teil von `npm test`).

## Abweichungen von der Leitkonvention

Stand: siehe `CHANGELOG.md` / `manifest.json` (dort steht die maßgebliche Version — hier bewusst
keine, damit dieser Block nicht durch Zeitablauf falsch wird). Bewusste, begründete Abweichungen
(comply-or-explain):

- **`authorUrl` zeigt auf GitHub, nicht auf `jkaindl.de`** (seit 2026-08-12). Der Store-Review
  prüft das Feld auf Erreichbarkeit und meldete wiederholt „Manifest URL field is not
  reachable" — die Domain war bei jeder Gegenprobe erreichbar (IPv4, IPv6, HEAD, `www`,
  extern, ohne Rate-Limit), der Befund also nicht reproduzierbar. Ursache blieb offen; sie
  ist auch nicht der Punkt. `authorUrl` ist eine **Verfügbarkeitszusage gegenüber einem
  fremden Prüfer**, und diese an den eigenen Server zu hängen riskiert sie bei jedem
  Neustart neu. Der Fehler kam mehrfach und wurde jedes Mal einzeln behoben — dieselbe
  Klasse Wiederholungsarbeit wie bei den Inline-disables (0.3.1/0.6.1), und dieselbe
  Antwort: die Ursache abstellen statt den Befund. **Nicht auf die eigene Domain
  zurückstellen**; sie steht ohnehin im Impressum und auf der Release-Seite.
- **`isDesktopOnly: false`** — das Plugin läuft auf Mobile. Alle Desktop-only-APIs sind
  bewacht: PDF-Export verzweigt auf `Platform.isDesktopApp` (Desktop: `contentWindow.print()`;
  Mobile: HTML-Datei schreiben + `openWithDefaultApp`); „Im Finder anzeigen" prüft
  `FileSystemAdapter` und fällt auf einen `Notice`-Fallback zurück.
- **PROF-OBS-06** — SettingTab nutzt `display()` (deklarative `getSettingDefinitions`-API ist
  Obsidian 1.13+). *Grund:* Recommendation, kein Blocker; minAppVersion bleibt 1.8.7. Eigener
  Upgrade-Zyklus.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `obsidian-plugins/` (dem Elternverzeichnis dieses Repos).
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
