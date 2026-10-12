import type { LlmConnection, LlmResult } from "./vendor/kit-obsidian/llm-connection";
import { t } from "./i18n";
import type { ChatMessage } from "./vendor/deck-core/pure/llm/deck-prompt";

export interface DeckStreamResult { content: string; reasoning: string; finishReason?: string; usedFallback: boolean }

/** What `runGenerateDeck` needs from the model side: one streamed answer for a prompt. The Kit
 *  connection (`plugin.llm`) owns endpoint, request parameters, transport, deadlines and checking;
 *  this is the thin adapter between it and the generation flow. */
export interface DeckClient {
  generate(messages: ChatMessage[], onContent: (t: string) => void, onReasoning: (t: string) => void, signal?: AbortSignal): Promise<DeckStreamResult>;
}

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
