import { requestUrl } from "obsidian";
import { createChatClient, type ChatClient, type ChatResult, type SseTransport } from "./vendor/kit-obsidian/chat-client";
import { requestUrlTransport, xhrSseTransport } from "./vendor/kit-obsidian/chat-transport";
import { t } from "./i18n";
import { normalizeEndpoint } from "./vendor/kit/endpoint";
import { authHeaders, effectiveModel, type EndpointConfig } from "./vendor/kit/endpoint_config";
import type { ResponseFacts } from "./vendor/kit/sampling-profiles";
import { classifyEndpointStatus, extractModelIds, type EndpointStatus, type ProbeInput } from "./vendor/kit/endpoint_diagnostics";
import { withTimeout } from "./vendor/kit/timeout";
import { parseLmStudioContext, parseOllamaContext, type ModelContext } from "./llm/model-info";
import type { ChatMessage } from "./vendor/deck-core/pure/llm/deck-prompt";

export interface HttpJson { (param: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; json: unknown; text: string }> }
/** `model` is the name as the user/list knows it, `sentModel` the one that goes on the wire (alias
 *  resolved, Sampling-Plan § 3.1). `params` come ready from `llm/request-params.ts::buildDeckParams`
 *  (mode creative); the client sends no sampling of its own. `onResponse` sees every server
 *  answer, also a refused one, for `checkResponse`; network errors, timeouts and aborts have none. */
export interface StreamOpts {
  model: string;
  sentModel: string;
  params: Record<string, number | string>;
  onResponse?: (facts: ResponseFacts) => void;
}
/** Transports for the chat path: the stream (XHR) and the optional non-streaming fallback. Injected so
 *  tests can supply fakes; `makeDeckLlmClient` wires the real ones. */
export interface ChatTransports { transport: SseTransport; fallbackTransport?: SseTransport }
/** Idle = silence since the last chunk. First-chunk is longer: a JIT-loading model or a long prompt
 *  needs minutes before the first token. Both are new — the old client waited forever. */
export const IDLE_TIMEOUT_MS = 120_000;
export const FIRST_CHUNK_TIMEOUT_MS = 600_000;

export interface DeckStreamResult { content: string; reasoning: string; finishReason?: string; usedFallback: boolean }

/** The single requestUrl-backed transport (CORS-free, mobile-safe). throw:false so an HTTP error
 *  still returns a body for the envelope check. Kept out of DeckLlmClient so tests inject a fake. */
export const requestUrlHttpJson: HttpJson = async (param) => {
  const r = await requestUrl({ ...param, throw: false });
  let json: unknown;
  try { json = r.json; } catch { /* non-JSON body — json stays undefined */ }
  return { status: r.status, json, text: r.text };
};

/** Maps a failed chat result to the error the callers show. The Kit client only knows `kind` and the
 *  server's message; the sentence around it is ours (UI-STANDARD §10). `generate-deck.ts` wraps the
 *  message in "Server error: {0}", so this stays the bare reason. Abort stays an `AbortError` — the
 *  generation flow branches on the name. */
function chatError(r: Extract<ChatResult, { ok: false }>): Error {
  if (r.kind === "aborted") { const e = new Error("Aborted"); e.name = "AbortError"; return e; }
  if (r.kind === "timeout") return new Error(t("deck.error.chat.timeout", r.detail));
  if (r.kind === "network") return new Error(t("deck.error.chat.network", r.detail));
  if (r.kind === "overflow") return new Error(t("deck.error.chat.overflow", r.detail));
  return new Error(r.detail);
}

export class DeckLlmClient {
  private endpoint: string;
  /** Auth headers for this endpoint, computed once. Empty for local servers. */
  private auth: Record<string, string>;
  /** One Kit chat client per DeckLlmClient (= per endpoint): its "stream refused, go on without" memory
   *  hangs on the instance, so a new endpoint must get a new client. */
  private chat: ChatClient;
  constructor(private cfg: EndpointConfig, private model: string, private http: HttpJson, transports: ChatTransports) {
    this.endpoint = normalizeEndpoint(cfg.url);
    this.auth = authHeaders(cfg.apiKey);
    this.chat = createChatClient({
      transport: transports.transport,
      ...(transports.fallbackTransport ? { fallbackTransport: transports.fallbackTransport } : {}),
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      firstChunkTimeoutMs: FIRST_CHUNK_TIMEOUT_MS,
    });
  }

