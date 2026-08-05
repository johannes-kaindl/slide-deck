import { describe, it, expect } from "vitest";
import { DeckLlmClient, type HttpJson } from "../src/llm-client";

function recorder(): { http: HttpJson; seen: (Record<string, string> | undefined)[] } {
  const seen: (Record<string, string> | undefined)[] = [];
  const http: HttpJson = async (p) => {
    seen.push(p.headers);
    return { status: 200, json: { data: [{ id: "m1" }] }, text: "{}" };
  };
  return { http, seen };
}

const noStream = (async () => ({ content: "", reasoning: "", raw: "" })) as never;

describe("DeckLlmClient — API key", () => {
  it("sends the bearer on probe — the path where a missing key fails silently", () => {
    const { http, seen } = recorder();
    const c = new DeckLlmClient({ url: "https://openrouter.ai/api", apiKey: "sk-x" }, "m1", http, noStream);
    return c.probe().then(() => {
      expect(seen[0]).toMatchObject({ Authorization: "Bearer sk-x" });
    });
  });

  it("sends the bearer on listModels", async () => {
    const { http, seen } = recorder();
    const c = new DeckLlmClient({ url: "https://openrouter.ai/api", apiKey: "sk-x" }, "m1", http, noStream);
    await c.listModels();
    expect(seen[0]).toMatchObject({ Authorization: "Bearer sk-x" });
  });

  it("sends the bearer on both modelContext probes", async () => {
    const seen: (Record<string, string> | undefined)[] = [];
    // The LM Studio probe (/api/v0/models) must fail so modelContext is forced past it into
    // the Ollama probe (/api/show) — otherwise a 200 on the first call lets it return early
    // and this test would only ever prove the LM Studio call carries the header.
    const http: HttpJson = async (p) => {
      seen.push(p.headers);
      if (p.url.includes("/api/v0/models")) return { status: 404, json: {}, text: "{}" };
      return { status: 200, json: { model_info: { context_length: 1234 } }, text: "{}" };
    };
    const c = new DeckLlmClient({ url: "https://openrouter.ai/api", apiKey: "sk-x" }, "m1", http, noStream);
    await c.modelContext("m1");
    expect(seen.length).toBe(2);
    expect(seen[0]).toMatchObject({ Authorization: "Bearer sk-x" });
    expect(seen[1]).toMatchObject({ Authorization: "Bearer sk-x" });
  });

  it("sends no Authorization header without a key — local servers stay untouched", async () => {
    const { http, seen } = recorder();
    const c = new DeckLlmClient({ url: "http://localhost:1234" }, "m1", http, noStream);
    await c.listModels();
    expect(seen[0]?.Authorization).toBeUndefined();
  });
});
