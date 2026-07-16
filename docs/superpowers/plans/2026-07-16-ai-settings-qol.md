# KI-Settings-QoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der KI-Settings-Bereich bekommt die drei verbindlichen `UI-STANDARD.md §8`-Bausteine (Endpoint-Zeilen-Editor mit Live-Probe, Status-Indikator, Async Modell-Feld) plus Kit-Diagnose und Kür (Kontextanzeige, Live-Suppress-Test, Always-on-Thinker), geteilt mit der Generate-Deck-View.

**Architecture:** Drei Schichten. `src/vendor/kit/` = verbatim Kit 0.14.0 (kein Eigenbau). `src/core/llm/ai-settings-model.ts` = pure Zustandslogik, obsidian-frei, vitest-bar ohne DOM. `src/ai-settings-ui.ts` = dünner Render gegen die pure Logik; `settings.ts` und `generate-deck-view.ts` sind nur Call-Sites.

**Tech Stack:** TypeScript strict · esbuild · vitest (`environment: "node"`, **kein DOM**) · Obsidian Plugin API

**Spec:** `docs/superpowers/specs/2026-07-16-ai-settings-qol-design.md`

## Global Constraints

- **Pure-Core-Invariante:** `src/core/**` darf niemals `obsidian`, `document.`, `window.`, `activeDocument`, `activeWindow` enthalten. Erzwungen durch `scripts/check-core-purity.mjs` (Schritt 1 von `npm test`). Task 1 erweitert das Gate auf `src/vendor/kit`.
- **vitest läuft mit `environment: "node"` — kein DOM, kein happy-dom.** Renderer sind NICHT unit-testbar. Nur pure Logik bekommt Tests; die Render-Schicht deckt der GUI-Smoke ab.
- **i18n:** EN ist kanonisch, DE übersetzt. Nutzersichtbare Strings **immer** via `t()` aus `src/i18n.ts` — keine Literale in der UI. `tests/i18n.test.ts` prüft EN/DE-Parität.
- **Kit-Klartexte nie durchreichen:** Kit's `EndpointStatus.klartext` ist hartkodiert **deutsch**. Gemappt wird ausschließlich über `kind` → `statusKindKey(kind)` → `t(key)`. Einzige Ausnahme: `kind === "unknown"`, dort trägt `raw` die einzige Information.
- **UI-STANDARD §2:** kein `innerHTML`. Nur `createEl`/`createDiv`/`createSpan`/`empty()`. Icons via `setIcon` (Lucide). Icon-only-Buttons **immer** mit `aria-label`/`setTooltip`.
- **UI-STANDARD §8:** Status = Form UND Farbe UND `is-ok`/`is-error`/`is-checking`-Klasse UND `aria-label` (WCAG 1.4.1 — Farbe nie allein). Icon-Vokabel: `loader` / `circle-check` / `circle-x` / `alert-triangle`.
- **Listen-Mutation nur bei `blur`, nie `onChange`** — sonst persistiert jeder Tastendruck-Zwischenstand (im Adder entstünden `h`, `ht`, `htt`, …).
- **Commits:** Conventional Commits, deutsche Beschreibung. **Nur berührte Dateien stagen.** Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Kit-Pin:** obsidian-kit **0.14.0**, sha **644603c** (`/Users/Shared/code/obsidian-plugins/obsidian-kit`).
- Nach jeder Task: `npm test` grün + `npx tsc --noEmit` clean (vitest ≠ tsc, beide laufen).

---

### Task 1: Kit-Vendor-Sweep auf 0.14.0 + Purity-Gate auf vendor ausdehnen

Heute liegen fünf Vendor-Module auf **vier verschiedenen Kit-Versionen** (think@0.2.0, endpoint+sse@0.3.0, settings@0.4.0, reasoning@0.6.0). Kit steht bei 0.14.0. `src/core/llm/model-info.ts` ist eine Handkopie von Kit's `model-context.ts`.

**Files:**
- Create: `src/vendor/kit/endpoint_diagnostics.ts`, `src/vendor/kit/model-context.ts`, `src/vendor/VENDOR.json`
- Modify: `src/vendor/kit/endpoint.ts`, `sse.ts`, `think.ts`, `settings.ts`, `reasoning.ts` (verbatim-Refresh auf 0.14.0)
- Modify: `src/core/llm/model-info.ts` (→ Re-Export + Eigenleistung)
- Modify: `scripts/check-core-purity.mjs:19` (Gate auf `src/vendor/kit` ausdehnen)

**Interfaces:**
- Produces: `classifyEndpointStatus(input: ProbeInput): EndpointStatus`, `validateEndpointInput(url: string): EndpointWarning[]`, `ENDPOINT_PRESETS: EndpointPreset[]`, Typen `EndpointStatusKind = "ok"|"refused"|"unknown-host"|"timeout"|"not-an-llm-api"|"unknown"`, `EndpointStatus {reachable, kind, klartext, raw?}`, `ProbeInput = {kind:"response",status,body} | {kind:"error",message} | {kind:"timeout"}`, `EndpointWarning {rule, message}`, `EndpointPreset {label, url}`
- Produces: `parseLmStudioContext(json, model)`, `parseOllamaContext(json)`, `ModelContext {maxContextLength?, loadedContextLength?}` — weiterhin re-exportiert aus `src/core/llm/model-info.ts` (bestehende Importe in `llm-client.ts:6` bleiben gültig)

- [ ] **Step 1: Kit-Stand verifizieren (Pin muss stimmen)**

```bash
cd /Users/Shared/code/obsidian-plugins/obsidian-kit && git status --short && git rev-parse --short HEAD && node -p "require('./package.json').version"
```

Erwartet: sauberer Tree (keine Ausgabe von `git status --short`), `644603c`, `0.14.0`.
**Wenn der Tree schmutzig ist oder der sha abweicht: STOPP** — dann wäre der Pin gelogen. Melde es statt zu vendoren.

- [ ] **Step 2: Vendor-Module verbatim kopieren + Herkunfts-Header setzen**

Jede Datei bekommt als **Zeile 1** einen Header nach bestehendem Muster (`src/vendor/kit/endpoint.ts` hat heute einen). Format:

```
// vendored from obsidian-kit@0.14.0 (644603c) — src/pure/<datei>.ts — verbatim, do not edit here.
```

```bash
cd /Users/Shared/code/obsidian-plugins/markdown-presentation
KIT=/Users/Shared/code/obsidian-plugins/obsidian-kit/src/pure
for pair in "endpoint.ts:endpoint.ts" "sse.ts:sse.ts" "think-splitter.ts:think.ts" "settings.ts:settings.ts" "reasoning.ts:reasoning.ts" "endpoint_diagnostics.ts:endpoint_diagnostics.ts" "model-context.ts:model-context.ts"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  printf '// vendored from obsidian-kit@0.14.0 (644603c) — src/pure/%s — verbatim, do not edit here.\n' "$src" > "src/vendor/kit/$dst"
  cat "$KIT/$src" >> "src/vendor/kit/$dst"
done
git diff --stat src/vendor/kit/
```

Erwartet: 7 Dateien, davon 2 neu (`endpoint_diagnostics.ts`, `model-context.ts`).

- [ ] **Step 3: VENDOR.json anlegen**

Datei `src/vendor/VENDOR.json` (KIT-MATRIX-Konvention, Vorbild `vim-dojo`):

```json
{
  "source": "https://codeberg.org/jkaindl/obsidian-kit",
  "version": "0.14.0",
  "sha": "644603c",
  "vendored": "2026-07-16",
  "modules": [
    "endpoint.ts",
    "endpoint_diagnostics.ts",
    "model-context.ts",
    "reasoning.ts",
    "settings.ts",
    "sse.ts",
    "think.ts"
  ],
  "note": "Verbatim copies of obsidian-kit/src/pure/*. Never edit here — re-vendor from the pinned sha. think.ts is kit's think-splitter.ts."
}
```

- [ ] **Step 4: Purity-Gate auf vendor ausdehnen**

In `scripts/check-core-purity.mjs`, letzte Zeilen ersetzen:

