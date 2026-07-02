# LLM-Deck-Transform: Notiz → Präsentation via lokales LLM (Spec D) — Design Spec

- **Status:** Draft (design) — pending User-Review (Design mündlich freigegeben 2026-07-02; Spec-Review beim nächsten Session-Start)
- **Datum:** 2026-07-02
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `main` (Spec) → `feat/llm-deck-transform` (Implementierung, anzulegen)
- **Baut auf:** 0.4.0 (`main`, `39980b2`) · Pro-Output-Foundation · Area-/Template-Layout (9 Templates + Modifier)
- **Code-Seeds:** `../vault-rag` (chat_client, endpoint, sse, reasoning, think_splitter, capabilities/modelInfo, Smart-Apply-Muster) · `../image-to-markdown` (parseErrorEnvelope, Failover-Muster) — **vendored, nie als git-Dep** (Lesson 2026-07-01: git+https-Deps brechen den Community-Review-Install)
- **Grounding:** 4 parallele Code-Reader (i2m-LLM-Muster, slide-deck-Pipeline, lokale LLM-Infra, vault-rag-Seed) + adversariales 3-Linsen-Critic-Panel gegen den echten Code (1 Blocker, 8 Major — alle eingearbeitet, §10).

---

## 1. Zusammenfassung

Ein neues Command transformiert die **aktive Markdown-Notiz** per **lokalem LLM**
(OpenAI-kompatibler Endpoint: LM Studio, Ollama, MLX, …) in eine **neue Deck-Notiz**
im slide-deck-Format. Das LLM darf **strukturieren und verdichten** (Prosa →
folientaugliche Stichpunkte). Die Quell-Notiz bleibt unangetastet — Projekt-Philosophie:
die Notiz ist kanonisch, Folien sind eine Projektion; hier entsteht eine zweite,
generierte Notiz als editierbarer Startpunkt.

Der zentrale architektonische Hebel existiert bereits: `getAuthoringContract()` +
`contractToPrompt()` (`src/core/constraints/contract.ts:17–41`) wurden als
Phase-2-LLM-Hook gebaut, sind getestet und werden von diesem Feature erstmals konsumiert.
LLM-Output wird **statisch validiert** (parseDeck + collectWarnings, ohne DOM), bevor
eine Notiz entsteht; alles Weitere fängt die bestehende fit-or-warn-Preview.

**Produktthese:** „Beliebige Notiz rein → präsentierfähiger Deck-Entwurf raus" — als
Startpunkt für den normalen Editier-Flow, nicht als Endprodukt. Iteration = erneut
generieren mit angepasstem Hinweis.

## 2. Goals

1. **Ein-Command-Transformation:** Aktive Notiz → neue Deck-Notiz `<basename> — Deck.md`
   im selben Ordner. Akzeptanz: Happy Path (LM Studio, qwen3.6) erzeugt aus einer
   Prosa-Notiz ein valides Deck, das ohne Handarbeit in der Preview rendert.
2. **Verdichtung mit Leitplanken:** Das LLM strukturiert (Folien-Splits, Templates,
   Modifier, `<!-- column -->`) und verdichtet — aber erfindet nie Inhalte
   (No-Invention-Regel im Prompt). Ausgabesprache = Sprache der Notiz.
