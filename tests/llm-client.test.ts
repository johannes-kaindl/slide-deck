import { describe, it, expect, vi } from "vitest";
import { DeckLlmClient, type HttpJson } from "../src/llm-client";
import type { SseTransport } from "../src/vendor/kit-obsidian/chat-client";

const opts = { model: "m", sentModel: "m", params: { temperature: 0.7, max_tokens: 8192 } };
const msg = [{ role: "user" as const, content: "x" }];

function fakeHttp(impl: (url: string, init?: any) => { status: number; json?: unknown; text?: string }): HttpJson {
  return (param) => Promise.resolve({ json: {}, text: "", ...impl(param.url, param) });
}
/** Fake stream transport: replays `chunks` through `onChunk` and resolves with the HTTP status —
 *  the contract of the Kit `SseTransport`. `bodies` collects what would go on the wire. */
const sse = (chunk: string) => `data: ${JSON.stringify({ model: "m", choices: [{ delta: { content: chunk } }] })}\n\n`;
function fakeStream(chunks: string[], status = 200, bodies: any[] = []): { transport: SseTransport } {
  return { transport: { postStream: async (_u, body, _h, onChunk) => { bodies.push(body); for (const c of chunks) onChunk(c); return status; } } };
}
const noStream = { transport: { postStream: async () => { throw new Error("not used"); } } as SseTransport };
const okStream = (content = "# A"): { transport: SseTransport } => fakeStream([sse(content), "data: [DONE]\n\n"]);

describe("DeckLlmClient reachability", () => {
  it("ping true on 200", async () => {
    expect(await new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200, json: { data: [] } })), okStream()).ping()).toBe(true);
  });
  it("listModels returns sorted ids", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200, json: { data: [{ id: "b" }, { id: "a" }] } })), okStream());
    expect(await c.listModels()).toEqual(["a", "b"]);
  });
  it("normalizes a /v1-suffixed endpoint", async () => {
    const urls: string[] = [];
    await new DeckLlmClient({ url: "http://x/v1" }, "m", fakeHttp((u) => { urls.push(u); return { status: 200 }; }), okStream()).ping();
    expect(urls[0]).toBe("http://x/v1/models");
  });
  it("modelContext reads LM Studio loaded_context_length", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp((u) => u.endsWith("/api/v0/models") ? ({ status: 200, json: { data: [{ id: "m", loaded_context_length: 8192 }] } }) : ({ status: 404 })), okStream());
    expect(await c.modelContext("m")).toEqual({ loadedContextLength: 8192 });
  });
});

