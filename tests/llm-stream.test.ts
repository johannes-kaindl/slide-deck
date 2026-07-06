import { describe, it, expect, vi, afterEach } from "vitest";
import { streamSSE } from "../src/llm-stream";
import { installFakeXHR } from "./fake_xhr";

const init = { method: "POST", headers: {}, body: "" };

describe("streamSSE (XHR, extended)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates content + calls onContent per delta", async () => {
    const xhr = installFakeXHR();
    const got: string[] = [];
    const p = streamSSE("u", init, (t) => got.push(t), () => {});
    xhr.feed(['data: {"choices":[{"delta":{"content":"Hal"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n']);
    expect((await p).content).toBe("Hallo");
    expect(got).toEqual(["Hal", "lo"]);
  });

  it("exposes raw responseText for the envelope check", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed(['{"error":{"message":"model not loaded"}}']);
    const r = await p;
    expect(r.content).toBe("");
    expect(r.raw).toContain("model not loaded");
  });

  it("captures finishReason: length", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed(['data: {"choices":[{"delta":{"content":"a"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n']);
    expect((await p).finishReason).toBe("length");
  });

  it("routes reasoning + strips inline <think>", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed(['data: {"choices":[{"delta":{"content":"<think>why</think>Answer"}}]}\n\ndata: [DONE]\n\n']);
    expect(await p).toMatchObject({ content: "Answer", reasoning: "why" });
  });

  it("rejects with StreamNetworkError on xhr.onerror (CORS)", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.error();
    await expect(p).rejects.toMatchObject({ name: "StreamNetworkError" });
  });

  it("rejects on HTTP error status", async () => {
    const xhr = installFakeXHR();
    const p = streamSSE("u", init, () => {}, () => {});
    xhr.feed([""], 500);
    await expect(p).rejects.toThrow("500");
  });
});
