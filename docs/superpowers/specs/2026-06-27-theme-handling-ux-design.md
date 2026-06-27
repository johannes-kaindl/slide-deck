# Theme-Handling-UX — Design Spec

- **Status:** Approved (design) — pending plan
- **Datum:** 2026-06-27
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `feat/theme-handling-ux`
- **Baut auf:** iframe-Isolation (auf `main`, Tag `0.1.0`) · [`2026-06-27-iframe-isolation-design.md`](2026-06-27-iframe-isolation-design.md) · CSS-Layouting · [`2026-06-26-css-layouting-design.md`](2026-06-26-css-layouting-design.md)
- **Grounding:** 5-Explorer-Parallel-Map des aktuellen Theme-Handlings + adversariale Synthese (alle Architektur-Claims mit `file:line` belegt, Anhang A). Folder-Hide-/Open-Muster aus `../vault-rag` verifiziert übernommen (Anhang B).

---

## 1. Zusammenfassung

Themes **funktionieren** (4 Built-ins, voller Token-/CSS-Stack, theme-isoliert via iframe), aber das **Bedien-Modell** ist eine Falle. Heute:

1. **Die Dropdown-Falle.** Das Settings-`defaultTheme`-Dropdown (`settings.ts:22`) ist von der eigentlichen Source-of-Truth — dem Frontmatter `theme:` der Notiz — **abgekoppelt**. `parseDeck` setzt zuerst den Settings-Default als Basis (`slide-model.ts:33`), dann überschreibt `parseFrontmatter` jeden vorhandenen `theme:`-Key **bedingungslos** (`slide-model.ts:22`). Folge: hat eine Notiz `theme: default`, ist das Dropdown wirkungslos — **ohne jeden UI-Hinweis**. (Ein *unbekanntes* Theme warnt dagegen bereits via `collectDeckWarnings` → `theme-unknown`, `engine.ts:16-17` — das ist kein Problem; die stille Falle ist nur der Fall eines *gültigen* überschreibenden Frontmatter-Werts.)
2. **Kein Live-Switch.** Das Theme zu wechseln heißt heute: Notiz-Frontmatter editieren **oder** Settings-Default ändern (der dann doch vom Frontmatter überstimmt wird) — plus manueller Refresh (`preview-view.ts:61`, kein Auto-Update). Es gibt keinen Weg, im Preview ein Theme „anzuprobieren".
3. **Nur ein globales Custom-CSS.** `customCss` ist eine einzige globale Settings-Textarea (`settings.ts:6,35`), paste-only. Es gibt **keine** benannten User-Themes, **kein** Import/Export, **keinen** Schreibzugriff aufs Frontmatter (das Plugin schreibt heute nur PNGs, `export.ts:43`).

Diese Iteration baut das **Bedien-Modell** um — die Render-/Isolations-Pipeline (iframe, fit-or-warn, feste Geometrie) bleibt unangetastet. Drei verschränkte Teile, **ein** Spec:

