# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, `../../workspace/_docs` relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

**Profil:** `ts-node` · `obsidian-plugin`.

## Project character

**Projekt:** `slide-deck` (Plugin-id) — Obsidian-Plugin, das eine **Markdown-Notiz** in eine
**Folienpräsentation** verwandelt und diese als PDF oder PNG-Bilderserie exportiert.
Desktop und Mobile; die Folien entstehen lokal, nur das optionale Erzeugen eines Decks (Panel „Erzeugen“) spricht einen konfigurierbaren LLM-Endpunkt an. Autor: Johannes Kaindl.

Das Warum und die Herkunft: `docs/internal/decisions.md`.

- **Fit-or-warn statt clip:** Folien, die zu viel Inhalt für den Canvas haben, werden bis zur
  Lesbarkeits-Untergrenze (`minFontPx`) skaliert — unterschreitet der Bedarf diese Grenze,
  wird die Folie gewarnt, nicht stumm beschnitten. Der Autor soll den Inhalt selbst verdichten.
- **Feste Geometrie:** Der Canvas ist immer 1280×720 (16:9) oder 960×720 (4:3) px — nicht
  flüssig. Das vereinfacht den Export (keine Viewport-Abhängigkeit).

## Architecture principles

**Pure-Core ↔ Obsidian-Adapter-Naht.** Der Kern (`src/vendor/deck-core/pure/**`) ist vollständig obsidian-frei und Node-testbar ohne DOM-Mock; er ist aus `deck-core` vendoriert. `src/vendor/deck-core/dom/` importiert DOM, aber nie Obsidian; nur die Adapter-Schicht in `src/` importiert Obsidian-APIs. Das Modul-Layout: `docs/internal/architecture.md`.

**Invariante:** `src/vendor/deck-core/pure/**` darf niemals `obsidian` importieren.
Ein purity-Check-Skript (`scripts/check-core-purity.mjs`) erzwingt das als Teil von `npm test`; es walkt auch `src/vendor/deck-core/dom` und `src/vendor/kit` (Regeln je Wurzel: `.claude/rules/deck-core.md`).

**Realm-Invariante:** `src/vendor/deck-core/dom/render-dom.ts` darf keine Obsidian-DOM-Augmentierungen verwenden (`createDiv`/`createEl`/`createSpan`/`empty`/`addClass`/`removeClass`/`setText`/`setAttr`); Begründung in `.claude/rules/export-und-iframe.md`.

