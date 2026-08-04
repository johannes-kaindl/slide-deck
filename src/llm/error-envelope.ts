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
  // Nur ohne reguläre Completion-Felder zusätzliche Fehlerformen (FastAPI {detail}, schlichtes {message}).
  if (!("choices" in o)) {
    const detail = o.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return null;
}
