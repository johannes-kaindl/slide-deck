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
    const { http, seen } = recorder();
    const c = new DeckLlmClient({ url: "https://openrouter.ai/api", apiKey: "sk-x" }, "m1", http, noStream);
    await c.modelContext("m1");
    expect(seen.length).toBeGreaterThanOrEqual(1);
    for (const h of seen) expect(h).toMatchObject({ Authorization: "Bearer sk-x" });
  });

  it("sends no Authorization header without a key — local servers stay untouched", async () => {
    const { http, seen } = recorder();
    const c = new DeckLlmClient({ url: "http://localhost:1234" }, "m1", http, noStream);
    await c.listModels();
    expect(seen[0]?.Authorization).toBeUndefined();
  });
});