```javascript
walk("src/core");
walk("src/vendor/kit");   // vendored kit modules are pure by kit design — pin that, so core may import them
console.log("core purity OK");
```

- [ ] **Step 5: model-info.ts auf Re-Export + Eigenleistung schrumpfen**

`src/core/llm/model-info.ts` komplett ersetzen:

```typescript
// Kit owns the context parsers (vendored, pinned). Only the two estimator helpers below are ours.
export { parseLmStudioContext, parseOllamaContext, type ModelContext } from "../../vendor/kit/model-context";

/** Rough token estimate: ~3.5 characters per token (English/German prose average). */
export function estimateTokens(chars: number): number { return Math.ceil(chars / 3.5); }

/** True only when a context limit is known and the request would not fit. */
export function contextOverflow(inputTokens: number, maxTokens: number, contextLimit: number | undefined): boolean {
  if (contextLimit == null) return false;
  return inputTokens + maxTokens > contextLimit;
}
```

- [ ] **Step 6: Gates laufen lassen — der Sweep darf nichts brechen**

```bash
npm test && npx tsc --noEmit
```

Erwartet: `core purity OK`, alle Tests grün, tsc clean. `tests/core/model-info.test.ts` testet weiter gegen dieselben Namen (Re-Export ist transparent) und ist damit der Regressionsschutz für den Sweep.
**Wenn Tests fehlschlagen:** ein Kit-Diff 0.2→0.14 hat Verhalten geändert. Nicht das Vendor-Modul editieren (verbatim!) — den Aufrufer anpassen oder melden.

- [ ] **Step 7: Commit**

```bash
git add src/vendor/ src/core/llm/model-info.ts scripts/check-core-purity.mjs
git commit -m "$(cat <<'EOF'
chore(vendor): Kit-Sweep auf 0.14.0 + endpoint_diagnostics/model-context + VENDOR.json

Die fünf vendorten Module lagen auf vier verschiedenen Kit-Versionen
(0.2.0/0.3.0/0.4.0/0.6.0); Kit steht bei 0.14.0. Alle verbatim nachgezogen,
endpoint_diagnostics + model-context neu dazu, VENDOR.json pinnt version+sha.

model-info.ts war eine Handkopie von kit/model-context.ts am Kit vorbei und
re-exportiert es jetzt; estimateTokens/contextOverflow bleiben Eigenleistung.
Das Purity-Gate walkt zusätzlich src/vendor/kit — Kit-Module sind per Design
pure, das pinnt es zu und macht core→vendor-Importe legitim statt geduldet.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure Zustandslogik `ai-settings-model.ts` (TDD)

**Files:**
- Create: `src/core/llm/ai-settings-model.ts`
- Test: `tests/core/ai-settings-model.test.ts`

**Interfaces:**
- Consumes: `EndpointStatusKind` aus Task 1 (`src/vendor/kit/endpoint_diagnostics`), `isAlwaysOnThinker` aus `src/vendor/kit/reasoning`
- Produces:
  - `applyEndpointEdit(list: string[], index: number, value: string, isAdder: boolean): string[]`
  - `activeIndexFromStatuses(statuses: (EndpointStatusKind | null)[]): number`
  - `modelFieldMode(models: string[]): "dropdown" | "freetext"`
  - `thinkToggleView(model: string, suppress: boolean): ThinkToggleView` mit `ThinkToggleView {labelKey: "deck.settings.thinking.on"|"deck.settings.thinking.off"|"deck.settings.thinking.always", cls: ""|"is-off"|"is-disabled", disabled: boolean}`
  - `effectiveSuppress(model: string, suppress: boolean): boolean`
  - `statusKindKey(kind: EndpointStatusKind): string` → `"deck.settings.endpoint.status.<kind>"`
  - `warnRuleKey(rule: string): string` → `"deck.settings.endpoint.warn.<rule>"`

- [ ] **Step 1: Write the failing test**

`tests/core/ai-settings-model.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  applyEndpointEdit, activeIndexFromStatuses, modelFieldMode,
  thinkToggleView, effectiveSuppress, statusKindKey, warnRuleKey,
} from "../../src/core/llm/ai-settings-model";

describe("applyEndpointEdit", () => {
  it("appends a non-empty value from the adder row", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "http://b:2", true)).toEqual(["http://a:1", "http://b:2"]);
  });
  it("is a no-op when the adder row is left empty", () => {
    expect(applyEndpointEdit(["http://a:1"], 1, "   ", true)).toEqual(["http://a:1"]);
  });
  it("replaces an existing row in place", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "http://z:9", false)).toEqual(["http://z:9", "http://b:2"]);
  });
  it("removes an existing row that was cleared", () => {
    expect(applyEndpointEdit(["http://a:1", "http://b:2"], 0, "", false)).toEqual(["http://b:2"]);
  });
  it("trims the value", () => {
    expect(applyEndpointEdit([], 0, "  http://a:1  ", true)).toEqual(["http://a:1"]);
  });
  it("never persists blank entries", () => {
    expect(applyEndpointEdit(["http://a:1", "  "], 0, "http://z:9", false)).toEqual(["http://z:9"]);
  });
});

describe("activeIndexFromStatuses", () => {
  it("picks the first ok — resolveActiveEndpoint semantics", () => {
    expect(activeIndexFromStatuses(["refused", "ok", "ok"])).toBe(1);
  });
  it("returns -1 when nothing is reachable", () => {
    expect(activeIndexFromStatuses(["refused", "timeout"])).toBe(-1);
  });
  it("treats not-yet-probed (null) as not active, not as an error", () => {
    expect(activeIndexFromStatuses([null, null])).toBe(-1);
  });
});

describe("modelFieldMode", () => {
  it("is a dropdown once models are loaded", () => {
    expect(modelFieldMode(["qwen3"])).toBe("dropdown");
  });
  it("falls back to freetext when offline / not yet loaded", () => {
    expect(modelFieldMode([])).toBe("freetext");
  });
});

describe("thinkToggleView", () => {
  it("shows an always-on model as disabled", () => {
    expect(thinkToggleView("gpt-oss-20b", true)).toEqual({ labelKey: "deck.settings.thinking.always", cls: "is-disabled", disabled: true });
  });
  it("shows suppressed thinking as off", () => {
    expect(thinkToggleView("qwen3", true)).toEqual({ labelKey: "deck.settings.thinking.off", cls: "is-off", disabled: false });
  });
  it("shows unsuppressed thinking as on", () => {
    expect(thinkToggleView("qwen3", false)).toEqual({ labelKey: "deck.settings.thinking.on", cls: "", disabled: false });
  });
});

describe("effectiveSuppress", () => {
  it("suppresses a normal model when asked", () => {
    expect(effectiveSuppress("qwen3", true)).toBe(true);
  });
  it("never suppresses an always-on model — it rejects reasoning_effort:none", () => {
    expect(effectiveSuppress("gpt-oss-20b", true)).toBe(false);
  });
  it("does not suppress when the user does not want it", () => {
    expect(effectiveSuppress("qwen3", false)).toBe(false);
  });
});

