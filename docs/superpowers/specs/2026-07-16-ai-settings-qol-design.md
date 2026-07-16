# KI-Settings: QoL-Ausbau + Kit-Angleichung

**Datum:** 2026-07-16 · **Branch:** `feat/ai-settings-qol` · **Status:** Design freigegeben

## Problem

Der KI-Bereich der Settings (`src/settings.ts:75-90`) sind fünf nackte Textfelder. Der komplette
Baukasten für einen ordentlichen Verbindungstest existiert bereits im Repo (`ping()`,
`listModels()`, `modelContext()`, `resolveActiveEndpoint`, `isAlwaysOnThinker`) — die Settings
nutzen davon genau eine Funktion: `parseEndpointList`.

Drei Lücken sind **Verstöße gegen den verbindlichen `UI-STANDARD.md §8`**, nicht bloß fehlender
Komfort:

1. **Status-Indikator** (verbindlich) — fehlt vollständig. Die Generate-Deck-View hat stattdessen
   `✓`/`✗`-Textzeichen (`generate-deck-view.ts:127-133`) statt der Icon-Vokabel
   `loader`/`circle-check`/`circle-x` mit `is-ok`/`is-error`-Klasse und `aria-label`
   (WCAG 1.4.1 — Farbe nie allein).
2. **Async Modell-Feld** (verbindlich) — Settings haben Freitext, kein Dropdown aus Server-Probe.
3. **Endpoint-Zeilen-Editor** (Kit-Kandidat, n=3) — Settings haben eine Textarea.

Dazu kommt ein echter Diagnose-Defekt: `llm-client.ts:29` prüft nur `status === 200`. Genau davor
warnt der Doc-Kommentar von Kit's `normalizeEndpoint` — LM Studio antwortet auf `/v1/v1/...` mit
HTTP 200 **plus Fehler-Body**. Der heutige Ping meldet „erreichbar" für einen Endpunkt, der keine
LLM-API ist.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Scope | Kanon (3 §8-Bausteine) + Diagnose (`endpoint_diagnostics`) + Kür (Kontextanzeige, Live-Suppress-Test, Always-on-Thinker) |
| Vendoring | Sweep auf Kit 0.14.0 (sha `644603c`) + `VENDOR.json` |
| Generate-View | Teilt den Baustein mit den Settings; verliert ihre `✓`/`✗`-Sonderlocke |
| Modell-SoT | View bleibt **ephemer** — Settings-`llmModel` ist Default, View-Wahl gilt nur für den Lauf (spiegelt das etablierte Theme-Muster: Frontmatter = SoT, Dropdown = Anprobe) |
| Probe-Trigger | Auto beim Öffnen (parallel, 5 s Timeout) + „Verbindung prüfen"-Button + Auto-Probe nach `blur` einer geänderten Zeile |
| Suppress-Test | Button neben dem Toggle, nie automatisch — ein echter LLM-Call gehört hinter eine bewusste Handlung |

## Architektur

Drei Schichten. Die Naht folgt der bestehenden Pure-Core-Invariante (`check-core-purity.mjs`).

### Kit-Vendor (`src/vendor/kit/`) — verbatim, kein Eigenbau

Sweep auf 0.14.0: `endpoint`, `sse`, `think`, `settings`, `reasoning` aktualisiert (heute auf vier
verschiedenen Versionen: 0.2.0/0.3.0/0.4.0/0.6.0). **Neu vendored:**

- `endpoint_diagnostics.ts` — `classifyEndpointStatus`, `validateEndpointInput`, `ENDPOINT_PRESETS`
- `model-context.ts` — `parseLmStudioContext`, `parseOllamaContext`

`VENDOR.json` mit `version: "0.14.0"` + `sha: "644603c"` (KIT-MATRIX-Konvention; `vim-dojo` ist
bisher das einzige Repo, das sie erfüllt).

`src/core/llm/model-info.ts` ist heute eine **Handkopie** von Kit's `model-context.ts` am Kit vorbei.
Sie schrumpft auf einen Re-Export des vendorten Moduls plus die echte Eigenleistung
`estimateTokens`/`contextOverflow`.

#### Vorbedingung: `src/core/**` darf aus `src/vendor/kit/**` importieren

Heute tut das **kein einziges** Core-Modul (null Treffer) — was die Handkopie in `model-info.ts`
erklärt. Der Grund ist real: `scripts/check-core-purity.mjs` walkt nur `src/core` und prüft dort auf
`obsidian`/DOM. Ein Import core→vendor wäre ungesichert — würde ein Vendor-Modul je unpure, verseuchte
es den Core still, ohne dass ein Gate anschlägt.

Das Gate walkt deshalb zusätzlich `src/vendor/kit`. Kit-Module sind per Kit-Design obsidian-frei; das
Gate pinnt damit nur zu, was ohnehin gilt, und macht den Import legitim statt geduldet. Erst dadurch
ist der Re-Export in `model-info.ts` und der `EndpointStatusKind`-Import in `ai-settings-model.ts`
sauber — sonst müsste jedes Kit-Modul weiter von Hand in den Core kopiert werden (genau die Drift,
die dieser Sweep beseitigt).

