# LLM-Deck-Transform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new command transforms the active Markdown note into a fresh sibling deck note (`<basename> — Deck.md`) via a local, OpenAI-compatible LLM, structuring and condensing prose into slide-deck Markdown.

**Architecture:** Obsidian-free pure core under `src/core/llm/**` (prompt building, output sanitation, static validation, vendored SSE/reasoning/endpoint/error-envelope/model-info parsers). A thin adapter layer (`src/llm-stream.ts`, `src/llm-client.ts`, `src/generate-deck.ts`, `src/generate-deck-modal.ts`) wires XHR streaming, `requestUrl` non-streaming fallback, orchestration, and the modal. The existing `contractToPrompt()` Phase-2 hook is consumed for the first time (extended with an `includeTheme` flag). LLM output is statically validated (`parseDeck` + `collectWarnings`, no DOM) before a note is created; the source note is never touched.

**Tech Stack:** TypeScript (strict, `noImplicitAny`), esbuild, vitest (`environment: "node"`, no DOM), Obsidian Plugin API 1.13+, XMLHttpRequest (streaming), `requestUrl` (non-streaming, CORS-free).

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from Spec D.

- **Pure-Core invariant:** `src/core/**` never imports `obsidian` and never touches the DOM. `scripts/check-core-purity.mjs` (first step of `npm test`) enforces it. All `src/core/llm/**` modules must be obsidian-/DOM-free.
- **No `fetch`:** `fetch` is forbidden by `eslint-plugin-obsidianmd`. Streaming uses `XMLHttpRequest`; non-streaming uses `requestUrl`.
- **No new npm dependencies.** Everything is vendored (copy-not-share; never a `git+https` dep — Lesson 2026-07-01: git deps break the Community-Review install).
- **Vendored files stay pristine** except the two documented extensions (`parseSSE` + `finish_reason`; XHR `streamSSE` + `raw`). No German hardcoded user strings from seeds — all user-facing text via `t()` (EN canonical + DE).
- **No static inline styles, no `innerHTML`.** DOM via the `createEl`/`createDiv` family (setProperty for dynamic styles only).
- **Declarative settings only** (Obsidian ≥ 1.13 `getSettingDefinitions`); `minAppVersion` stays `1.13.0`.
- **Commits:** Conventional Commits, German description allowed, **only touched files staged**. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Default endpoint** `http://localhost:1234` (LM Studio). Never `:8080` (dead MLX stack).
- **Timeouts: none.** Cancellation is the user's job (Stop button → AbortController).
- **Hard cap: at most 2 generation runs total** (validation-retry and transport-fallback share the budget).
- After every task: `npm test` (purity + realm + bundle-smoke + vitest) and `npx tsc --noEmit` must be green.

## File Structure

**New — pure core (`src/core/llm/`, obsidian-free, fully unit-tested):**
- `sse-parse.ts` — vendored `parseSSE` + `finish_reason` extension.
- `think-splitter.ts` — vendored `ThinkSplitter` (unchanged).
- `endpoint.ts` — vendored `normalizeEndpoint` + `resolveActiveEndpoint` (unchanged) + slide-deck addition `parseEndpointList`.
- `reasoning.ts` — vendored `suppressParams` / `reasoningHappened` / `isAlwaysOnThinker` (unchanged).
- `error-envelope.ts` — vendored `parseErrorEnvelope` (from i2m, unchanged).
- `model-info.ts` — pure context parsers + token estimator + overflow check (new).
- `deck-prompt.ts` — `buildDeckPrompt` + `buildRetryFeedback` + `ChatMessage` type (new).
- `deck-sanitize.ts` — `extractDeckMarkdown` + `setDeckTheme` (new; the blocker fix).
- `deck-validate.ts` — `validateDeckOutput` (new).

**New — adapter (`src/`, imports obsidian/DOM):**
- `llm-stream.ts` — XHR `streamSSE` extended with `raw` + `finishReason` (browser API; node-tested via fake XHR).
- `llm-client.ts` — `DeckLlmClient` (injected transports) + `makeDeckLlmClient` factory (requestUrl + XHR wiring).
- `generate-deck.ts` — `runGenerateDeck` orchestrator (injected deps; node-tested).
- `generate-deck-modal.ts` — `GenerateDeckModal` (DOM; GUI-smoke only).

**Modified:**
- `src/core/constraints/contract.ts` — `contractToPrompt` gains `{ includeTheme?: boolean }`.
- `src/i18n.ts` — all new EN+DE strings.
- `src/settings.ts` — new "AI (local)" group + keys + get/setControlValue.
- `src/main.ts` — `generate-deck` command (`checkCallback`); `activatePreview` made public + a `refreshActivePreview` helper.
- `README.md` — Network-use disclosure (EN+DE) + Server-CORS section.

**New tests:** one `tests/core/*.test.ts` per pure module; `tests/llm-stream.test.ts`; `tests/llm-client.test.ts`; `tests/generate-deck.test.ts`; `tests/core/contract.test.ts`; extend `tests/settings.test.ts`. Copy `tests/fake_xhr.ts` from vault-rag.

---

## Phase A — Vendored pure modules (obsidian-free, fully unit-tested)

### Task 1: Vendored SSE parser (`parseSSE` + `finish_reason`)

**Files:**
- Create: `src/core/llm/sse-parse.ts`
- Test: `tests/core/sse-parse.test.ts`

**Interfaces:**
- Produces: `parseSSE(buffer: string): { content: string[]; reasoning: string[]; model?: string; finishReason?: string; rest: string; done: boolean }`. Only the pure parser is vendored here — the XHR `streamSSE` lives in the adapter (`src/llm-stream.ts`, Task 12).

- [ ] **Step 1: Write the failing test**

`tests/core/sse-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSSE } from "../../src/core/llm/sse-parse";

describe("parseSSE", () => {
  it("extracts content deltas", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"Hal"}}]}\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n');
    expect(r.content).toEqual(["Hal", "lo"]);
    expect(r.reasoning).toEqual([]);
    expect(r.done).toBe(false);
    expect(r.rest).toBe("");
  });
  it("extracts reasoning_content deltas", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"reasoning_content":"den"}}]}\n');
    expect(r.reasoning).toEqual(["den"]);
    expect(r.content).toEqual([]);
  });
  it("sets done on [DONE]", () => { expect(parseSSE("data: [DONE]\n").done).toBe(true); });
  it("keeps an incomplete last line in rest", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"x"}}]}\ndata: {"cho');
    expect(r.content).toEqual(["x"]);
    expect(r.rest).toBe('data: {"cho');
  });
  it("reads model from the first chunk only", () => {
    const r = parseSSE('data: {"model":"qwen3","choices":[{"delta":{"content":"a"}}]}\ndata: {"model":"other","choices":[{"delta":{"content":"b"}}]}\n');
    expect(r.model).toBe("qwen3");
  });
  it("captures the first non-null finish_reason (NEW extension)", () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"a"},"finish_reason":null}]}\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}\n');
    expect(r.finishReason).toBe("length");
  });
  it("finishReason is undefined when never present", () => {
    expect(parseSSE('data: {"choices":[{"delta":{"content":"a"}}]}\n').finishReason).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/sse-parse.test.ts`
Expected: FAIL — cannot find module `../../src/core/llm/sse-parse`.

- [ ] **Step 3: Write the minimal implementation**

`src/core/llm/sse-parse.ts` (vendored from vault-rag `sse.ts:6–27`, extended with `finishReason`):
```ts
/** Accumulates OpenAI-SSE deltas (content + reasoning_content) from a (partial) buffer;
 *  an incomplete last line goes to `rest`. `model` = first chunk `model` seen.
 *  `finishReason` = first non-null `choices[0].finish_reason` seen (slide-deck addition —
 *  needed to detect a token-limit truncation). Pure function — no state. */
export function parseSSE(buffer: string): { content: string[]; reasoning: string[]; model?: string; finishReason?: string; rest: string; done: boolean } {
  const content: string[] = [];
  const reasoning: string[] = [];
  let model: string | undefined;
  let finishReason: string | undefined;
  let done = false;
  const lines = buffer.split(/\r\n|\n|\r/);
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") { done = true; continue; }
    try {
      const j = JSON.parse(data) as { model?: string; choices?: { delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null }[] };
      if (model === undefined && typeof j.model === "string") model = j.model;
      const c0 = j.choices?.[0];
      if (finishReason === undefined && typeof c0?.finish_reason === "string" && c0.finish_reason) finishReason = c0.finish_reason;
      const d = c0?.delta;
      if (typeof d?.content === "string") content.push(d.content);
      if (typeof d?.reasoning_content === "string") reasoning.push(d.reasoning_content);
    } catch { /* incomplete — should not happen for complete lines */ }
  }
  return { content, reasoning, model, finishReason, rest, done };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/sse-parse.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/sse-parse.ts tests/core/sse-parse.test.ts
git commit -m "feat(llm): vendor pure parseSSE with finish_reason extension"
```

---

### Task 2: Vendored ThinkSplitter

**Files:**
- Create: `src/core/llm/think-splitter.ts`
- Test: `tests/core/think-splitter.test.ts`

**Interfaces:**
- Produces: `class ThinkSplitter { push(text): { content; reasoning }; flush(): { content; reasoning } }`.

- [ ] **Step 1: Copy the seed test** — copy `/Users/Shared/code/vault-rag/tests/think_splitter.test.ts` verbatim to `tests/core/think-splitter.test.ts`, then change only the import line to:
```ts
import { ThinkSplitter } from "../../src/core/llm/think-splitter";
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/think-splitter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Vendor the implementation** — copy `/Users/Shared/code/vault-rag/src/think_splitter.ts` verbatim to `src/core/llm/think-splitter.ts` (no changes).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/think-splitter.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/think-splitter.ts tests/core/think-splitter.test.ts
git commit -m "feat(llm): vendor ThinkSplitter (copy-not-share)"
```

---

### Task 3: Vendored endpoint resolver + `parseEndpointList`

**Files:**
- Create: `src/core/llm/endpoint.ts`
- Test: `tests/core/endpoint.test.ts`

**Interfaces:**
- Produces: `normalizeEndpoint(endpoint: string): string`; `resolveActiveEndpoint(endpoints: string[], ping: (ep) => Promise<boolean>): Promise<string | null>`; `parseEndpointList(text: string): string[]` (slide-deck addition — splits a settings textarea into an ordered, trimmed, de-duplicated, non-empty list).

- [ ] **Step 1: Write the failing test** — copy `/Users/Shared/code/vault-rag/tests/endpoint.test.ts` to `tests/core/endpoint.test.ts`, change the import to `from "../../src/core/llm/endpoint"`, and append:
```ts
import { parseEndpointList } from "../../src/core/llm/endpoint";

describe("parseEndpointList", () => {
  it("splits lines, trims, drops blanks, preserves order", () => {
    expect(parseEndpointList("http://a\n\n  http://b  \n")).toEqual(["http://a", "http://b"]);
  });
  it("de-duplicates while keeping first-seen order", () => {
    expect(parseEndpointList("http://a\nhttp://b\nhttp://a")).toEqual(["http://a", "http://b"]);
  });
  it("returns [] for empty/whitespace input", () => {
    expect(parseEndpointList("   \n  ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/endpoint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Vendor + extend** — copy `/Users/Shared/code/vault-rag/src/endpoint.ts` verbatim to `src/core/llm/endpoint.ts`, then append the slide-deck addition:
```ts

/** slide-deck addition (NOT vendored): parse the settings textarea (one endpoint per line)
 *  into an ordered, trimmed, de-duplicated, non-empty list for resolveActiveEndpoint. */
export function parseEndpointList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const v = raw.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/endpoint.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/endpoint.ts tests/core/endpoint.test.ts
git commit -m "feat(llm): vendor endpoint resolver + add parseEndpointList"
```

---

### Task 4: Vendored reasoning helpers

**Files:**
- Create: `src/core/llm/reasoning.ts`
- Test: `tests/core/reasoning.test.ts`

**Interfaces:**
- Produces: `suppressParams(suppress: boolean): Record<string, unknown>`; `reasoningHappened(content: string, reasoning: string | undefined): boolean`; `isAlwaysOnThinker(model: string): boolean`; `type ThinkingSupport = "none" | "hybrid" | "always"`.

- [ ] **Step 1: Copy the seed test** — copy `/Users/Shared/code/vault-rag/tests/reasoning.test.ts` to `tests/core/reasoning.test.ts`, change the import to `from "../../src/core/llm/reasoning"`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/reasoning.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Vendor** — copy `/Users/Shared/code/vault-rag/src/reasoning.ts` verbatim to `src/core/llm/reasoning.ts` (no changes).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/reasoning.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/reasoning.ts tests/core/reasoning.test.ts
git commit -m "feat(llm): vendor reasoning suppression helpers"
```

---

### Task 5: Vendored error-envelope parser

**Files:**
- Create: `src/core/llm/error-envelope.ts`
- Test: `tests/core/error-envelope.test.ts`

**Interfaces:**
- Produces: `parseErrorEnvelope(text: string): string | null` — detects the HTTP-200-plus-`{error}` LM-Studio footgun.

- [ ] **Step 1: Write the failing test** (extracted from i2m `vision_client.test.ts` lines 22–52):
```ts
import { describe, it, expect } from "vitest";
import { parseErrorEnvelope } from "../../src/core/llm/error-envelope";

describe("parseErrorEnvelope", () => {
  it("{error:{message}} → message", () => {
    expect(parseErrorEnvelope('{"error":{"message":"model X is not loaded"}}')).toBe("model X is not loaded");
  });
  it("{error:'…'} → string", () => { expect(parseErrorEnvelope('{"error":"bad request"}')).toBe("bad request"); });
  it("{detail} (no choices) → detail", () => { expect(parseErrorEnvelope('{"detail":"not found"}')).toBe("not found"); });
  it("{message} (no choices) → message", () => { expect(parseErrorEnvelope('{"message":"server busy"}')).toBe("server busy"); });
  it("valid completion (even empty) → null", () => {
    expect(parseErrorEnvelope('{"choices":[{"message":{"content":"x"}}]}')).toBeNull();
    expect(parseErrorEnvelope('{"choices":[]}')).toBeNull();
  });
  it("empty / non-JSON / HTML → null", () => {
    expect(parseErrorEnvelope("")).toBeNull();
    expect(parseErrorEnvelope("<html>oops</html>")).toBeNull();
  });
  it("ignores top-level message/detail when choices present", () => {
    expect(parseErrorEnvelope('{"choices":[{"message":{"content":"x"}}],"message":"stray"}')).toBeNull();
  });
  it("{error} wins even with choices present", () => {
    expect(parseErrorEnvelope('{"choices":[],"error":{"message":"real error"}}')).toBe("real error");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/error-envelope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Vendor the implementation** — copy the `parseErrorEnvelope` function verbatim from i2m `vision_client.ts:22–42` into `src/core/llm/error-envelope.ts` (as a standalone module — drop the surrounding VisionClient code):
```ts
/** Detects an OpenAI-compatible error envelope in a response body. Local servers (LM Studio)
 *  often answer errors with HTTP 200 + `{error:{message}}` → the caller can show the real
 *  server message instead of a generic error. Returns `null` for a (possibly empty) completion
 *  or no recognizable error / no JSON. Pure function, obsidian-free. */
