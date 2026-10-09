import { requestUrl } from "obsidian";
import type { LlmConnection, LlmResult } from "./vendor/kit-obsidian/llm-connection";
import { t } from "./i18n";
import { normalizeEndpoint } from "./vendor/kit/endpoint";
import { authHeaders, type EndpointConfig } from "./vendor/kit/endpoint_config";
import { parseLmStudioContext, parseOllamaContext, type ModelContext } from "./llm/model-info";
import type { ChatMessage } from "./vendor/deck-core/pure/llm/deck-prompt";

export interface HttpJson { (param: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; json: unknown; text: string }> }

export interface DeckStreamResult { content: string; reasoning: string; finishReason?: string; usedFallback: boolean }

/** What `runGenerateDeck` needs from the model side: one streamed answer for a prompt. The Kit
 *  connection (`plugin.llm`) owns endpoint, request parameters, transport, deadlines and checking;
 *  this is the thin adapter between it and the generation flow. */
export interface DeckClient {
  generate(messages: ChatMessage[], onContent: (t: string) => void, onReasoning: (t: string) => void, signal?: AbortSignal): Promise<DeckStreamResult>;
}

/** The single requestUrl-backed transport (CORS-free, mobile-safe). throw:false so an HTTP error
 *  still returns a body. Kept apart from `fetchModelContext` so tests inject a fake. */
export const requestUrlHttpJson: HttpJson = async (param) => {
  const r = await requestUrl({ ...param, throw: false });
  let json: unknown;
  try { json = r.json; } catch { /* non-JSON body — json stays undefined */ }
  return { status: r.status, json, text: r.text };
};

/** Maps a failed connection result to the error the callers show. The Kit only knows `kind` and the
 *  server's message; the sentence around it is ours (UI-STANDARD §10). `generate-deck.ts` wraps the
 *  message in "Server error: {0}", so this stays the bare reason. Abort stays an `AbortError` — the
 *  generation flow branches on the name. */
function chatError(r: Extract<LlmResult, { ok: false }>): Error {
  if (r.kind === "aborted") { const e = new Error("Aborted"); e.name = "AbortError"; return e; }
  if (r.kind === "no-endpoint") return new Error(t("deck.error.noEndpoint", r.detail));
  if (r.kind === "timeout") return new Error(t("deck.error.chat.timeout", r.detail));
  if (r.kind === "network") return new Error(t("deck.error.chat.network", r.detail));
  if (r.kind === "overflow") return new Error(t("deck.error.chat.overflow", r.detail));
  return new Error(r.detail);
}

/** A successful result becomes the deck result; a failed one throws (see `chatError`). Truncated
 *  WITHOUT text comes from the Kit as an ok result with `finishReason: "length"` (policy `result`):
 *  here it stays what it always was — an empty result that the format check turns into the retry
 *  (reasoning models: the thinking ate the budget). `usedFallback` = the answer did not arrive as a stream. */
export function deckResultOf(r: LlmResult): DeckStreamResult {
  if (!r.ok) throw chatError(r);
  return { content: r.content, reasoning: r.reasoning, finishReason: r.finishReason, usedFallback: !r.streamed };
}

/** Deck client over the Kit connection. `model` is the name as the user or the list knows it; the
 *  connection resolves alias and family for it. Empty = the resolved model. */
export function deckClient(llm: Pick<LlmConnection, "complete">, model: string): DeckClient {
  return {
    async generate(messages, onContent, onReasoning, signal) {
      const r = await llm.complete({ messages }, {
        onToken: onContent, onReasoning,
        ...(model ? { model } : {}),
        ...(signal ? { signal } : {}),
      });
      return deckResultOf(r);
    },
  };
}

/** Best-effort context length (LM Studio /api/v0/models, then Ollama /api/show). null if unknown.
 *  `cfg` is the HYDRATED entry from `llm.resolve()` — its API key is not in the settings any more. */
export async function fetchModelContext(cfg: EndpointConfig, model: string, http: HttpJson = requestUrlHttpJson): Promise<ModelContext | null> {
  const endpoint = normalizeEndpoint(cfg.url);
  const auth = authHeaders(cfg.apiKey);
  try {
    const lm = await http({ url: `${endpoint}/api/v0/models`, headers: { ...auth } });
    if (lm.status === 200) { const c = parseLmStudioContext(lm.json, model); if (c) return c; }
  } catch { /* try next */ }
  try {
    const oll = await http({ url: `${endpoint}/api/show`, method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ model }) });
    if (oll.status === 200) { const c = parseOllamaContext(oll.json); if (c) return c; }
  } catch { /* give up */ }
  return null;
}