describe("DeckLlmClient.generate", () => {
  it("returns streamed content on success", async () => {
    const chunks = [sse("# Ti"), sse("tle"), 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'];
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream(chunks));
    const got: string[] = [];
    expect(await c.generate(msg, opts, (t) => got.push(t), () => {})).toMatchObject({ content: "# Title", finishReason: "stop", usedFallback: false });
    expect(got).toEqual(["# Ti", "tle"]);
  });
  it("routes reasoning deltas and inline <think> to onReasoning", async () => {
    const chunks = ['data: {"choices":[{"delta":{"reasoning_content":"hm"}}]}\n\n', sse("<think>x</think># A"), "data: [DONE]\n\n"];
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream(chunks));
    const r: string[] = [];
    const out = await c.generate(msg, opts, () => {}, (t) => r.push(t));
    expect(out.content).toBe("# A");
    expect(out.reasoning).toBe("hmx");
  });
  it("sends the params and the model on the wire — the client adds no sampling of its own", async () => {
    const bodies: any[] = [];
    await new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream([sse("a"), "data: [DONE]\n\n"], 200, bodies)).generate(msg, { ...opts, model: "other", sentModel: "other" }, () => {}, () => {});
    expect(bodies[0]).toMatchObject({ model: "other", stream: true, temperature: 0.7, max_tokens: 8192, messages: msg });
  });
  it("throws the envelope message on a 200-error body (no SSE)", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream(['{"error":{"message":"model not loaded"}}']));
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("model not loaded");
  });
  it("HTTP error carries the server's reason instead of 'stream HTTP n'", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream(['{"error":{"message":"context length exceeded"}}'], 400));
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow(/context/);
  });
  it("HTTP error without a body still names the status", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream([], 502));
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("HTTP 502");
  });
  it("a silent server ends with a readable timeout error, not a hang", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), {
      transport: { postStream: (_u, _b, _h, _c, signal) => new Promise<number>((_res, rej) => signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); })) },
    });
    vi.useFakeTimers();
    try {
      const p = c.generate(msg, opts, () => {}, () => {});
      const assertion = expect(p).rejects.toThrow(/no answer from the endpoint/);
      await vi.advanceTimersByTimeAsync(600_001);
      await assertion;
    } finally { vi.useRealTimers(); }
  });
  it("falls back to non-streaming on StreamNetworkError (CORS) and flags it", async () => {
    const netErr = { postStream: async () => { const e = new Error("net"); e.name = "StreamNetworkError"; throw e; } };
    const fallback: SseTransport = { postStream: async (_u, _b, _h, onChunk) => { onChunk(JSON.stringify({ choices: [{ message: { content: "# Fallback" }, finish_reason: "stop" }] })); return 200; } };
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), { transport: netErr, fallbackTransport: fallback });
    const got: string[] = [];
    expect(await c.generate(msg, opts, (t) => got.push(t), () => {})).toMatchObject({ content: "# Fallback", usedFallback: true });
    expect(got).toEqual(["# Fallback"]);
  });
  it("does NOT fall back on AbortError", async () => {
    const abortErr = { postStream: async () => { const e = new Error("Aborted"); e.name = "AbortError"; throw e; } };
    let fallbackUsed = false;
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), { transport: abortErr, fallbackTransport: { postStream: async () => { fallbackUsed = true; return 200; } } });
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toMatchObject({ name: "AbortError" });
    expect(fallbackUsed).toBe(false);
  });
  it("fallback surfaces the envelope from the error body", async () => {
    const netErr = { postStream: async () => { const e = new Error("net"); e.name = "StreamNetworkError"; throw e; } };
    const fallback: SseTransport = { postStream: async (_u, _b, _h, onChunk) => { onChunk('{"error":{"message":"context length exceeded"}}'); return 200; } };
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), { transport: netErr, fallbackTransport: fallback });
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("context length exceeded");
  });
  it("skips streaming on the second call after a CORS fallback (C6)", async () => {
    let streamCalls = 0;
    const netErr = { postStream: async () => { streamCalls++; const e = new Error("net"); e.name = "StreamNetworkError"; throw e; } };
    const fallback: SseTransport = { postStream: async (_u, _b, _h, onChunk) => { onChunk(JSON.stringify({ choices: [{ message: { content: "# A" } }] })); return 200; } };
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), { transport: netErr, fallbackTransport: fallback });
    await c.generate(msg, opts, () => {}, () => {});
    await c.generate(msg, opts, () => {}, () => {});
    expect(streamCalls).toBe(1);
  });
  it("truncated without text stays an empty result with finish_reason 'length' (format check → retry), not an exception", async () => {
    const c = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream(['data: {"choices":[{"delta":{"reasoning_content":"hm"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n']));
    expect(await c.generate(msg, opts, () => {}, () => {})).toMatchObject({ content: "", finishReason: "length", usedFallback: false });
  });

  it("puts opts.params into the body, unchanged, and sends nothing of its own", async () => {
    const bodies: any[] = [];
    const c = new DeckLlmClient({ url: "http://x:1" }, "qwen3", fakeHttp(() => ({ status: 200 })), fakeStream([sse("ok"), "data: [DONE]\n\n"], 200, bodies));
    await c.generate(msg, { model: "qwen3", sentModel: "qwen3", params: { temperature: 0.7, top_p: 0.8, reasoning_effort: "none", max_tokens: 4096 } }, () => {}, () => {});
    expect(bodies[0]).toMatchObject({ temperature: 0.7, top_p: 0.8, reasoning_effort: "none", max_tokens: 4096, model: "qwen3" });
    expect("chat_template_kwargs" in bodies[0]).toBe(false);
  });
  it("sends no sampling at all when params are empty", async () => {
    const bodies: any[] = [];
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream([sse("ok"), "data: [DONE]\n\n"], 200, bodies));
    await c.generate(msg, { model: "m", sentModel: "m", params: {} }, () => {}, () => {});
    for (const k of ["temperature", "max_tokens", "reasoning_effort", "top_p"]) expect(k in bodies[0]).toBe(false);
  });
  it("sends the alias-resolved model on the wire (sentModel), not the listed name", async () => {
    const bodies: any[] = [];
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream([sse("ok"), "data: [DONE]\n\n"], 200, bodies));
    await c.generate(msg, { model: "verdigado-think", sentModel: "google/gemma-4-e4b", params: {} }, () => {}, () => {});
    expect(bodies[0].model).toBe("google/gemma-4-e4b");
  });
  it("reports every server answer to onResponse (ok, truncated, HTTP error) and none for an abort", async () => {
    const seen: any[] = [];
    const ok = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream([sse("# A"), "data: [DONE]\n\n"]));
    await ok.generate(msg, { ...opts, onResponse: (f) => seen.push(f) }, () => {}, () => {});
    expect(seen[0]).toMatchObject({ status: 200, content: "# A" });
    const trunc = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream(['data: {"choices":[{"delta":{"reasoning_content":"hm"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n']));
    await trunc.generate(msg, { ...opts, onResponse: (f) => seen.push(f) }, () => {}, () => {});
    expect(seen[1]).toMatchObject({ status: 200, finishReason: "length", content: "" });
    const bad = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), fakeStream([], 400));
    await expect(bad.generate(msg, { ...opts, onResponse: (f) => seen.push(f) }, () => {}, () => {})).rejects.toThrow();
    expect(seen[2]).toMatchObject({ status: 400 });
    const ctrl = new AbortController(); ctrl.abort();
    const ab = new DeckLlmClient({ url: "http://x" }, "m", fakeHttp(() => ({ status: 200 })), okStream());
    await expect(ab.generate(msg, { ...opts, onResponse: (f) => seen.push(f) }, () => {}, () => {}, ctrl.signal)).rejects.toThrow();
    expect(seen).toHaveLength(3);
  });
  it("carries the API key on the chat path", async () => {
    const seen: Record<string, string>[] = [];
    const c = new DeckLlmClient({ url: "https://openrouter.ai/api", apiKey: "sk-x" }, "m", fakeHttp(() => ({ status: 200 })), { transport: { postStream: async (_u, _b, h, onChunk) => { seen.push(h); onChunk("data: [DONE]\n\n"); return 200; } } });
    await c.generate(msg, opts, () => {}, () => {});
    expect(seen[0]).toMatchObject({ Authorization: "Bearer sk-x" });
  });
});