export function parseErrorEnvelope(text: string): string | null {
  if (!text || !text.trim()) return null;
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const err = o.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  if (!("choices" in o)) {
    const detail = o.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/error-envelope.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/error-envelope.ts tests/core/error-envelope.test.ts
git commit -m "feat(llm): vendor parseErrorEnvelope as a standalone pure module"
```

---

### Task 6: Model-info context parsers + token/overflow helpers

**Files:**
- Create: `src/core/llm/model-info.ts`
- Test: `tests/core/model-info.test.ts`

**Interfaces:**
- Produces:
  - `interface ModelContext { maxContextLength?: number; loadedContextLength?: number }`
  - `parseLmStudioContext(json: unknown, model: string): ModelContext | null` — from LM Studio `GET /api/v0/models` (vault-rag `chat_client.ts:39–55`).
  - `parseOllamaContext(json: unknown): ModelContext | null` — from Ollama `POST /api/show` (`model_info["<arch>.context_length"]`).
  - `estimateTokens(chars: number): number` — `Math.ceil(chars / 3.5)`.
  - `contextOverflow(inputTokens: number, maxTokens: number, contextLimit: number | undefined): boolean` — `true` only when a limit is known and `inputTokens + maxTokens > contextLimit`.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { parseLmStudioContext, parseOllamaContext, estimateTokens, contextOverflow } from "../../src/core/llm/model-info";

describe("parseLmStudioContext", () => {
  it("reads max + loaded context length for the matching model", () => {
    const json = { data: [{ id: "qwen3", max_context_length: 32768, loaded_context_length: 8192 }] };
    expect(parseLmStudioContext(json, "qwen3")).toEqual({ maxContextLength: 32768, loadedContextLength: 8192 });
  });
  it("returns null when the model is absent", () => {
    expect(parseLmStudioContext({ data: [{ id: "other" }] }, "qwen3")).toBeNull();
  });
  it("omits non-numeric fields", () => {
    expect(parseLmStudioContext({ data: [{ id: "m" }] }, "m")).toEqual({});
  });
});

describe("parseOllamaContext", () => {
  it("finds the *.context_length key in model_info", () => {
    const json = { model_info: { "qwen3.context_length": 40960, "general.architecture": "qwen3" } };
    expect(parseOllamaContext(json)).toEqual({ maxContextLength: 40960 });
  });
  it("returns null without a context_length key", () => {
    expect(parseOllamaContext({ model_info: { "general.architecture": "x" } })).toBeNull();
    expect(parseOllamaContext({})).toBeNull();
  });
});

describe("estimateTokens", () => {
  it("uses ~3.5 chars per token, rounded up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(7)).toBe(2);
    expect(estimateTokens(8)).toBe(3);
  });
});

describe("contextOverflow", () => {
  it("true when input + maxTokens exceeds a known limit", () => {
    expect(contextOverflow(7000, 2000, 8192)).toBe(true);
  });
  it("false when it fits", () => {
    expect(contextOverflow(1000, 2000, 8192)).toBe(false);
  });
  it("false when the limit is unknown", () => {
    expect(contextOverflow(999999, 2000, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/model-info.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**
```ts
export interface ModelContext { maxContextLength?: number; loadedContextLength?: number }

function findById(json: unknown, model: string): Record<string, unknown> | null {
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const hit = (data as unknown[]).find((x) => (x as { id?: unknown }).id === model);
  return (hit as Record<string, unknown> | undefined) ?? null;
}

/** LM Studio GET /api/v0/models → per-model context lengths. null when the model is absent. */
export function parseLmStudioContext(json: unknown, model: string): ModelContext | null {
  const m = findById(json, model);
  if (!m) return null;
  const out: ModelContext = {};
  if (typeof m.max_context_length === "number") out.maxContextLength = m.max_context_length;
  if (typeof m.loaded_context_length === "number") out.loadedContextLength = m.loaded_context_length;
  return out;
}

/** Ollama POST /api/show → model_info holds "<arch>.context_length". null when absent. */
export function parseOllamaContext(json: unknown): ModelContext | null {
  const info = (json as { model_info?: unknown }).model_info;
  if (!info || typeof info !== "object") return null;
  for (const [k, v] of Object.entries(info as Record<string, unknown>)) {
    if (k.endsWith(".context_length") && typeof v === "number") return { maxContextLength: v };
  }
  return null;
}

/** Rough token estimate: ~3.5 characters per token (English/German prose average). */
export function estimateTokens(chars: number): number { return Math.ceil(chars / 3.5); }

/** True only when a context limit is known and the request would not fit. */
export function contextOverflow(inputTokens: number, maxTokens: number, contextLimit: number | undefined): boolean {
  if (contextLimit == null) return false;
  return inputTokens + maxTokens > contextLimit;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/model-info.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/model-info.ts tests/core/model-info.test.ts
git commit -m "feat(llm): add pure model-context parsers + token/overflow helpers"
```

---

## Phase B — Deck-specific pure core

### Task 7: `contractToPrompt` gains an `includeTheme` flag

**Files:**
- Modify: `src/core/constraints/contract.ts:30-41`
- Test: `tests/core/contract.test.ts`

**Interfaces:**
- Consumes: existing `getAuthoringContract(d)` and `AuthoringContract`.
- Produces: `contractToPrompt(c: AuthoringContract, opts?: { includeTheme?: boolean }): string`. Default `includeTheme: true` (existing callers unaffected). When `false`, the `Deck theme via frontmatter "theme:"…` line is omitted.

- [ ] **Step 1: Write the failing test**

`tests/core/contract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";

const contract = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });

describe("contractToPrompt", () => {
  it("includes the theme line by default (backward compatible)", () => {
    expect(contractToPrompt(contract)).toContain('Deck theme via frontmatter "theme:"');
  });
  it("omits the theme line when includeTheme is false", () => {
    const p = contractToPrompt(contract, { includeTheme: false });
    expect(p).not.toContain('Deck theme via frontmatter "theme:"');
    // the other contract lines survive
    expect(p).toContain("Separate slides with a line containing only");
    expect(p).toContain("Per-slide layout");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/contract.test.ts`
Expected: FAIL — the second test fails (theme line still present).

- [ ] **Step 3: Modify the implementation**

Replace `contractToPrompt` in `src/core/constraints/contract.ts` (lines 30–41) with:
```ts
export function contractToPrompt(c: AuthoringContract, opts?: { includeTheme?: boolean }): string {
  const includeTheme = opts?.includeTheme ?? true;
  const lines = [
    `Build a slide deck as Markdown. Separate slides with a line containing only "${c.slideSeparator}".`,
    `Each slide must fit a fixed ${c.geometry.width}x${c.geometry.height}px canvas with body text no smaller than ${c.minFontPx}px.`,
    `Keep slides sparse: few bullets, short lines. Every element must have a clear function.`,
    `Per-slide layout via "<!-- layout: NAME [modifier] -->" (split columns with "<!-- column -->"). Available: ${c.layouts.join(", ")}. Modifiers: compact, code-heavy.`,
    `Optional deck slots via frontmatter: header:, footer:, paginate: true.`,
    ...(includeTheme ? [`Deck theme via frontmatter "theme:". Available: ${c.themes.join(", ")}.`] : []),
    `Supported: ${c.features.join(", ")}.`,
    `Not supported (do not use): ${c.unsupported.join(", ")}.`,
  ];
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/contract.test.ts && npm test`
Expected: PASS (2 new tests; full suite still green — the change is backward compatible).

- [ ] **Step 5: Commit**

```bash
git add src/core/constraints/contract.ts tests/core/contract.test.ts
git commit -m "feat(contract): add includeTheme flag to contractToPrompt"
```

---

### Task 8: `deck-prompt.ts` — prompt + retry-feedback builders

**Files:**
- Create: `src/core/llm/deck-prompt.ts`
- Test: `tests/core/deck-prompt.test.ts`

**Interfaces:**
- Consumes: `getAuthoringContract`, `contractToPrompt` (Task 7); `AuthoringContract` from `../constraints/contract`.
- Produces:
  - `interface ChatMessage { role: "system" | "user" | "assistant"; content: string }`
  - `interface DeckPromptOpts { slideTarget: number | "auto"; hint: string }`
  - `buildDeckPrompt(sourceBody: string, opts: DeckPromptOpts, contract: AuthoringContract): ChatMessage[]` — a `system` + `user` pair. Calls `contractToPrompt(contract, { includeTheme: false })`.
  - `buildRetryFeedback(failedOutput: string, reason: string): ChatMessage[]` — an `assistant` (truncated failed output) + `user` (corrective instruction) pair to append to the original messages.

- [ ] **Step 1: Write the failing test**

`tests/core/deck-prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDeckPrompt, buildRetryFeedback } from "../../src/core/llm/deck-prompt";
import { getAuthoringContract } from "../../src/core/constraints/contract";

const contract = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });

describe("buildDeckPrompt", () => {
  it("returns a system+user pair", () => {
    const msgs = buildDeckPrompt("Some prose.", { slideTarget: "auto", hint: "" }, contract);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"]);
  });
  it("embeds the contract lines but NOT the theme line (includeTheme:false)", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract);
    expect(system.content).toContain("Separate slides with a line containing only");
    expect(system.content).not.toContain('Deck theme via frontmatter "theme:"');
  });
  it("states the core rules: no preamble, never start with a separator, no quotes, condense, no invention", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract);
    expect(system.content).toMatch(/ONLY the deck markdown/i);
    expect(system.content).toMatch(/never (begin|start).*separator/i);
    expect(system.content).toMatch(/do not.*quote/i);
    expect(system.content).toMatch(/condense/i);
    expect(system.content).toMatch(/do not invent/i);
    expect(system.content).toMatch(/same language as the (note|source)/i);
  });
  it("auto target asks for content-driven count (typically 5–12)", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract);
    expect(system.content).toMatch(/5.?12/);
  });
  it("numeric target asks for that many slides", () => {
    const [system] = buildDeckPrompt("x", { slideTarget: 6, hint: "" }, contract);
    expect(system.content).toMatch(/6 slides/);
  });
  it("puts the source body in the user message", () => {
    const [, user] = buildDeckPrompt("MY SOURCE PROSE", { slideTarget: "auto", hint: "" }, contract);
    expect(user.content).toContain("MY SOURCE PROSE");
  });
  it("adds the hint to the user message when present, omits it when empty", () => {
    const withHint = buildDeckPrompt("x", { slideTarget: "auto", hint: "focus on architecture" }, contract)[1];
    expect(withHint.content).toContain("focus on architecture");
    const noHint = buildDeckPrompt("x", { slideTarget: "auto", hint: "" }, contract)[1];
    expect(noHint.content).not.toMatch(/hint/i);
  });
});