  /** Reachability with a named diagnosis. GET /v1/models, 5s cap — requestUrl knows no
   *  timeout/abort, so the race is the only way to bound a dead endpoint. Never throws:
   *  a failure degrades to a classified status (settings must never die on a probe). */
  async probe(timeoutMs = 5000): Promise<EndpointStatus> {
    const call: Promise<ProbeInput> = (async () => {
      try {
        const r = await this.http({ url: `${this.endpoint}/v1/models`, headers: { ...this.auth } });
        return { kind: "response", status: r.status, body: r.json };
      } catch (e: unknown) {
        return { kind: "error", message: (e as Error)?.message ?? String(e) };
      }
    })();
    // The kit's withTimeout clears the losing timer in `finally` — a fast success/error must
    // not leave it armed for up to `timeoutMs`, and Promise.race never cancels the loser on
    // its own (Finding 6). `window` is the injected timer port; the binding belongs in this
    // obsidian-facing layer, not in the vendored pure module.
    const raced = await withTimeout(call, timeoutMs, window);
    return classifyEndpointStatus(raced.timedOut ? { kind: "timeout" } : raced.value);
  }

  /** Boolean reachability for resolveActiveEndpoint's injected ping. Delegates to probe() so
   *  "HTTP 200 + error body" (LM Studio on /v1/v1) counts as unreachable, not as ok. */
  async ping(): Promise<boolean> {
    return (await this.probe()).reachable;
  }

  async listModels(): Promise<string[]> {
    try {
      const { status, json } = await this.http({ url: `${this.endpoint}/v1/models`, headers: { ...this.auth } });
      if (status !== 200) return [];
      return extractModelIds(json).sort();
    } catch { return []; }
  }

  /** Best-effort context length (LM Studio /api/v0/models, then Ollama /api/show). null if unknown. */
  async modelContext(model: string): Promise<ModelContext | null> {
    try {
      const lm = await this.http({ url: `${this.endpoint}/api/v0/models`, headers: { ...this.auth } });
      if (lm.status === 200) { const c = parseLmStudioContext(lm.json, model); if (c) return c; }
    } catch { /* try next */ }
    try {
      const oll = await this.http({ url: `${this.endpoint}/api/show`, method: "POST", headers: { "Content-Type": "application/json", ...this.auth }, body: JSON.stringify({ model }) });
      if (oll.status === 200) { const c = parseOllamaContext(oll.json); if (c) return c; }
    } catch { /* give up */ }
    return null;
  }

  /** Stream via XHR (Kit chat client); on a stream network error (CORS: ping ok but stream refused) the
   *  client repeats the request once without streaming (requestUrl) and stays there for this instance —
   *  that bounds the run budget. Throws the server's message on an HTTP error or an HTTP-200 error body.
   *  The sampling values travel in `opts.params`; the client sends none of its own. */
  async generate(messages: ChatMessage[], opts: StreamOpts, onContent: (t: string) => void, onReasoning: (t: string) => void, signal?: AbortSignal): Promise<DeckStreamResult> {
    const model = opts.sentModel || opts.model || this.model;
    const r = await this.chat.complete({
      endpoint: this.cfg.apiKey ? { url: this.endpoint, apiKey: this.cfg.apiKey } : { url: this.endpoint },
      model,
      messages,
      params: opts.params,
      ...(signal ? { signal } : {}),
      onToken: onContent,
      onReasoning,
    });
    if (r.ok) {
      opts.onResponse?.({ status: 200, finishReason: r.finishReason ?? null, content: r.content, reasoning: r.reasoning, ...(r.model !== undefined ? { responseModel: r.model } : {}) });
      return { content: r.content, reasoning: r.reasoning, finishReason: r.finishReason, usedFallback: !r.streamed };
    }
    // Truncated WITHOUT text is an error in the Kit; here it stays what it always was — an empty result
    // with finish_reason "length" that the format check turns into the retry (reasoning models: the
    // thinking ate the budget).
    if (r.kind === "truncated") {
      opts.onResponse?.({ status: 200, finishReason: "length", content: "", reasoning: r.reasoning });
      return { content: "", reasoning: r.reasoning, finishReason: "length", usedFallback: false };
    }
    if (r.kind === "http" && r.status !== undefined) {
      opts.onResponse?.({ status: r.status, errorText: r.body ?? r.detail, finishReason: null, content: "", reasoning: r.reasoning });
    }
    throw chatError(r);
  }
}

/** Production factory: wires the requestUrl httpJson + the Kit chat transports (XHR stream, requestUrl fallback).
 *  Takes the whole endpoint entry so the API key reaches every request — including probe(),
 *  where a missing key would make a hosted provider look unreachable with no error shown. */
export function makeDeckLlmClient(cfg: EndpointConfig, model: string): DeckLlmClient {
  return new DeckLlmClient(cfg, effectiveModel(cfg, model), requestUrlHttpJson, { transport: xhrSseTransport, fallbackTransport: requestUrlTransport });
}