3. **Entscheidungsarmes Modal:** Defaults so, dass Enter sofort startet (Zielfolienzahl
   „auto", Theme = Settings-Default, Hinweis leer). Feinsteuerung optional, nie nötig.
4. **Robust gegen reale LLM-Ausgaben:** Präambeln, ```-Wrapper, `<think>`-Residuen,
   führende `---`, gequotete Frontmatter-Werte, wiederholte Frontmatter-Blöcke — alle
   bekannten Fehlerklassen werden deterministisch saniert oder klar gemeldet (§6).
5. **Lokal & offen:** Endpoint-Fallback-Liste (localhost/LAN), keine Cloud, keine neuen
   npm-Dependencies, Community-Review-konform (kein `fetch`, deklarative Settings,
   Disclosure im README).
6. **Invarianten gewahrt:** Pure-Core-Naht (`src/core/llm/**` obsidian-/DOM-frei),
   Realm-Gate unberührt, alle Gates grün, bestehende 135 vitest grün + neue Tests.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Kein Chat-Refine-Loop** und kein Per-Folie-Refine — Iteration = Re-Run mit
  angepasstem Hinweis. (Eigenes späteres Feature, falls Bedarf entsteht.)
- ❌ **Kein JSON-Zwischenformat** — das LLM emittiert direkt Deck-Markdown (§4).
- ❌ **Kein Chunking langer Notizen** — präzise Kontext-Warnung statt Magie.
- ❌ **Keine In-Place-Transformation** der Quell-Notiz.
- ❌ **Keine Cloud-Endpoints als Feature** — konfigurierbar ist jede URL, beworben und
  getestet wird nur lokal.
- ❌ **Kein LLM-gewähltes Theme** — Theme kommt deterministisch aus der Modal-Wahl.
- ❌ **Keine Sprechernotizen/Speaker-Notes** — slide-deck hat das Konzept nicht.

## 4. Entschiedene Richtungsfragen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Eingriffstiefe | **Strukturieren + verdichten** (User-Q&A) | Reines Umformatieren erzeugt bei Prosa-Notizen massenhaft fit-or-warn-Overflow; der LLM-Wert liegt in der Verdichtung. Original bleibt unangetastet. |
| Output | **Neue Notiz daneben** (User-Q&A) | Nicht destruktiv; Ergebnis reviewbar im normalen Flow. |
| Aufruf-UX | **Kleines Modal mit Defaults** (User-Q&A) | Kontrolle ohne Entscheidungslast; Enter startet sofort. |
| Iteration | **Re-Run mit Hinweis** (Empfehlung, pauschal freigegeben) | Hält den Scope klein; Feinschliff einzelner Folien direkt im Markdown. |
| Generierungsformat | **Direkt Deck-Markdown** (Empfehlung, pauschal freigegeben) | Lokale Modelle sind bei Markdown robuster als bei striktem JSON (LM Studio: 400 bei response_format auf Reasoning-Modellen; Escaping-Hölle bei Codeblöcken in JSON-Strings); `contractToPrompt` existiert genau dafür. Sicherheitsnetz: Sanitizer + statisches Gate + fit-or-warn + nicht-destruktive neue Notiz. |
| Re-Run-Kollision | **Ersetzen (Default) vs. Kopie — bewusste Wahl im Modal** | Deck = regenerierbare Projektion; Suffix-Schleife (`-copy2`, …) nur hinter der bewussten Kopie-Wahl (Critic: sonst Deck-copy-Müllhalde beim deklarierten Standard-Workflow). |
| Modal-Close während Generierung | **Close ≠ Abort** | Esc/Scrim-Klick schließt Modals in Obsidian; bei minutenlangen lokalen Generationen darf das nicht Minuten Arbeit vernichten (ND-UX). Abbruch nur über expliziten Stop-Button. |
| Streaming-Transport | **XHR** (vendored aus vault-rag) + **non-streaming-requestUrl-Fallback** | `fetch` ist obsidianmd-lint-gesperrt (verifiziert; vault-rag-Präzedenz), `requestUrl` streamt nicht. Fallback heilt den CORS-Fehlmodus (§6). |
| Timeouts | **Keine** | Lokale Modelle rechnen lange (Cold-Start 30–90 s); beide Seed-Plugins tun es bewusst genauso. Abbruch ist User-Sache. |
| Default-Endpoint | `http://localhost:1234` (LM Studio) | Läuft real beim Autor; NICHT `:8080` — der MLX-Stack ist seit 2026-05-02 stillgelegt (i2m-Default zeigt ins Leere — nicht wiederholen). |

## 5. User-Flow

1. **Command** „Generate presentation from note" (`generate-deck`), `checkCallback`:
   nur bei aktiver `.md`-Datei.
2. **Modal** (`GenerateDeckModal`), Zustand `input`:
   - Statuszeile: aktives Modell + aufgelöster Endpoint mit Live-Ping
     (✓/✗ als Form + Farbe + Text, WCAG 1.4.1).
   - Zielfolienzahl: „auto" (Default) oder Zahl.
   - Freitext-Hinweis (optional; z. B. „Fokus auf Architektur", „auf Englisch").
   - Theme-Dropdown: `themeStore.getThemes()` (Built-ins + User-Themes),
     Default `settings.defaultTheme`.
   - **Kontext-Check:** Token-Schätzung (Zeichen ÷ 3,5 + Promptanteile + `llmMaxTokens`)
     gegen `loaded_context_length` aus vendored modelInfo/capabilities
     (LM Studio `/api/v0/models`, Ollama `/api/show`); präzise Warnung bei drohendem
     Overflow. Statischer ~30k-Zeichen-Fallback nur ohne Capability-Antwort.
   - Existiert `<basename> — Deck.md`: Wahl **Ersetzen** (Default; Hinweis, dass
     Handedits verloren gehen) vs. **Neue Kopie**.
   - Ist die Quelle selbst schon eine Deck-Notiz (Frontmatter `theme:` + `---`-Trenner):
     Hinweis anzeigen (kein Block).
   - CTA „Generieren" (Enter) / Abbrechen.
3. **Zustand `running`:** Elapsed-Timer, einklappbarer 💭-Reasoning-Block,
   Roh-Stream-Tail, Retry-Anzeige („2. Versuch …"), **Stop-Button**.
   Close (Esc/Scrim) schließt nur das Modal — die Generation läuft im Orchestrator
   weiter (Abschluss-Notice; Deck wird geschrieben). Erneuter Command-Aufruf während
   laufender Generation re-attacht das Modal an den `running`-Zustand.
4. **Pure-Core-Pipeline** nach Stream-Ende (Reihenfolge fix): sanitize →
   Frontmatter-Disambiguierung → setDeckTheme → validate (§6/§7).
5. **Schreiben:** `app.vault.create` (bzw. `vault.modify` bei „Ersetzen");
   Existenzcheck racefrei via `vault.getAbstractFileByPath` + `normalizePath`
   (Vault-API-Guideline; NICHT `adapter.exists` — nur die Suffix-Schleifen-Idee stammt
   aus `theme-source.ts:29–30`).
6. **Abschluss:** neue Notiz öffnen → Preview aktivieren → **explizit
   `view.refresh()`** (SlideDeckView hat keinen active-leaf-Listener; bei bereits
   offener Preview bliebe sonst das alte Deck stehen). Dafür: `activatePreview`
   public machen bzw. Helfer extrahieren; Leaf-Lookup via
   `workspace.getLeavesOfType(VIEW_TYPE)` + `instanceof SlideDeckView`
   (Muster: `main.ts:48–50`). Reihenfolge: openFile → activatePreview → refresh.
   Erfolgs-Notice.

## 6. Robustheit: Sanitizer, Fehlerklassen, Retry

### 6.1 `extractDeckMarkdown(raw)` — deterministische Sanitisierung (pure)

- Präambel-Prosa („Here is your deck:") und umschließende ```-Fences strippen.
- **Reasoning-Residuen:** nacktes `</think>` ohne Opener (Chat-Template hat `<think>`
  vorbefüllt — reale Qwen-/DeepSeek-Variante; der ThinkSplitter ist opener-gated und
  fängt das nicht) → alles bis einschließlich dieser Zeile kappen.
  `reasoningHappened()` dient als Ehrlichkeits-Signal, ob Suppression griff.
- **Führendes-`---`-Disambiguierung (Blocker-Fix):** `parseFrontmatter`
  (`slide-model.ts:15–17`) konsumiert bei `lines[0] === '---'` alles bis zum nächsten
  `---` als Frontmatter — beginnt der Output mit einem Folientrenner, verschwindet
  Folie 1 lautlos (nicht matchende Zeilen werden per `continue` verworfen, das
  0-Folien-Fatal-Gate greift nicht). Heuristik: führendes `---` ist nur dann
  Frontmatter-Start, wenn **jede** Zeile bis zum schließenden `---` leer ist oder
  `^\w+:\s` matcht (identische Key-Grammatik wie der Parser, `slide-model.ts:20`);
  sonst wird der führende Separator gestrippt.
- Folientrenner-Whitespace normalisieren (`--- ` → `---`): Frontmatter-Ende matcht
  exakt, Body-Trenner getrimmt (Asymmetrie `slide-model.ts:16` vs. `:66`).
- Folien, die ausschließlich aus `key:`-Zeilen bestehen (vom Modell wiederholte
  Frontmatter-Blöcke mitten im Deck), droppen.
- Quotes um `aspect`-/`theme`-Werte normalisieren: der Zeilen-Regex-Parser übernimmt
  `theme` ungestrippt und vergleicht `aspect` strikt — `aspect: "16:9"` fiele still
  auf den Default (nur `header`/`footer` strippen Quotes).

### 6.2 `setDeckTheme(md, key)` — Frontmatter-scoped (pure)

Spiegelt den `parseFrontmatter`-Algorithmus: Block zwischen Zeile-0-`---` und
Schlusszeile erkennen; `theme:` **nur darin** ersetzen (nie eine `theme:`-Zeile im
Folien-Body oder Code-Fence treffen); existiert kein Block, **immer** einen injizieren.
Läuft **nach** der Disambiguierung (sonst würde in einen Pseudo-Frontmatter-Block
injiziert). Theme kommt ausschließlich aus der Modal-Wahl.

### 6.3 `validateDeckOutput(md)` — statisches Gate (pure)

`parseDeck` + `parseDirectives` + `collectWarnings` pro Slide mit
Stub-`FitResult {scale:1, overflow:false}` und `renderWarnings=[]`.
**Statisch prüfbar:** `directive-malformed`, `layout-unknown`, `layout-multiple`,
`region-count`. **Nicht statisch prüfbar** (erst Preview/DOM): `overflow`,
`missing-embed`, `mermaid-error` — dem Gate nicht mehr zutrauen; nicht-fatale
Warnungen blockieren das Schreiben nicht (fit-or-warn-Philosophie).

### 6.4 Fatal-Klassen und Retry (Critic-Fix: getrennt)

| Klasse | Beispiele | Verhalten |
|---|---|---|
| **Error-Envelope** (HTTP 200 + `{error}`-Body — LM-Studio-Eigenheit) | Modell nicht geladen, context length exceeded | **Sofort** Fehlerzustand mit echter Servermeldung + Handlungshinweis („Kontextlänge in LM Studio erhöhen oder Notiz kürzen"). **Kein Retry** — deterministischer Serverzustand; ein Retry mit angehängtem Feedback macht den Prompt länger und den zweiten Fehlschlag bei Context-Overflow sicher. |
| **Format-Fatal** | leerer Output, 0 Folien nach Sanitize | **Ein** Auto-Retry, im Modal sichtbar („2. Versuch …"). Feedback-Format: fehlgeschlagener Output als Assistant-Turn (gekürzt) + User-Turn „Das war kein gültiges Deck, weil X — gib NUR Deck-Markdown aus." |
| **Transport** | Stream-Netzwerkfehler trotz grünem Ping | **CORS-Fallback** (§6.5), zählt ins Budget. |

**Hartes Cap: maximal 2 Generierungs-Läufe gesamt** (Validierungs-Retry und
Transport-Fallback teilen sich das Budget — kein 4×-Stacking, keine Minuten-Kaskade).

### 6.5 CORS-Asymmetrie (Critic-Fund, wahrscheinlichster realer Fehlmodus)

`requestUrl` (Ping, Modell-Liste) ist CORS-frei; **XHR (Stream) nicht** — er läuft
unter der Obsidian-Origin und braucht Server-CORS-Header. Ollama ohne
`OLLAMA_ORIGINS`, LM Studio mit CORS-Toggle aus, Mobile-WebView: **Ping ✓, Stream
tot.** Behandlung: bei Stream-Netzwerkfehler trotz grünem Ping automatischer
**Fallback auf non-streaming `POST /v1/chat/completions` via `requestUrl`**
(funktioniert ohne CORS; kostet nur den Live-Tail — Modal zeigt Spinner). Fehler-/
Hinweistext nennt die CORS-Ursache + Abhilfe; README bekommt einen Abschnitt zu
Server-CORS-Voraussetzungen.

### 6.6 Weitere Fehlerpfade

- Kein Endpoint erreichbar → Statuszeile ✗, „Generieren" deaktiviert, Settings-Hinweis.
- `finish_reason: "length"` → Deck wird geschrieben + Notice „evtl. unvollständig —
  Token-Limit erreicht". (Erfordert die parseSSE-Erweiterung §7 — die Seed-Parser
  liefern `finish_reason` nicht.)
- Stop-Button → Abort (`e.name === "AbortError"`, Muster `vault-rag/chat_session.ts:58`),
  kein Schreiben, stiller Reset.
- Mobile: **unverifizierte Annahme** — XHR in der Capacitor-WebView + iOS-ATS für
  `http://` sind ungetestet; der non-streaming-Fallback ist zugleich der plausible
  Mobile-Pfad. Mobile-Smoke im Testplan; falls Streaming mobil nicht hält, greift der
  Fallback statt still zu scheitern.

## 7. Architektur

### 7.1 Pure Core — `src/core/llm/` (kein obsidian, kein DOM; Purity-Gate greift automatisch)

| Modul | Vertrag |
|---|---|
| `deck-prompt.ts` | `buildDeckPrompt(sourceBody, opts {slideTarget, hint}, contract)` → `ChatMessage[]` (system+user). Konsumiert `getAuthoringContract()`/`contractToPrompt()`. **`contractToPrompt` bekommt `{ includeTheme?: boolean }`** (Default `true`, Tests erweitert) — hier `false`, damit der Prompt nicht zur Theme-Wahl auffordert, die `setDeckTheme` wegwirft. Zusatz-Regeln: Verdichtung; Ausgabesprache = Notizsprache; „no preamble — output ONLY the deck markdown"; „Ausgabe beginnt mit Frontmatter, NIEMALS mit einem Folientrenner"; keine Quotes um Frontmatter-Werte; auto-Folienzahl = „aus der Inhaltsstruktur, typisch 5–12; kurze Notiz → wenige Folien"; **No-Invention**; Nicht-Bild-Embeds weglassen (Transklusion unsupported). **Quell-Frontmatter wird vor dem Prompt gestrippt** (Body-only — Schema-Frontmatter würde als Folieninhalt geechot und Kontext verbrennen). |
| `deck-sanitize.ts` | `extractDeckMarkdown(raw)`, `setDeckTheme(md, key)` — §6.1/§6.2. |
| `deck-validate.ts` | `validateDeckOutput(md)` → `{ fatal?, deck, warnings }` — §6.3. |

**Vendored** (copy-not-share; Tests mitkopieren, für Erweiterungen **neue** Tests):

| Modul | Quelle | Anpassung |
|---|---|---|
| `sse-parse.ts` | vault-rag `sse.ts:6–27` (pure Funktion) | **+ `choices[0].finish_reason`** (erstes non-null gewinnt) — sonst ist §6.6-„length" nicht implementierbar (beide Seed-Repos parsen es nicht; grep: 0 Treffer). |
| `think-splitter.ts` | vault-rag | unverändert. |
| `endpoint.ts` | vault-rag (zurückvendored aus obsidian-kit) | unverändert: `normalizeEndpoint` (Doppel-`/v1`-Falle), `resolveActiveEndpoint` (geordnete Fallback-Liste localhost/LAN). |
| `reasoning.ts` | vault-rag | unverändert: `suppressParams`-Union, `reasoningHappened`, `isAlwaysOnThinker`. |
| `error-envelope.ts` | i2m `vision_client.ts:22–42` | als eigenes pures Modul. |
| `model-info.ts` | vault-rag `chat_client.ts:39–55` + `capabilities.ts:130–151` | nur Kontext-Teile: `max_context_length`/`loaded_context_length` (LM Studio `/api/v0/models`, Ollama `/api/show`) für den Kontext-Check. |

Vendored Strings werden **nicht** deutsch hartkodiert übernommen (Seed tut das,
z. B. „Chat-Netzwerkfehler") — alle User-Meldungen via `t()` EN+DE.

### 7.2 Adapter — `src/`

| Modul | Vertrag |
|---|---|
| `llm-client.ts` | `DeckLlmClient`: `ping`/`listModels`/`modelInfo` via requestUrl-Helfer (httpJson-Muster, `throw:false`); `stream` via **XHR** (vendored `streamSSE`, hierher — XHR ist Browser-API, gehört in den Adapter; **erweitert um `raw`-Response-Body** [xhr.responseText bei onload] für den Envelope-Check: content leer UND kein `^\s*data:`-Match im raw); AbortController end-to-end; non-streaming-Fallback (§6.5). Keine Timeouts. |
| `generate-deck.ts` | Orchestrator (Plugin-Ebene, **überlebt Modal-Close**): read Quelle → Frontmatter strippen → buildDeckPrompt → stream (mit Fallback) → sanitize → validate → ggf. 1 Retry → vault.create/modify → open + Preview-refresh. Hält `running`-State fürs Modal-Re-Attach. |
| `generate-deck-modal.ts` | Modal, Zustände `input | running | error`; reine Anzeige + Steuerung des Orchestrators. DOM via createEl-Familie; keine statischen Inline-Styles (setProperty-Lesson), kein innerHTML. |
| `main.ts` | Command-Registrierung; `activatePreview`-Refactor (public/Helfer). |
| `settings.ts` | Neue Gruppe **„AI (local)"**, deklarativ (seit 0.4.0): `llmEndpoints: string[]` (Default `["http://localhost:1234"]`) als **natives `SettingDefinitionList`** (`type:'list'`, 1.13-API — nicht das imperative vault-rag-Muster; Blur-statt-onChange-Lesson bleibt; Ping-Icon ggf. via kleinem render-Anteil) · `llmModel: string` als **bespoke render-Callback** (async via `/v1/models`, Freitext-Fallback offline — die deklarative dropdown-Control ist synchron) · `llmMaxTokens` (Default 8192 — vault-rags 4096 reichte für Decks nicht) · `llmTemperature` (Default 0.3) · `llmSuppressThinking` (Default true). Vier Stellen je Key (Interface, DEFAULT_SETTINGS, Definition-Item, get/setControlValue). |
| `i18n.ts` | Alle neuen Strings EN+DE. |

## 8. Privacy / Community-Konformität

- **README-Disclosure (EN/DE), präzise formuliert:** Requests gehen ausschließlich an
  die vom User konfigurierten Endpoints (Default localhost). Erreichbarkeits-Pings und
  Modell-Listen werden beim Öffnen von Dialog/Settings abgefragt; **Notiz-Inhalte nur
  bei explizitem „Generieren"**. (Developer Policies verlangen „Network use"-Disclosure;
  keine KI-Sonderkategorie — Volltext geprüft. Nicht mehr versprechen, als das
  Verhalten hält: die Pings SIND automatische Requests.)
- Kein `fetch` (lint-gesperrt; XHR ist konform — vault-rag-Präzedenz), keine statischen
  Inline-Styles, kein innerHTML.
- **Keine neuen npm-Dependencies** (alles vendored) — der Review-Install bleibt
  netzunabhängig.
- `minAppVersion` bleibt 1.13.0 (reicht inkl. `SettingDefinitionList`).

## 9. Tests

- **Core (vitest, node):**
  - `deck-prompt`: Contract-Zeilen enthalten, `includeTheme:false` filtert Theme-Zeile,
    slideTarget auto/Zahl, hint, Sprachregel, No-Invention, Body-only (Frontmatter
    gestrippt).
  - `deck-sanitize`: Präambel · ```-Wrapper · nacktes `</think>` · führendes-`---`
    (beide Zweige der Disambiguierung) · Trenner-Whitespace · `key:`-only-Folien-Drop ·
    Quote-Normalisierung.
  - `setDeckTheme`: ersetzen im Block / injizieren ohne Block / `theme:`-Zeile im
    Code-Fence bleibt unberührt.
  - `deck-validate`: fatal (leer, 0 Folien) vs. warnings; Stub-FitResult-Vertrag.
  - vendored: `sse-parse` (kopierte + **neue finish_reason-Tests**), `think-splitter`,
    `endpoint`, `reasoning`, `error-envelope`, `model-info`.
- **Adapter:** `settings.test.ts` Binding-Round-Trip um alle neuen Keys erweitert.
- **Gates:** check-core-purity (erfasst `core/llm` automatisch), check-render-realm
  unberührt, `npm run lint`, bundle-smoke unverändert.
- **GUI-Smoke (manuell, Pallas):** Happy Path (LM Studio) · **Ollama-Default-Setup
  (CORS-Fall + Fallback)** · Offline · Stop mid-stream · Modal-Close mid-stream
  (Weiterlauf + Notice) · Re-Run/Ersetzen · lange Notiz (Kontext-Warnung) ·
  Reasoning-Modell mit fehlgeschlagener Suppression · Non-Reasoning-Modell ·
  **Mobile (iOS, LAN-Endpoint)**.

## 10. Critic-Panel-Ledger (Grounding der Härtungen)

Adversariales 3-Linsen-Panel (Community-Konformität · Architektur-Konsistenz ·
Edge-Cases) gegen den echten Code beider Seed-Repos + slide-deck. Eingearbeitet:

1. **[Blocker]** Führendes `---` frisst Folie 1 lautlos → Disambiguierungs-Heuristik §6.1.
2. **[Major]** Vendored SSE liefert weder `raw` noch `finish_reason` → explizite
   Erweiterungen §7 (sonst zwei tote Fehlerpfad-Zusagen).
3. **[Major]** CORS-Asymmetrie Ping/Stream → non-streaming-Fallback + Meldung §6.5.
4. **[Major]** Modal-Esc vernichtet Minuten Generierung → Close ≠ Abort §5.3.
5. **[Major]** Retry undifferenziert → Fatal-Klassen-Trennung + 2-Läufe-Cap §6.4.
6. **[Major]** Suffix-Schleife = Deck-copy-Müllhalde → Ersetzen-Default §4.
7. **[Major]** 30k-Schwellwert falsch kalibriert → modelInfo/`loaded_context_length` §5.2.
8. **[Major]** Nacktes `</think>` + wiederholte Frontmatter-Blöcke → Sanitizer §6.1.
9. **[Major]** Mobile unverifiziert → als Annahme gekennzeichnet + Smoke-Plan §6.6/§9.
10. Minor: `SettingDefinitionList` statt imperativem Muster; `llmModel` als render-Callback;
    Vault-API statt adapter.exists; `contractToPrompt`-Theme-Filter; Disclosure präzisiert;
    Prompt-Lücken (Quell-Frontmatter, auto-Regel, No-Invention, Quelle-ist-Deck-Hinweis);
    validateDeckOutput-Grenzen dokumentiert; Referenz-Korrekturen (`ThemeStore.getThemes()`;
    Abort-Muster ist in vault-rag korrekt — als Positiv-Referenz übernommen).

## 11. Offene Punkte für die Implementierungs-Session

1. **Spec-Review durch Johannes** (dieses Dokument) — insbesondere §4-Entscheidungen,
   die pauschal statt einzeln freigegeben wurden (Iteration, Ansatz A, Notiz-Suffix
   „— Deck", Settings-Defaults).
2. `superpowers:writing-plans` auf Basis dieser Spec → Implementierungsplan →
   `feat/llm-deck-transform`.
3. Beim Smoke: LM Studio muss laufen (Modell geladen); für den CORS-Fall Ollama ohne
   `OLLAMA_ORIGINS` testen.