describe("buildRetryFeedback", () => {
  it("returns an assistant echo (truncated) + a corrective user turn naming the reason", () => {
    const long = "Z".repeat(5000);
    const [assistant, user] = buildRetryFeedback(long, "0 slides after sanitizing");
    expect(assistant.role).toBe("assistant");
    expect(assistant.content.length).toBeLessThanOrEqual(2000);
    expect(user.role).toBe("user");
    expect(user.content).toContain("0 slides after sanitizing");
    expect(user.content).toMatch(/ONLY the deck markdown/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/deck-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/llm/deck-prompt.ts`:
```ts
import { contractToPrompt, type AuthoringContract } from "../constraints/contract";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface DeckPromptOpts { slideTarget: number | "auto"; hint: string }

const MAX_ECHO = 2000;

/** Build the system+user messages that turn a source note body into slide-deck Markdown.
 *  The contract's theme line is omitted (includeTheme:false) — the deck theme is set
 *  deterministically afterwards, so the model must not choose one. */
export function buildDeckPrompt(sourceBody: string, opts: DeckPromptOpts, contract: AuthoringContract): ChatMessage[] {
  const target = opts.slideTarget === "auto"
    ? "Choose the slide count from the content structure — typically 5–12; a short note yields few slides."
    : `Produce about ${opts.slideTarget} slides.`;
  const system = [
    "You convert a Markdown note into a slide-deck Markdown document.",
    contractToPrompt(contract, { includeTheme: false }),
    "",
    "Rules:",
    "- Structure AND condense: turn prose into sparse, presentable bullet points. Do not invent facts, numbers, or claims not in the source.",
    "- Write the deck in the same language as the note.",
    "- Output ONLY the deck markdown. No preamble, no explanation, no surrounding code fences.",
    "- The output begins with the frontmatter block, and NEVER begins with a slide separator line.",
    "- Do not put quotes around frontmatter values.",
    "- Only image embeds (![[name]]) are supported; drop transclusions of other notes.",
    `- ${target}`,
  ].join("\n");

  const userParts = [`Source note:\n\n${sourceBody}`];
  if (opts.hint.trim()) userParts.push(`\nAuthor hint: ${opts.hint.trim()}`);
  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}

/** Corrective feedback for the single allowed auto-retry: echo the failed output (truncated)
 *  as the assistant turn, then a user turn naming why it failed. */
export function buildRetryFeedback(failedOutput: string, reason: string): ChatMessage[] {
  const echo = failedOutput.length > MAX_ECHO ? failedOutput.slice(0, MAX_ECHO) : failedOutput;
  return [
    { role: "assistant", content: echo },
    { role: "user", content: `That was not a valid deck because: ${reason}. Output ONLY the deck markdown, starting with the frontmatter block.` },
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/deck-prompt.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/deck-prompt.ts tests/core/deck-prompt.test.ts
git commit -m "feat(llm): add deck prompt + retry-feedback builders"
```

---

### Task 9: `deck-sanitize.ts` — `extractDeckMarkdown` (deterministic sanitation)

**Files:**
- Create: `src/core/llm/deck-sanitize.ts`
- Test: `tests/core/deck-sanitize.test.ts`

**Interfaces:**
- Produces: `extractDeckMarkdown(raw: string): string`. Applies, in order: newline-normalize + trim → cut a bare `</think>` residue → strip preamble chatter → unwrap an enclosing code fence → **leading-`---` disambiguation (the blocker fix)** → fence-aware separator whitespace normalization → quote-normalize `aspect`/`theme` frontmatter values → drop `key:`-only slides (repeated frontmatter blocks).
- Also produces the internal helper `frontmatterRange(lines: string[]): { end: number } | null` (line-0 `---` … next `---`), reused by `setDeckTheme` in Task 10.

- [ ] **Step 1: Write the failing test**

`tests/core/deck-sanitize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { extractDeckMarkdown } from "../../src/core/llm/deck-sanitize";
import { parseDeck } from "../../src/core/slide-model";

describe("extractDeckMarkdown", () => {
  it("passes clean deck markdown through unchanged (modulo trim)", () => {
    const md = "---\ntheme: dark\n---\n# A\n\n---\n\n# B";
    expect(extractDeckMarkdown(`  ${md}  `)).toBe(md);
  });

  it("strips a preamble chatter line ending in a colon", () => {
    const out = extractDeckMarkdown("Here is your deck:\n\n---\ntheme: dark\n---\n# A");
    expect(out).toBe("---\ntheme: dark\n---\n# A");
  });

  it("unwraps an enclosing ```markdown fence", () => {
    const out = extractDeckMarkdown("```markdown\n# A\n\n---\n\n# B\n```");
    expect(out).toBe("# A\n\n---\n\n# B");
  });

  it("cuts a bare </think> residue (no opener) up to and including its line", () => {
    const out = extractDeckMarkdown("okay let me think\n</think>\n# A\n\n---\n\n# B");
    expect(out).toBe("# A\n\n---\n\n# B");
  });

  it("leaves a properly paired <think>…</think> for downstream handling", () => {
    const raw = "<think>reason</think>\n# A";
    expect(extractDeckMarkdown(raw)).toBe("<think>reason</think>\n# A");
  });

  // THE BLOCKER: a leading --- that is a stray separator (not frontmatter) must be stripped,
  // otherwise parseFrontmatter eats slide 1 silently.
  it("strips a leading --- that is NOT valid frontmatter (blocker fix)", () => {
    const raw = "---\n# First slide\n\n---\n\n# Second slide";
    const out = extractDeckMarkdown(raw);
    expect(parseDeck(out).slides.map((s) => s.markdown.trim())).toEqual(["# First slide", "# Second slide"]);
  });

  it("keeps a leading --- that IS valid frontmatter", () => {
    const raw = "---\ntheme: dark\naspect: 16:9\n---\n# A";
    const out = extractDeckMarkdown(raw);
    expect(out.startsWith("---\ntheme: dark")).toBe(true);
    expect(parseDeck(out).directives.theme).toBe("dark");
  });

  it("normalizes separator whitespace (`--- ` → `---`) outside fences", () => {
    const out = extractDeckMarkdown("# A\n--- \n# B");
    expect(parseDeck(out).slides).toHaveLength(2);
  });

  it("does NOT normalize a `--- ` line inside a code fence", () => {
    const raw = "# A\n\n```yaml\n--- \nx: 1\n```";
    const out = extractDeckMarkdown(raw);
    expect(out).toContain("--- \nx: 1"); // the spaced line inside the fence is preserved
    expect(parseDeck(out).slides).toHaveLength(1);
  });

  it("normalizes quotes around aspect/theme frontmatter values", () => {
    const raw = '---\ntheme: "dark"\naspect: "16:9"\n---\n# A';
    const d = parseDeck(extractDeckMarkdown(raw)).directives;
    expect(d.theme).toBe("dark");
    expect(d.aspect).toBe("16:9");
  });

  it("drops a slide that is a repeated key:-only frontmatter block", () => {
    const raw = "---\ntheme: dark\n---\n# A\n\n---\n\ntheme: dark\naspect: 16:9\n\n---\n\n# B";
    const slides = parseDeck(extractDeckMarkdown(raw)).slides.map((s) => s.markdown.trim());
    expect(slides).toEqual(["# A", "# B"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/deck-sanitize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/llm/deck-sanitize.ts`:
```ts
const FENCE_RE = /^\s*(```|~~~)/;
const KEY_RE = /^\w+:\s/; // frontmatter key grammar (mirrors slide-model.ts parseFrontmatter)

/** Line-0 `---` … next `---`. Returns the closing delimiter index, or null if there is no block. */
export function frontmatterRange(lines: string[]): { end: number } | null {
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.indexOf("---", 1);
  return end === -1 ? null : { end };
}

function cutBareThink(md: string): string {
  const close = md.indexOf("</think>");
  if (close === -1) return md;
  const open = md.indexOf("<think>");
  if (open !== -1 && open < close) return md; // properly paired
  const nl = md.indexOf("\n", close);
  return nl === -1 ? "" : md.slice(nl + 1);
}

function stripPreambleChatter(md: string): string {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && /\s.*:$/.test(lines[i].trim())) {
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    return lines.slice(i).join("\n");
  }
  return md;
}

function unwrapFence(md: string): string {
  const m = /^(```|~~~)[^\n]*\n([\s\S]*?)\n\1[ \t]*$/.exec(md.trim());
  return m ? m[2].trim() : md;
}

function fixLeadingSeparator(md: string): string {
  const lines = md.split("\n");
  if (lines[0]?.trim() !== "---") return md;
  const range = frontmatterRange(lines);
  if (!range) return md; // no closing delimiter → a lone leading --- yields no phantom slide
  const inner = lines.slice(1, range.end);
  const isFrontmatter = inner.every((l) => l.trim() === "" || KEY_RE.test(l.trim()));
  return isFrontmatter ? md : lines.slice(1).join("\n");
}

/** Fence-aware final pass: quote-normalize aspect/theme in frontmatter, normalize body
 *  separator whitespace, and drop key:-only slides (repeated frontmatter blocks). */
function finalPass(md: string): string {
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  const fmEnd = range ? range.end : -1;

  if (fmEnd !== -1) {
    for (let i = 1; i < fmEnd; i++) {
      const m = /^(aspect|theme):\s*(.+?)\s*$/.exec(lines[i]);
      if (m) lines[i] = `${m[1]}: ${m[2].replace(/^["']|["']$/g, "")}`;
    }
  }

  const head = fmEnd === -1 ? [] : lines.slice(0, fmEnd + 1);
  const body = lines.slice(fmEnd === -1 ? 0 : fmEnd + 1);

  const slides: string[][] = [[]];
  let inFence = false, marker = "";
  for (const line of body) {
    const fm = FENCE_RE.exec(line);
    if (fm) {
      if (!inFence) { inFence = true; marker = fm[1]; }
      else if (fm[1] === marker) { inFence = false; marker = ""; }
      slides[slides.length - 1].push(line);
      continue;
    }
    if (!inFence && line.trim() === "---") slides.push([]);
    else slides[slides.length - 1].push(line);
  }
  const kept = slides.filter((s) => {
    const nonEmpty = s.map((l) => l.trim()).filter(Boolean);
    if (nonEmpty.length === 0) return true;
    return !nonEmpty.every((l) => KEY_RE.test(l));
  });
  const bodyOut = kept.map((s) => s.join("\n")).join("\n---\n");
  return head.length ? `${head.join("\n")}\n${bodyOut}` : bodyOut;
}

/** Turn a raw LLM response into clean slide-deck Markdown (deterministic; see Spec §6.1). */
export function extractDeckMarkdown(raw: string): string {
  let md = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  md = cutBareThink(md).trim();
  md = stripPreambleChatter(md).trim();
  md = unwrapFence(md).trim();
  md = fixLeadingSeparator(md).trim();
  md = finalPass(md).trim();
  return md;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/deck-sanitize.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/deck-sanitize.ts tests/core/deck-sanitize.test.ts
git commit -m "feat(llm): add extractDeckMarkdown sanitizer (leading --- blocker fix)"
```

---

### Task 10: `deck-sanitize.ts` — `setDeckTheme` (frontmatter-scoped)

**Files:**
- Modify: `src/core/llm/deck-sanitize.ts` (add `setDeckTheme`, reuse `frontmatterRange`)
- Test: `tests/core/deck-sanitize.test.ts` (add a `setDeckTheme` describe block)

**Interfaces:**
- Consumes: `frontmatterRange` (Task 9).
- Produces: `setDeckTheme(md: string, key: string): string` — replaces `theme:` **only inside** the frontmatter block; injects a fresh block if none exists. Never touches a `theme:` line in a slide body or code fence. Must run AFTER `extractDeckMarkdown` (so the frontmatter block is real, not a pseudo one).

- [ ] **Step 1: Write the failing test** — append to `tests/core/deck-sanitize.test.ts`:
```ts
import { setDeckTheme } from "../../src/core/llm/deck-sanitize";

describe("setDeckTheme", () => {
  it("replaces an existing theme: inside the frontmatter block", () => {
    const out = setDeckTheme("---\ntheme: dark\naspect: 16:9\n---\n# A", "serif");
    expect(out).toBe("---\ntheme: serif\naspect: 16:9\n---\n# A");
  });
  it("injects a frontmatter block when none exists", () => {
    expect(setDeckTheme("# A\n\n---\n\n# B", "dark")).toBe("---\ntheme: dark\n---\n# A\n\n---\n\n# B");
  });
  it("adds theme: to a frontmatter block that lacks it", () => {
    expect(setDeckTheme("---\naspect: 4:3\n---\n# A", "dark")).toBe("---\ntheme: dark\naspect: 4:3\n---\n# A");
  });
  it("does NOT touch a theme: line in a slide body / code fence", () => {
    const src = "---\ntheme: dark\n---\n# A\n\n---\n\n```yaml\ntheme: light\n```";
    const out = setDeckTheme(src, "serif");
    expect(out).toContain("theme: serif"); // frontmatter changed
    expect(out).toContain("theme: light"); // fenced body untouched
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/deck-sanitize.test.ts`
Expected: FAIL — `setDeckTheme` is not exported.

- [ ] **Step 3: Add the implementation** — append to `src/core/llm/deck-sanitize.ts`:
```ts

/** Set the deck theme inside the frontmatter block only (mirrors parseFrontmatter's scope).
 *  Injects a fresh block if none exists. Run AFTER extractDeckMarkdown. */
export function setDeckTheme(md: string, key: string): string {
  const lines = md.split("\n");
  const range = frontmatterRange(lines);
  if (!range) return `---\ntheme: ${key}\n---\n${md}`;
  for (let i = 1; i < range.end; i++) {
    if (/^theme:\s/.test(lines[i])) { lines[i] = `theme: ${key}`; return lines.join("\n"); }
  }
  lines.splice(1, 0, `theme: ${key}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/deck-sanitize.test.ts`
Expected: PASS (15 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/deck-sanitize.ts tests/core/deck-sanitize.test.ts
git commit -m "feat(llm): add frontmatter-scoped setDeckTheme"
```

---

### Task 11: `deck-validate.ts` — static output gate

**Files:**
- Create: `src/core/llm/deck-validate.ts`
- Test: `tests/core/deck-validate.test.ts`

**Interfaces:**
- Consumes: `parseDeck`, `SlideDeck` from `../slide-model`; `collectWarnings`, `Warning` from `../constraints/engine`; `FitResult` from `../layout/fit`.
- Produces: `interface DeckValidation { fatal?: string; deck: SlideDeck; warnings: Warning[] }`; `validateDeckOutput(md: string): DeckValidation`. Fatal only for empty output or 0 slides. Directive/layout/region warnings are collected (stub `FitResult {scale:1, overflow:false}`, `renderWarnings=[]`) but never block. `overflow`/`missing-embed`/`mermaid-error` are excluded (not statically checkable).

- [ ] **Step 1: Write the failing test**

`tests/core/deck-validate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateDeckOutput } from "../../src/core/llm/deck-validate";

describe("validateDeckOutput", () => {
  it("fatal for empty output", () => { expect(validateDeckOutput("   ").fatal).toBeTruthy(); });
  it("fatal for zero slides (frontmatter only)", () => {
    expect(validateDeckOutput("---\ntheme: dark\n---\n").fatal).toBeTruthy();
  });
  it("no fatal for a valid deck; returns the parsed deck", () => {
    const r = validateDeckOutput("# A\n\n---\n\n# B");
    expect(r.fatal).toBeUndefined();
    expect(r.deck.slides).toHaveLength(2);
  });
  it("collects a statically-checkable warning without blocking", () => {
    const r = validateDeckOutput("<!-- layout: nonesuch -->\n# A");
    expect(r.fatal).toBeUndefined();
    expect(r.warnings.some((w) => w.kind === "layout-unknown")).toBe(true);
  });
  it("does not flag overflow (stub fit)", () => {
    expect(validateDeckOutput("# A").warnings.some((w) => w.kind === "overflow")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/deck-validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/core/llm/deck-validate.ts`:
```ts
import { parseDeck, type SlideDeck } from "../slide-model";
import { collectWarnings, type Warning } from "../constraints/engine";
import type { FitResult } from "../layout/fit";

const STUB_FIT: FitResult = { scale: 1, overflow: false };

export interface DeckValidation { fatal?: string; deck: SlideDeck; warnings: Warning[] }

/** Static (no-DOM) validation of sanitized deck markdown. Fatal only for empty output or
 *  zero slides. Directive/layout/region warnings are collected but never block (fit-or-warn).
 *  overflow / missing-embed / mermaid-error are only knowable at render time → excluded. */
export function validateDeckOutput(md: string): DeckValidation {
  const deck = parseDeck(md);
  if (md.trim() === "") return { fatal: "empty output", deck, warnings: [] };
  if (deck.slides.length === 0) return { fatal: "0 slides after sanitizing", deck, warnings: [] };
  const warnings: Warning[] = [];
  for (const slide of deck.slides) warnings.push(...collectWarnings(slide, [], STUB_FIT));
  return { deck, warnings };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/core/deck-validate.test.ts && npm test`
Expected: PASS (5 new tests; full core suite green; purity gate passes — `src/core/llm/**` imports no obsidian).

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/deck-validate.ts tests/core/deck-validate.test.ts
git commit -m "feat(llm): add static validateDeckOutput gate"
```

---

### Task 12: i18n strings (all new EN + DE)

**Files:**
- Modify: `src/i18n.ts` (add keys to both `EN` and `DE` dicts)
- Test: `tests/i18n.test.ts` (add a deck-strings block + a full EN↔DE parity assertion)

**Interfaces:**
- Produces: the `cmd.generateDeck` and `deck.*` keys consumed by Tasks 15–18.

- [ ] **Step 1: Write the failing test** — append to `tests/i18n.test.ts`:
```ts
import { STRINGS_EN, STRINGS_DE } from "../src/i18n";

describe("deck-generation strings", () => {
  const keys = ["cmd.generateDeck", "deck.modal.title", "deck.modal.generate", "deck.modal.stop",
    "deck.modal.slideCount", "deck.modal.hint", "deck.modal.existsReplace", "deck.modal.existsCopy",
    "deck.modal.contextWarn", "deck.modal.noEndpoint", "deck.notice.done", "deck.notice.incomplete",
    "deck.notice.finishedBg", "deck.error.envelope", "deck.error.cors", "deck.error.invalid",
    "deck.settings.heading", "deck.settings.endpoints.name", "deck.settings.model.name",
    "deck.settings.maxTokens.name", "deck.settings.temperature.name", "deck.settings.suppressThinking.name"];
  it("has EN + DE for every deck key", () => {
    setLang("en"); for (const k of keys) expect(t(k), `EN ${k}`).not.toBe(k);
    setLang("de"); for (const k of keys) expect(t(k), `DE ${k}`).not.toBe(k);
    setLang("en");
  });
});

describe("EN/DE parity", () => {
  it("every EN key has a DE translation and vice versa", () => {
    expect(Object.keys(STRINGS_DE).sort()).toEqual(Object.keys(STRINGS_EN).sort());
  });
});
```

- [ ] **Step 2: Export the dicts for the parity test** — in `src/i18n.ts`, change the `const EN`/`const DE` declarations so they are also exported (rename the exports to avoid confusion):
```ts
export const STRINGS_EN: Dict = EN;
export const STRINGS_DE: Dict = DE;
```
Add these two lines just after the `const STRINGS: Record<Lang, Dict> = { en: EN, de: DE };` line.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — deck keys resolve to themselves (missing).

- [ ] **Step 4: Add the keys** — insert the following block into the `EN` dict (before its closing `};`) and the matching German block into the `DE` dict:

EN additions:
```ts
  "cmd.generateDeck": "Generate presentation from note",
  "deck.modal.title": "Generate presentation",
  "deck.modal.endpoint": "Endpoint",
  "deck.modal.model": "Model",
  "deck.modal.reachable": "reachable",
  "deck.modal.unreachable": "not reachable",
  "deck.modal.slideCount": "Target slides",
  "deck.modal.auto": "auto",
  "deck.modal.hint": "Hint (optional)",
  "deck.modal.hintPlaceholder": "e.g. focus on architecture, in English",
  "deck.modal.theme": "Theme",
  "deck.modal.generate": "Generate",
  "deck.modal.cancel": "Cancel",
  "deck.modal.stop": "Stop",
  "deck.modal.reasoning": "Reasoning",
  "deck.modal.generating": "Generating…",
  "deck.modal.attempt": "Attempt {0}…",
  "deck.modal.elapsed": "{0}s elapsed",
  "deck.modal.existsLabel": "A deck note already exists:",
  "deck.modal.existsReplace": "Replace (hand edits will be lost)",
  "deck.modal.existsCopy": "New copy",
  "deck.modal.sourceIsDeck": "This note already looks like a deck.",
  "deck.modal.contextWarn": "The note may exceed the model context (~{0} tokens vs {1}). Consider shortening it.",
  "deck.modal.noEndpoint": "No endpoint reachable — check the AI settings.",
  "deck.notice.done": "Deck generated: {0}",
  "deck.notice.incomplete": "Deck written but may be incomplete — token limit reached.",
  "deck.notice.finishedBg": "Deck generation finished in the background: {0}",
  "deck.error.envelope": "Server error: {0}",
  "deck.error.cors": "The endpoint answered the ping but refused the stream (likely CORS). Enable CORS on the server (e.g. OLLAMA_ORIGINS); it will fall back to non-streaming.",
  "deck.error.invalid": "The model did not return a valid deck ({0}).",
  "deck.settings.heading": "AI (local)",
  "deck.settings.endpoints.name": "Endpoints",
  "deck.settings.endpoints.desc": "One OpenAI-compatible base URL per line; the first reachable one is used. Default: http://localhost:1234",
  "deck.settings.model.name": "Model",
  "deck.settings.model.desc": "Model id sent to the endpoint (e.g. the loaded LM Studio / Ollama model).",
  "deck.settings.maxTokens.name": "Max output tokens",
  "deck.settings.maxTokens.desc": "Upper bound on generated tokens (default 8192).",
  "deck.settings.temperature.name": "Temperature",
  "deck.settings.temperature.desc": "Sampling temperature (default 0.3).",
  "deck.settings.suppressThinking.name": "Suppress model thinking",
  "deck.settings.suppressThinking.desc": "Ask reasoning models to skip visible thinking (default on).",
```

DE additions:
```ts
  "cmd.generateDeck": "Präsentation aus Notiz erzeugen",
  "deck.modal.title": "Präsentation erzeugen",
  "deck.modal.endpoint": "Endpoint",
  "deck.modal.model": "Modell",
  "deck.modal.reachable": "erreichbar",
  "deck.modal.unreachable": "nicht erreichbar",
  "deck.modal.slideCount": "Zielfolienzahl",
  "deck.modal.auto": "auto",
  "deck.modal.hint": "Hinweis (optional)",
  "deck.modal.hintPlaceholder": "z. B. Fokus auf Architektur, auf Englisch",
  "deck.modal.theme": "Theme",
  "deck.modal.generate": "Erzeugen",
  "deck.modal.cancel": "Abbrechen",
  "deck.modal.stop": "Stopp",
  "deck.modal.reasoning": "Denkprozess",
  "deck.modal.generating": "Erzeuge…",
  "deck.modal.attempt": "{0}. Versuch…",
  "deck.modal.elapsed": "{0}s vergangen",
  "deck.modal.existsLabel": "Es existiert bereits eine Deck-Notiz:",
  "deck.modal.existsReplace": "Ersetzen (Handedits gehen verloren)",
  "deck.modal.existsCopy": "Neue Kopie",
  "deck.modal.sourceIsDeck": "Diese Notiz sieht bereits wie ein Deck aus.",
  "deck.modal.contextWarn": "Die Notiz überschreitet evtl. den Modell-Kontext (~{0} vs. {1} Tokens). Ggf. kürzen.",
  "deck.modal.noEndpoint": "Kein Endpoint erreichbar — AI-Einstellungen prüfen.",
  "deck.notice.done": "Deck erzeugt: {0}",
  "deck.notice.incomplete": "Deck geschrieben, evtl. unvollständig — Token-Limit erreicht.",
  "deck.notice.finishedBg": "Deck-Erzeugung im Hintergrund fertig: {0}",
  "deck.error.envelope": "Server-Fehler: {0}",
  "deck.error.cors": "Der Endpoint beantwortet den Ping, verweigert aber den Stream (vermutlich CORS). CORS am Server aktivieren (z. B. OLLAMA_ORIGINS); sonst greift der Non-Streaming-Fallback.",
  "deck.error.invalid": "Das Modell lieferte kein gültiges Deck ({0}).",
  "deck.settings.heading": "KI (lokal)",
  "deck.settings.endpoints.name": "Endpoints",
  "deck.settings.endpoints.desc": "Eine OpenAI-kompatible Basis-URL pro Zeile; die erste erreichbare wird genutzt. Standard: http://localhost:1234",
  "deck.settings.model.name": "Modell",
  "deck.settings.model.desc": "Modell-ID an den Endpoint (z. B. das geladene LM-Studio-/Ollama-Modell).",
  "deck.settings.maxTokens.name": "Max. Ausgabe-Tokens",
  "deck.settings.maxTokens.desc": "Obergrenze der erzeugten Tokens (Standard 8192).",
  "deck.settings.temperature.name": "Temperatur",
  "deck.settings.temperature.desc": "Sampling-Temperatur (Standard 0.3).",
  "deck.settings.suppressThinking.name": "Modell-Denkprozess unterdrücken",
  "deck.settings.suppressThinking.desc": "Reasoning-Modelle bitten, sichtbares Denken zu überspringen (Standard an).",
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/i18n.test.ts`
Expected: PASS (deck keys resolve in both langs; EN/DE parity holds).

- [ ] **Step 6: Commit**

```bash
git add src/i18n.ts tests/i18n.test.ts
git commit -m "feat(i18n): add deck-generation strings (EN+DE) + parity test"
```

---

## Phase C — Adapter: transport, client, orchestrator

### Task 13: `llm-stream.ts` — XHR streaming (extended with `raw` + `finishReason`)

**Files:**
- Create: `src/llm-stream.ts` (adapter — uses `XMLHttpRequest`, the sanctioned streaming primitive)
- Create: `tests/fake_xhr.ts` (copied verbatim from vault-rag)
- Test: `tests/llm-stream.test.ts`

**Interfaces:**
- Consumes: `parseSSE` (Task 1), `ThinkSplitter` (Task 2).
- Produces: `interface StreamResult { content: string; reasoning: string; model: string; raw: string; finishReason?: string }`; `streamSSE(url, init, onContent, onReasoning, signal?): Promise<StreamResult>`. On `xhr.onerror` it rejects with an error whose `.name === "StreamNetworkError"` (so the client can branch to the CORS fallback); on abort, `.name === "AbortError"`.

- [ ] **Step 1: Copy the fake XHR harness** — copy `/Users/Shared/code/vault-rag/tests/fake_xhr.ts` verbatim to `tests/fake_xhr.ts` (no changes).

- [ ] **Step 2: Write the failing test**

`tests/llm-stream.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { streamSSE } from "../src/llm-stream";
import { installFakeXHR } from "./fake_xhr";

const init = { method: "POST", headers: {}, body: "" };

describe("streamSSE (XHR, extended)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates content + calls onContent per delta", async () => {
    const xhr = installFakeXHR();
    const got: string[] = [];
    const p = streamSSE("u", init, (t) => got.push(t), () => {});
    xhr.feed(['data: {"choices":[{"delta":{"content":"Hal"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n']);
    expect((await p).content).toBe("Hallo");
    expect(got).toEqual(["Hal", "lo"]);
  });

  it("exposes raw responseText for the envelope check", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed(['{"error":{"message":"model not loaded"}}']);
    const r = await p;
    expect(r.content).toBe("");
    expect(r.raw).toContain("model not loaded");
  });

  it("captures finishReason: length", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed(['data: {"choices":[{"delta":{"content":"a"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n']);
    expect((await p).finishReason).toBe("length");
  });

  it("routes reasoning + strips inline <think>", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed(['data: {"choices":[{"delta":{"content":"<think>why</think>Answer"}}]}\n\ndata: [DONE]\n\n']);
    expect(await p).toMatchObject({ content: "Answer", reasoning: "why" });
  });

  it("rejects with StreamNetworkError on xhr.onerror (CORS)", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.error();
    await expect(p).rejects.toMatchObject({ name: "StreamNetworkError" });
  });

  it("rejects on HTTP error status", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed([""], 500);
    await expect(p).rejects.toThrow("500");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/llm-stream.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`src/llm-stream.ts` (vendored from vault-rag `sse.ts:29–80`, extended with `raw` + `finishReason` + `StreamNetworkError`):
```ts
import { parseSSE } from "./core/llm/sse-parse";
import { ThinkSplitter } from "./core/llm/think-splitter";

export interface StreamResult { content: string; reasoning: string; model: string; raw: string; finishReason?: string }

/** Streams an OpenAI-compatible SSE stream over XMLHttpRequest (NOT fetch: Obsidian forbids it;
 *  requestUrl cannot stream). Extended vs. the vault-rag seed: returns `raw` (full responseText,
 *  for the HTTP-200-error-body envelope check) and `finishReason` (token-limit detection). A network
 *  error rejects as `StreamNetworkError` so the caller can fall back to non-streaming (CORS). */
export function streamSSE(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
  onContent: (t: string) => void,
  onReasoning: (t: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const splitter = new ThinkSplitter();
    let content = "", reasoning = "", model = "", buffer = "", seen = 0;
    let finishReason: string | undefined;
    const emit = (c: string, r: string): void => {
      if (c) { content += c; onContent(c); }
      if (r) { reasoning += r; onReasoning(r); }
    };
    const drain = (p: { content: string[]; reasoning: string[]; model?: string; finishReason?: string }): void => {
      if (!model && p.model) model = p.model;
      if (finishReason === undefined && p.finishReason) finishReason = p.finishReason;
      for (const r of p.reasoning) emit("", r);
      for (const c of p.content) { const s = splitter.push(c); emit(s.content, s.reasoning); }
    };
    const pump = (): void => {
      const text = xhr.responseText;
      buffer += text.slice(seen);
      seen = text.length;
      const p = parseSSE(buffer);
      buffer = p.rest;
      drain(p);
    };
    const named = (msg: string, name: string): Error => { const e = new Error(msg); e.name = name; return e; };

    xhr.open(init.method, url);
    for (const [k, v] of Object.entries(init.headers)) xhr.setRequestHeader(k, v);
    xhr.onprogress = (): void => pump();
    xhr.onerror = (): void => reject(named("stream network error", "StreamNetworkError"));
    xhr.onabort = (): void => reject(named("Aborted", "AbortError"));
    xhr.onload = (): void => {
      pump();
      drain(parseSSE(buffer));
      const tail = splitter.flush();
      emit(tail.content, tail.reasoning);
      const raw = xhr.responseText;
      if (xhr.status < 200 || xhr.status >= 300) reject(new Error(`stream HTTP ${xhr.status}`));
      else resolve({ content, reasoning, model, raw, finishReason });
    };
    if (signal) signal.addEventListener("abort", () => xhr.abort());
    xhr.send(init.body);
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/llm-stream.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/llm-stream.ts tests/fake_xhr.ts tests/llm-stream.test.ts
git commit -m "feat(llm): add XHR streamSSE with raw + finishReason + CORS-distinct error"
```

---

### Task 14: `llm-client.ts` — `DeckLlmClient` + factory

**Files:**
- Create: `src/llm-client.ts`
- Test: `tests/llm-client.test.ts`

**Interfaces:**
- Consumes: `streamSSE`/`StreamResult` (Task 13); `normalizeEndpoint` (Task 3); `suppressParams` (Task 4); `parseErrorEnvelope` (Task 5); `parseLmStudioContext`/`parseOllamaContext`/`ModelContext` (Task 6); `ChatMessage` (Task 8); `requestUrl` from obsidian.
- Produces:
  - `interface HttpJson { (param): Promise<{ status: number; json: unknown; text: string }> }`
  - `interface StreamOpts { model: string; temperature: number; maxTokens: number; suppressThinking: boolean }`
  - `interface DeckStreamResult { content: string; reasoning: string; finishReason?: string; usedFallback: boolean }`
  - `class DeckLlmClient` with `ping()`, `listModels()`, `modelContext(model)`, `generate(messages, opts, onContent, onReasoning, signal?)` (constructor takes injected `http: HttpJson` + `stream_: typeof streamSSE`).
  - `makeDeckLlmClient(endpoint, model): DeckLlmClient` (wires `requestUrlHttpJson` + `streamSSE`).

- [ ] **Step 1: Write the failing test**

`tests/llm-client.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { DeckLlmClient, type HttpJson } from "../src/llm-client";

const opts = { model: "m", temperature: 0.3, maxTokens: 8192, suppressThinking: true };
const msg = [{ role: "user" as const, content: "x" }];

function fakeHttp(impl: (url: string, init?: any) => { status: number; json?: unknown; text?: string }): HttpJson {
  return (param) => Promise.resolve({ status: 200, json: {}, text: "", ...impl(param.url, param) });
}
const okStream = (over: any = {}): any =>
  (_u: string, _i: any, onC: (t: string) => void) => { onC(over.content ?? "# A"); return Promise.resolve({ content: "# A", reasoning: "", model: "m", raw: "data: x", finishReason: undefined, ...over }); };

describe("DeckLlmClient reachability", () => {
  it("ping true on 200", async () => {
    expect(await new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), okStream()).ping()).toBe(true);
  });
  it("listModels returns sorted ids", async () => {
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { data: [{ id: "b" }, { id: "a" }] } })), okStream());
    expect(await c.listModels()).toEqual(["a", "b"]);
  });
  it("normalizes a /v1-suffixed endpoint", async () => {
    const urls: string[] = [];
    await new DeckLlmClient("http://x/v1", "m", fakeHttp((u) => { urls.push(u); return { status: 200 }; }), okStream()).ping();
    expect(urls[0]).toBe("http://x/v1/models");
  });
  it("modelContext reads LM Studio loaded_context_length", async () => {
    const c = new DeckLlmClient("http://x", "m", fakeHttp((u) => u.endsWith("/api/v0/models") ? ({ status: 200, json: { data: [{ id: "m", loaded_context_length: 8192 }] } }) : ({ status: 404 })), okStream());
    expect(await c.modelContext("m")).toEqual({ loadedContextLength: 8192 });
  });
});

describe("DeckLlmClient.generate", () => {
  it("returns streamed content on success", async () => {
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), okStream({ content: "# Title", finishReason: "stop" }));
    expect(await c.generate(msg, opts, () => {}, () => {})).toMatchObject({ content: "# Title", usedFallback: false });
  });
  it("throws the envelope message on a 200-error stream body", async () => {
    const errStream: any = () => Promise.resolve({ content: "", reasoning: "", model: "", raw: '{"error":{"message":"model not loaded"}}' });
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), errStream);
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("model not loaded");
  });
  it("falls back to non-streaming on StreamNetworkError (CORS)", async () => {
    const netErr: any = () => { const e = new Error("net"); e.name = "StreamNetworkError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { choices: [{ message: { content: "# Fallback" }, finish_reason: "stop" }] }, text: '{"choices":[]}' })), netErr);
    expect(await c.generate(msg, opts, () => {}, () => {})).toMatchObject({ content: "# Fallback", usedFallback: true });
  });
  it("does NOT fall back on AbortError", async () => {
    const abortErr: any = () => { const e = new Error("Aborted"); e.name = "AbortError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), abortErr);
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toMatchObject({ name: "AbortError" });
  });
  it("fallback surfaces the envelope from the error body", async () => {
    const netErr: any = () => { const e = new Error("net"); e.name = "StreamNetworkError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: {}, text: '{"error":{"message":"context length exceeded"}}' })), netErr);
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("context length exceeded");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/llm-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/llm-client.ts`:
```ts
import { requestUrl } from "obsidian";
import { streamSSE, type StreamResult } from "./llm-stream";
import { normalizeEndpoint } from "./core/llm/endpoint";
import { suppressParams } from "./core/llm/reasoning";
import { parseErrorEnvelope } from "./core/llm/error-envelope";
import { parseLmStudioContext, parseOllamaContext, type ModelContext } from "./core/llm/model-info";
import type { ChatMessage } from "./core/llm/deck-prompt";

export interface HttpJson { (param: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; json: unknown; text: string }> }
export interface StreamOpts { model: string; temperature: number; maxTokens: number; suppressThinking: boolean }
export interface DeckStreamResult { content: string; reasoning: string; finishReason?: string; usedFallback: boolean }

/** The single requestUrl-backed transport (CORS-free, mobile-safe). throw:false so an HTTP error
 *  still returns a body for the envelope check. Kept out of DeckLlmClient so tests inject a fake. */
export const requestUrlHttpJson: HttpJson = async (param) => {
  const r = await requestUrl({ ...param, throw: false });
  let json: unknown;
  try { json = r.json; } catch { /* non-JSON body — json stays undefined */ }
  return { status: r.status, json, text: r.text };
};

export class DeckLlmClient {
  private endpoint: string;
  constructor(endpoint: string, private model: string, private http: HttpJson, private stream_: typeof streamSSE) {
    this.endpoint = normalizeEndpoint(endpoint);
  }

  async ping(): Promise<boolean> {
    try { return (await this.http({ url: `${this.endpoint}/v1/models` })).status === 200; } catch { return false; }
  }

  async listModels(): Promise<string[]> {
    try {
      const { status, json } = await this.http({ url: `${this.endpoint}/v1/models` });
      if (status !== 200) return [];
      const j = json as { data?: { id?: string }[] };
      return (j.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === "string").sort();
    } catch { return []; }
  }

  /** Best-effort context length (LM Studio /api/v0/models, then Ollama /api/show). null if unknown. */
  async modelContext(model: string): Promise<ModelContext | null> {
    try {
      const lm = await this.http({ url: `${this.endpoint}/api/v0/models` });
      if (lm.status === 200) { const c = parseLmStudioContext(lm.json, model); if (c) return c; }
    } catch { /* try next */ }
    try {
      const oll = await this.http({ url: `${this.endpoint}/api/show`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
      if (oll.status === 200) { const c = parseOllamaContext(oll.json); if (c) return c; }
    } catch { /* give up */ }
    return null;
  }

  private buildBody(messages: ChatMessage[], opts: StreamOpts, stream: boolean): string {
    return JSON.stringify({
      model: opts.model || this.model,
      messages, stream,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...suppressParams(opts.suppressThinking),
    });
  }

  /** Stream via XHR; on a stream network error (CORS: ping ok but stream refused) fall back once to
   *  non-streaming requestUrl. Throws the server envelope message on an HTTP-200-error body. */
  async generate(messages: ChatMessage[], opts: StreamOpts, onContent: (t: string) => void, onReasoning: (t: string) => void, signal?: AbortSignal): Promise<DeckStreamResult> {
    try {
      const r = await this.stream_(`${this.endpoint}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: this.buildBody(messages, opts, true) }, onContent, onReasoning, signal);
      this.throwIfEnvelope(r);
      return { content: r.content, reasoning: r.reasoning, finishReason: r.finishReason, usedFallback: false };
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === "AbortError") throw e;
      if (name !== "StreamNetworkError") throw e; // real HTTP/envelope error → surface, no fallback
      return this.generateNonStreaming(messages, opts, signal);
    }
  }

  private async generateNonStreaming(messages: ChatMessage[], opts: StreamOpts, signal?: AbortSignal): Promise<DeckStreamResult> {
    if (signal?.aborted) { const e = new Error("Aborted"); e.name = "AbortError"; throw e; }
    const res = await this.http({ url: `${this.endpoint}/v1/chat/completions`, method: "POST", headers: { "Content-Type": "application/json" }, body: this.buildBody(messages, opts, false) });
    const envelope = parseErrorEnvelope(res.text);
    if (envelope) throw new Error(envelope);
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    const j = res.json as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const c0 = j.choices?.[0];
    return { content: c0?.message?.content ?? "", reasoning: "", finishReason: c0?.finish_reason, usedFallback: true };
  }

  private throwIfEnvelope(r: StreamResult): void {
    if (!r.content.trim() && !/^\s*data:/m.test(r.raw)) {
      const envelope = parseErrorEnvelope(r.raw);
      if (envelope) throw new Error(envelope);
    }
  }
}

/** Production factory: wires the requestUrl httpJson + the XHR streamSSE. */
export function makeDeckLlmClient(endpoint: string, model: string): DeckLlmClient {
  return new DeckLlmClient(endpoint, model, requestUrlHttpJson, streamSSE);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/llm-client.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm-client.ts tests/llm-client.test.ts
git commit -m "feat(llm): add DeckLlmClient (XHR stream + requestUrl fallback + envelope)"
```

---

### Task 15: `generate-deck.ts` — orchestrator (`runGenerateDeck`)

**Files:**
- Create: `src/generate-deck.ts`
- Test: `tests/generate-deck.test.ts`

**Interfaces:**
- Consumes: `extractDeckMarkdown`/`setDeckTheme` (Tasks 9/10); `validateDeckOutput` (Task 11); `buildRetryFeedback`/`ChatMessage` (Task 8); `DeckLlmClient`/`StreamOpts` (Task 14).
- Produces:
  - `type GenPhase = "running" | "retrying" | "done" | "error" | "aborted"`
  - `interface GenState { phase: GenPhase; attempt: number; content: string; reasoning: string; error?: string }`
  - `interface GenerateDeps { client: Pick<DeckLlmClient, "generate">; messages: ChatMessage[]; streamOpts: StreamOpts; themeKey: string; signal: AbortSignal; onState: (s: GenState) => void }`
  - `interface GenerateResult { status: "ok" | "fatal" | "aborted"; markdown?: string; incomplete?: boolean; error?: string }`
  - `runGenerateDeck(deps: GenerateDeps): Promise<GenerateResult>` — pipeline `stream → sanitize → setDeckTheme → validate`, at most one retry on a format-fatal result, hard cap of 2 runs, immediate fatal (no retry) on an envelope/server error. Returns the deck markdown; the **caller** writes the note.

- [ ] **Step 1: Write the failing test**

`tests/generate-deck.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runGenerateDeck } from "../src/generate-deck";

const opts = { model: "m", temperature: 0.3, maxTokens: 8192, suppressThinking: true };
const baseMessages = [{ role: "user" as const, content: "src" }];
function deps(client: any, over: any = {}) {
  return { client, messages: baseMessages, streamOpts: opts, themeKey: "dark", signal: new AbortController().signal, onState: () => {}, ...over };
}

describe("runGenerateDeck", () => {
  it("happy path: returns a themed deck, not incomplete", async () => {
    const client = { generate: vi.fn(async () => ({ content: "# A\n\n---\n\n# B", reasoning: "", usedFallback: false })) };
    const r = await runGenerateDeck(deps(client));
    expect(r.status).toBe("ok");
    expect(r.markdown).toContain("theme: dark");
    expect(r.incomplete).toBe(false);
  });

  it("marks incomplete on finish_reason length", async () => {
    const client = { generate: vi.fn(async () => ({ content: "# A", reasoning: "", finishReason: "length", usedFallback: false })) };
    expect((await runGenerateDeck(deps(client))).incomplete).toBe(true);
  });

  it("retries once on a format-fatal result, then succeeds (with retry feedback)", async () => {
    const client = { generate: vi.fn() };
    client.generate.mockResolvedValueOnce({ content: "", reasoning: "", usedFallback: false });   // 0 slides → fatal
    client.generate.mockResolvedValueOnce({ content: "# Good", reasoning: "", usedFallback: false });
    const r = await runGenerateDeck(deps(client));
    expect(r.status).toBe("ok");
    expect(client.generate).toHaveBeenCalledTimes(2);
    expect(client.generate.mock.calls[1][0].length).toBeGreaterThan(baseMessages.length);
  });

  it("gives up after 2 fatal runs (hard cap)", async () => {
    const client = { generate: vi.fn(async () => ({ content: "", reasoning: "", usedFallback: false })) };
    const r = await runGenerateDeck(deps(client));
    expect(r.status).toBe("fatal");
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it("returns fatal immediately on an envelope error (NO retry)", async () => {
    const client = { generate: vi.fn(async () => { throw new Error("model not loaded"); }) };
    const r = await runGenerateDeck(deps(client));
    expect(r).toMatchObject({ status: "fatal", error: "model not loaded" });
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it("returns aborted on AbortError", async () => {
    const client = { generate: vi.fn(async () => { const e = new Error("Aborted"); e.name = "AbortError"; throw e; }) };
    expect((await runGenerateDeck(deps(client))).status).toBe("aborted");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/generate-deck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/generate-deck.ts`:
```ts
import { extractDeckMarkdown, setDeckTheme } from "./core/llm/deck-sanitize";
import { validateDeckOutput } from "./core/llm/deck-validate";
import { buildRetryFeedback, type ChatMessage } from "./core/llm/deck-prompt";
import type { DeckLlmClient, StreamOpts } from "./llm-client";

export type GenPhase = "running" | "retrying" | "done" | "error" | "aborted";
export interface GenState { phase: GenPhase; attempt: number; content: string; reasoning: string; error?: string }

export interface GenerateDeps {
  client: Pick<DeckLlmClient, "generate">;
  messages: ChatMessage[];
  streamOpts: StreamOpts;
  themeKey: string;
  signal: AbortSignal;
  onState: (s: GenState) => void;
}
export interface GenerateResult { status: "ok" | "fatal" | "aborted"; markdown?: string; incomplete?: boolean; error?: string }

const MAX_RUNS = 2;

/** stream → sanitize → setDeckTheme → validate, with at most one retry on a format-fatal result.
 *  An envelope/server error returns fatal immediately (no retry — deterministic server state).
 *  Hard cap: MAX_RUNS total generation calls. Returns the deck markdown; the caller writes the note. */
export async function runGenerateDeck(deps: GenerateDeps): Promise<GenerateResult> {
  let messages = deps.messages;
  let lastReason = "invalid output";
  for (let attempt = 1; attempt <= MAX_RUNS; attempt++) {
    const phase: GenPhase = attempt === 1 ? "running" : "retrying";
    const acc = { content: "", reasoning: "" };
    deps.onState({ phase, attempt, content: "", reasoning: "" });
    let finishReason: string | undefined;
    try {
      const r = await deps.client.generate(
        messages, deps.streamOpts,
        (c) => { acc.content += c; deps.onState({ phase, attempt, content: acc.content, reasoning: acc.reasoning }); },
        (rs) => { acc.reasoning += rs; deps.onState({ phase, attempt, content: acc.content, reasoning: acc.reasoning }); },
        deps.signal,
      );
      finishReason = r.finishReason;
      acc.content = r.content; acc.reasoning = r.reasoning;
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return { status: "aborted" };
      return { status: "fatal", error: (e as Error).message };
    }

    const themed = setDeckTheme(extractDeckMarkdown(acc.content), deps.themeKey);
    const validation = validateDeckOutput(themed);
    if (!validation.fatal) {
      deps.onState({ phase: "done", attempt, content: acc.content, reasoning: acc.reasoning });
      return { status: "ok", markdown: themed, incomplete: finishReason === "length" };
    }
    lastReason = validation.fatal;
    if (attempt < MAX_RUNS) messages = [...deps.messages, ...buildRetryFeedback(acc.content, validation.fatal)];
  }
  deps.onState({ phase: "error", attempt: MAX_RUNS, content: "", reasoning: "", error: lastReason });
  return { status: "fatal", error: lastReason };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/generate-deck.test.ts && npm test`
Expected: PASS (6 new tests; full suite green).

- [ ] **Step 5: Commit**

```bash
git add src/generate-deck.ts tests/generate-deck.test.ts
git commit -m "feat(llm): add runGenerateDeck orchestrator (retry cap + fatal classes)"
```

---

## Phase D — Adapter: settings, command wiring, modal, docs

> **Design note (comply-or-explain vs. Spec §7.2):** the spec suggested a native `SettingDefinitionList`
> for `llmEndpoints`. The Obsidian 1.13 list API binds **per-item scalars** through `key` — there is no
> `string[]` control type, so a whole-array binding cannot round-trip through the existing
> `get/setControlValue` harness in a statically type-safe way. We therefore store `llmEndpoints: string[]`
> but **edit it via a declarative `textarea` control** (one endpoint per line), joined/split through the
> pure `parseEndpointList` (Task 3). This keeps the array in the settings schema (spec-faithful), stays
> declarative (honours the anti-imperative `onChange` lesson), round-trips through the tested harness, and
> the parse is unit-tested. A live model dropdown is deferred; `llmModel` is a freetext control, and the
> modal shows the resolved model + a live ping.

### Task 16: `settings.ts` — "AI (local)" group

**Files:**
- Modify: `src/settings.ts` (interface, DEFAULT_SETTINGS, a second group, get/setControlValue)
- Test: `tests/settings.test.ts` (flatten groups; extend the key set + round-trip)

**Interfaces:**
- Consumes: `parseEndpointList` (Task 3); the `deck.settings.*` i18n keys (Task 12).
- Produces: new `SlideDeckSettings` fields `llmEndpoints: string[]`, `llmModel: string`, `llmMaxTokens: number`, `llmTemperature: number`, `llmSuppressThinking: boolean`, all round-tripped through `getControlValue`/`setControlValue`.

- [ ] **Step 1: Update the round-trip test** — in `tests/settings.test.ts`, replace the `controlItems` helper with the group-flattening version:
```ts
function controlItems(tab: SlideDeckSettingTab) {
  const defs = tab.getSettingDefinitions() as Array<{ type: string; items: any[] }>;
  const items = defs.flatMap((g) => { expect(g.type).toBe("group"); return g.items; });
  return items.filter((i) => i && typeof i === "object" && "control" in i && i.control) as Array<{ control: { key: string; type: string } }>;
}
```
Then replace the entire first `it("returns one group…")` block with:
```ts
  it("every control key is a real settings key and round-trips", async () => {
    const settings: SlideDeckSettings = { ...DEFAULT_SETTINGS };
    const { plugin, calls } = makeFakePlugin(settings);
    const tab = new SlideDeckSettingTab({} as any, plugin as any);

    const controls = controlItems(tab);
    const keys = controls.map((c) => c.control.key);
    expect(new Set(keys)).toEqual(new Set([
      "defaultTheme", "minFontPx", "imageScale", "exportFolder", "themesFolder", "hideThemesFolder", "customCss",
      "llmEndpoints", "llmModel", "llmMaxTokens", "llmTemperature", "llmSuppressThinking",
    ]));
    for (const key of keys) expect(key in DEFAULT_SETTINGS).toBe(true);

    for (const key of keys) {
      if (key === "llmEndpoints") { expect(tab.getControlValue(key)).toBe(settings.llmEndpoints.join("\n")); continue; }
      expect(tab.getControlValue(key)).toBe(settings[key as keyof SlideDeckSettings]);
    }

    const newValues: Record<string, unknown> = {
      defaultTheme: "dark", minFontPx: 30, imageScale: 3, exportFolder: "Out", themesFolder: "Themes",
      hideThemesFolder: false, customCss: "body{}",
      llmEndpoints: "http://a\nhttp://b", llmModel: "qwen3", llmMaxTokens: 4096, llmTemperature: 0.7, llmSuppressThinking: false,
    };
    for (const key of keys) {
      await tab.setControlValue(key, newValues[key]);
      if (key === "llmEndpoints") {
        expect(settings.llmEndpoints).toEqual(["http://a", "http://b"]);
        expect(tab.getControlValue(key)).toBe("http://a\nhttp://b");
        continue;
      }
      expect(settings[key as keyof SlideDeckSettings]).toBe(newValues[key]);
      expect(tab.getControlValue(key)).toBe(newValues[key]);
    }
    expect(calls.saveSettings).toBeGreaterThanOrEqual(keys.length);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — key set mismatch (new AI keys absent).

- [ ] **Step 3: Extend the settings interface + defaults** — in `src/settings.ts`, add to `SlideDeckSettings` (after `hideThemesFolder: boolean;`):
```ts
  llmEndpoints: string[];
  llmModel: string;
  llmMaxTokens: number;
  llmTemperature: number;
  llmSuppressThinking: boolean;
```
And to `DEFAULT_SETTINGS` (after `hideThemesFolder: true,`):
```ts
  llmEndpoints: ["http://localhost:1234"], llmModel: "", llmMaxTokens: 8192, llmTemperature: 0.3, llmSuppressThinking: true,
```
Add the import at the top:
```ts
import { parseEndpointList } from "./core/llm/endpoint";
```

- [ ] **Step 4: Add the second group** — in `getSettingDefinitions()`, return a second group after the existing one (change `return [ {…} ];` to `return [ {…}, {AI group} ];`). The AI group:
```ts
      {
        type: "group",
        heading: t("deck.settings.heading"),
        items: [
          { name: t("deck.settings.endpoints.name"), desc: t("deck.settings.endpoints.desc"),
            control: { type: "textarea", key: "llmEndpoints", placeholder: DEFAULT_SETTINGS.llmEndpoints[0] } },
          { name: t("deck.settings.model.name"), desc: t("deck.settings.model.desc"),
            control: { type: "text", key: "llmModel", placeholder: "qwen3" } },
          { name: t("deck.settings.maxTokens.name"), desc: t("deck.settings.maxTokens.desc"),
            control: { type: "number", key: "llmMaxTokens", min: 256 } },
          { name: t("deck.settings.temperature.name"), desc: t("deck.settings.temperature.desc"),
            control: { type: "number", key: "llmTemperature", min: 0, step: "any" } },
          { name: t("deck.settings.suppressThinking.name"), desc: t("deck.settings.suppressThinking.desc"),
            control: { type: "toggle", key: "llmSuppressThinking" } },
        ],
      },
```

- [ ] **Step 5: Wire get/setControlValue** — in `getControlValue`, add before `default:`:
```ts
      case "llmEndpoints": return s.llmEndpoints.join("\n");
      case "llmModel": return s.llmModel;
      case "llmMaxTokens": return s.llmMaxTokens;
      case "llmTemperature": return s.llmTemperature;
      case "llmSuppressThinking": return s.llmSuppressThinking;
```
In `setControlValue`, add before `default:` (these need `await this.plugin.saveSettings()` at the end, which the existing fall-through already does):
```ts
      case "llmEndpoints": s.llmEndpoints = parseEndpointList(String(value)); break;
      case "llmModel": s.llmModel = String(value).trim(); break;
      case "llmMaxTokens": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.llmMaxTokens = Math.floor(n); break; }
      case "llmTemperature": { const n = Number(value); if (Number.isFinite(n) && n >= 0) s.llmTemperature = n; break; }
      case "llmSuppressThinking": s.llmSuppressThinking = Boolean(value); break;
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/settings.test.ts && npm test`
Expected: PASS (round-trip covers all 12 keys; full suite green).

- [ ] **Step 7: Commit**

```bash
git add src/settings.ts tests/settings.test.ts
git commit -m "feat(settings): add AI (local) group (endpoints, model, tokens, temperature, thinking)"
```

---

### Task 17: `main.ts` — command + plugin-level generation handle

> Smoke-verified (needs a running Obsidian + LM Studio), not vitest — it wires obsidian APIs.
> Keep the code type-clean so `npx tsc --noEmit` passes.

**Files:**
- Modify: `src/generate-deck.ts` (add the `GenerationHandle` interface)
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `runGenerateDeck`/`GenState`/`GenerateResult` (Task 15); `makeDeckLlmClient` (Task 14); `buildDeckPrompt` (Task 8); `getAuthoringContract` (contract); `GenerateDeckModal` (Task 18).
- Produces on the plugin: `activatePreview()` (now public), `refreshActivePreview()`, `openDeckNote(path)`, `startDeckGeneration(input): GenerationHandle`, `activeGeneration: GenerationHandle | null`; the `generate-deck` command; `interface DeckGenInput`.

- [ ] **Step 1: Add `GenerationHandle` to `src/generate-deck.ts`** — append:
```ts
/** A live generation the modal can attach to. Survives modal close (Close ≠ Abort). */
export interface GenerationHandle {
  snapshot(): GenState;
  subscribe(fn: (s: GenState) => void): () => void;
  abort(): void;
  readonly done: Promise<GenerateResult>;
  readonly targetLabel: string;
}
```

- [ ] **Step 2: Update `src/main.ts` imports** — replace line 1 and add imports:
```ts
import { Plugin, getLanguage, TFile, TAbstractFile, Notice, normalizePath } from "obsidian";
```
and after the existing imports add:
```ts
import { GenerateDeckModal } from "./generate-deck-modal";
import { runGenerateDeck, type GenState, type GenerateResult, type GenerationHandle } from "./generate-deck";
import { makeDeckLlmClient } from "./llm-client";
import { buildDeckPrompt } from "./core/llm/deck-prompt";
import { getAuthoringContract } from "./core/constraints/contract";

export interface DeckGenInput {
  sourceBody: string; slideTarget: number | "auto"; hint: string;
  themeKey: string; endpoint: string; targetPath: string; replace: boolean;
}
```

- [ ] **Step 3: Add the plugin field** — after `private hideSheet: CSSStyleSheet | null = null;`:
```ts
  public activeGeneration: GenerationHandle | null = null;
```

- [ ] **Step 4: Register the command** — inside `onload()`, after the `export-images` command block:
```ts
    this.addCommand({
      id: "generate-deck", name: t("cmd.generateDeck"),
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && file.extension === "md";
        if (ok && !checking) new GenerateDeckModal(this.app, this, file!).open();
        return ok;
      },
    });
```

- [ ] **Step 5: Make `activatePreview` public + add helpers** — change `private async activatePreview()` to `async activatePreview()`, and add these methods (e.g. after `activatePreview`):
```ts
  /** Refresh every open preview leaf (SlideDeckView has no active-leaf listener). */
  async refreshActivePreview(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SlideDeckView) await leaf.view.refresh();
    }
  }

  /** Open a generated deck note, then activate + refresh the preview (order matters). */
  async openDeckNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf(false).openFile(file);
    await this.activatePreview();
    await this.refreshActivePreview();
  }

  private async writeDeckNote(path: string, markdown: string, replace: boolean): Promise<void> {
    const p = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing instanceof TFile && replace) { await this.app.vault.modify(existing, markdown); return; }
    await this.app.vault.create(p, markdown);
  }

  /** Start a generation. Returns a handle the modal attaches to; the run survives modal close. */
  startDeckGeneration(input: DeckGenInput): GenerationHandle {
    const controller = new AbortController();
    let state: GenState = { phase: "running", attempt: 1, content: "", reasoning: "" };
    const subs = new Set<(s: GenState) => void>();
    const notify = (s: GenState): void => { state = s; for (const fn of subs) fn(s); };

    const contract = getAuthoringContract({ theme: this.settings.defaultTheme, aspect: "16:9", minFontPx: this.settings.minFontPx });
    const messages = buildDeckPrompt(input.sourceBody, { slideTarget: input.slideTarget, hint: input.hint }, contract);
    const client = makeDeckLlmClient(input.endpoint, this.settings.llmModel);
    const streamOpts = { model: this.settings.llmModel, temperature: this.settings.llmTemperature, maxTokens: this.settings.llmMaxTokens, suppressThinking: this.settings.llmSuppressThinking };

    const done: Promise<GenerateResult> = (async () => {
      const result = await runGenerateDeck({ client, messages, streamOpts, themeKey: input.themeKey, signal: controller.signal, onState: notify });
      if (result.status === "ok" && result.markdown != null) {
        await this.writeDeckNote(input.targetPath, result.markdown, input.replace);
        await this.openDeckNote(input.targetPath);
        new Notice(result.incomplete ? t("deck.notice.incomplete") : t("deck.notice.done", input.targetPath));
      } else if (result.status === "fatal") {
        notify({ phase: "error", attempt: state.attempt, content: state.content, reasoning: state.reasoning, error: result.error });
        new Notice(t("deck.error.invalid", result.error ?? ""));
      }
      return result;
    })();
    void done.finally(() => { if (this.activeGeneration === handle) this.activeGeneration = null; });

    const handle: GenerationHandle = {
      snapshot: () => state,
      subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
      abort: () => controller.abort(),
      done,
      targetLabel: input.targetPath,
    };
    this.activeGeneration = handle;
    return handle;
  }
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: after Task 18 exists, no type errors. (If run before Task 18, expect only the missing `./generate-deck-modal` module — implement Task 18 next, then re-run.)

- [ ] **Step 7: Commit** (commit together with Task 18 if you prefer a compiling checkpoint; otherwise:)

```bash
git add src/main.ts src/generate-deck.ts
git commit -m "feat(deck): register generate-deck command + plugin generation handle"
```

---

### Task 18: `generate-deck-modal.ts` — the modal

> Smoke-verified, not vitest (DOM + Obsidian Modal). Provide complete, type-clean code.
> DOM via createEl/createDiv only; dynamic styles via setProperty; no innerHTML, no static inline styles.

**Files:**
- Create: `src/generate-deck-modal.ts`

**Interfaces:**
- Consumes: `DeckGenInput`, `SlideDeckPlugin` (Task 17); `makeDeckLlmClient` (Task 14); `resolveActiveEndpoint` (Task 3); `frontmatterRange` (Task 9); `estimateTokens`/`contextOverflow` (Task 6); `GenState`/`GenerationHandle` (Tasks 15/17); the `deck.*` i18n keys.
- Produces: `class GenerateDeckModal extends Modal`.

- [ ] **Step 1: Write the implementation**

`src/generate-deck-modal.ts`:
```ts
import { App, Modal, Notice, TFile } from "obsidian";
import type SlideDeckPlugin from "./main";
import type { DeckGenInput } from "./main";
import { makeDeckLlmClient } from "./llm-client";
import { resolveActiveEndpoint } from "./core/llm/endpoint";
import { frontmatterRange } from "./core/llm/deck-sanitize";
import { estimateTokens, contextOverflow } from "./core/llm/model-info";
import type { GenState, GenerationHandle } from "./generate-deck";
import { t } from "./i18n";

/** Remove the source note's own frontmatter (schema keys would burn context / be echoed as content). */
function stripSourceFrontmatter(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = frontmatterRange(lines);
  return range ? lines.slice(range.end + 1).join("\n").replace(/^\n+/, "") : md;
}

/** A note "looks like a deck" if it has frontmatter with a theme: line and a body --- separator. */
function looksLikeDeck(md: string): boolean {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = frontmatterRange(lines);
  if (!range) return false;
  const hasTheme = lines.slice(1, range.end).some((l) => /^theme:\s/.test(l));
  const hasSep = lines.slice(range.end + 1).some((l) => l.trim() === "---");
  return hasTheme && hasSep;
}

export class GenerateDeckModal extends Modal {
  private endpoint: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: number | null = null;
  private startedAt = 0;

  constructor(app: App, private plugin: SlideDeckPlugin, private sourceFile: TFile) { super(app); }

  async onOpen(): Promise<void> {
    this.titleEl.setText(t("deck.modal.title"));
    if (this.plugin.activeGeneration) { this.renderRunning(this.plugin.activeGeneration); return; }
    await this.renderInput();
  }

  onClose(): void {
    // Close ≠ Abort: leave any running generation alone; just detach listeners/timers.
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    this.contentEl.empty();
  }

  private async renderInput(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    const raw = await this.app.vault.read(this.sourceFile);
    const body = stripSourceFrontmatter(raw);

    // Status line: resolved endpoint + model + reachability.
    const status = contentEl.createDiv({ cls: "sd-gen-status" });
    status.createSpan({ text: `${t("deck.modal.model")}: ${this.plugin.settings.llmModel || "—"}` });
    const pingEl = status.createSpan({ cls: "sd-gen-ping", text: "…" });

    // Controls.
    const targetRow = contentEl.createDiv({ cls: "sd-gen-row" });
    targetRow.createEl("label", { text: t("deck.modal.slideCount") });
    const countSel = targetRow.createEl("select");
    countSel.createEl("option", { value: "auto", text: t("deck.modal.auto") });
    for (const n of [3, 5, 6, 8, 10, 12]) countSel.createEl("option", { value: String(n), text: String(n) });

    const hintRow = contentEl.createDiv({ cls: "sd-gen-row" });
    hintRow.createEl("label", { text: t("deck.modal.hint") });
    const hintInput = hintRow.createEl("input", { type: "text" });
    hintInput.placeholder = t("deck.modal.hintPlaceholder");

    const themeRow = contentEl.createDiv({ cls: "sd-gen-row" });
    themeRow.createEl("label", { text: t("deck.modal.theme") });
    const themeSel = themeRow.createEl("select");
    for (const e of this.plugin.themeStore.getThemes()) themeSel.createEl("option", { value: e.key, text: e.key });
    themeSel.value = this.plugin.settings.defaultTheme;

    // Deck-collision: choose replace vs. new copy.
    const targetBase = `${this.sourceFile.parent?.path ? this.sourceFile.parent.path + "/" : ""}${this.sourceFile.basename} — Deck`;
    const existsAt = (p: string) => this.app.vault.getAbstractFileByPath(p) instanceof TFile;
    let replace = true;
    if (existsAt(`${targetBase}.md`)) {
      const box = contentEl.createDiv({ cls: "sd-gen-exists" });
      box.createEl("p", { text: t("deck.modal.existsLabel") });
      const rep = box.createEl("label"); const repRadio = rep.createEl("input", { type: "radio" }); repRadio.name = "sd-collide"; repRadio.checked = true; rep.createSpan({ text: ` ${t("deck.modal.existsReplace")}` });
      const cop = box.createEl("label"); const copRadio = cop.createEl("input", { type: "radio" }); copRadio.name = "sd-collide"; cop.createSpan({ text: ` ${t("deck.modal.existsCopy")}` });
      repRadio.addEventListener("change", () => { replace = true; });
      copRadio.addEventListener("change", () => { replace = false; });
    }

    if (looksLikeDeck(raw)) contentEl.createDiv({ cls: "sd-gen-hint", text: t("deck.modal.sourceIsDeck") });
    const warnEl = contentEl.createDiv({ cls: "sd-gen-hint" });

    // CTA row.
    const cta = contentEl.createDiv({ cls: "sd-gen-cta" });
    const genBtn = cta.createEl("button", { cls: "mod-cta", text: t("deck.modal.generate") });
    cta.createEl("button", { text: t("deck.modal.cancel") }).addEventListener("click", () => this.close());

    // Resolve endpoint + ping + context check.
    genBtn.disabled = true;
    const endpoints = this.plugin.settings.llmEndpoints;
    this.endpoint = await resolveActiveEndpoint(endpoints, (ep) => makeDeckLlmClient(ep, this.plugin.settings.llmModel).ping());
    if (!this.endpoint) {
      pingEl.setText(`✗ ${t("deck.modal.unreachable")}`);
      warnEl.setText(t("deck.modal.noEndpoint"));
    } else {
      pingEl.setText(`✓ ${this.endpoint} (${t("deck.modal.reachable")})`);
      genBtn.disabled = false;
      const ctx = await makeDeckLlmClient(this.endpoint, this.plugin.settings.llmModel).modelContext(this.plugin.settings.llmModel);
      const limit = ctx?.loadedContextLength ?? ctx?.maxContextLength;
      const inputTokens = estimateTokens(body.length) + 400; // + rough prompt overhead
      if (contextOverflow(inputTokens, this.plugin.settings.llmMaxTokens, limit)) {
        warnEl.setText(t("deck.modal.contextWarn", inputTokens, String(limit)));
      }
    }

    const start = (): void => {
      if (genBtn.disabled || !this.endpoint) return;
      const slideTarget: number | "auto" = countSel.value === "auto" ? "auto" : Number(countSel.value);
      let targetPath = `${targetBase}.md`;
      if (!replace) { let n = 2; while (existsAt(targetPath)) { targetPath = `${targetBase} ${n}.md`; n++; } }
      const input: DeckGenInput = { sourceBody: body, slideTarget, hint: hintInput.value, themeKey: themeSel.value, endpoint: this.endpoint, targetPath, replace };
      const handle = this.plugin.startDeckGeneration(input);
      this.renderRunning(handle);
    };
    genBtn.addEventListener("click", start);
    // Enter starts (unless focus is in the multi-char hint and the user is mid-typing — Enter still starts).
    this.scope.register([], "Enter", (e) => { e.preventDefault(); start(); return false; });
  }

  private renderRunning(handle: GenerationHandle): void {
    const { contentEl } = this;
    contentEl.empty();
    this.startedAt = Date.now();

    const head = contentEl.createDiv({ cls: "sd-gen-running" });
    const phaseEl = head.createSpan({ cls: "sd-gen-phase", text: t("deck.modal.generating") });
    const elapsedEl = head.createSpan({ cls: "sd-gen-elapsed" });

    const details = contentEl.createEl("details", { cls: "sd-gen-reasoning" });
    details.createEl("summary", { text: t("deck.modal.reasoning") });
    const reasoningEl = details.createEl("pre");

    const tailEl = contentEl.createEl("pre", { cls: "sd-gen-tail" });

    const cta = contentEl.createDiv({ cls: "sd-gen-cta" });
    cta.createEl("button", { cls: "mod-warning", text: t("deck.modal.stop") }).addEventListener("click", () => { handle.abort(); this.close(); });

    const render = (s: GenState): void => {
      phaseEl.setText(s.phase === "retrying" ? t("deck.modal.attempt", s.attempt) : s.phase === "error" ? (s.error ?? "") : t("deck.modal.generating"));
      reasoningEl.setText(s.reasoning.slice(-4000));
      tailEl.setText(s.content.slice(-1200));
      if (s.phase === "error") { if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; } }
    };
    render(handle.snapshot());
    this.unsubscribe = handle.subscribe(render);
    this.timer = window.setInterval(() => { elapsedEl.setText(t("deck.modal.elapsed", Math.round((Date.now() - this.startedAt) / 1000))); }, 500);

    void handle.done.then((r) => { if (r.status === "ok") this.close(); });
  }
}
```

- [ ] **Step 2: Add minimal styles** — append to `styles.css` (cosmetic; the deck itself is iframe-isolated, so these plain rules are safe in the parent doc):
```css
.sd-gen-row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
.sd-gen-row label { min-width: 120px; }
.sd-gen-status { margin-bottom: 10px; opacity: 0.9; }
.sd-gen-ping { margin-left: 8px; }
.sd-gen-hint { margin: 8px 0; font-size: 0.9em; opacity: 0.8; }
.sd-gen-cta { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.sd-gen-tail, .sd-gen-reasoning pre { max-height: 180px; overflow: auto; white-space: pre-wrap; font-size: 0.8em; }
```

- [ ] **Step 3: Typecheck + build + full gate**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: no type errors; full vitest suite green; lint clean (no `fetch`, no `innerHTML`, no static inline styles).

- [ ] **Step 4: Commit**

```bash
git add src/generate-deck-modal.ts styles.css src/main.ts src/generate-deck.ts
git commit -m "feat(deck): add GenerateDeckModal (input + running states, Close≠Abort)"
```

---

### Task 19: README — Network-use disclosure (EN + DE) + Server-CORS

**Files:**
- Modify: `README.md` (add a section in both the EN and DE parts)

**Interfaces:** none (docs). Required for Community-Review "Network use" disclosure.

- [ ] **Step 1: Add the disclosure** — add this section to the English part of `README.md` (e.g. after the features section), and the German translation to the German part:

EN:
```markdown
## Network use (local AI)

The "Generate presentation from note" command sends note content to an **OpenAI-compatible
LLM endpoint that you configure** (default `http://localhost:1234`, i.e. a local LM Studio).
No cloud service is involved unless you point the endpoint at one.

- **Reachability pings and model lists** are requested when you open the generation dialog or
  the settings tab. These are automatic requests to the configured endpoint(s).
- **Note contents are sent only when you press "Generate".**
- No telemetry, no analytics, no third-party services.

### Server CORS

Streaming runs over `XMLHttpRequest` under the Obsidian origin, so the endpoint must allow
cross-origin requests. LM Studio's CORS toggle must be on; Ollama needs `OLLAMA_ORIGINS=app://obsidian.md`
(or `*`). If the endpoint answers the reachability ping but refuses the stream, the plugin
**automatically falls back to a non-streaming request** (you lose the live token view but the
deck still generates).
```

DE (translate faithfully):
```markdown
## Netzwerknutzung (lokale KI)

Der Befehl „Präsentation aus Notiz erzeugen" sendet Notiz-Inhalte an einen **von dir
konfigurierten OpenAI-kompatiblen LLM-Endpoint** (Standard `http://localhost:1234`, also ein
lokales LM Studio). Kein Cloud-Dienst ist beteiligt, solange du den Endpoint nicht auf einen
richtest.

- **Erreichbarkeits-Pings und Modell-Listen** werden abgefragt, wenn du den Erzeugen-Dialog oder
  den Einstellungs-Tab öffnest. Das sind automatische Requests an die konfigurierten Endpoints.
- **Notiz-Inhalte werden nur beim Klick auf „Erzeugen" gesendet.**
- Keine Telemetrie, keine Analyse, keine Drittanbieter.

### Server-CORS

Das Streaming läuft über `XMLHttpRequest` unter der Obsidian-Origin; der Endpoint muss also
Cross-Origin-Requests erlauben. LM Studios CORS-Schalter muss an sein; Ollama braucht
`OLLAMA_ORIGINS=app://obsidian.md` (oder `*`). Beantwortet der Endpoint den Ping, verweigert aber
den Stream, **fällt das Plugin automatisch auf einen Non-Streaming-Request zurück** (die
Live-Token-Ansicht entfällt, das Deck entsteht trotzdem).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: disclose local-AI network use + server CORS requirements"
```

---

### Task 20: Manual GUI smoke (Pallas) — verification, not code

> No commit unless a bug is found (then fix + commit under the relevant task). Requires LM Studio
> running with a model loaded; for the CORS case, Ollama **without** `OLLAMA_ORIGINS`.

Deploy: `npm run deploy` (needs `$OBSIDIAN_PLUGIN_DIR`). Then walk the Spec §9 matrix:

- [ ] **Happy path** — LM Studio, a prose note → command → Enter → a valid deck note `<name> — Deck.md` renders in the preview without hand edits.
- [ ] **Ollama default (CORS case)** — endpoint pings green, stream refused → automatic non-streaming fallback writes the deck; the hint mentions CORS.
- [ ] **Offline** — no endpoint reachable → status ✗, Generate disabled, settings hint shown.
- [ ] **Stop mid-stream** — Stop button → no note written, silent reset.
- [ ] **Modal close mid-stream** — Esc/scrim closes the modal; generation continues; completion Notice fires and the deck is written; re-invoking the command re-attaches to the running state.
- [ ] **Re-run / Replace** — existing deck note → Replace overwrites; New copy writes `<name> — Deck 2.md`.
- [ ] **Long note** — context warning appears (token estimate vs `loaded_context_length`).
- [ ] **Reasoning model, suppression failed** — bare `</think>` residue is stripped; slide 1 survives.
- [ ] **Non-reasoning model** — clean output, no residue handling needed.
- [ ] **Leading `---` case** — a model that emits a leading separator still yields slide 1 (blocker fix holds end-to-end).
- [ ] **Mobile (iOS, LAN endpoint)** — streaming or the non-streaming fallback produces a deck; note the outcome (Spec §6.6 flags this as an unverified assumption).

---

## Spec Coverage (self-review matrix)

| Spec section / requirement | Task(s) |
|---|---|
| §2.1 one-command transform → `<basename> — Deck.md` | 17 (command, target path), 18 (path compute) |
| §2.2 condense + no-invention + output language | 8 (prompt rules) |
| §2.3 decision-light modal (Enter starts, defaults) | 18 |
| §2.4 robust against real LLM output | 1, 9 (sanitizer), 13 (raw), 15 (retry) |
| §2.5 local & open, no new deps, no `fetch` | 3, 13 (XHR), 14 (requestUrl), Global Constraints |
| §2.6 invariants (pure core, gates, tests green) | all core tasks + purity gate |
| §4 direct deck-markdown, replace-default, close≠abort, XHR+fallback, no timeouts, default `:1234` | 8, 14, 15, 17, 18 |
| §5.2 context check (token est. vs loaded_context_length) | 6, 14 (modelContext), 18 |
| §5.6 open → activatePreview → refresh | 17 (`openDeckNote`) |
| §6.1 `extractDeckMarkdown` (all rules incl. leading `---` blocker) | 9 |
| §6.2 `setDeckTheme` frontmatter-scoped | 10 |
| §6.3 `validateDeckOutput` static gate | 11 |
| §6.4 fatal classes + 2-run cap (envelope no-retry) | 15 |
| §6.5 CORS asymmetry + non-streaming fallback | 13 (StreamNetworkError), 14 (fallback) |
| §6.6 finish_reason length; abort; mobile | 1, 13, 15 (incomplete), 20 (mobile smoke) |
| §7.1 pure core modules + `contractToPrompt` includeTheme + strip source frontmatter | 1–11, 7, 18 |
| §7.2 adapter modules (client, orchestrator, modal, main, settings, i18n) | 12–18 |
| §8 privacy / disclosure / CORS README | 19 |
| §9 tests (core + adapter + gates + GUI smoke) | all + 20 |

**Placeholder scan:** none — every code step contains complete code; no "TBD"/"handle errors"/"similar to Task N".

**Type-consistency spot checks:** `ChatMessage` defined in Task 8, imported by 14/15/17. `StreamOpts`/`DeckStreamResult` defined in 14, consumed by 15/17. `GenState`/`GenerateResult`/`GenerationHandle` defined in 15/17, consumed by 17/18. `ModelContext` defined in 6, consumed by 14/18. `frontmatterRange` exported in 9, reused by 10/18. `parseEndpointList` from 3 used by 16/18. `StreamResult` from 13 used by 14.

---

## Verification corrections (v2) — apply these during implementation

A 5-lens adversarial review (verify-deck-plan workflow, 2026-07-02) found real defects. These
corrections OVERRIDE the task code above where they conflict. Each cites the finding.

### C1 — Sanitizer key grammar (Task 9, finding: sanitizer #1 + #3) [certain]

Replace the single `KEY_RE` with **two** regexes and use each in the right place:
```ts
// General frontmatter key grammar — mirrors slide-model.ts parseFrontmatter (`\s*` allows `theme:dark`).
const FM_KEY_RE = /^\w+:\s*\S/;
// Recognized deck directive keys — used ONLY to drop echoed frontmatter blocks mid-deck.
const DIRECTIVE_KEY_RE = /^(theme|aspect|minFontPx|header|footer|paginate):\s*\S/;
```
- `fixLeadingSeparator` disambiguation uses `FM_KEY_RE` (so `theme:dark` no-space is kept as frontmatter; a stray `---` before a heading/bullet/prose slide is stripped).
- `finalPass` key-only slide drop uses `DIRECTIVE_KEY_RE` (so an echoed `theme:/aspect:` block is dropped, but a real `Name: Ada\nRole: X` content slide is kept).

### C2 — `unwrapFence` only unwraps a true wrapper (Task 9, finding: sanitizer #2) [certain]

```ts
function unwrapFence(md: string): string {
  const lines = md.split("\n");
  const openM = /^(```|~~~)(markdown|md)?[ \t]*$/.exec(lines[0] ?? "");
  if (!openM || lines.length < 2) return md;
  const marker = openM[1];
  const closeIdx = lines.length - 1;
  if (lines[closeIdx].trim() !== marker) return md;
  for (let i = 1; i < closeIdx; i++) if (lines[i].trim() === marker) return md; // interior fence → real code, not a wrapper
  return lines.slice(1, closeIdx).join("\n");
}
```
Only an empty/`markdown`/`md` info-string wrapper with no interior fence line is unwrapped; a deck that opens/closes with ```python…``` code blocks is left intact.

### C3 — `stripPreambleChatter` never eats a Markdown block (Task 9, finding: sanitizer #4) [likely]

```ts
function stripPreambleChatter(md: string): string {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const l = lines[i]?.trim() ?? "";
  const isBlock = /^([#>|`]|[-*+]\s|\d+[.)]\s|---)/.test(l) || FM_KEY_RE.test(l);
  if (i < lines.length && !isBlock && /\S\s.*:$/.test(l)) {
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    return lines.slice(i).join("\n");
  }
  return md;
}
```
Strips `Here is your deck:` but never a heading like `# Agenda:` / list item / blockquote / fence.

### C4 — Extra Task 9 tests (add to `tests/core/deck-sanitize.test.ts`)

```ts
  it("keeps no-space frontmatter (theme:dark)", () => {
    expect(parseDeck(extractDeckMarkdown("---\ntheme:dark\n---\n# A")).directives.theme).toBe("dark");
  });
  it("does NOT unwrap a deck whose slides are code fences", () => {
    const raw = "```python\nprint(1)\n```\n\n---\n\n```python\nprint(2)\n```";
    expect(parseDeck(extractDeckMarkdown(raw)).slides).toHaveLength(2);
  });
  it("does NOT strip a heading that ends with a colon", () => {
    const out = extractDeckMarkdown("# Agenda:\n- Intro\n\n---\n\n# Details");
    const slides = parseDeck(out).slides;
    expect(slides).toHaveLength(2);
    expect(slides[0].markdown).toContain("# Agenda:");
  });
  it("keeps a Name:/Role: content slide (not a directive echo)", () => {
    const raw = "# A\n\n---\n\nName: Ada\nRole: programmer";
    const slides = parseDeck(extractDeckMarkdown(raw)).slides;
    expect(slides).toHaveLength(2);
    expect(slides[1].markdown).toContain("Name: Ada");
  });
```

### C5 — Source-frontmatter strip → pure core + tested (Task 8, finding: spec #11) [certain]

In `src/core/llm/deck-prompt.ts`, import `frontmatterRange` from `./deck-sanitize` and add:
```ts
import { frontmatterRange } from "./deck-sanitize";

/** Strip the note's own frontmatter block (schema keys would burn context / be echoed as content). */
export function stripNoteFrontmatter(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = frontmatterRange(lines);
  return range ? lines.slice(range.end + 1).join("\n").replace(/^\n+/, "") : md;
}
```
`buildDeckPrompt` calls it on `sourceBody` before embedding: `const bodyOnly = stripNoteFrontmatter(sourceBody);` and uses `bodyOnly` in the user message. Add the §9 "Body-only" test:
```ts
import { stripNoteFrontmatter } from "../../src/core/llm/deck-prompt";
it("strips the source note frontmatter before embedding (body-only)", () => {
  const [, user] = buildDeckPrompt("---\ntitle: X\ntags: [a]\n---\nReal body.", { slideTarget: "auto", hint: "" }, contract);
  expect(user.content).toContain("Real body.");
  expect(user.content).not.toContain("title: X");
});
it("stripNoteFrontmatter returns the body unchanged when there is no frontmatter", () => {
  expect(stripNoteFrontmatter("Just body")).toBe("Just body");
});
```
The modal (Task 18) then imports `stripNoteFrontmatter` from `deck-prompt` (drop its local `stripSourceFrontmatter`) and uses it for the context estimate; it passes the stripped body to `startDeckGeneration` (buildDeckPrompt re-stripping is idempotent).

### C6 — `DeckLlmClient`: fallback-once flag + abort recheck (Task 14, findings: orchestration #2, spec #13) [likely/speculative]

Add a `private streamRefused = false;` field. In `generate()`, before the try: `if (this.streamRefused) return this.generateNonStreaming(messages, opts, signal);`. In the catch, on `StreamNetworkError`: `this.streamRefused = true;` before returning the fallback. In `generateNonStreaming`, **after** `const res = await this.http(...)` add:
```ts
    if (signal?.aborted) { const e = new Error("Aborted"); e.name = "AbortError"; throw e; }
```
This bounds the worst case to 2 total generations (retry skips streaming) and honors Stop during the fallback. Add a test:
```ts
  it("skips streaming on the second call after a CORS fallback", async () => {
    let streamCalls = 0;
    const netErr: any = () => { streamCalls++; const e = new Error("net"); e.name = "StreamNetworkError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { choices: [{ message: { content: "# A" } }] }, text: "{}" })), netErr);
    await c.generate(msg, opts, () => {}, () => {});
    await c.generate(msg, opts, () => {}, () => {});
    expect(streamCalls).toBe(1); // second generate went straight to non-streaming
  });
```

### C7 — Thread `usedFallback` + fatal `kind` through the orchestrator (Task 15, findings: spec #8 + #10) [certain]

`GenerateResult` gains `usedFallback?: boolean` and `kind?: "server" | "format"`:
```ts
export interface GenerateResult { status: "ok" | "fatal" | "aborted"; markdown?: string; incomplete?: boolean; error?: string; usedFallback?: boolean; kind?: "server" | "format" }
```
- Capture `usedFallback` from the successful `client.generate` result and set it on the `ok` return: `return { status: "ok", markdown: themed, incomplete: finishReason === "length", usedFallback: r.usedFallback };` (bind `const r = await deps.client.generate(...)` so you can read `r.usedFallback`).
- In the catch (non-abort): `return { status: "fatal", error: (e as Error).message, kind: "server" };`
- After the loop: `return { status: "fatal", error: lastReason, kind: "format" };`
Add tests: happy path asserts `usedFallback` is falsy; a client that returns `{ usedFallback: true }` yields `result.usedFallback === true`; the envelope-throw test asserts `kind === "server"`; the give-up test asserts `kind === "format"`.

### C8 — Surface CORS + envelope in `startDeckGeneration` (Task 17, findings: spec #8 + #10) [certain]

`DeckGenInput` gains `model: string`. In `startDeckGeneration`, use `input.model` (not `this.settings.llmModel`) for `makeDeckLlmClient` and `streamOpts.model`. Replace the result handling:
```ts
      if (result.status === "ok" && result.markdown != null) {
        await this.writeDeckNote(input.targetPath, result.markdown, input.replace);
        await this.openDeckNote(input.targetPath);
        if (result.usedFallback) new Notice(t("deck.error.cors"));
        new Notice(result.incomplete ? t("deck.notice.incomplete") : t("deck.notice.done", input.targetPath));
      } else if (result.status === "fatal") {
        notify({ phase: "error", attempt: state.attempt, content: state.content, reasoning: state.reasoning, error: result.error });
        new Notice(result.kind === "server" ? t("deck.error.envelope", result.error ?? "") : t("deck.error.invalid", result.error ?? ""));
      }
```
Update `deck.error.envelope` (Task 12) to include the remedy, EN: `"Server error: {0}. Load the model or raise its context length, then retry."` / DE: `"Server-Fehler: {0}. Modell laden oder Kontextlänge erhöhen, dann erneut versuchen."`

### C9 — Modal fixes (Task 18, findings: api #1, orchestration #1, spec #9 #12 #14) [certain/likely]

1. **Import:** `import { App, Modal, TFile } from "obsidian";` (drop unused `Notice`). Also import `stripNoteFrontmatter` from `./core/llm/deck-prompt` and drop the local `stripSourceFrontmatter`; use `stripNoteFrontmatter` for `body`.
2. **Model picker:** after resolving the endpoint, `const models = await makeDeckLlmClient(this.endpoint, "").listModels();`. Render a model control: if `models.length`, a `<select>` of models (default `settings.llmModel` if present in the list, else `models[0]`); else a text `<input>` defaulting to `settings.llmModel`. Track the chosen value in `let model = …`. **Disable Generate while `model` is empty.** Pass `model` in `DeckGenInput`.
3. **Non-reentrant start:** first line of `start()`: `if (this.plugin.activeGeneration) return;`. Also set `genBtn.disabled = true;` inside `start()` before `renderRunning`.
4. **Static context fallback:** when `limit` is undefined, still warn if `body.length > 30000` (spec §5.2 static ~30k fallback): `if (contextOverflow(inputTokens, maxTokens, limit) || (limit == null && body.length > 30000)) warnEl.setText(t("deck.modal.contextWarn", inputTokens, limit != null ? String(limit) : "?"));`
5. **Ping color:** toggle a class on `pingEl`: `pingEl.classList.toggle("sd-gen-ping-ok", !!this.endpoint); pingEl.classList.toggle("sd-gen-ping-err", !this.endpoint);` and add to `styles.css`: `.sd-gen-ping-ok{color:var(--text-success)} .sd-gen-ping-err{color:var(--text-error)}`.

### C10 — accepted without change

The `SettingDefinitionList → textarea` deviation (Task 16) was reviewed and judged adequately
justified — no capability lost (only the optional per-row ping icon, which the spec marked "ggf.").
Keep as written.
