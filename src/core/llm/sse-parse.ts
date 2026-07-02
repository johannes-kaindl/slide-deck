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
