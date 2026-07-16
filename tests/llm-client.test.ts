import { describe, it, expect } from "vitest";
import { DeckLlmClient, type HttpJson } from "../src/llm-client";

const opts = { model: "m", temperature: 0.3, maxTokens: 8192, suppressThinking: true };
const msg = [{ role: "user" as const, content: "x" }];

function fakeHttp(impl: (url: string, init?: any) => { status: number; json?: unknown; text?: string }): HttpJson {
  return (param) => Promise.resolve({ status: 200, json: {}, text: "", ...impl(param.url, param) });
}
const okStream = (over: any = {}): any =>
  (_u: string, _i: any, onC: (t: string) => void) => { onC(over.content ?? "# A"); return Promise.resolve({ content: "# A", reasoning: "", model: "m", raw: "data: x", finishReason: undefined, ...over }); };

describe("DeckLlmClient reachability", () => {
  it("ping true on 200", async () => {
    expect(await new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { data: [] } })), okStream()).ping()).toBe(true);
  });
  it("listModels returns sorted ids", async () => {
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { data: [{ id: "b" }, { id: "a" }] } })), okStream());
    expect(await c.listModels()).toEqual(["a", "b"]);
  });
  it("normalizes a /v1-suffixed endpoint", async () => {
    const urls: string[] = [];
    await new DeckLlmClient("http://x/v1", "m", fakeHttp((u) => { urls.push(u); return { status: 200 }; }), okStream()).ping();
    expect(urls[0]).toBe("http://x/v1/models");
  });
  it("modelContext reads LM Studio loaded_context_length", async () => {
    const c = new DeckLlmClient("http://x", "m", fakeHttp((u) => u.endsWith("/api/v0/models") ? ({ status: 200, json: { data: [{ id: "m", loaded_context_length: 8192 }] } }) : ({ status: 404 })), okStream());
    expect(await c.modelContext("m")).toEqual({ loadedContextLength: 8192 });
  });
});

describe("DeckLlmClient.generate", () => {
  it("returns streamed content on success", async () => {
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), okStream({ content: "# Title", finishReason: "stop" }));
    expect(await c.generate(msg, opts, () => {}, () => {})).toMatchObject({ content: "# Title", usedFallback: false });
  });
  it("throws the envelope message on a 200-error stream body", async () => {
    const errStream: any = () => Promise.resolve({ content: "", reasoning: "", model: "", raw: '{"error":{"message":"model not loaded"}}' });
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), errStream);
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("model not loaded");
  });
  it("falls back to non-streaming on StreamNetworkError (CORS)", async () => {
    const netErr: any = () => { const e = new Error("net"); e.name = "StreamNetworkError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { choices: [{ message: { content: "# Fallback" }, finish_reason: "stop" }] }, text: '{"choices":[]}' })), netErr);
    expect(await c.generate(msg, opts, () => {}, () => {})).toMatchObject({ content: "# Fallback", usedFallback: true });
  });
  it("does NOT fall back on AbortError", async () => {
    const abortErr: any = () => { const e = new Error("Aborted"); e.name = "AbortError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200 })), abortErr);
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toMatchObject({ name: "AbortError" });
  });
  it("fallback surfaces the envelope from the error body", async () => {
    const netErr: any = () => { const e = new Error("net"); e.name = "StreamNetworkError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: {}, text: '{"error":{"message":"context length exceeded"}}' })), netErr);
    await expect(c.generate(msg, opts, () => {}, () => {})).rejects.toThrow("context length exceeded");
  });
  it("skips streaming on the second call after a CORS fallback (C6)", async () => {
    let streamCalls = 0;
    const netErr: any = () => { streamCalls++; const e = new Error("net"); e.name = "StreamNetworkError"; return Promise.reject(e); };
    const c = new DeckLlmClient("http://x", "m", fakeHttp(() => ({ status: 200, json: { choices: [{ message: { content: "# A" } }] }, text: "{}" })), netErr);
    await c.generate(msg, opts, () => {}, () => {});
    await c.generate(msg, opts, () => {}, () => {});
    expect(streamCalls).toBe(1);
  });
});

describe("probe", () => {
  const noStream = (() => { throw new Error("not used"); }) as never;

  it("classifies a model-list response as ok", async () => {
    const http = async () => ({ status: 200, json: { data: [{ id: "qwen3" }] }, text: "" });
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: true, kind: "ok" });
  });

  it("classifies HTTP 200 with an error body as not-an-llm-api — the /v1/v1 trap", async () => {
    const http = async () => ({ status: 200, json: { error: "Unexpected endpoint" }, text: "" });
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "not-an-llm-api" });
  });

  it("classifies a refused connection", async () => {
    const http = async () => { throw new Error("net::ERR_CONNECTION_REFUSED"); };
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "refused" });
  });

  it("classifies an unknown host", async () => {
    const http = async () => { throw new Error("getaddrinfo ENOTFOUND nope.invalid"); };
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ reachable: false, kind: "unknown-host" });
  });

  it("keeps the raw message for an unclassifiable error", async () => {
    const http = async () => { throw new Error("weird failure"); };
    const c = new DeckLlmClient("http://x:1", "m", http, noStream);
    expect(await c.probe()).toMatchObject({ kind: "unknown", raw: "weird failure" });
  });

  it("ping stays a boolean and now rejects a non-LLM 200", async () => {
    const ok = new DeckLlmClient("http://x:1", "m", async () => ({ status: 200, json: { data: [] }, text: "" }), noStream);
    const bad = new DeckLlmClient("http://x:1", "m", async () => ({ status: 200, json: { error: "nope" }, text: "" }), noStream);
    expect(await ok.ping()).toBe(true);
    expect(await bad.ping()).toBe(false);
  });
});