describe("i18n key mappers", () => {
  it("maps a status kind to its key", () => {
    expect(statusKindKey("not-an-llm-api")).toBe("deck.settings.endpoint.status.not-an-llm-api");
  });
  it("maps a warn rule to its key", () => {
    expect(warnRuleKey("port")).toBe("deck.settings.endpoint.warn.port");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/ai-settings-model.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/llm/ai-settings-model"`

- [ ] **Step 3: Write minimal implementation**

`src/core/llm/ai-settings-model.ts`:

```typescript
// Pure state logic of the AI settings UI: obsidian-free, DOM-free, node-testable and pinned by
// check-core-purity. The render layer (ai-settings-ui.ts) calls these and stays thin.
import type { EndpointStatusKind } from "../../vendor/kit/endpoint_diagnostics";
import { isAlwaysOnThinker } from "../../vendor/kit/reasoning";

/** Applies one row-editor edit to the endpoint list.
 *  - trims the value;
 *  - `isAdder` (the trailing blank row) appends a non-empty value; an empty one is a no-op;
 *  - an existing row cleared to empty is removed, otherwise replaced in place;
 *  - blank entries are always filtered out — never persist an empty line. */
export function applyEndpointEdit(list: string[], index: number, value: string, isAdder: boolean): string[] {
  const v = value.trim();
  let next: string[];
  if (isAdder) {
    next = v ? [...list, v] : [...list];
  } else {
    next = [...list];
    if (v) next[index] = v;
    else next.splice(index, 1);
  }
  return next.filter((e) => e.trim().length > 0);
}

/** Index of the first `ok` row (= the active endpoint, exactly resolveActiveEndpoint semantics),
 *  else -1. `null` means "not probed yet" — that is not an error, just not active. */
export function activeIndexFromStatuses(statuses: (EndpointStatusKind | null)[]): number {
  return statuses.findIndex((s) => s === "ok");
}

/** Mode of the model field: `dropdown` as soon as any models were loaded, else `freetext`
 *  (offline / not yet probed). A saved model missing from the list does NOT hide the dropdown —
 *  the render layer keeps it as an extra option (never lose it, but make it selectable). */
export function modelFieldMode(models: string[]): "dropdown" | "freetext" {
  return models.length > 0 ? "dropdown" : "freetext";
}

export interface ThinkToggleView {
  labelKey: "deck.settings.thinking.on" | "deck.settings.thinking.off" | "deck.settings.thinking.always";
  cls: "" | "is-off" | "is-disabled";
  disabled: boolean;
}

/** gpt-oss/harmony cannot be switched off → disabled + "always on". Otherwise on/off per flag. */
export function thinkToggleView(model: string, suppress: boolean): ThinkToggleView {
  if (isAlwaysOnThinker(model)) return { labelKey: "deck.settings.thinking.always", cls: "is-disabled", disabled: true };
  if (suppress) return { labelKey: "deck.settings.thinking.off", cls: "is-off", disabled: false };
  return { labelKey: "deck.settings.thinking.on", cls: "", disabled: false };
}

/** Effective suppress for the request: only when the user wants it AND the model can be switched
 *  off. Always-on models (gpt-oss/harmony) reject reasoning_effort:"none" — never suppress there
 *  (mirrors the toggle's disabled state onto the request side). */
export function effectiveSuppress(model: string, suppress: boolean): boolean {
  return suppress && !isAlwaysOnThinker(model);
}

/** i18n key for an endpoint status kind (the render layer calls `t(key)`).
 *  Kit's own `klartext` is hardcoded German — never surface it; map via `kind`. */
export function statusKindKey(kind: EndpointStatusKind): string {
  return `deck.settings.endpoint.status.${kind}`;
}

/** i18n key for an input warning rule (the render layer calls `t(key)`). */
export function warnRuleKey(rule: string): string {
  return `deck.settings.endpoint.warn.${rule}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/ai-settings-model.test.ts && npm test`
Expected: alle grün, `core purity OK` (die Datei importiert nur aus `vendor/kit`, das seit Task 1 mitgepinnt ist)

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/ai-settings-model.ts tests/core/ai-settings-model.test.ts
git commit -m "$(cat <<'EOF'
feat(core): pure Zustandslogik für den KI-Settings-Bereich

applyEndpointEdit/activeIndexFromStatuses/modelFieldMode (vault-crews-Kanon)
+ thinkToggleView/effectiveSuppress (aus image-to-markdown gehoben, REGISTRY:20
Kit-Kandidat — dies ist das zweite Exemplar) + statusKindKey/warnRuleKey.

Kits klartext ist hartkodiert deutsch; dieses Plugin ist EN-kanonisch → gemappt
wird ausschließlich über kind.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: i18n-Keys EN/DE + Paritäts-Test über alle Status-Kinds

**Files:**
- Modify: `src/i18n.ts` (EN-Block bei `deck.settings.*` ~Z. 91-101; DE-Block ~Z. 186-196)
- Modify: `tests/i18n.test.ts`

**Interfaces:**
- Consumes: `statusKindKey`/`warnRuleKey` aus Task 2
- Produces: i18n-Keys, die Task 5-7 rendern

- [ ] **Step 1: Write the failing test**

An `tests/i18n.test.ts` anhängen. Der Test iteriert über **alle** `EndpointStatusKind`-Werte, damit ein künftiger Kit-Nachzug mit neuem `kind` nicht still einen fehlenden Key erzeugt:

```typescript
import { statusKindKey, warnRuleKey } from "../src/core/llm/ai-settings-model";
import type { EndpointStatusKind } from "../src/vendor/kit/endpoint_diagnostics";

describe("AI settings i18n coverage", () => {
  const KINDS: EndpointStatusKind[] = ["ok", "refused", "unknown-host", "timeout", "not-an-llm-api", "unknown"];
  const RULES = ["scheme", "malformed", "port", "placeholder-ip"];

  it.each(KINDS)("has EN+DE for status kind %s", (kind) => {
    const key = statusKindKey(kind);
    setLang("en"); expect(t(key)).not.toBe(key);
    setLang("de"); expect(t(key)).not.toBe(key);
  });

  it.each(RULES)("has EN+DE for warn rule %s", (rule) => {
    const key = warnRuleKey(rule);
    setLang("en"); expect(t(key)).not.toBe(key);
    setLang("de"); expect(t(key)).not.toBe(key);
  });
});
```

**Hinweis:** `t()` gibt bei fehlendem Key den Key selbst zurück — deshalb `not.toBe(key)`. Prüfe die bestehenden Importe/Helper oben in `tests/i18n.test.ts` (`t`, `setLang`) und ergänze nur, was fehlt. Die `RULES` sind die vier `rule`-Werte aus Kit's `validateEndpointInput` (`endpoint_diagnostics.ts:77,87,93,96`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — die Status-/Warn-Keys fehlen in beiden Dicts

- [ ] **Step 3: Write minimal implementation**

In `src/i18n.ts`, **EN-Block**, nach `"deck.settings.suppressThinking.desc"` einfügen:

```typescript
  "deck.settings.endpoint.status.ok": "Connected",
  "deck.settings.endpoint.status.refused": "Connection refused — server not running or wrong port.",
  "deck.settings.endpoint.status.unknown-host": "Unknown host — typo in the address?",
  "deck.settings.endpoint.status.timeout": "Timed out — network unreachable (wrong network / VPN off?).",
  "deck.settings.endpoint.status.not-an-llm-api": "Answers, but is not an OpenAI-compatible endpoint — wrong path or service?",
  "deck.settings.endpoint.status.unknown": "Not reachable",
  "deck.settings.endpoint.warn.scheme": "Address needs http:// or https://",
  "deck.settings.endpoint.warn.malformed": "Address is not a valid URL",
  "deck.settings.endpoint.warn.port": "Local LLM servers almost always need a port (e.g. :1234)",
  "deck.settings.endpoint.warn.placeholder-ip": "Looks like an example / placeholder address",
  "deck.settings.endpoint.probing": "Checking…",
  "deck.settings.endpoint.check": "Check connections",
  "deck.settings.endpoint.remove": "Remove endpoint",
  "deck.settings.endpoint.addPreset": "+ {0}",
  "deck.settings.model.load": "Load models",
  "deck.settings.model.loading": "Loading…",
  "deck.settings.model.loaded": "{0} models loaded",
  "deck.settings.model.none": "No endpoint reachable — enter the model id manually.",
  "deck.settings.model.context": "max context {0}",
  "deck.settings.model.contextLoaded": "max context {0} · loaded {1}",
  "deck.settings.thinking.on": "Thinking on",
  "deck.settings.thinking.off": "Thinking off",
  "deck.settings.thinking.always": "Always on (model cannot disable it)",
  "deck.settings.thinking.test": "Test",
  "deck.settings.thinking.testing": "Testing…",
  "deck.settings.thinking.testOk": "Thinking is being suppressed.",
  "deck.settings.thinking.testFail": "The model thinks despite “off” — its server ignores the suppress params.",
  "deck.settings.thinking.testError": "Test failed: {0}",
  "deck.settings.thinking.testNoModel": "Pick a model first.",
```

Dieselben Keys im **DE-Block** (analoge Position):

```typescript
  "deck.settings.endpoint.status.ok": "Verbunden",
  "deck.settings.endpoint.status.refused": "Verbindung abgelehnt — Server läuft nicht oder Port falsch.",
  "deck.settings.endpoint.status.unknown-host": "Hostname unbekannt — Tippfehler in der Adresse?",
  "deck.settings.endpoint.status.timeout": "Zeitüberschreitung — Netz nicht erreichbar (falsches Netz / VPN aus?).",
  "deck.settings.endpoint.status.not-an-llm-api": "Antwortet, ist aber kein OpenAI-kompatibler Endpunkt — falscher Pfad/Dienst?",
  "deck.settings.endpoint.status.unknown": "Nicht erreichbar",
  "deck.settings.endpoint.warn.scheme": "Adresse braucht http:// oder https://",
  "deck.settings.endpoint.warn.malformed": "Adresse ist keine gültige URL",
  "deck.settings.endpoint.warn.port": "Lokale LLM-Server brauchen fast immer einen Port (z. B. :1234)",
  "deck.settings.endpoint.warn.placeholder-ip": "Sieht aus wie eine Beispiel-/Platzhalter-Adresse",
  "deck.settings.endpoint.probing": "Prüfe…",
  "deck.settings.endpoint.check": "Verbindungen prüfen",
  "deck.settings.endpoint.remove": "Endpunkt entfernen",
  "deck.settings.endpoint.addPreset": "+ {0}",
  "deck.settings.model.load": "Modelle laden",
  "deck.settings.model.loading": "Lade…",
  "deck.settings.model.loaded": "{0} Modelle geladen",
  "deck.settings.model.none": "Kein Endpunkt erreichbar — Modell-id von Hand eintragen.",
  "deck.settings.model.context": "max. Kontext {0}",
  "deck.settings.model.contextLoaded": "max. Kontext {0} · geladen {1}",
  "deck.settings.thinking.on": "Thinking an",
  "deck.settings.thinking.off": "Thinking aus",
  "deck.settings.thinking.always": "Immer an (Modell kann es nicht abschalten)",
  "deck.settings.thinking.test": "Testen",
  "deck.settings.thinking.testing": "Teste…",
  "deck.settings.thinking.testOk": "Thinking wird unterdrückt.",
  "deck.settings.thinking.testFail": "Das Modell denkt trotz „aus" — sein Server ignoriert die Suppress-Parameter.",
  "deck.settings.thinking.testError": "Test fehlgeschlagen: {0}",
  "deck.settings.thinking.testNoModel": "Erst ein Modell wählen.",
```

Außerdem die Endpoints-Beschreibung anpassen (die Textarea verschwindet in Task 5) — EN:

```typescript
  "deck.settings.endpoints.desc": "OpenAI-compatible base URLs; the first reachable one is used. Default: http://localhost:1234",
```

DE:

```typescript
  "deck.settings.endpoints.desc": "OpenAI-kompatible Basis-URLs; der erste erreichbare wird genutzt. Standard: http://localhost:1234",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/i18n.test.ts && npm test`
Expected: alle grün (inkl. der bestehenden EN/DE-Paritätsprüfung)

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts tests/i18n.test.ts
git commit -m "$(cat <<'EOF'
feat(i18n): Keys für Endpoint-Diagnose, Modell-Feld und Thinking-Test (EN+DE)

Der Paritätstest iteriert über alle EndpointStatusKind-Werte statt über eine
Literal-Liste — ein künftiger Kit-Nachzug mit neuem kind fällt damit auf, statt
still einen fehlenden Key zu erzeugen.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `probe()` im Client — echte Diagnose statt `status===200`

Heute prüft `ping()` nur `status === 200` (`llm-client.ts:29-31`). LM Studio antwortet auf `/v1/v1/...` mit HTTP 200 **plus Fehler-Body** — der heutige Ping meldet dafür „erreichbar".

**Files:**
- Modify: `src/llm-client.ts:29-31` (ping) + neue `probe()`
- Test: `tests/llm-client.test.ts`

**Interfaces:**
- Consumes: `classifyEndpointStatus`, `ProbeInput`, `EndpointStatus` aus Task 1
- Produces: `DeckLlmClient.probe(): Promise<EndpointStatus>`; `ping()` bleibt `Promise<boolean>` (Signatur unverändert — `resolveActiveEndpoint` braucht sie so)

- [ ] **Step 1: Write the failing test**

An `tests/llm-client.test.ts` anhängen. Schau dir oben im File an, wie dort ein Fake-`HttpJson` gebaut wird, und folge dem Muster:

```typescript
describe("probe", () => {
  const noStream = (() => { throw new Error("not used"); }) as never;

  it("classifies a model-list response as ok", async () => {
    const http = async () => ({ status: 200, json: { data: [{ id: "qwen3" }] }, text: "" });
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: true, kind: "ok" });
  });

  it("classifies HTTP 200 with an error body as not-an-llm-api — the /v1/v1 trap", async () => {
    const http = async () => ({ status: 200, json: { error: "Unexpected endpoint" }, text: "" });
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "not-an-llm-api" });
  });

  it("classifies a refused connection", async () => {
    const http = async () => { throw new Error("net::ERR_CONNECTION_REFUSED"); };
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "refused" });
  });

  it("classifies an unknown host", async () => {
    const http = async () => { throw new Error("getaddrinfo ENOTFOUND nope.invalid"); };
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "unknown-host" });
  });

  it("keeps the raw message for an unclassifiable error", async () => {
    const http = async () => { throw new Error("weird failure"); };
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ kind: "unknown", raw: "weird failure" });
  });

  it("ping stays a boolean and now rejects a non-LLM 200", async () => {
    const ok = new DeckLlmClient("http://x:1", "m", async () => ({ status: 200, json: { data: [] }, text: "" }), noStream);
    const bad = new DeckLlmClient("http://x:1", "m", async () => ({ status: 200, json: { error: "nope" }, text: "" }), noStream);
    expect(await ok.ping()).toBe(true);
    expect(await bad.ping()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm-client.test.ts`
Expected: FAIL — `c.probe is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/llm-client.ts` den Import ergänzen:

```typescript
import { classifyEndpointStatus, type EndpointStatus, type ProbeInput } from "./vendor/kit/endpoint_diagnostics";
```

`ping()` (Z. 29-31) ersetzen durch:

```typescript
  /** Reachability with a named diagnosis. GET /v1/models, 5s cap — requestUrl knows no
   *  timeout/abort, so the race is the only way to bound a dead endpoint. Never throws:
   *  a failure degrades to a classified status (settings must never die on a probe). */
  async probe(timeoutMs = 5000): Promise<EndpointStatus> {
    const timeout = new Promise<ProbeInput>((r) => setTimeout(() => r({ kind: "timeout" }), timeoutMs));
    const call: Promise<ProbeInput> = this.http({ url: `${this.endpoint}/v1/models` })
      .then((r) => ({ kind: "response", status: r.status, body: r.json }) as ProbeInput)
      .catch((e: unknown) => ({ kind: "error", message: (e as Error)?.message ?? String(e) }) as ProbeInput);
    return classifyEndpointStatus(await Promise.race([call, timeout]));
  }

  /** Boolean reachability for resolveActiveEndpoint's injected ping. Delegates to probe() so
   *  "HTTP 200 + error body" (LM Studio on /v1/v1) counts as unreachable, not as ok. */
  async ping(): Promise<boolean> {
    return (await this.probe()).reachable;
  }
```

**Wichtig:** `setTimeout` ist in `src/llm-client.ts` (Adapter-Schicht) erlaubt — das Purity-Gate walkt nur `src/core` und `src/vendor/kit`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llm-client.test.ts && npm test && npx tsc --noEmit`
Expected: alle grün. Die bestehenden `ping`-Tests müssen mitlaufen — schlägt einer fehl, weil er einen 200er ohne `data`-Array als `true` erwartete, ist **der Test** veraltet (das war genau der Bug): Fixture auf `{ data: [] }` korrigieren.

- [ ] **Step 5: Commit**

```bash
git add src/llm-client.ts tests/llm-client.test.ts
git commit -m "$(cat <<'EOF'
fix(llm): probe() mit echter Diagnose — ping() erkennt jetzt not-an-llm-api

ping() prüfte nur status===200 und meldete damit "erreichbar" für alles, was
irgendwie antwortet. LM Studio antwortet auf /v1/v1/... mit HTTP 200 + Fehler-Body
(genau die Falle, vor der kits normalizeEndpoint warnt) → still falsche Diagnose.

probe() liefert das Rohsignal an classifyEndpointStatus (prüft erst die API-Form,
klassifiziert Fehler nur auf dem Nicht-verwertbar-Pfad) und kappt bei 5s via
Promise.race — requestUrl kennt kein Timeout/Abort. ping() delegiert und behält
seine Boolean-Signatur für resolveActiveEndpoint.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Render-Baustein — Endpoint-Zeilen-Editor

Ab hier ist die Schicht **nicht unit-testbar** (vitest ohne DOM). Das Netz ist der GUI-Smoke in Task 9. Umso strenger: pure Logik aus Task 2 aufrufen, hier keine Entscheidungen nachbauen.

**Files:**
- Create: `src/ai-settings-ui.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `applyEndpointEdit`, `activeIndexFromStatuses`, `statusKindKey`, `warnRuleKey` (Task 2); `validateEndpointInput`, `ENDPOINT_PRESETS`, `EndpointStatusKind` (Task 1); `DeckLlmClient.probe()` (Task 4)
- Produces:
  ```typescript
  export interface EndpointEditorDeps {
    getList: () => string[];
    setList: (next: string[]) => Promise<void>;
    probe: (endpoint: string) => Promise<EndpointStatus>;
    rerender: () => void;
  }
  export function renderEndpointEditor(containerEl: HTMLElement, deps: EndpointEditorDeps): void
  ```

- [ ] **Step 1: Baustein schreiben**

`src/ai-settings-ui.ts` anlegen:

```typescript
// Render layer for the AI settings blocks (UI-STANDARD §8). All decisions live in
// core/llm/ai-settings-model.ts — this file only draws. Shared by the settings tab and the
// generate-deck view so both speak the same icon vocabulary.
import { Setting, setIcon } from "obsidian";
import { t } from "./i18n";
import {
  applyEndpointEdit, activeIndexFromStatuses, statusKindKey, warnRuleKey,
} from "./core/llm/ai-settings-model";
import {
  validateEndpointInput, ENDPOINT_PRESETS, type EndpointStatus, type EndpointStatusKind,
} from "./vendor/kit/endpoint_diagnostics";

/** Status icon per UI-STANDARD §8: shape AND colour AND state class AND aria-label — colour is
 *  never the only carrier (WCAG 1.4.1). `null` kind = not probed yet. */
export function paintStatus(el: HTMLElement, kind: EndpointStatusKind | null, label: string): void {
  el.empty();
  el.removeClasses(["is-ok", "is-error", "is-checking", "is-active"]);
  if (kind === null) { el.addClass("is-checking"); setIcon(el, "loader"); }
  else if (kind === "ok") { el.addClass("is-ok"); setIcon(el, "circle-check"); }
  else { el.addClass("is-error"); setIcon(el, "circle-x"); }
  el.setAttribute("aria-label", label);
  el.setAttribute("title", label);
}

export interface EndpointEditorDeps {
  getList: () => string[];
  setList: (next: string[]) => Promise<void>;
  probe: (endpoint: string) => Promise<EndpointStatus>;
  rerender: () => void;
}

/** Row editor for the endpoint list: one Setting row per endpoint + a trailing adder row.
 *  Name/desc only on row 0. Live probe icon per row, active marker on the first reachable one. */
export function renderEndpointEditor(containerEl: HTMLElement, deps: EndpointEditorDeps): void {
  const list = deps.getList();
  const rows = [...list, ""]; // trailing adder
  const statuses: (EndpointStatusKind | null)[] = list.map(() => null);
  const icons: HTMLElement[] = [];

  rows.forEach((value, index) => {
    const isAdder = index === list.length;
    const setting = new Setting(containerEl);
    if (index === 0) {
      setting.setName(t("deck.settings.endpoints.name")).setDesc(t("deck.settings.endpoints.desc"));
    }
    setting.settingEl.addClass("sd-endpoint-row");

    setting.addText((txt) => {
      txt.setValue(value);
      txt.setPlaceholder(ENDPOINT_PRESETS[0].url);
      // Mutate on blur, never onChange: onChange would persist every keystroke — the adder
      // would grow entries "h", "ht", "htt", … (UI-STANDARD §8).
      txt.inputEl.addEventListener("blur", () => {
        const next = applyEndpointEdit(deps.getList(), index, txt.getValue(), isAdder);
        if (JSON.stringify(next) === JSON.stringify(deps.getList())) return; // nothing changed
        void deps.setList(next).then(() => deps.rerender());
      });
    });

    if (!isAdder) {
      const icon = setting.controlEl.createSpan({ cls: "sd-endpoint-status" });
      paintStatus(icon, null, t("deck.settings.endpoint.probing"));
      icons.push(icon);

      for (const w of validateEndpointInput(value)) {
        const warn = setting.controlEl.createSpan({ cls: "sd-endpoint-warn" });
        setIcon(warn, "alert-triangle");
        const text = t(warnRuleKey(w.rule));
        warn.setAttribute("aria-label", text);
        warn.setAttribute("title", text);
      }

      setting.addExtraButton((b) => b
        .setIcon("trash-2")
        .setTooltip(t("deck.settings.endpoint.remove"))
        .onClick(() => {
          const next = applyEndpointEdit(deps.getList(), index, "", false);
          void deps.setList(next).then(() => deps.rerender());
        }));
    }
  });

  // Presets + re-check, one row below the list.
  const actions = new Setting(containerEl);
  actions.settingEl.addClass("sd-endpoint-actions");
  for (const preset of ENDPOINT_PRESETS) {
    actions.addButton((b) => b
      .setButtonText(t("deck.settings.endpoint.addPreset", preset.label))
      .onClick(() => {
        const next = applyEndpointEdit(deps.getList(), deps.getList().length, preset.url, true);
        void deps.setList(next).then(() => deps.rerender());
      }));
  }
  actions.addButton((b) => b
    .setButtonText(t("deck.settings.endpoint.check"))
    .onClick(() => void probeAll()));

  /** Probe every row in parallel — one dead endpoint must not block the others. Never throws:
   *  probe() already degrades a failure to a classified status. */
  async function probeAll(): Promise<void> {
    for (const icon of icons) paintStatus(icon, null, t("deck.settings.endpoint.probing"));
    await Promise.all(list.map(async (ep, i) => {
      const st = await deps.probe(ep);
      statuses[i] = st.kind;
      const label = st.kind === "unknown" && st.raw
        ? `${t(statusKindKey("unknown"))} — ${st.raw}`
        : t(statusKindKey(st.kind));
      paintStatus(icons[i], st.kind, label);
    }));
    const active = activeIndexFromStatuses(statuses);
    if (active >= 0) icons[active]?.addClass("is-active");
  }

  void probeAll(); // auto-probe on open
}
```

- [ ] **Step 2: CSS ergänzen**

An `styles.css` anhängen. **Nur Theme-Variablen** (UI-STANDARD §3) — keine Hex-Werte:

```css
/* --- AI settings: endpoint row editor (UI-STANDARD §8) --- */
.sd-endpoint-row .sd-endpoint-status,
.sd-endpoint-row .sd-endpoint-warn {
  display: inline-flex;
  align-items: center;
  margin-left: var(--size-4-2);
}
.sd-endpoint-status.is-checking { color: var(--text-faint); }
.sd-endpoint-status.is-ok { color: var(--text-success); }
.sd-endpoint-status.is-error { color: var(--text-error); }
.sd-endpoint-status.is-active { outline: 1px solid var(--text-success); border-radius: var(--radius-s); }
.sd-endpoint-warn { color: var(--text-warning); }
.sd-endpoint-actions .setting-item-control { justify-content: flex-start; }
```

- [ ] **Step 3: Build + Gates**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: alles clean. Es gibt keine Unit-Tests für diese Datei — das ist beabsichtigt (kein DOM in vitest).

- [ ] **Step 4: Commit**

```bash
git add src/ai-settings-ui.ts styles.css
git commit -m "$(cat <<'EOF'
feat(ui): Endpoint-Zeilen-Editor mit Live-Probe (UI-STANDARD §8)

Ersetzt die Textarea: eine Setting-Zeile pro Endpunkt + Adder, Status-Icon pro
Zeile (loader/circle-check/circle-x + is-ok/is-error + aria-label — Farbe nie
allein, WCAG 1.4.1), Aktiv-Marker auf dem ersten erreichbaren, Trash pro Zeile,
Presets aus ENDPOINT_PRESETS, "Verbindungen prüfen".

Listen-Mutation nur bei blur, nie onChange — sonst persistiert jeder Tastendruck
und der Adder sammelt "h", "ht", "htt".

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Render-Bausteine — Modell-Feld + Thinking-Zeile

**Files:**
- Modify: `src/ai-settings-ui.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `modelFieldMode`, `thinkToggleView`, `effectiveSuppress` (Task 2); `estimateTokens`-Nachbar `ModelContext` aus `core/llm/model-info` (Task 1)
- Produces:
  ```typescript
  export interface ModelFieldDeps {
    getModel: () => string;
    setModel: (m: string) => Promise<void>;
    listModels: () => Promise<string[]>;
    modelContext: (m: string) => Promise<ModelContext | null>;
    rerender: () => void;
  }
  export function renderModelField(containerEl: HTMLElement, deps: ModelFieldDeps): void

  export interface ThinkingDeps {
    getModel: () => string;
    getSuppress: () => boolean;
    setSuppress: (v: boolean) => Promise<void>;
    testSuppress: (model: string) => Promise<{ thought: boolean }>;
    rerender: () => void;
  }
  export function renderThinkingRow(containerEl: HTMLElement, deps: ThinkingDeps): void
  ```

- [ ] **Step 1: Modell-Feld schreiben**

An `src/ai-settings-ui.ts` anhängen (Importe oben ergänzen: `Notice` aus `obsidian`, `modelFieldMode`/`thinkToggleView`/`effectiveSuppress` aus dem Model, `type ModelContext` aus `./core/llm/model-info`):

```typescript
export interface ModelFieldDeps {
  getModel: () => string;
  setModel: (m: string) => Promise<void>;
  listModels: () => Promise<string[]>;
  modelContext: (m: string) => Promise<ModelContext | null>;
  rerender: () => void;
}

/** Model field: dropdown from the server probe, freetext fallback when offline.
 *  A saved model missing from the list is kept as an extra option — never silently dropped. */
export function renderModelField(containerEl: HTMLElement, deps: ModelFieldDeps): void {
  const setting = new Setting(containerEl)
    .setName(t("deck.settings.model.name"))
    .setDesc(t("deck.settings.model.desc"));
  const holder = setting.controlEl.createDiv({ cls: "sd-model-holder" });
  const info = containerEl.createDiv({ cls: "sd-model-info" });

  drawFreetext(); // until the probe returns
  void load();

  function drawFreetext(): void {
    holder.empty();
    const input = holder.createEl("input", { type: "text", cls: "sd-model-input" });
    input.value = deps.getModel();
    input.placeholder = "qwen3";
    input.addEventListener("blur", () => void deps.setModel(input.value.trim()).then(showContext));
  }

  function drawDropdown(models: string[]): void {
    holder.empty();
    const saved = deps.getModel();
    // Keep a saved-but-absent model selectable instead of losing it (UI-STANDARD §8).
    const options = saved && !models.includes(saved) ? [saved, ...models] : models;
    const select = holder.createEl("select", { cls: "dropdown" });
    for (const m of options) select.createEl("option", { value: m, text: m });
    select.value = saved && options.includes(saved) ? saved : options[0];
    if (select.value !== saved) void deps.setModel(select.value);
    select.addEventListener("change", () => void deps.setModel(select.value).then(showContext));
  }

  async function load(): Promise<void> {
    const models = await deps.listModels();
    if (modelFieldMode(models) === "dropdown") drawDropdown(models);
    else { drawFreetext(); info.setText(t("deck.settings.model.none")); }
    await showContext();
  }

  /** Context length is best-effort: when the server does not report it, stay silent
   *  rather than guess. */
  async function showContext(): Promise<void> {
    const model = deps.getModel();
    if (!model) { info.setText(""); return; }
    const ctx = await deps.modelContext(model);
    if (!ctx?.maxContextLength) { info.setText(""); return; }
    const max = ctx.maxContextLength.toLocaleString();
    info.setText(ctx.loadedContextLength
      ? t("deck.settings.model.contextLoaded", max, ctx.loadedContextLength.toLocaleString())
      : t("deck.settings.model.context", max));
  }

  setting.addButton((b) => b
    .setButtonText(t("deck.settings.model.load"))
    .onClick(async () => {
      b.setButtonText(t("deck.settings.model.loading")).setDisabled(true);
      const models = await deps.listModels();
      b.setButtonText(t("deck.settings.model.load")).setDisabled(false);
      if (modelFieldMode(models) === "dropdown") {
        drawDropdown(models);
        new Notice(t("deck.settings.model.loaded", String(models.length))); // make the click visible
        await showContext();
      } else {
        new Notice(t("deck.settings.model.none"));
      }
    }));
}
```

- [ ] **Step 2: Thinking-Zeile schreiben**

Weiter an `src/ai-settings-ui.ts` anhängen:

```typescript
export interface ThinkingDeps {
  getModel: () => string;
  getSuppress: () => boolean;
  setSuppress: (v: boolean) => Promise<void>;
  testSuppress: (model: string) => Promise<{ thought: boolean }>;
  rerender: () => void;
}

/** Thinking toggle + live verification. isAlwaysOnThinker only knows gpt-oss/harmony — the test
 *  button is what turns a guess into a fact. Never runs on its own: it costs a real LLM call. */
export function renderThinkingRow(containerEl: HTMLElement, deps: ThinkingDeps): void {
  const view = thinkToggleView(deps.getModel(), deps.getSuppress());
  const setting = new Setting(containerEl)
    .setName(t("deck.settings.suppressThinking.name"))
    .setDesc(t(view.labelKey));
  if (view.cls) setting.settingEl.addClass(view.cls);

  setting.addToggle((tg) => {
    tg.setValue(deps.getSuppress());
    tg.setDisabled(view.disabled);
    tg.onChange((v) => void deps.setSuppress(v).then(() => deps.rerender()));
  });

  setting.addButton((b) => b
    .setButtonText(t("deck.settings.thinking.test"))
    .setDisabled(view.disabled)
    .onClick(async () => {
      const model = deps.getModel();
      if (!model) { new Notice(t("deck.settings.thinking.testNoModel")); return; }
      b.setButtonText(t("deck.settings.thinking.testing")).setDisabled(true);
      try {
        const { thought } = await deps.testSuppress(model);
        new Notice(thought ? t("deck.settings.thinking.testFail") : t("deck.settings.thinking.testOk"));
      } catch (e) {
        new Notice(t("deck.settings.thinking.testError", (e as Error)?.message ?? String(e)));
      } finally {
        b.setButtonText(t("deck.settings.thinking.test")).setDisabled(false);
      }
    }));
}
```

**Hinweis:** `effectiveSuppress` wird hier nicht gerufen — es gehört auf die **Request**-Seite (Task 7, `generate-deck.ts`-Call-Site), damit ein always-on-Modell nie `reasoning_effort:"none"` bekommt.

- [ ] **Step 3: CSS ergänzen**

```css
/* --- AI settings: model field + thinking row --- */
.sd-model-holder { display: flex; gap: var(--size-4-2); align-items: center; }
.sd-model-input { width: 100%; }
.sd-model-info { color: var(--text-muted); font-size: var(--font-ui-smaller); padding: 0 0 var(--size-4-2) 0; }
.setting-item.is-disabled .setting-item-name { color: var(--text-muted); }
```

- [ ] **Step 4: Build + Gates**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: alles clean.

- [ ] **Step 5: Commit**

```bash
git add src/ai-settings-ui.ts styles.css
git commit -m "$(cat <<'EOF'
feat(ui): Async Modell-Feld + Thinking-Zeile mit Live-Test

Modell-Feld (UI-STANDARD §8): Dropdown aus listModels(), Freitext-Fallback
offline, "Modelle laden" mit Notice-Feedback. Ein gespeichertes Modell, das die
Liste nicht enthält, bleibt als Option erhalten statt still verworfen zu werden.
Darunter die Kontextlängen-Anzeige — best-effort, schweigt statt zu raten.

Thinking-Zeile über thinkToggleView: always-on-Modelle (gpt-oss/harmony) zeigen
den Toggle disabled + "immer an". Der Test-Button macht aus der Namensheuristik
einen Nachweis — echter 1-Wort-Call, nie automatisch.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Settings-Tab verdrahten + `effectiveSuppress` auf der Request-Seite

**Files:**
- Modify: `src/settings.ts:75-90` (AI-Gruppe), `:156` + `:174` (Control-Bindings)
- Modify: `src/generate-deck.ts` oder `src/llm-client.ts` (Call-Site für `effectiveSuppress`)
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: `renderEndpointEditor`, `renderModelField`, `renderThinkingRow` (Task 5+6); `makeDeckLlmClient` (bestehend)

- [ ] **Step 1: AI-Gruppe auf die Bausteine umstellen**

In `src/settings.ts` die AI-Gruppe (Z. 75-90) ersetzen. Die drei Bausteine hängen an `render:` — das `control`-Schema kennt weder Buttons noch mehrzeilige Editoren, und der imperative Fallback-Walker unterstützt `render:` bereits (`settings.ts:112`):

```typescript
      {
        type: "group",
        heading: t("deck.settings.heading"),
        items: [
          { render: (setting) => this.renderEndpoints(setting) },
          { render: (setting) => this.renderModel(setting) },
          { name: t("deck.settings.maxTokens.name"), desc: t("deck.settings.maxTokens.desc"),
            control: { type: "number", key: "llmMaxTokens", min: 256 } },
          { name: t("deck.settings.temperature.name"), desc: t("deck.settings.temperature.desc"),
            control: { type: "number", key: "llmTemperature", min: 0, step: "any" } },
          { render: (setting) => this.renderThinking(setting) },
        ],
      },
```

Und die drei Methoden ergänzen (vor `refreshUi()`):

```typescript
  /** The §8 blocks render into their own container: they draw multiple Setting rows, while the
   *  definition walker hands us exactly one. settingEl is emptied and used as the host. */
  private hostFor(setting: Setting): HTMLElement {
    setting.settingEl.empty();
    setting.settingEl.addClass("sd-settings-host");
    return setting.settingEl;
  }

  private renderEndpoints(setting: Setting): void {
    renderEndpointEditor(this.hostFor(setting), {
      getList: () => this.plugin.settings.llmEndpoints,
      setList: async (next) => { this.plugin.settings.llmEndpoints = next; await this.plugin.saveSettings(); },
      probe: (ep) => makeDeckLlmClient(ep, "").probe(),
      rerender: () => this.refreshUi(),
    });
  }

  private renderModel(setting: Setting): void {
    renderModelField(this.hostFor(setting), {
      getModel: () => this.plugin.settings.llmModel,
      setModel: async (m) => { this.plugin.settings.llmModel = m.trim(); await this.plugin.saveSettings(); },
      listModels: async () => {
        const ep = await this.activeEndpoint();
        return ep ? makeDeckLlmClient(ep, "").listModels() : [];
      },
      modelContext: async (m) => {
        const ep = await this.activeEndpoint();
        return ep ? makeDeckLlmClient(ep, m).modelContext(m) : null;
      },
      rerender: () => this.refreshUi(),
    });
  }

  private renderThinking(setting: Setting): void {
    renderThinkingRow(this.hostFor(setting), {
      getModel: () => this.plugin.settings.llmModel,
      getSuppress: () => this.plugin.settings.llmSuppressThinking,
      setSuppress: async (v) => { this.plugin.settings.llmSuppressThinking = v; await this.plugin.saveSettings(); },
      testSuppress: (model) => this.runSuppressTest(model),
      rerender: () => this.refreshUi(),
    });
  }

  private async activeEndpoint(): Promise<string | null> {
    return resolveActiveEndpoint(this.plugin.settings.llmEndpoints, (ep) => makeDeckLlmClient(ep, "").ping());
  }

  /** One real, minimal call with suppression on: did the model think anyway?
   *  This is the only place that replaces the gpt-oss/harmony name heuristic with evidence. */
  private async runSuppressTest(model: string): Promise<{ thought: boolean }> {
    const ep = await this.activeEndpoint();
    if (!ep) throw new Error(t("deck.modal.noEndpoint"));
    const client = makeDeckLlmClient(ep, model);
    const r = await client.generate(
      [{ role: "user", content: "Reply with the single word: ok" }],
      { model, temperature: 0, maxTokens: 32, suppressThinking: true },
      () => {}, () => {},
    );
    return { thought: reasoningHappened(r.content, r.reasoning) };
  }
```

Importe oben in `settings.ts` ergänzen:

```typescript
import { renderEndpointEditor, renderModelField, renderThinkingRow } from "./ai-settings-ui";
import { makeDeckLlmClient } from "./llm-client";
import { resolveActiveEndpoint } from "./vendor/kit/endpoint";
import { reasoningHappened } from "./vendor/kit/reasoning";
```

Der Import von `parseEndpointList` (Z. 5) und die Bindings `case "llmEndpoints"` in `getControlValue` (Z. 156) / `setControlValue` (Z. 174) entfallen — der Zeilen-Editor schreibt `llmEndpoints` direkt. **`case "llmModel"` in beiden Switches bleibt**: Task 8's View liest es weiter über `getControlValue`. Prüfe mit `grep -n "parseEndpointList\|llmEndpoints" src/`, dass keine tote Referenz bleibt.

- [ ] **Step 2: `effectiveSuppress` auf die Request-Seite ziehen**

`suppressParams(opts.suppressThinking)` in `llm-client.ts:61` (`buildBody`) unterdrückt heute auch bei always-on-Modellen — die lehnen `reasoning_effort:"none"` ab. Ersetzen:

```typescript
      ...suppressParams(effectiveSuppress(opts.model || this.model, opts.suppressThinking)),
```

Import ergänzen: `import { effectiveSuppress } from "./core/llm/ai-settings-model";`

- [ ] **Step 3: Settings-Tests anpassen**

`tests/settings.test.ts` prüft vermutlich die `llmEndpoints`-Textarea-Bindings (join/parseEndpointList-Roundtrip). Diese Tests sind jetzt **veraltet** — der Editor schreibt die Liste direkt. Entferne genau die Bindings-Tests für `llmEndpoints`; alle anderen (`llmModel`, `llmMaxTokens`, Theme-Keys …) müssen unverändert grün bleiben.

Ergänze in `tests/llm-client.test.ts` den Regressionstest für Step 2:

```typescript
it("never sends suppress params to an always-on thinker", async () => {
  let sentBody = "";
  const http = async (p: { body?: string }) => { sentBody = p.body ?? ""; return { status: 200, json: { choices: [{ message: { content: "ok" } }] }, text: "" }; };
  const c = new DeckLlmClient("http://x:1", "gpt-oss-20b", http, (() => { const e = new Error("x"); e.name = "StreamNetworkError"; throw e; }) as never);
  await c.generate([{ role: "user", content: "hi" }], { model: "gpt-oss-20b", temperature: 0, maxTokens: 8, suppressThinking: true }, () => {}, () => {});
  expect(JSON.parse(sentBody).reasoning_effort).toBeUndefined();
});
```

- [ ] **Step 4: Gates**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: alles clean.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/llm-client.ts tests/
git commit -m "$(cat <<'EOF'
feat(settings): KI-Bereich auf die §8-Bausteine umgestellt

Die AI-Gruppe hängt Endpoint-Editor, Modell-Feld und Thinking-Zeile über render:
ein — das control-Schema kennt weder Buttons noch mehrzeilige Editoren, der
imperative Fallback-Walker unterstützt render: bereits. Die Textarea-Bindings für
llmEndpoints entfallen; der Editor schreibt die Liste direkt.

Dazu ein echter Fund: buildBody schickte suppress-Params auch an always-on-Thinker
(gpt-oss/harmony), die reasoning_effort:"none" ablehnen → jetzt via effectiveSuppress
gefiltert, mit Regressionstest.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Generate-Deck-View auf den geteilten Baustein umstellen

Die View hat heute `✓`/`✗`-Textzeichen (`generate-deck-view.ts:126-142`) statt der Icon-Vokabel — derselbe §8-Verstoß, den Task 5 in den Settings behebt.

**Files:**
- Modify: `src/generate-deck-view.ts:93-99` (Modell-Input), `:126-142` (Ping + Modell-Liste)
- Modify: `styles.css` (tote `sd-gen-ping-*`-Regeln entfernen)

**Interfaces:**
- Consumes: `paintStatus` (Task 5), `modelFieldMode` (Task 2)

- [ ] **Step 1: Ping-Anzeige auf `paintStatus` umstellen**

Lies `src/generate-deck-view.ts:120-145`. Ersetze die `✓`/`✗`-Textzeichen-Anzeige (`sd-gen-ping-ok`/`sd-gen-ping-err`) durch `paintStatus(el, kind, label)` aus `./ai-settings-ui`. Der Ablauf bleibt: `resolveActiveEndpoint` → bei Erfolg `listModels()` → Dropdown statt Text-Input.

Konkret: statt `ping()` einmal `probe()` auf dem aufgelösten Endpoint rufen und dessen `kind` an `paintStatus` geben — dann zeigt die View denselben Klartext wie die Settings (`t(statusKindKey(kind))`), statt nur „reachable"/„not reachable".

**Nicht ändern:** Die Modellwahl bleibt **ephemer** (`this.model`, kein Schreiben in die Settings) — das ist die bewusste Entscheidung aus dem Spec und spiegelt das Theme-Muster (Frontmatter = SoT, Dropdown = Anprobe).

- [ ] **Step 2: Modellwahl über `modelFieldMode` entscheiden lassen**

Die View entscheidet heute selbst per `if (models.length)`. Ersetze das durch `modelFieldMode(models) === "dropdown"` — eine Entscheidung, eine Quelle. Ebenso: ein gespeichertes `settings.llmModel`, das nicht in der Liste steht, bleibt als Option erhalten (gleiche Regel wie Task 6).

- [ ] **Step 3: Tote CSS-Regeln entfernen**

```bash
grep -n "sd-gen-ping" styles.css src/
```

Entferne die `sd-gen-ping-ok`/`sd-gen-ping-err`-Regeln, sobald der letzte Verwender weg ist. Der Container `sd-gen-ping` darf bleiben, wenn er noch als Host dient.

- [ ] **Step 4: Gates**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: alles clean.

- [ ] **Step 5: Commit**

```bash
git add src/generate-deck-view.ts styles.css
git commit -m "$(cat <<'EOF'
refactor(ui): Generate-View nutzt den geteilten Status-Baustein

Die View hatte ✓/✗-Textzeichen statt der §8-Icon-Vokabel — derselbe Verstoß, den
die Settings gerade abgelegt haben. Jetzt paintStatus + modelFieldMode: ein
Mechanismus, zwei Call-Sites, identischer Klartext aus derselben i18n-Quelle.

Die Modellwahl bleibt ephemer (kein Schreiben in die Settings) — Anprobe-Muster
wie beim Theme.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Doku + GUI-Smoke in Pallas

Der eigentliche Test dieser Arbeit. Laut Cockpit-Historie sitzen die Bugs dieses Projekts wiederholt in genau der Schicht, die vitest nicht fasst (Settings-Render, Sidebar, render-dom).

**Files:**
- Modify: `AGENTS.md` (§Architecture-Dateilandkarte + §Gotchas)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: AGENTS.md nachziehen**

In der Dateilandkarte (§Architecture) ergänzen:

```
  ai-settings-ui.ts  Render der KI-Settings-Bausteine (UI-STANDARD §8): renderEndpointEditor
                     (Zeilen-Editor + Live-Probe + Presets), renderModelField (Dropdown aus
                     listModels() + Freitext-Fallback + Kontextlänge), renderThinkingRow
                     (Toggle + Live-Suppress-Test). Geteilt von settings.ts und
                     generate-deck-view.ts. paintStatus() ist die gemeinsame Icon-Vokabel.
```

Unter `src/core/`:

```
  llm/
    ai-settings-model.ts  Pure Zustandslogik der KI-Settings: applyEndpointEdit,
                          activeIndexFromStatuses, modelFieldMode, thinkToggleView,
                          effectiveSuppress, statusKindKey/warnRuleKey.
```

In §Gotchas ergänzen:

```markdown
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
```

- [ ] **Step 2: CHANGELOG.md**

Unter `## [Unreleased]` (anlegen falls nicht vorhanden):

```markdown
### Added
- AI settings: endpoint row editor with live connection check, one-click provider presets
  (LM Studio / Ollama), plain-text diagnosis per endpoint, and non-blocking input warnings.
- AI settings: model dropdown populated from the endpoint, with a freetext fallback when
  offline and the model's context length shown when the server reports it.
- AI settings: "Test" button next to the thinking toggle — runs one real minimal call and
  reports whether the model actually stopped thinking. Models that cannot disable thinking
  (gpt-oss/harmony) now show a disabled toggle instead of a silently ineffective one.

### Fixed
- Connection checks reported "reachable" for any endpoint answering HTTP 200, including
  servers that are not an OpenAI-compatible API.
- Thinking suppression parameters were sent to always-on reasoning models that reject them.
```

- [ ] **Step 3: Deploy nach Pallas**

```bash
npm run build && npm run deploy
```

Erwartet: Build clean, Kopie nach `$OBSIDIAN_PLUGIN_DIR`. Ohne die Variable schlägt `deploy` explizit fehl.

- [ ] **Step 4: GUI-Smoke (Johannes) — die Checkliste aus dem Spec**

Obsidian neu laden (Cmd+R), dann Settings → „KI (lokal)":

1. **LM Studio aus** → alle Icons `circle-x`, Tooltip „Verbindung abgelehnt — Server läuft nicht oder Port falsch.", Modellfeld = Freitext
2. **LM Studio an** → „Verbindungen prüfen" → `circle-check` + Aktiv-Marker auf Zeile 0, Dropdown füllt sich
3. **Endpoint auf `http://localhost:1234/v1`** → bleibt `ok` (normalizeEndpoint greift, kein `/v1/v1`)
4. **`http://localhost:9999`** → `refused` · **`http://example.com`** → `not-an-llm-api` (der Fall, den der alte Ping durchwinkte)
5. **Zeile leeren + wegklicken** → verschwindet · **in den Adder tippen** → genau ein Eintrag, keine Präfix-Fragmente (`h`, `ht`)
6. **`http://localhost` ohne Port** → gelbes `alert-triangle` mit Hinweis, aber **nicht** blockierend
7. **Thinking-Test mit qwen3** → „Thinking wird unterdrückt." · **mit gpt-oss** → Toggle disabled, „Immer an"
8. **Generate-View öffnen** → identische Icons wie die Settings; Modell wechseln → Settings bleiben unverändert (ephemer)

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: KI-Settings-Bausteine in AGENTS.md + CHANGELOG

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Nach dem Plan

Nach grünem Smoke: `superpowers:finishing-a-development-branch` → Merge nach `main`.

**Kit-Promotion als Folge-Task (nicht hier):** Dieses Repo liefert jetzt das zweite Exemplar von
`thinkToggleView`/`effectiveSuppress` (REGISTRY:20) und das dritte von `extractModelIds`
(REGISTRY:83) — beide sind damit promotionsreif. Der Zeilen-Editor steht bei n=4. Gehört in einen
Repo-übergreifenden Sweep, zusammen mit dem offenen `verify-mirror`-Rollout.