### Pure Zustandslogik (`src/core/llm/ai-settings-model.ts`, neu)

Obsidian-frei, keine Netzwerk-Calls, voll vitest-bar ohne DOM:

| Funktion | Zweck |
|---|---|
| `applyEndpointEdit(list, index, value, isAdder)` | Zeilen-Editor-Mutation (vault-crews-Kanon) |
| `activeIndexFromStatuses(statuses)` | Index des Aktiv-Markers = erster `ok` (exakt `resolveActiveEndpoint`-Semantik) |
| `modelFieldMode(models)` | `dropdown` sobald Modelle geladen, sonst `freetext` |
| `thinkToggleView(model, suppress)` | 3 Zustände: an / `is-off` / `is-disabled` „immer an" |
| `effectiveSuppress(model, suppress)` | Spiegelt den disabled-Zustand auf die Request-Seite |
| `statusKindKey(kind)` / `warnRuleKey(rule)` | Kit-`kind` → i18n-Key |

`thinkToggleView`/`effectiveSuppress` werden aus `image-to-markdown/src/reasoning_toggle.ts`
gehoben (dort bereits pure, in REGISTRY:20 als Kit-Kandidat geführt — dies ist das zweite Exemplar).

**Die deutschen Kit-Klartexte werden nie durchgereicht.** Kit's `KLARTEXT` ist hartkodiert deutsch;
dieses Plugin ist EN-kanonisch mit DE-Übersetzung. Gemappt wird ausschließlich über `kind`
(vim-dojo-Muster, `endpointText.ts:6`). `EndpointStatus.raw` (nur bei `kind === "unknown"`) wird
angehängt, weil es die rohe Fehlermeldung trägt.

### Adapter

- **`src/llm-client.ts`** — neu `probe(): Promise<ProbeInput>`: GET `/v1/models`, `throw: false`,
  5 s Timeout via `Promise.race` (`requestUrl` kennt kein Abort/Timeout — vault-rag `http.ts:25`).
  Liefert das Rohsignal an `classifyEndpointStatus`. `ping()` bleibt als dünner Wrapper
  (`(await probe()) → classify → .reachable`) erhalten, damit `resolveActiveEndpoint` weiter
  seine injizierte Boolean-Ping-Signatur bekommt — erkennt jetzt aber `not-an-llm-api`.
- **`src/ai-settings-ui.ts`** (neu) — rendert die §8-Bausteine gegen die pure Logik. Exportiert
  `renderEndpointEditor(...)`, `renderModelField(...)`, `renderThinkingRow(...)`.
  Settings und Generate-View sind beide nur Call-Sites.

## UI im Detail

### Endpoint-Zeilen-Editor

Ersetzt die Textarea. Eine `Setting`-Zeile pro Endpoint, Label/Desc nur in Zeile 0, plus eine
Add-Leerzeile (`[...list, ""]`).

- **Listen-Mutation nur bei `blur`, nie `onChange`** (UI-STANDARD §8, explizit): sonst wird jeder
  Tastendruck-Zwischenstand persistiert — im Adder entstünden Einträge `h`, `ht`, `htt`, …
- Trash pro Zeile via `addExtraButton("trash-2")` mit `aria-label`
- Status-Icon pro Zeile: `loader` (probing) → `circle-check` (`is-ok`) / `circle-x` (`is-error`),
  Tooltip = `t(statusKindKey(kind))`. Der aktive Endpoint (erster `ok`) bekommt zusätzlich `is-active`.
- Warn-Span `alert-triangle` bei `validateEndpointInput`-Findings, `aria-label` = `t(warnRuleKey(rule))`.
  **Nicht-blockierend** — Hinweis, kein Fehler.
- Preset-Buttons „+ LM Studio" / „+ Ollama" aus `ENDPOINT_PRESETS`
- „Verbindung prüfen"-Button → alle Zeilen neu proben

### Async Modell-Feld

`modelFieldMode(models)` entscheidet:
- **`dropdown`** — Optionen aus `listModels()` des aktiven Endpoints. Ein gespeichertes Modell, das
  nicht in der Liste steht, **bleibt als zusätzliche Option erhalten und vorgewählt** — nie still
  verwerfen (UI-STANDARD §8).
- **`freetext`** — offline / noch nicht geladen. Plus „Modelle laden"-Button.

Darunter die **Kontextlängen-Anzeige** (Kür): `modelContext(model)` →
`max Context 32.768 · loaded 8.192`. Fehlt die Angabe (`null`), bleibt die Zeile leer statt zu raten.

### Thinking-Zeile

Toggle `llmSuppressThinking`, gerendert über `thinkToggleView(model, suppress)`:
- normal: an / aus
- `isAlwaysOnThinker(model)` (gpt-oss/harmony): **disabled + „immer an"** — das Modell akzeptiert
  `reasoning_effort:"none"` nicht

Daneben **„Testen"**-Button (Kür, vault-rag `settings.ts:591`): → „Teste…" + disabled → echter
1-Wort-Call mit `suppressParams(true)` → `reasoningHappened(content, reasoning)` → Notice
„Thinking wird unterdrückt" / „Modell denkt trotz ‚aus'". Das ist die einzige Stelle, die
Vermutung durch Nachweis ersetzt — `isAlwaysOnThinker` kennt nur `gpt-oss|harmony`.

