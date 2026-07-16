// Kit owns the context parsers (vendored, pinned). Only the two estimator helpers below are ours.
export { parseLmStudioContext, parseOllamaContext, type ModelContext } from "../../vendor/kit/model-context";

/** Rough token estimate: ~3.5 characters per token (English/German prose average). */
export function estimateTokens(chars: number): number { return Math.ceil(chars / 3.5); }

/** True only when a context limit is known and the request would not fit. */
export function contextOverflow(inputTokens: number, maxTokens: number, contextLimit: number | undefined): boolean {
  if (contextLimit == null) return false;
  return inputTokens + maxTokens > contextLimit;
}