describe("probe", () => {
  

  it("classifies a model-list response as ok", async () => {
    const http = async () => ({ status: 200, json: { data: [{ id: "qwen3" }] }, text: "" });
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: true, kind: "ok" });
  });

  it("classifies HTTP 200 with an error body as not-an-llm-api — the /v1/v1 trap", async () => {
    const http = async () => ({ status: 200, json: { error: "Unexpected endpoint" }, text: "" });
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "not-an-llm-api" });
  });

  it("classifies a refused connection", async () => {
    const http = async () => { throw new Error("net::ERR_CONNECTION_REFUSED"); };
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "refused" });
  });

  it("classifies an unknown host", async () => {
    const http = async () => { throw new Error("getaddrinfo ENOTFOUND nope.invalid"); };
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "unknown-host" });
  });

  it("keeps the raw message for an unclassifiable error", async () => {
    const http = async () => { throw new Error("weird failure"); };
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", http, noStream);
    expect(await c.probe()).toMatchObject({ kind: "unknown", raw: "weird failure" });
  });

  it("ping stays a boolean and now rejects a non-LLM 200", async () => {
    const ok = new DeckLlmClient({ url: "http://x:1" }, "m", async () => ({ status: 200, json: { data: [] }, text: "" }), noStream);
    const bad = new DeckLlmClient({ url: "http://x:1" }, "m", async () => ({ status: 200, json: { error: "nope" }, text: "" }), noStream);
    expect(await ok.ping()).toBe(true);
    expect(await bad.ping()).toBe(false);
  });

  it("does not throw when the injected http fn throws synchronously", async () => {
    const syncThrow = (() => { throw new Error("sync boom"); }) as never;
    const c = new DeckLlmClient({ url: "http://x:1" }, "m", syncThrow, noStream);
    await expect(c.probe()).resolves.toMatchObject({ reachable: false, kind: "unknown" });
  });
});
