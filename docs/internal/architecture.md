# Aufbau von slide-deck

Modul-Layout und Datenfluss. Der Kern (`AGENTS.md`) nennt nur die Trennlinie und die Invarianten; hier steht, was in welcher Datei liegt. Gotchas zu einzelnen Bereichen stehen als Pfadregeln unter `.claude/rules/`.

## Pure-Core ↔ Obsidian-Adapter-Naht

Der Kern (`src/vendor/deck-core/pure/**`) ist **vollständig obsidian-frei** und
Node-testbar ohne DOM-Mock — vendoriert aus `deck-core` (Grund und Grenze: `.claude/rules/deck-core.md`). `src/vendor/deck-core/dom/` importiert DOM, aber nie Obsidian; nur die Adapter-Schicht in `src/` importiert Obsidian-APIs:

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
    md2html.ts       renderMarkdown(input: RenderInput) → RenderedSlide (markdown-it + KaTeX +
                     highlight.js + Callout-Präprozessor + Mermaid-Slot).
    callouts.ts      calloutPlugin(md) — markdown-it-Plugin für barrierefreie Callouts (icon+label).
  constraints/
    contract.ts      getAuthoringContract(directives) · contractToPrompt(contract) — der Schreib-Vertrag für Autor und Modell.
    engine.ts        Constraint-Engine — collectWarnings(slide, renderWarnings, fit) · collectDeckWarnings(deck, registry) · WARNING_SEVERITY (totaler Record Warnungsart → Schwere).
  directives.ts     parseDirectives() — fence-aware Per-Folie-Direktiven (<!-- layout -->,
                    <!-- column -->) → { layout, regions, warnings }.
  theme-key.ts       keyFromFilename(filename) → Theme-Key (Dateiname ohne .css);
                     parseBaseFontPx(css) → baseFontPx-Token aus CSS.
  deck-css.ts        Die API-Naht zum Fremd-CSS (VendorCss: katex, hljs je Schema) — der Host
                     reicht es herein, deck-core importiert keine .css-Datei selbst.
                     builtinThemeEntries(vendor) → ThemeEntry[] der eingebauten Themes (die Presets in `presets/`);
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
    kairo.ts · kami.ts · kogane.ts · kurenai.ts · sumi.ts   je ein Preset (Token-Block + hljs/mermaid).
    crimson.ts         die Crimson-Familie (4 Modi) aus dem Marp-Import — Ebene A: Farben,
                       Fonts, Atmosphäre. Keine Skala/Spacing (die ist global, s. _marp-shared).
    _marp-shared.ts    marpAtmosphere() + der normalisierte Marp-Token-Vorrat. MARP_SCALE_TOKENS
                       und MARP_PAD sind bewusst NICHT verdrahtet — Vorrat fürs Ebene-B-Projekt.
    structure.css.ts  geteiltes, theme-unabhängiges Struktur-CSS (var(--sd-*); kein --sd-base).
    layouts.css.ts    LAYOUTS/layoutFor() + geteiltes Layout-CSS (.sd-layout-*, .sd-region).

src/vendor/deck-core/dom/    Ebenfalls vendoriert aus `deck-core` — importiert DOM, aber kein
                     Obsidian (Realm-Invariante: `.claude/rules/export-und-iframe.md`).
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
  render-dom.ts      buildIsolatedDeck(ownerDoc, deck, resolveEmbed, registry, customCss?) — rendert und
                     misst im Off-Screen-Staging-iframe (theme-isoliert), serialisiert
                     {slidesHtml, css, warnings}. renderDeckToContainer() ist realm-sicher
                     (ausschließlich native DOM: doc.createElement/classList/replaceChildren, keine
                     Obsidian-Augmentierungen) und zweiphasig (alle Folien bauen → fonts.ready →
                     alle messen). renderMermaidSlots() — Mermaid SVG-Rendering (async, DOM-abhängig).