**Der Folienkern liegt nicht mehr hier.** Modell, Renderer, Themes, Layout und der Deck-Prompt leben in [`deck-core`](https://git.jkaindl.de/jkaindl/deck-core) und liegen als gepinnte Kopie unter `src/vendor/deck-core/`. **Dort nicht bearbeiten:** Änderungen gehören nach `deck-core`, danach neu vendorieren und `VENDOR.json` (`version`, `sha`, `vendored`) nachziehen; die Fallen dabei (annotated Tags, `^{}`) stehen in `.claude/rules/deck-core.md`.

## Commands

```bash
npm install                       # Deps installieren
npm run dev                       # esbuild watch (Entwicklung)
npm run build                     # tsc --noEmit + esbuild prod → main.js
npm run deploy                    # build + nach $OBSIDIAN_PLUGIN_DIR kopieren
npm run lint                      # inline-disable-Gate + eslint src (reproduziert Community-Review-Checks)
npm test                          # check-no-abs-paths + check-no-nul-bytes + Core-Purity-Check + bundle-smoke (every-theme deckCss) + vitest run
npm run gate                      # typecheck + typecheck:test + typecheck:scripts + test + lint + build (die Abnahme-Schleife)
npm run typecheck                 # tsc --noEmit (separat von vitest)
npm run version-bump              # Version bumpen (package.json/manifest.json/versions.json synct)
npm run visual-smoke              # Deck headless rendern -> _visual/<theme>.png (Default: demo-deck)
npm run shots                     # README-Bilder: Folien headless in Chrome, OHNE Obsidian
npm run shots:obsidian -- --port <port>   # README-Bilder, die Obsidians Oberflaeche zeigen (CDP, Zweitinstanz)
npm run shots:check               # Vertrag <-> Dateien <-> README-Einbettungen abgleichen
npm run smoke:gui -- --port <port>        # Checkliste aus docs/SMOKE.md gegen eine LAUFENDE Zweitinstanz (Port Pflicht)
```

README-Bilder und GUI-Smoke: Aufnahme-Vertrag in `docs/images/README.md`, Checkliste in `docs/SMOKE.md`, Fallen in `.claude/rules/gui-smoke.md`.

## Conventions

- **TS strict + `noImplicitAny`** — keine `any`-Casts für neue Typen.
- **Tests:** vitest läuft mit `environment: "node"` — **kein DOM, kein happy-dom**.
  Obsidian-Mock für reine Logik-Tests: `tests/__mocks__/obsidian.ts` re-exportiert das gevendorte Kit-Mock (`tests/vendor/kit/obsidian-mock.ts`), `tests/setup.ts` stellt `window` über `installWindowTimers({ full: true })` bereit.
  DOM/iframe/Layout-Verhalten wird durch `bundle-smoke.mjs` und den GUI-Smoke (`docs/SMOKE.md`) abgedeckt.
  Nach jeder Änderung müssen alle vitest-Tests grün bleiben. `npx tsc --noEmit` separat laufen
  (vitest ≠ tsc).
- **Core-Purity:** `scripts/check-core-purity.mjs` läuft als erster Schritt von `npm test` —
  schlägt fehl, wenn `src/vendor/deck-core/**` oder `src/vendor/kit/**` einen `obsidian`-Import enthält.
- **Keine Inline-`eslint-disable` in `src/`:** `scripts/check-no-inline-disables.mjs` läuft als erster Schritt von `npm run lint`; der Community-Store wertet ein Inline-disable einer `obsidianmd/*`-Regel als **Error**. Sollzustand des Lints ist null Warnungen; die Fallen (Scanner-Pin, file-scoped Overrides): `.claude/rules/lint-store.md`.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien
  stagen.** Trailer bei substanziellem AI-Beitrag:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n:** nutzersichtbare Strings via `t()` aus `i18n.ts` (EN kanonisch, EN/DE nach
  App-Sprache). Keine Literal-UI-Strings in `main.ts`/`preview-view.ts`.
- **Workspace-Standards:** PROF-OBS-03 (pure core), PROF-OBS-07 (i18n), CORE-META-01 (README),
  CORE-AGENT-01 (AGENTS.md).

## Gotchas

- **Fit-or-warn — Overflow ist beabsichtigt:** Folien werden bei `minFontPx` gewarnt, nicht
  beschnitten. Das ist kein Bug — der Nutzer soll den Inhalt verdichten.
- **`data.json`** — von Obsidian persistierte Plugin-Config — git-ignored, nie committen.
- **`main.js`** — Build-Artefakt — git-ignored, nie manuell editieren.
- **Deploy:** `npm run deploy` setzt `$OBSIDIAN_PLUGIN_DIR` voraus (Pfad zum Plugin-Ordner
  im Vault). Ohne diese Variable schlägt das Kommando explizit fehl.
- **`isDesktopOnly: false`** — das Plugin läuft auf Mobile. Alle Desktop-only-APIs sind bewacht: PDF-Export verzweigt auf `Platform.isDesktopApp` (Desktop: `contentWindow.print()`; Mobile: HTML-Datei schreiben + `openWithDefaultApp`); „Im Finder anzeigen“ prüft `FileSystemAdapter` und fällt auf einen `Notice`-Fallback zurück.
- **Die Folie rendert in einem `sandbox="allow-same-origin"`-iframe,** darum gilt dort nur natives DOM, keine Obsidian-Augmentierung. Mehr: `.claude/rules/export-und-iframe.md`.

## Context index

- Bevor du unter `src/vendor/` liest oder änderst, das Kit neu vendorst oder einen deck-core-Tag auflöst: `.claude/rules/deck-core.md`.
- Bevor du Theme-Registry, Theme-CSS, Warnungen oder `sd-modifiers` anfasst (`src/theme-*.ts`, `src/vendor/deck-core/pure/presets/`, `docs/themes/`): `.claude/rules/themes.md`.
- Bevor du den Export (`src/export.ts`), die Vorschau (`src/preview-view.ts`) oder `src/vendor/deck-core/dom/` änderst: `.claude/rules/export-und-iframe.md`.
- Bevor du die LLM-Verbindung, das Erzeugen eines Decks oder die Einstellungen (`src/llm/`, `src/llm-client.ts`, `src/generate-deck*.ts`, `src/settings.ts`) änderst: `.claude/rules/llm-verbindung.md`.
- Bevor du Bildplätze (`src/image/`, `runSlot()` in `src/main.ts`) änderst: `.claude/rules/bildplaetze.md`.
- Bevor du den GUI-Smoke fährst oder änderst oder README-Bilder aufnimmst: `.claude/rules/gui-smoke.md`, `docs/SMOKE.md`, `docs/images/README.md`, `../.claude/rules/gui-smoke-treiber.md`, `../.claude/rules/obsidian-instanz.md`, `../.claude/rules/cdp-lock.md`, `../.claude/rules/staging-vaults.md`, `../.claude/rules/readme-shots.md`, Skill `readme-shots`.
- Bevor du Lint-Konfiguration oder `eslint.config.mjs` änderst: `.claude/rules/lint-store.md`.
- Vor Änderungen an Modulstruktur oder Dateinamen: `docs/internal/architecture.md`.
- Bevor du eine Entscheidung „bewusst so“ übernimmst: `docs/internal/decisions.md`.
- Bevor du `styles.css` oder UI änderst: `../.claude/rules/store-css.md`, `../.claude/rules/ui-bausteine.md`, `../UI-STANDARD.md`.
- Vor einem Release oder einer Store-Einreichung: `../.claude/rules/release-und-store.md`, Skills `plugin-release-setup` und `store-rescan`.

## Memory

- **Projekt-Memory:** über die Memory-Bindung von claude-data (`10_Memory/_bindings`, Store `code/markdown-presentation`) — der Pfad unter `~/.claude/projects/` folgt dem Repo-Ort und ist kein fester Name
- **SDD-Artefakte (ab 2026-07-16):** **Cockpit**, nicht Repo — `$VAULT/25_Coding/markdown-presentation/_SDD/`
  (CORE-META-14). Specs/Plans tragen Arbeitskontext (Vault-Pfade, Schwester-Repo-Interna), der in
  einem public Repo niemandem nützt. Das Repo behält die Design-Essenz in dieser Datei + `CHANGELOG.md`.
  `.superpowers/sdd/` bleibt der git-ignorierte Scratch-Ort für laufende Ledger/Reports.
- **Nie im Repo:** absolute Pfade außerhalb des Repos (`/Users/…`, Vault-Pfade) — Platzhalter nutzen
  (`$VAULT/…`). Herkunftsnachweise als Repo-Name + `Datei:Zeile` (`// vault-rag pattern`) sind dagegen
  erwünscht: sie begründen Design-Entscheidungen.
  Gate: `scripts/check-no-abs-paths.mjs` (Teil von `npm test`).

## Abweichungen von der Leitkonvention

Keine.

## UI-Abweichungen

- **strings-location** — Grund: (UI-STANDARD §10 nennt `src/i18n/strings.ts` als Ablageort)
  Die Texte dieses Plugins liegen in `src/i18n.ts` (EN kanonisch, EN/DE); ein Umzug würde nur Dateipfade
  ändern, keinen Text und keine Auflösung von Fachbegriffen. Entscheidung Master Welle 14, 2026-09-30.
  — gilt-solange: `src/i18n.ts` die einzige Textquelle des Plugins ist

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `obsidian-plugins/` (dem Elternverzeichnis dieses Repos).
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).
