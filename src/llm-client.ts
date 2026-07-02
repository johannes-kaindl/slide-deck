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
  private streamRefused = false; // once a stream is CORS-refused, skip streaming on later calls
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
   *  non-streaming requestUrl and remember the refusal (later calls skip streaming — bounds the run
   *  budget). Throws the server envelope message on an HTTP-200-error body. */
  async generate(messages: ChatMessage[], opts: StreamOpts, onContent: (t: string) => void, onReasoning: (t: string) => void, signal?: AbortSignal): Promise<DeckStreamResult> {
    if (this.streamRefused) return this.generateNonStreaming(messages, opts, signal);
    try {
      const r = await this.stream_(`${this.endpoint}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: this.buildBody(messages, opts, true) }, onContent, onReasoning, signal);
      this.throwIfEnvelope(r);
      return { content: r.content, reasoning: r.reasoning, finishReason: r.finishReason, usedFallback: false };
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === "AbortError") throw e;
      if (name !== "StreamNetworkError") throw e; // real HTTP/envelope error → surface, no fallback
      this.streamRefused = true;
      return this.generateNonStreaming(messages, opts, signal);
    }
  }

  private async generateNonStreaming(messages: ChatMessage[], opts: StreamOpts, signal?: AbortSignal): Promise<DeckStreamResult> {
    if (signal?.aborted) { const e = new Error("Aborted"); e.name = "AbortError"; throw e; }
    const res = await this.http({ url: `${this.endpoint}/v1/chat/completions`, method: "POST", headers: { "Content-Type": "application/json" }, body: this.buildBody(messages, opts, false) });
    if (signal?.aborted) { const e = new Error("Aborted"); e.name = "AbortError"; throw e; } // Stop during the fallback → no write
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
