import { extractDeckMarkdown, setDeckTheme, setDeckSource, hoistDeckSlots } from "./core/llm/deck-sanitize";
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
  sourceLink?: string; // optional "[[Note]]" backlink written into the deck frontmatter
  signal: AbortSignal;
  onState: (s: GenState) => void;
}
export interface GenerateResult { status: "ok" | "fatal" | "aborted"; markdown?: string; incomplete?: boolean; error?: string; usedFallback?: boolean; kind?: "server" | "format" }

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
    let usedFallback = false;
    try {
      const r = await deps.client.generate(
        messages, deps.streamOpts,
        (c) => { acc.content += c; deps.onState({ phase, attempt, content: acc.content, reasoning: acc.reasoning }); },
        (rs) => { acc.reasoning += rs; deps.onState({ phase, attempt, content: acc.content, reasoning: acc.reasoning }); },
        deps.signal,
      );
      finishReason = r.finishReason;
      usedFallback = r.usedFallback;
      acc.content = r.content; acc.reasoning = r.reasoning;
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return { status: "aborted" };
      return { status: "fatal", error: (e as Error).message, kind: "server" };
    }

    let themed = hoistDeckSlots(setDeckTheme(extractDeckMarkdown(acc.content), deps.themeKey));
    if (deps.sourceLink) themed = setDeckSource(themed, deps.sourceLink);
    const validation = validateDeckOutput(themed);
    if (!validation.fatal) {
      deps.onState({ phase: "done", attempt, content: acc.content, reasoning: acc.reasoning });
      return { status: "ok", markdown: themed, incomplete: finishReason === "length", usedFallback };
    }
    lastReason = validation.fatal;
    if (attempt < MAX_RUNS) messages = [...deps.messages, ...buildRetryFeedback(acc.content, validation.fatal)];
  }
  deps.onState({ phase: "error", attempt: MAX_RUNS, content: "", reasoning: "", error: lastReason });
  return { status: "fatal", error: lastReason, kind: "format" };
}

/** A live generation the modal can attach to. Survives modal close (Close ≠ Abort). */
export interface GenerationHandle {
  snapshot(): GenState;
  subscribe(fn: (s: GenState) => void): () => void;
  abort(): void;
  readonly done: Promise<GenerateResult>;
  readonly targetLabel: string;
  readonly startedAt: number; // ms epoch of generation start (for a reattach-stable elapsed clock)
}
