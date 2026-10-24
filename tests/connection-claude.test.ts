import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { DEFAULT_SETTINGS, type SlideDeckSettings } from "../src/settings";
import { deckConnectionOptions } from "../src/llm/connection";
import { createLlmConnection } from "../src/vendor/kit-obsidian/llm-connection";
import type { SseTransport } from "../src/vendor/kit-obsidian/chat-client";
import type { BackendId } from "../src/vendor/kit/sampling-profiles";

// Claude als Endpunkt des Endpunkt-Managers: ohne den Opt-in `transports.anthropic` in `deckConnectionOptions` sieht das Plugin einen
// Endpunkt `provider: "anthropic"` des Managers nie (die Verbindung fragt dann nur nach `http`). Der Manager hier zeichnet auf, womit
// ihn die Verbindung fragt, und liefert den Claude-Endpunkt nur, wenn `"anthropic"` unter den Transporten steht (wie der echte).

interface Asked { via: "list" | "resolve"; transports: unknown }

function managerApp(): { app: App; asked: Asked[] } {
  const asked: Asked[] = [];
  const claude = {
    id: "claude", label: "Claude API", provider: "anthropic", transport: "anthropic", backend: "anthropic",
    capabilities: ["chat"], defaultModel: "claude-haiku-5-5", enabled: true, hasSecret: true,
    url: "https://api.anthropic.test", models: [{ id: "claude-haiku-5-5" }],
  };
  const wants = (t: unknown): boolean => Array.isArray(t) && t.includes("anthropic");
  const api = {
    version: 1,
    list: (filter?: { transports?: unknown }) => { asked.push({ via: "list", transports: filter?.transports }); return wants(filter?.transports) ? [claude] : []; },
    get: () => null,
    resolve: async (_capability: string, opts?: { transports?: unknown }) => {
      asked.push({ via: "resolve", transports: opts?.transports });
      return wants(opts?.transports)
        ? { id: claude.id, label: claude.label, backend: claude.backend, transport: claude.transport, defaultModel: claude.defaultModel, models: claude.models,
            config: { url: claude.url, apiKey: "sk-ant-test", model: claude.defaultModel } }
        : { error: "no-endpoint" };
    },
    materialize: async () => ({ error: "no-endpoint" }),
    models: async () => [],
    importEndpoints: async () => ({ error: "no-endpoint" }),
    on: () => () => {},
  };
  const app = { plugins: { plugins: { "llm-endpoint-manager": { api } } } } as unknown as App;
  return { app, asked };
}

function connection(app: App, transports?: ReturnType<typeof deckConnectionOptions>["transports"]) {
  const settings: SlideDeckSettings = structuredClone(DEFAULT_SETTINGS);
  const opts = deckConnectionOptions({ app, pluginId: "slide-deck", settings: () => settings, save: async () => {}, ...(transports ? { transports } : {}) });
  return createLlmConnection({ ...opts, probe: async () => true, backendOf: async (): Promise<BackendId> => "anthropic" });
}

describe("Claude als Endpunkt des Endpunkt-Managers", () => {
  it("die Verbindung fragt den Manager auch nach Endpunkten mit Transport „anthropic“", async () => {
    const { app, asked } = managerApp();
    const r = await connection(app).resolve();
    const resolved = asked.filter((a) => a.via === "resolve");
    // Messprobe: der Fake wurde gefragt und hat einen Endpunkt geliefert, sonst ist „immer anthropic“ nichts wert.
    expect(resolved.length).toBeGreaterThan(0);
    expect(r.config).not.toBeNull();
    for (const a of resolved) expect(a.transports).toEqual(["http", "anthropic"]);
  });

  it("der Test-Transport bleibt erhalten, der Opt-in kommt dazu: Messages-API mit x-api-key, ohne temperature", async () => {
    const { app } = managerApp();
    const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    const http: SseTransport = {
      async postStream(url, body, headers, onChunk) {
        sent.push({ url, body: body as Record<string, unknown>, headers });
        onChunk(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "Folien" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
        return 200;
      },
    };
    const r = await connection(app, { http, fallback: "none" }).complete({ messages: [{ role: "user", content: "Mach Folien" }] });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://api.anthropic.test/v1/messages");
    expect(sent[0]!.headers["x-api-key"]).toBe("sk-ant-test");
    expect(sent[0]!.headers["anthropic-version"]).toBeTruthy();
    expect(sent[0]!.body).not.toHaveProperty("temperature");
    expect(sent[0]!.body).not.toHaveProperty("top_p");
    expect(sent[0]!.body.max_tokens).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});
