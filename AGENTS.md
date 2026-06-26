# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.
Workspace-weite Standards (comply-or-explain): siehe [`../_docs/CONVENTIONS.md`](../_docs/CONVENTIONS.md).

**Profil:** `ts-node` · `obsidian-plugin`.

## Project character

**Projekt:** `slide-deck` (Plugin-id) — Obsidian-Plugin, das eine **Markdown-Notiz** in eine
**Folienpräsentation** verwandelt und diese als PDF oder PNG-Bilderserie exportiert.
Desktop-only, keine Cloud, keine externen Dienste. Autor: Johannes Kaindl.

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
  render-dom.ts      buildSelfContainedDeckHtml(doc, deck, resolveEmbed) — rendert alle
                     Folien im DOM, misst, fittet, sammelt Warnings, liefert slidesHtml[]+css.
                     renderMermaidSlots() — Mermaid SVG-Rendering (async, DOM-abhängig).
  preview-view.ts    SlideDeckView (ItemView, rechte Seitenleiste) — Live-Vorschau mit
                     Warn-Badges und Source-Jump-Link.
  export.ts          exportPdf() (window.print-Pipeline) + exportImages() (html2canvas → PNG
                     in den konfigurierten Anhang-Ordner). Beide bauen dasselbe self-contained HTML.
  dom-safe.ts        Popout-sichere DOM-Helfer (activeDocument, activeWindow).
  i18n.ts            t(key, ...args) · pickLang · setLang/getLang. EN kanonisch, DE übersetzt.
  settings.ts        SlideDeckSettings (defaultTheme, minFontPx, imageScale) + SettingTab.
```

**Invariante:** `src/core/**` darf niemals `obsidian` importieren. Ein purity-Check-Skript
(`scripts/check-core-purity.mjs`) erzwingt das als Teil von `npm test`.

**md2pdf-Seed:** Die Architektur ist bewusst so aufgebaut, dass `src/core/**` + ein
CLI-Adapter in einem zukünftigen `md2pdf`-Tool wiederverwendet werden kann, ohne die
Obsidian-Schicht zu benötigen.

## Commands

```bash
npm install                       # Deps installieren
npm run dev                       # esbuild watch (Entwicklung)
npm run build                     # tsc --noEmit + esbuild prod → main.js
npm run deploy                    # build + nach $OBSIDIAN_PLUGIN_DIR kopieren
npm run lint                      # eslint src (reproduziert Obsidian-Community-Review-Checks)
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
- **Tests:** vitest + happy-dom; Obsidian-Mock unter `tests/__mocks__/obsidian.ts`. Nach jeder
  Änderung müssen alle vitest-Tests grün bleiben. `npx tsc --noEmit` separat laufen
  (vitest ≠ tsc).
- **Core-Purity:** `scripts/check-core-purity.mjs` läuft als erster Schritt von `npm test` —
  schlägt fehl, wenn `src/core/**` einen `obsidian`-Import enthält.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien
  stagen.** Trailer bei substanziellem AI-Beitrag:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n:** nutzersichtbare Strings via `t()` aus `i18n.ts` (EN kanonisch, EN/DE nach
  App-Sprache). Keine Literal-UI-Strings in `main.ts`/`preview-view.ts`.
- **Workspace-Standards:** PROF-OBS-03 (pure core), PROF-OBS-07 (i18n), CORE-META-01 (README),
  CORE-AGENT-01 (AGENTS.md).

## Gotchas

- **Themes/Tokens-Invariante:** Themes setzen nur Tokens; Struktur/Layout-CSS ist theme-unantastbar (fit-kritisch). `--sd-base` lebt einzig in `presetTokensCss`.
- **html2canvas-Fidelität:** Der PNG-Export nutzt html2canvas 1.x. KaTeX-Mathematik und
  Mermaid-SVGs werden grundsätzlich erfasst, aber komplexe SVG-Funktionen (Gradients,
  Clipping Paths, bestimmte Fonts) können im Export abweichen. Bei Bedarf muss die
  Render-Pipeline auf eine Headless-Browser-Lösung (z.B. Puppeteer/Playwright) umgestellt
  werden — das ist als Phase-2-Arbeit markiert.
- **PDF via window.print:** Der PDF-Export injiziert selbst-enthaltenes HTML in den
  `activeDocument` und öffnet `window.print()`. Obsidian-Themes, Browser-Erweiterungen und
  Systemdruck-Einstellungen können das Ergebnis beeinflussen. Die `@page`-CSS-Regel setzt die
  Seitengröße auf die Foliengröße.
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

## Memory

- **Projekt-Memory:** `~/.claude/projects/-Users-Shared-code-markdown-presentation/memory/`
- **SDD-Artefakte:** `.superpowers/sdd/` — Spec, Plan, Task-Reports

## Abweichungen von der Leitkonvention

Stand 2026-06-25 — **vor erstem Release 0.1.0**. Bewusste, begründete Abweichungen
(comply-or-explain):

- **`isDesktopOnly: true`** — PDF-Export via `window.print()` und PNG-Export via html2canvas
  benötigen eine vollständige Browser-DOM-Umgebung. Obsidian Mobile hat dafür keine stabile API.
  Explizite Desktop-Einschränkung ist besser als stiller Fehler auf Mobile.
- **PROF-OBS-06** — SettingTab nutzt `display()` (deklarative `getSettingDefinitions`-API ist
  Obsidian 1.13+). *Grund:* Recommendation, kein Blocker; minAppVersion bleibt 1.8.7. Eigener
  Upgrade-Zyklus.
- **Kein Codeberg-`origin` / GitHub-Mirror** — Remotes noch nicht eingerichtet (pre-release).
  Einzurichten vor dem ersten Tag.