## Fehlerbehandlung

- **Probe-Fehler** → `classifyEndpointStatus` → `kind` → i18n-Key. Nie roher Text in die UI außer
  bei `kind === "unknown"` (dort trägt `raw` die einzige Information).
- **Timeout** 5 s pro Endpoint, Probes laufen parallel. Ein toter Endpoint blockiert die anderen nicht.
- **Kein Endpoint erreichbar** → Modellfeld fällt auf `freetext` zurück (nicht: leerer Dropdown).
  Bestehendes `llmModel` bleibt sichtbar und benutzbar.
- **Suppress-Test schlägt fehl** (Netz/Server) → Notice mit dem Envelope-Text, kein Zustandswechsel.
- **Settings-Tab darf nie an einer Probe sterben.** Alle Probe-Pfade sind try/catch-umschlossen;
  ein Netzwerkfehler degradiert zu `kind: "unknown"`, er wirft nicht. Das ist dieselbe Lehre wie
  beim Folder-Hide-Fix (`13d57fc`): Kosmetik darf die Funktion nie brechen.
- **Read-modify-write** (Cross-Project-Lesson 2026-07-16, kuro-screensaver): Persistenz läuft
  ausschließlich über `setControlValue` → `plugin.saveSettings()` mit vendored `mergeSettings`.
  Der Endpoint-Editor schreibt **nur** `llmEndpoints`, fasst keine fremden Keys an.

## Testing

**Pure (vitest, node — kein DOM):** vollständige Abdeckung für alle sechs Funktionen in
`ai-settings-model.ts`. Kernfälle: `applyEndpointEdit` (Adder mit leerem Wert = No-Op; bestehende
Zeile geleert = entfernt; Leereinträge nie persistiert), `activeIndexFromStatuses` (kein `ok` → -1;
`null` = ungeprobt ≠ Fehler), `modelFieldMode`, `thinkToggleView` (alle 3 Zustände),
`effectiveSuppress` (always-on überstimmt den User-Wunsch), Key-Mapper.

Für `probe()` → `classifyEndpointStatus` kommen Tests mit injizierten `ProbeInput`-Rohsignalen —
insbesondere der Regressionsfall **HTTP 200 + Fehler-Body → `not-an-llm-api`**, den der alte
`ping()` als „erreichbar" durchgewinkt hätte.

**i18n:** neue Keys EN (kanonisch) + DE. `tests/i18n.test.ts` prüft Parität — jeder
`statusKindKey`/`warnRuleKey`-Wert braucht beide Sprachen. Ein Test iteriert über alle
`EndpointStatusKind`-Werte, damit ein künftiger Kit-Nachzug mit neuem `kind` nicht still einen
fehlenden Key erzeugt.

**Adapter/DOM:** nicht vitest-bar (vitest läuft hier ohne DOM, bewusst). Das Netz ist wie gehabt der
GUI-Smoke in Pallas — und genau dort sitzen laut Cockpit-Historie wiederholt die Bugs dieses
Projekts (Settings-Render, Sidebar, render-dom). Smoke-Checkliste:
1. Settings öffnen ohne laufenden LM-Studio → alle Icons `circle-x`, Klartext „Verbindung abgelehnt", Modellfeld = Freitext
2. LM Studio starten, „Verbindung prüfen" → `circle-check` + `is-active` auf Zeile 0, Dropdown füllt sich
3. Endpoint auf `http://localhost:1234/v1` setzen → normalisiert, weiterhin `ok` (kein `/v1/v1`)
4. Müll-Endpoint `http://localhost:9999` → `refused`; `http://example.com` → `not-an-llm-api`
5. Zeile leeren + blur → verschwindet; Adder tippen → genau ein Eintrag, keine Präfix-Fragmente
6. Thinking-Test mit qwen3 → „wird unterdrückt"; mit gpt-oss → Toggle disabled „immer an"
7. Generate-View öffnen → identische Icon-Vokabel, Modellwahl bleibt ephemer (Settings unverändert)

## Nicht in diesem Scope (YAGNI)

- **Probe-Cache** zwischen Settings und View — die Auto-Probe ist ein GET gegen localhost; ein Cache
  bräuchte Invalidierung + Zeitquelle als Port für mehr Mechanik als Nutzen.
- **Kontext-Budget-Slider** (vault-rag `updateBudgetMax`) — koppelt Input-Budget ans Modellfenster.
  Unser `llmMaxTokens` ist das **Output**-Limit; die Kopplung wäre eine andere Semantik.
- **Capability-Chips / Vision-Test** — dieses Plugin generiert Text-Decks, keine Bildanalyse.
- **Kit-Promotion** der gehobenen Bausteine (`thinkToggleView`, Zeilen-Editor, `extractModelIds`) —
  eigener Task über alle Repos, nicht hier. Dieses Repo liefert das jeweils zweite/dritte Exemplar,
  das die Promotion rechtfertigt.
