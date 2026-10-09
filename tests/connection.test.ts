import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { DEFAULT_SETTINGS, type SlideDeckSettings } from "../src/settings";
import { deckConnectionOptions } from "../src/llm/connection";
import { createLlmConnection } from "../src/vendor/kit-obsidian/llm-connection";
import type { SseTransport } from "../src/vendor/kit-obsidian/chat-client";
import type { BackendId } from "../src/vendor/kit/sampling-profiles";

// Die Verbindung selbst ist Kit-Code (und dort getestet). Hier steht, was DIESES Plugin an ihr
// festmacht: die Zuordnung der Settings-Felder, der Modus "creative" im Body (die goldenen Requests
// von frueher, jetzt durch die echte Verbindung statt durch eine eigene Bau-Funktion), ein Modell je
// Aufruf, die Schwaerzung samt Rueckweg und der Umzug der Klartext-Schluessel.

interface Sent { url: string; body: Record<string, unknown>; headers: Record<string, string> }

/** Ein Transport, der den Body aufzeichnet und `reply(body)` als Stream zurueckgibt. */
function fakeTransport(reply: (body: Record<string, unknown>) => string = () => "ok"): { transport: SseTransport; sent: Sent[] } {
  const sent: Sent[] = [];
  const transport: SseTransport = {
    async postStream(url, body, headers, onChunk) {
      const b = body as Record<string, unknown>;
      sent.push({ url, body: b, headers });
      const text = reply(b);
      onChunk(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      onChunk(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
      onChunk("data: [DONE]\n\n");
      return 200;
    },
  };
  return { transport, sent };
}

function fakeApp(secrets: Map<string, string> = new Map()): { app: App; secrets: Map<string, string> } {
  const app = {
    plugins: { plugins: {} },
    secretStorage: {
      getSecret: (id: string) => secrets.get(id) ?? "",
      setSecret: (id: string, v: string) => { secrets.set(id, v); },
    },
  } as unknown as App;
  return { app, secrets };
}

function setup(over: Partial<SlideDeckSettings> = {}, backend: BackendId = "lmstudio", app: App = fakeApp().app) {
  const settings: SlideDeckSettings = { ...structuredClone(DEFAULT_SETTINGS), ...over };
  const saved: string[] = [];
  const { transport, sent } = fakeTransport();
  const rec = { transport, sent };
  const opts = deckConnectionOptions({
    app, pluginId: "slide-deck", settings: () => settings,
    save: async () => { saved.push(JSON.stringify(settings)); },
    transports: { http: transport, fallback: "none" },
  });
  // Kein Netz: die lokale Zeile gilt als erreichbar, das Backend ist vorgegeben.
  const llm = createLlmConnection({ ...opts, probe: async () => true, backendOf: async () => backend });
  return { llm, settings, saved, rec };
}

const MSG = [{ role: "user", content: "Mach Folien" }];

/** Settings-Anfrage mit ausdruecklich abgeschalteter Denkstufe (der Standard der Settings ist „medium“). */
function thinkingOff() {
  const request = structuredClone(DEFAULT_SETTINGS.request);
  request.thinking.creative = "off";
  return request;
}

describe("goldene Requests — creative, Denkstufe aus, Budget 8192", () => {
  const EXPECTED: Record<string, Record<string, Record<string, number | string>>> = {
    "qwen/qwen3.8-27b": {
      lmstudio: { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, reasoning_effort: "none", max_tokens: 8192 },
      openwebui: { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5, reasoning_effort: "none", max_tokens: 8192 },
    },
    "openai/gpt-oss-20b": {
      lmstudio: { temperature: 0.7, top_p: 1, reasoning_effort: "minimal", max_tokens: 8192 },
    },
    "kein-bekanntes-modell": {
      lmstudio: { temperature: 0.7, reasoning_effort: "none", max_tokens: 8192 },
      unknown: { temperature: 0.7, max_tokens: 8192 },
    },
  };
  for (const [model, byBackend] of Object.entries(EXPECTED)) {
    for (const [backend, params] of Object.entries(byBackend)) {
      it(`${model} × ${backend}`, async () => {
        const { llm, rec } = setup({ llmModel: model, request: thinkingOff() }, backend as BackendId);
        const r = await llm.complete({ messages: MSG });
        expect(r.ok).toBe(true);
        const { model: wire, messages: _m, stream: _s, ...sampling } = rec.sent[0]!.body;
        expect(wire).toBe(model);
        expect(sampling).toEqual(params);
      });
    }
  }

  it("nie chat_template_kwargs oder reasoning_budget", async () => {
    const { llm, rec } = setup({ llmModel: "qwen/qwen3.8-27b", request: thinkingOff() });
    await llm.complete({ messages: MSG });
    expect(rec.sent[0]!.body).not.toHaveProperty("chat_template_kwargs");
    expect(rec.sent[0]!.body).not.toHaveProperty("reasoning_budget");
  });

  it("das eigene Budget (llmMaxTokens) geht als max_tokens mit", async () => {
    const { llm, rec } = setup({ llmModel: "openai/gpt-oss-20b", llmMaxTokens: 100000, request: thinkingOff() });
    await llm.complete({ messages: MSG });
    expect(rec.sent[0]!.body.max_tokens).toBe(100000);
  });

  it("eine Ueberschreibung aus den Settings gewinnt", async () => {
    const request = structuredClone(DEFAULT_SETTINGS.request);
    request.overrides.creative = { "gemma4": { temperature: 0.2 } };
    const { llm, rec } = setup({ llmModel: "google/gemma-4-12b", request });
    await llm.complete({ messages: MSG });
    expect(rec.sent[0]!.body.temperature).toBe(0.2);
  });
});

describe("Aufruf-Optionen, die dieses Plugin nutzt", () => {
  it("model: ein frei getipptes Modell geht auf den Draht, die Settings bleiben unberuehrt", async () => {
    const { llm, rec, settings } = setup({ llmModel: "qwen/qwen3.8-27b" });
    await llm.complete({ messages: MSG }, { model: "openai/gpt-oss-20b" });
    expect(rec.sent[0]!.body.model).toBe("openai/gpt-oss-20b");
    expect(rec.sent[0]!.body.top_p).toBe(1); // Profil der Familie gpt-oss, nicht qwen
    expect(settings.llmModel).toBe("qwen/qwen3.8-27b");
  });

  it("Denk-Test: thinking off, Temperatur 0 und max_tokens 32 je Aufruf", async () => {
    const request = structuredClone(DEFAULT_SETTINGS.request);
    request.thinking.creative = "high";
    const { llm, rec } = setup({ llmModel: "qwen/qwen3.8-27b", request });
    await llm.complete({ messages: MSG }, { model: "qwen/qwen3.8-27b", thinking: "off", overrides: { temperature: 0, max_tokens: 32 } });
    expect(rec.sent[0]!.body).toMatchObject({ temperature: 0, max_tokens: 32, reasoning_effort: "none" });
  });
});

describe("Schwaerzung (Verhaltenswechsel mit dem Kit-Chat-Client)", () => {
  const TOKEN = "abcdefghijklmnop12345678";
  const SOURCE = `Notiz mit Zugang: Authorization: Bearer ${TOKEN} fuer die API.`;

  it("das Modell sieht einen Platzhalter, der Aufrufer bekommt das Original zurueck", async () => {
    const { transport, sent } = fakeTransport((body) => {
      const content = (body.messages as { content: string }[])[0]!.content;
      return `Folie: ${/\[redacted-[a-z]+-\d+\]/.exec(content)?.[0] ?? "KEIN-PLATZHALTER"}`;
    });
    const opts = deckConnectionOptions({ app: fakeApp().app, pluginId: "slide-deck", settings: () => ({ ...structuredClone(DEFAULT_SETTINGS) }), save: async () => {}, transports: { http: transport, fallback: "none" } });
    const llm = createLlmConnection({ ...opts, probe: async () => true, backendOf: async () => "lmstudio" });
    const r = await llm.complete({ messages: [{ role: "user", content: SOURCE }] });
    const wire = JSON.stringify(sent[0]!.body);
    expect(wire).not.toContain(TOKEN);
    expect(r.ok && r.content).toContain(TOKEN);
    expect(r.ok && r.redactions).toBeGreaterThan(0);
  });
});

describe("Schluessel im Schluesselbund", () => {
  it("ein Klartext-Schluessel zieht beim ersten Aufloesen in den Schluesselbund; data.json traegt ihn nicht mehr", async () => {
    const { app, secrets } = fakeApp();
    const { llm, settings, saved } = setup({ llmEndpoints: [{ url: "http://localhost:1234", apiKey: "sk-klartext-123456" }] }, "lmstudio", app);
    const src = await llm.resolve({ force: true });
    // Der Aufrufer bekommt den Schluessel (hydriert) ...
    expect(src.config?.apiKey).toBe("sk-klartext-123456");
    // ... die Settings und die gespeicherte Fassung nicht.
    expect(JSON.stringify(settings)).not.toContain("sk-klartext-123456");
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((s) => !s.includes("sk-klartext-123456"))).toBe(true);
    expect([...secrets.values()]).toContain("sk-klartext-123456");
  });

  it("der hydrierte Schluessel geht als Bearer auf den Draht", async () => {
    const { app } = fakeApp();
    const { llm, rec } = setup({ llmModel: "m", llmEndpoints: [{ url: "http://localhost:1234", apiKey: "sk-klartext-123456" }] }, "lmstudio", app);
    await llm.complete({ messages: MSG });
    expect(rec.sent[0]!.headers.Authorization).toBe("Bearer sk-klartext-123456");
  });
});

describe("persist: Feldzuordnung", () => {
  it("schreibt endpoints/choice/model/request synchron in die Plugin-Felder, bevor gespeichert wird", async () => {
    const settings: SlideDeckSettings = structuredClone(DEFAULT_SETTINGS);
    let atSave: SlideDeckSettings | null = null;
    const opts = deckConnectionOptions({ app: fakeApp().app, pluginId: "slide-deck", settings: () => settings, save: async () => { atSave = structuredClone(settings); } });
    const p = opts.persist({ endpoints: [{ url: "http://x:1" }], choice: { endpointId: "e1" }, model: "m1" });
    expect(settings.llmEndpoints).toEqual([{ url: "http://x:1" }]);
    expect(settings.choice).toEqual({ endpointId: "e1" });
    expect(settings.llmModel).toBe("m1");
    await p;
    expect(atSave).not.toBeNull();
    expect(opts.getSettings()).toMatchObject({ endpoints: [{ url: "http://x:1" }], choice: { endpointId: "e1" }, model: "m1" });
  });
});