- **A — Falle heilen durch Sichtbarkeit:** Das Preview zeigt das *tatsächlich aktive* Theme **und seine Quelle** (Frontmatter vs. Standard). Die Precedence bleibt; sie wird nur sichtbar.
- **B — Live-Switch + bewusster Commit:** Ein Theme-Dropdown in der Preview-Toolbar schaltet **ephemer** um (Anprobe, kein Schreiben); ein expliziter `✓ Setzen`-Button schreibt `theme:` surgical via `processFrontMatter` ins Frontmatter.
- **C — Benannte User-Themes + Import/Export:** Eine **Theme-Registry** = Built-ins (compile-time, unkaputtbar) **+** User-Themes aus einem Vault-Ordner (`.css`-Dateien, auto-entdeckt). Import = Datei in den Ordner droppen (Settings-Button „Open in Finder"); Export = ein Theme als anpassbare `.css` rausschreiben. Ordner optional aus dem Datei-Explorer ausblendbar.

> **Leitidee:** Das Bedienelement *ist* die Source-of-Truth. Die Falle existiert, weil Kontrolle (Settings) und Wahrheit (Frontmatter) getrennt sind — die Heilung verbindet beide im Preview und macht den aktiven Zustand jederzeit sichtbar.

> Phase-2 (LLM-Authoring) bleibt geparkt. `isDesktopOnly: true` bleibt.

## 2. Goals

1. **Falle geheilt:** Im Preview ist jederzeit sichtbar, *welches* Theme rendert und *woher* es kommt (`aus Frontmatter` / `aus Standard`). Akzeptanz: Notiz mit `theme: default` + Settings-Default `dark` → Preview zeigt `default` + Label `aus Frontmatter`; kein „nichts passiert"-Erlebnis mehr.
2. **Live-Switch (ephemer):** Toolbar-Dropdown schaltet das gerenderte Theme sofort um, ohne die Notiz zu berühren; Zustand wird als `● ungespeichert` markiert; geht bei Refresh/Schließen verloren.
3. **Bewusster Commit:** `✓ Setzen` schreibt `theme: <key>` surgical ins Frontmatter (`processFrontMatter` — Rest der YAML unangetastet); danach ist der Zustand sauber und das Label zeigt `aus Frontmatter`.
4. **Benannte User-Themes:** `.css`-Dateien in einem konfigurierbaren Ordner werden als Themes entdeckt und erscheinen im selben Dropdown wie die Built-ins.
5. **Import/Export:** „Open in Finder"-Button (Drop-in-Import) + „Theme als .css exportieren" (Built-in/aktuelles als anpassbarer Startpunkt). Ordner via Toggle ausblendbar (vault-rag-Muster).
6. **Ein-zu-eins-Key-Modell:** Dropdown-Wert = Frontmatter-Wert = Settings-Listen-Wert, identisch. User-Theme-Key = Dateiname ohne `.css` (verbatim). **Settings-Referenzliste** zählt alle gültigen Keys live auf.
7. **Pure-Core-Naht bleibt:** `src/core/**` bleibt obsidian-/DOM-frei; alle neuen I/O- (Ordner-Scan, Frontmatter-Write, Reveal) und DOM-Teile leben in der Adapter-Schicht. `check-core-purity.mjs` + `check-render-realm.mjs` bleiben grün.
8. **Render-Pipeline unverändert:** iframe-Isolation, `fit-or-warn`, feste Geometrie, Constraint-Engine bleiben bitidentisch — nur *welcher* CSS-String reinkommt, ändert sich.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Keine** Änderung der Precedence-Reihenfolge (Frontmatter > Settings-Default > `default`) — nur Sichtbarmachung. (`slide-model.ts:22,33`, `presets/index.ts:24`.)
- ❌ **Kein** Display-Name-Header im CSS. Key = Dateiname, *verbatim*. Sonst entstünde eine Dropdown↔Frontmatter-Diskrepanz (Goal 6).
- ❌ **Keine** Voll-Materialisierung der Built-ins in den Ordner. Built-ins bleiben im Bundle (Hybrid, §4) — kein First-Run-Scaffolding, kein Versions-Drift.
- ❌ **Kein** reiches JSON-Theme-Schema (Tokens+hljs+mermaid+Version). User-Themes sind `.css` — User-gewählt wegen Einfachheit/Teilbarkeit. *Folge:* User-Themes erben Code-Highlight (hljs) + Mermaid-Theme des `default`-Built-ins, sofern ihr Extra-CSS es nicht selbst überschreibt (dokumentierte Grenze).
- ❌ **Kein** Auto-Refresh des Decks bei Datei-Edits — Refresh bleibt manuell (`preview-view.ts:61`). (Die Registry-Aktualisierung bei *Theme-Ordner*-Änderungen ist davon getrennt, §6.)
- ❌ **Kein** Auto-Write beim Dropdown-Wechsel — Schreiben **nur** über expliziten `✓ Setzen` (User-gewählt: ephemer + Commit).
- ❌ **Kein** Mobile-Support (`isDesktopOnly: true`); „Open in Finder" nur auf Desktop/`FileSystemAdapter`.
- ❌ **Kein** Per-Folie-/Per-Region-CSS und **keine** Custom-CSS-Migration — die globale `customCss`-Textarea bleibt unverändert bestehen (wirkt weiterhin zuletzt in der CSS-Kette, `deck-css.ts:15`).

## 4. Design-Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Falle: Precedence ändern oder sichtbar machen? | **Sichtbar machen** (Quell-Label im Preview) | Die Precedence ist korrekt (Frontmatter = SoT der Notiz); das Problem ist die *unsichtbare Abkopplung* des Settings-Dropdowns. Ändern bräche das mentale Modell „die Notiz bestimmt ihr Theme". |
| Live-Switch-Persistenz | **Ephemer + expliziter Commit** (User-gewählt) | Null Überraschungs-Schreibzugriffe auf Notizen. Die „warum bleibt's nicht?"-Verwirrung wird durch sichtbaren `● ungespeichert`-Zustand + `✓ Setzen`-Button abgefangen. |
| Frontmatter-Write-API | **`app.fileManager.processFrontMatter`** | Surgical (nur `theme:`-Key, Rest der YAML + Body unangetastet); legt fehlenden Frontmatter-Block selbst an. Net-neue Fähigkeit — heute schreibt das Plugin nur PNGs (`export.ts:43`). |
| User-Theme-Speicherung | **Vault-Ordner aus `.css`-Dateien** (User-gewählt) | Die Datei *ist* das portable Artefakt → Import/Export quasi gratis, git-/sync-freundlich, nutzt die bestehende CSS-Injektion (`deck-css.ts:15`, `iframe-host.ts:11`), kein neues Schema. |
| Built-ins: im Ordner oder im Bundle? | **Hybrid** (User-gewählt): im Bundle, auf Knopfdruck exportierbar | Built-ins unkaputtbar + kein Versions-Drift. „Export als .css" liefert den anpassbaren Startpunkt; eine Ordner-Datei mit gleichem Key **überschreibt** das Built-in. |
| Key-Quelle | **Dateiname ohne `.css`, verbatim** | Dropdown = Frontmatter = Settings-Liste, 1:1, keine mentale Übersetzung (Goal 6). |
| Discoverability manueller `theme:`-Werte | **Settings-Referenzliste, live aus der Registry** | Wer von Hand ins Frontmatter schreibt, braucht die gültigen Werte; eine live-Liste ist nie veraltet (aktualisiert bei Ordner-Änderung). |
| Ordner ausblenden | **Toggle + adoptiertes Stylesheet** (vault-rag-Muster) | `buildHideCss(dir, hide)` → `.nav-folder-title[data-path="…"]` + `… + .nav-folder-children { display:none }`. Mobil-sicher (kein `:has()`), `data-path` ist internes Markup → bricht es, taucht der Ordner nur kosmetisch wieder auf (kein Datenverlust). |
| Export-Theme bei offenem Preview | **Toolbar-Export ehrt die ephemere Anprobe** | „Exportiere, was ich sehe". Command-Palette-Export (ohne Preview) nutzt das aufgelöste Theme der Notiz. |

## 5. Architektur — Registry + verschränkte Bedien-Naht

```
                 ┌──────────────────────────────────────────┐
   BUILTIN_PRESETS (compile-time, src/core/presets)          │  Adapter-Schicht
        │ presetTokensCss(preset)  → css-String              │  (I/O + DOM)
        ▼                                                     ▼
   ThemeRegistry  ◀──merge──  User-Themes (.css aus Vault-Ordner)
   { key → { css, source: 'builtin'|'user', overrides? } }   ▲
        │                                  scan + watch ──────┘
        │  getThemes() / resolve(key)
        ├──────────────┬───────────────────────┬──────────────┐
        ▼              ▼                       ▼              ▼
   Preview-Toolbar   render/export        Settings-UI     Folder-Hide
   (Dropdown +       (deckCss(themeCss,   (Referenzliste, (adopted
    Quell-Label +     customCss))          Open/Export,    stylesheet)
    ✓ Setzen)                              Toggle)
        │
        └─▶ frontmatter-writer.setNoteTheme(file, key)  (processFrontMatter)
```

**Pure-Core bleibt rein:** Built-in-Presets, `presetTokensCss`, die CSS-Assembly und die Resolution-Logik bleiben pure Funktionen über *übergebene* Daten. Alles I/O — Ordner-Scan, Datei-Lesen/-Schreiben, Frontmatter-Write, Reveal-in-Finder, Event-Watch — lebt in neuen Adapter-Modulen.

### 5.1 Theme-Modell & Registry

Heute ist ein Theme ein `Preset` (Token-Objekt + hljs + mermaid, `presets/index.ts:15`), und `presetFor(id)` löst nur über die 4 Built-ins auf (`presets/index.ts:23-25`). Neu: eine **Registry** vereint zwei Quellen zu *CSS-Strings*. Zwei Ebenen — reine Core-**Daten** + Adapter-**Holder**:

```ts
// Core (pure, src/core/presets) — DATEN + Resolution über eine ÜBERGEBENE Map
type ThemeEntry = { key: string; css: string; source: 'builtin' | 'user'; overridesBuiltin?: boolean };
type ThemeRegistry = Map<string, ThemeEntry>;          // reine Daten, keine Methoden
function resolveTheme(reg: ThemeRegistry, key: string): ThemeEntry;  // Fallback 'default', pure
function listThemes(reg: ThemeRegistry): ThemeEntry[]; // stabile Sortierung (Built-ins zuerst), pure

// Adapter (src/theme-registry.ts) — HOLDER, besitzt die Map + macht das I/O
interface ThemeStore {
  getThemes(): ThemeEntry[];        // delegiert an listThemes(map)
  resolve(key: string): ThemeEntry; // delegiert an resolveTheme(map, key)
  refresh(): Promise<void>;         // re-scant den Ordner, baut die Map neu
}
```

Im Folgenden meint „die Registry" den Adapter-`ThemeStore` (mit Methoden); seine interne `map` ist die pure Core-`ThemeRegistry`. Der `theme-unknown`-Warnungspfad bleibt und prüft gegen diese Map.

- **Built-in-Eintrag:** `css = assembleDeckCss([...presetTokensCss(preset), hljs, mermaid …])`-Anteil wie heute (die Built-in-CSS-Erzeugung bleibt unverändert, nur als Registry-Eintrag verpackt).
- **User-Eintrag:** `css` = roher Inhalt der `.css`-Datei (ein `.sd-slide { --sd-*: … }`-Token-Block + optional Extra-CSS, scoped auf Folien-Selektoren). Wird wie das heutige `customCss` in die Kette injiziert.
- **Kollision:** User-Datei mit Built-in-Key → `overridesBuiltin = true`, User gewinnt (so passt man `dark` an: exportieren → editieren → eigene Version rendert). Zwei User-Dateien mit gleichem Key → erster gewinnt + Konsolen-Warnung.
- **Bau (Adapter):** `theme-registry.ts` baut die Map: Built-ins zuerst, dann User-Themes drübergemergt. `refresh()` re-scannt den Ordner.

### 5.2 Adapter: Ordner-I/O (`theme-source.ts`, neu)

- `scanThemes(adapter, folder): Promise<{key, css}[]>` — listet `*.css` im Ordner (`app.vault.adapter.list`), liest jede, leitet `key` = Dateiname ohne `.css` ab. Unlesbare/leere Dateien → überspringen + warnen, nie crashen.
- `writeThemeCss(adapter, folder, key, css)` — Export: legt Ordner bei Bedarf an (`mkdir`), schreibt `<key>.css` (bzw. `<key>-copy.css`, wenn vorhanden — kein Clobbern). Built-in-Export serialisiert dessen Token-Block + Kommentar-Header.
- `revealFolder(app, folder)` — öffnet den Ordner im System-Dateimanager (Desktop/`FileSystemAdapter`; sonst Button verborgen). Implementierungs-Detail (Obsidian `showInFolder` / Electron-`shell`) wird im Plan festgenagelt (§11).

### 5.3 Adapter: Frontmatter-Writer (`frontmatter-writer.ts`, neu)

```ts
setNoteTheme(app, file: TFile, key: string): Promise<void>
  // app.fileManager.processFrontMatter(file, fm => { fm.theme = key; })
```

Surgical, idempotent; legt den YAML-Block an, falls die Notiz keinen hat. Einziger neuer Schreibpfad auf Notizen.

### 5.4 Folder-Hide (`folder-hide.ts`, neu — spiegelt `../vault-rag/src/index_dir.ts`)

- `buildHideCss(folder, hide): string` (pure) — exakt das vault-rag-Muster (Anhang B).
- Anwendung in `main.ts`: ein adoptiertes `CSSStyleSheet` (`document.adoptedStyleSheets`), `replaceSync(buildHideCss(...))` in `onload` und bei Setting-Änderung.

### 5.5 Preview-Toolbar (`preview-view.ts`)

Heute 4 Controls (`buildToolbar()`, `preview-view.ts:42`): Refresh, PDF, PNG, Datei-Label. Neu (5. Control + Statuszeile):

```
nicht-dirty (gerendert == gespeichert):
┌──────────────────────────────────────────────────────────────────┐
│ ⟳  Theme:[ dark ▾ ]  ⓘ aus Frontmatter         ⤓PDF ⤓PNG   notiz  │
└──────────────────────────────────────────────────────────────────┘
Notiz ohne theme:-Key → greift der Settings-Standard:
│ ⟳  Theme:[ default ▾ ]  ⓘ aus Standard          ⤓PDF ⤓PNG   notiz  │
nach Live-Umschalten (Anprobe, noch nicht geschrieben):
│ ⟳  Theme:[ serif ▾ ]  ● ungespeichert  ✓ Setzen  ⤓PDF ⤓PNG  notiz  │
```

**View-State (pro aktueller Datei):**
- `persistedTheme: string | undefined` — der `theme:`-Wert aus dem Frontmatter (oder undefined).
- `ephemeralTheme: string | undefined` — die aktive Anprobe (überschreibt nur die Anzeige, nie die Datei).
- `effective = ephemeralTheme ?? persistedTheme ?? settings.defaultTheme`.
- `dirty = ephemeralTheme !== undefined && ephemeralTheme !== persistedTheme`.

**Verhalten:**
- **Dropdown** = `registry.getThemes()`-Keys; Wert = `effective`; `onChange` → `ephemeralTheme = key` → iframe re-rendert mit `registry.resolve(key).css`.
- **Quell-Label:** `dirty` → `● ungespeichert`; sonst `persistedTheme` gesetzt → `ⓘ aus Frontmatter`; sonst `ⓘ aus Standard`.
- **`✓ Setzen`** nur sichtbar bei `dirty` → `setNoteTheme(file, effective)` → `persistedTheme = effective`, `ephemeralTheme = undefined` → Label `aus Frontmatter`.
- **Toolbar-Export** nutzt `effective` (inkl. Anprobe). **Command-Palette-Export** (`main.ts:20,25`) nutzt `persistedTheme ?? settings.defaultTheme` (kein Preview-State).
- Refresh/Datei-Wechsel/`onClose` setzt `ephemeralTheme` zurück (Anprobe ist bewusst flüchtig).

### 5.6 Settings (`settings.ts`)

Neue Felder: `themesFolder: string` (Default `"Slide-Deck-Themes"`), `hideThemesFolder: boolean` (Default `true`). Neue/angepasste Controls:
- **`defaultTheme`-Dropdown** (bleibt) — jetzt aus der **Registry** (Built-ins + User-Themes) befüllt; Copy geschärft: „Greift nur für Notizen *ohne* `theme:`-Frontmatter."
- **„Verfügbare Themes"-Referenz** (neu) — live-Liste aller gültigen Keys als kopierbare Code-Chips, markiert `builtin` vs. `aus Ordner` (und `überschreibt Built-in`); Werte mit Leerzeichen bereits in Anführungszeichen. Erklärtext: „Im Frontmatter `theme:` trägst du einen dieser Werte ein; für eigene Themes ist das der Dateiname ohne `.css`."
- **Themes-Ordner-Pfad** (Text), **„Open in Finder"** (Button), **„Theme als .css exportieren"** (Dropdown aller Themes + Export-Button), **„Ordner im Datei-Explorer ausblenden"** (Toggle).
- Bestehende Felder (`minFontPx`, `imageScale`, `exportFolder`, `customCss`) bleiben unverändert.

## 6. Datenfluss & Lebenszyklus

```
onload (main.ts):
  registry = await buildThemeRegistry(adapter, settings.themesFolder)   // Built-ins + Scan
  applyHideCss(buildHideCss(settings.themesFolder, settings.hideThemesFolder))
  registerEvent(vault: create/delete/rename unter themesFolder) → registry.refresh() → UI-Refresh

Preview refresh(file):
  deck = loadDeck(file)                       // parseDeck — frontmatter theme gelesen
  persistedTheme = deck.directives.theme falls im Frontmatter gesetzt, sonst undefined
  ephemeralTheme = undefined                  // Anprobe verfällt bei Refresh
  effective = persistedTheme ?? settings.defaultTheme
  css = registry.resolve(effective).css       // Fallback default + theme-unknown-Warnung
  render iframe(css); dropdown=effective; label=source

Dropdown change(key):  ephemeralTheme=key → re-render iframe(registry.resolve(key).css); dirty?
✓ Setzen:              setNoteTheme(file, effective) → persistedTheme=effective; ephemeralTheme=undefined; label=Frontmatter
Export (toolbar):      buildIsolatedDeck(... css=registry.resolve(effective).css ...)
Theme-Ordner-Event:    registry.refresh() → Dropdown + Settings-Referenzliste neu
```

> **Persisted-vs-Default-Unterscheidung:** `parseDeck` merged heute Settings-Default als Basis (`slide-model.ts:33`), sodass `deck.directives.theme` *immer* gesetzt ist — die View kann „kam aus Frontmatter" daraus nicht ableiten. Lösung: die Adapter-Lade-Schicht meldet **explizit**, ob die Notiz einen eigenen `theme:`-Key hatte (z.B. `loadDeck` gibt `{ deck, frontmatterTheme?: string }` zurück). Kein Core-Eingriff nötig — `parseFrontmatter` weiß es bereits (`slide-model.ts:22`); der Wert wird nur zusätzlich nach außen gereicht.

## 7. Fehlerbehandlung & Degradation

- **Unlesbare/leere `.css`** → überspringen + Konsolen-Warnung; Registry crasht nie. CSS-Injektion ist fehlertolerant (ungültige Regeln werden vom Browser ignoriert).
- **Key-Kollision** User↔Built-in → User überschreibt (`overridesBuiltin`); User↔User → erster gewinnt + Warnung. In der Settings-Liste markiert.
- **`processFrontMatter` ohne YAML-Block** → Obsidian legt ihn an. **Kein aktiver Markdown-File** → `✓ Setzen` disabled.
- **Themes-Ordner fehlt** → Scan liefert leere User-Menge; angelegt bei Export/Open.
- **Reveal-in-Finder** nur bei `FileSystemAdapter` (Desktop) → Button sonst verborgen.
- **Unbekanntes `effective`** (nicht in Registry) → Fallback `default` + bestehende `theme-unknown`-Warnung (`engine.ts:16-17`), jetzt über die *gemergte* Registry geprüft.
- **`ephemeralTheme`** ist View-lokal, nicht persistiert; kein Cross-Reload-Leak (bewusst).

## 8. Pure-Core-Naht — was wo lebt

| Schicht | Verantwortung |
|---|---|
| **Core (pure, `src/core/**`)** | `ThemeEntry`/`ThemeRegistry`-Typ; `resolveTheme(registry, key)` (Fallback); `presetTokensCss`/Built-in-CSS (unverändert); `keyFromFilename(name)` (pure Ableitung); `buildHideCss(dir, hide)` (pure String-Fn); `theme-unknown`-Warnung über Registry. **Kein** `obsidian`-Import, **kein** DOM. |
| **Adapter (`src/*.ts`)** | `theme-registry.ts` (merge + refresh), `theme-source.ts` (scan/write/reveal), `frontmatter-writer.ts` (processFrontMatter), Folder-Hide-Anwendung (adoptedStyleSheets), Toolbar-/Settings-DOM, Event-Watch. |

`render-dom.ts` bleibt realm-sicher (`check-render-realm.mjs`); die Theme-CSS-Auswahl wandert von „nur Built-ins" zu „Registry-Lookup", bleibt aber reiner String-Durchlauf.

## 9. Testing-Strategie

Per `AGENTS.md`: vitest läuft `environment: "node"` — **kein DOM**. Reine Logik wird unit-getestet; DOM/iframe/I/O via Bundle-Smoke + manuellem Pallas-Smoke.

- **Core bleibt grün** (64 vitest) — Purity- + Realm-Gate unberührt.
- **Neue Unit-Tests (pure):**
  - `keyFromFilename` — `"My Theme.css"` → `"My Theme"`; Endungs-Strip; Edge-Cases.
  - `resolveTheme(registry, key)` — Fallback auf `default`; gesetzter Key gewinnt; unbekannt → default.
  - Registry-Merge — Built-ins vorhanden; User überschreibt Built-in (`overridesBuiltin`); zwei User gleicher Key → erster + Warnung.
  - `theme-unknown`-Warnung über gemergte Registry (vorhandener User-Key warnt **nicht** mehr).
  - `buildHideCss` — leer bei `hide=false`/leerem Pfad; korrektes Selektor-Paar; JSON-escapeter `data-path`.
  - Built-in→`.css`-Serialisierung (reiner String) + `<key>-copy`-Namenskollision.
- **Bundle-Smoke** (`scripts/bundle-smoke.mjs`) erweitert: jedes Built-in assembliert; ein synthetisches User-Theme-CSS injiziert sauber.
- **Nicht unit-testbar (manueller Pallas-Smoke, dokumentierte Checkliste):** Dropdown-Umschalten rendert live; `● ungespeichert`/`✓ Setzen`-Zyklus; `processFrontMatter` schreibt nur `theme:`; Ordner-Scan entdeckt gedroppte `.css`; „Open in Finder" öffnet den Ordner; Hide-Toggle blendet im Explorer aus; Toolbar-Export ehrt die Anprobe.

## 10. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/core/presets/index.ts` | `ThemeEntry`/`ThemeRegistry`-Typ; `resolveTheme(registry,key)`; Built-in-CSS als Registry-Einträge verpackt (Erzeugung unverändert) |
| `src/core/theme-key.ts` | **neu** (pure) — `keyFromFilename` |
| `src/core/folder-hide.ts` | **neu** (pure) — `buildHideCss` (vault-rag-Muster) |
| `src/theme-registry.ts` | **neu** (Adapter) — merge Built-ins + User; `refresh()` |
| `src/theme-source.ts` | **neu** (Adapter) — `scanThemes`/`writeThemeCss`/`revealFolder` |
| `src/frontmatter-writer.ts` | **neu** (Adapter) — `setNoteTheme` via `processFrontMatter` |
| `src/adapter.ts` | `loadDeck` meldet `frontmatterTheme?` explizit nach außen |
| `src/render-dom.ts` / `src/deck-css.ts` | Theme-CSS aus Registry-Lookup statt nur Built-ins (reiner String) |
| `src/preview-view.ts` | Toolbar: Dropdown + Quell-Label + `● ungespeichert` + `✓ Setzen`; View-State (persisted/ephemeral); Export ehrt `effective`; `ephemeralTheme`-Reset |
| `src/export.ts` | resolved Theme-CSS entgegennehmen (Toolbar: `effective`; Palette: persisted/default) |
| `src/settings.ts` | `themesFolder`/`hideThemesFolder`; Referenzliste; Open-in-Finder; Export-Theme; Hide-Toggle; `defaultTheme`-Copy + Quelle aus Registry |
| `src/main.ts` | Registry bauen; Folder-Hide-Stylesheet; Theme-Ordner-Events; Registry in Preview/Export reichen |
| `src/i18n.ts` | neue UI-Strings EN/DE (Quell-Label, Setzen, Referenz, Open/Export, Hide-Toggle) |
| `styles.css` | Toolbar-Dropdown/Label/Setzen-Styling; Settings-Chips |
| `tests/**` | Unit-Tests (§9); Bundle-Smoke-Erweiterung |
| `AGENTS.md` | Theme-Registry + Frontmatter-Write + Folder-Hide dokumentieren |
| `README` / `CHANGELOG` | User-Themes, Live-Switch, Import/Export beschreiben |

## 11. Offene Punkte für die Spec-Review / Plan
- **Reveal-in-Finder-API:** Obsidian `showInFolder` (undokumentiert) vs. Electron `shell.openPath` vs. `app.openWithDefaultApp`. Im Plan festnageln; Desktop-only erlaubt Electron-`shell`. Fallback: Pfad als Notice anzeigen.
- **Ordner-Default-Name:** `Slide-Deck-Themes` (kein Dot-Prefix → wird von Obsidian Sync mitgenommen; Hide-Toggle übernimmt das „stört nicht"). Verifizieren, dass der Name nicht mit dem Export-Ordner (`Slide-Deck-Export`) verwechselt wird.
- **Dropdown-Render bei vielen Themes:** Reihenfolge (Built-ins zuerst, dann User alphabetisch?) im Plan festlegen.
- **`effective` bei Export-from-Palette ohne offenes Preview:** bestätigt persisted/default (kein ephemerer State existiert dort).

---

## Anhang A — Grounding-Belege (verifiziert, `file:line`)

- **Dropdown-Falle:** `parseDeck` setzt Basis aus Settings (`slide-model.ts:33` `{...DEFAULTS, ...defaults}`), dann `parseFrontmatter` überschreibt `theme:` bedingungslos (`slide-model.ts:22` `if (key === 'theme') d.theme = val;`). Settings-Dropdown schreibt `defaultTheme` (`settings.ts:22`), gereicht via `preview-view.ts:66` → `adapter.ts:21,24` → `parseDeck`. Theme final aufgelöst `render-dom.ts:32` `presetFor(deck.directives.theme)`.
- **Unbekanntes Theme warnt bereits:** `collectDeckWarnings` (`engine.ts:14-17`) pusht `theme-unknown`, aufgerufen `render-dom.ts:36`. `presetFor` fällt zusätzlich still auf default (`presets/index.ts:24` `PRESETS[id] ?? PRESETS.default`).
- **Toolbar heute:** `buildToolbar()` (`preview-view.ts:42`) — Refresh (`:51`), PDF (`:54`), PNG (`:55`), Datei-Label (`:56`). Refresh manuell (`:61`), keine Watcher. View-State session-lokal (`currentFile` `:22`).
- **Custom-CSS:** globale Settings-Textarea (`settings.ts:6,35`), zuletzt in der Kette (`deck-css.ts:15` `assembleDeckCss([…, presetTokensCss(preset), customCss])`), injiziert `iframe-host.ts:11` `<style>${css}${extraCss}</style>`. Drei Call-Sites (`preview-view.ts:74`, `export.ts:16`, `export.ts:42`).
- **Kein Frontmatter-Write heute:** `parseFrontmatter` read-only (`slide-model.ts:13-22`); einziger Datei-Write `adapter.writeBinary` für PNG (`export.ts:43`); kein `processFrontMatter`/`vault.modify`.
- **Presets compile-time:** `PRESETS` (`presets/index.ts:15`), 4 Keys; `presetFor` (`:23-25`). Settings coerced unbekannten Default nur bei Tab-Anzeige (`settings.ts:17`).
- **Settings-Felder:** `SlideDeckSettings` (`settings.ts:6`) — `defaultTheme`, `minFontPx`, `imageScale`, `customCss`, `exportFolder`. `defaultTheme.desc` (`i18n.ts:20` EN / `:49` DE).

## Anhang B — vault-rag Folder-Hide-/Open-Muster (verifiziert)

- `buildHideCss(indexDir, hide)` (`../vault-rag/src/index_dir.ts:17-22`): `const sel = `.nav-folder-title[data-path=${JSON.stringify(p)}]``; `return `${sel},\n${sel} + .nav-folder-children { display: none; }``. Kommentar: `data-path` internes Markup, kein `:has()` (Mobile), `display:none` (Explorer-Virtualisierung), Wert via `JSON.stringify` escaped.
- Anwendung: adoptiertes `CSSStyleSheet`, `hideStyleSheet.replaceSync(buildHideCss(dir, hide))` (`../vault-rag/src/main.ts:295`); Toggle `hideIndexFolder` (Default `true`, `settings.ts:62`).
- Dot-Pfade werden von Obsidian Sync ignoriert (`index_dir.ts:6-9`) → Themes-Ordner bewusst **kein** Dot-Prefix.
- **Reveal-Hinweis:** vault-rag `openPath` (`main.ts:57`) öffnet *Dateien in Obsidian*, **nicht** im Finder — die Reveal-in-Finder-Mechanik ist für slide-deck neu zu wählen (§11).