src/               Obsidian-Adapter-Schicht — importiert obsidian / DOM.
  main.ts            Plugin-Entry: Commands (open-preview, export-pdf, export-images,
                     insert-image-slot), SettingTab, View-Registration, Sprach-Detektion.
                     runSlot() ist die Bildplatz-Laufzeit (s. image/ unten): liest die
                     Nachbar-API, ruft generate()/save() auf und schreibt über
                     replaceSlot() zurück — die einzige Stelle, die den Vault mutiert.
  adapter.ts         loadActiveDeck(app, defaults) — liest die aktive Notiz, löst Embeds
                     zu data-URLs auf (resolveEmbed-Closure), gibt SlideDeck zurück.
  image/             Bildplätze — ein ```slide-image-Block, der sich selbst durch ein Embed
                     ersetzt. Redet mit `local-image-generator`, kennt es aber nur über die
                     Vertragsform (image-api.ts), nie per Import — das Nachbarplugin darf fehlen.
    image-api.ts       readImageApi(app) liest `plugins.plugins["local-image-generator"].api`,
                       prüft Form UND `apiVersion` (Muster: koda-agent/retrieval.ts). `recheck()`
                       ist optional erst ab LIG 0.10.0 — s. `.claude/rules/bildplaetze.md`. ensureReady(api) holt
                       `status()` (netzfrei, synchron) und ruft `recheck()` nur nach, wenn der
                       Grund `unreachable` ist — ein veralteter Serverzustand ist der einzige
                       Fall, den ein Netzaufruf heilen kann.
    slot-format.ts     parseSlot(body) — die Feld-Grammatik des Blockinhalts (führende
                       `schluessel: wert`-Zeilen, erste Nicht-Kopfzeile beginnt den Prompt).
                       filledMarkdown() baut den gefüllten Zustand (Prompt-Kommentar + Embed,
                       einzeilig). replaceSlot() ersetzt über Textidentität — s. `.claude/rules/bildplaetze.md`.
    functions.ts       IMAGE_FUNCTIONS (sechs Bildfunktionen, englische IDs) + DEFAULT_SUFFIXES/
                       DEFAULT_NEGATIVES als Prompt-Bausteine. composePrompt() hängt kommasepariert
                       ohne Dubletten an (dieselbe Grammatik wie LIGs Stil-Presets, geteilt ist
                       der Trenner, nicht der Code). buildRequest() lässt den Negativ-Prompt weg,
                       wenn `capabilities.negativePrompt` fehlt — ein wirkungsloses Feld wäre eine
                       Attrappe.
    insert-slot.ts     insertImageSlot() — Command `insert-image-slot`: SuggestModal über die
                       sechs Funktionen, fügt den Block-Snippet ein und setzt den Cursor in die
                       leere Prompt-Zeile.
    slot-card-model.ts cardVm(block, state) — reine Zustand→Ansicht-Abbildung (CardState:
                       idle/unavailable/blocked/running/error/done) nach der §8-Status-Vokabel
                       (is-checking/is-ok/is-error, nur diese drei).
    slot-card.ts       registerSlotCard() — MarkdownCodeBlockProcessor für `slide-image`.
                       paintSlotStatus() ist ein EIGENER Maler derselben Vokabel, bewusst nicht
                       `paintStatus` aus ai-settings-ui: ein Bildlauf ist kein Endpunkt, geteilt
                       wird die Sprache, nicht die Funktion.
  llm/
    model-info.ts         Re-Export von Kits effectiveContext/ModelContext (model-context.ts) + eigene estimateTokens(chars), contextOverflow(...). Der Abruf der Kontextlänge selbst ist `fetchEndpointContext` (obsidian-kit, in `generate-deck-view.ts` direkt gerufen).
    ai-settings-model.ts  Pure Zustandslogik des Modell-Felds: modelFieldMode, initialModelSelection (+ Typ ModelSelection — hält einen serverseitig nicht mehr gelisteten, gespeicherten Modellwert als Extra-Option statt ihn stumm zu verlieren). Statustexte gibt es hier nicht mehr (Kit: `endpointStatusText`).
  preview-view.ts    PreviewPanel (HubPanel im `SlideDeckHubView`, rechte Seitenleiste) — Live-Vorschau mit
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
  deck-second-pass.ts  secondPassDeck(markdown, {parseHtml, neutralizeSlide?}) — zweite Schicht fuer ERZEUGTE Decks
                     (generate-deck.ts, nach der Regex-Schicht): je Folie (Grenzen aus parseDeck) und je REGION
                     wie die Vorschau rendern (renderMarkdown, einzeln geparst in einem inerten Dokument), dann
                     neutralizeRemoteResourcesInTree (code-kit web/remote-resources). Ein `.sd-mermaid`-Slot, dessen
                     Quelltext das Kit (`mermaidLoadsRemote`, code-kit safe-markdown) als ladend einstuft, gilt als Fund
                     (Mermaid laedt ausserhalb jedes Baums). Seit 0.20.0 faengt die erste Schicht dieselben Fences schon
                     selbst ab; der Mermaid-Zweig hier ist Tiefenverteidigung.
                     Fund → NUR diese Folie wird mit neutralizeModelMarkdown Text; bleibt einer → `kind: "remote"`,
                     nichts wird geschrieben, kein Retry. Variante A (Johannes 2026-10-10): nur Modell-Ausgabe beim
                     Erzeugen, keine CSP im Vorschau-iframe, kein Eingriff in deck-core. Der Fund traegt nie die
                     Quelle (kann ein wiederhergestelltes Geheimnis sein). ⚠ happy-dom kennt die Textmodi von
                     `<textarea>`/`<xmp>` nicht und parst SVG-`<style>` anders (code-kit `happy-dom-blind.json`):
                     was Chromium anders sieht, misst der GUI-Smoke (V9–V13), nicht vitest.
  llm/request-params.ts  MODE (creative) · loadRequestSettings (Legacy-Migration
                     llmSuppressThinking → Stufe, llmTemperature → Überschreibung unter "unknown"). Kein obsidian-Import.
  llm/connection.ts  deckConnectionOptions(): die Optionen für createLlmConnection — Zuordnung der Settings-Felder
                     (llmEndpoints/choice/request) und synchrones persist. Request-Bau, Texte der Abweichungen
                     und Backend-Erkennung kommen aus dem Kit (tests/connection.test.ts: goldene Requests).
  ai-settings-ui.ts  Render der KI-Settings-Bausteine (UI-STANDARD §8): paintStatus (gemeinsame
                     Status-Icon-Vokabel — Form + Farbe + State-Klasse + aria-label, WCAG 1.4.1),
                     renderThinkingTestRow (Knopf + Live-Suppress-Test via
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

Weitere Module in `src/`, die das Layout oben nicht einzeln führt:

```
  hub-view.ts        Sidebar-Hub der beiden Panels Vorschau und Erzeugen (UI-STANDARD §8, Kit-Baustein `buildHubInto`); `VIEW_TYPE_HUB`.
  generate-deck.ts   Ablauf der Deck-Erzeugung aus einer Notiz (Prompt, Strom, Nachbearbeitung, Validierung, Wiederholung); nimmt einen `DeckClient`.
  generate-deck-view.ts  Panel „Erzeugen“ (GeneratePanel): Quelle, Modell, Kontextlänge, Strom, Übernehmen.
  llm-client.ts      Adapter zwischen der Kit-Verbindung (`plugin.llm`) und dem Deck-Ablauf: `deckClient(llm, model)`, `deckResultOf`.
\1  (weitere, im Layout oben nicht einzeln geführte Dateien im vendorten Kern: `dom/theme-tokens.ts` (mermaidVarsFromDocument), `pure/render/hljs.ts`, `parseThemeMeta`/`THEME_ALIASES` in `pure/theme-key.ts`; `settings.ts` trägt außerdem `customCss`, `exportFolder` und die LLM-Felder)\n```

## Obsidian-Commands

| Command-ID | Name (EN) |
|---|---|
| `open-preview` | Open presentation preview |
| `export-pdf` | Export presentation to PDF |
| `export-images` | Export presentation to image series |
\1\n| `generate-deck` | Generate presentation from note |

## md2pdf-Seed

**md2pdf-Seed:** Die Architektur ist bewusst so aufgebaut, dass `src/vendor/deck-core/pure/**`
+ ein CLI-Adapter in einem zukünftigen `md2pdf`-Tool wiederverwendet werden kann, ohne die
Obsidian-Schicht zu benötigen.
