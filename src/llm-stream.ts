import { parseSSE } from "./core/llm/sse-parse";
import { ThinkSplitter } from "./vendor/kit/think";

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
