import { describe, it, expect, vi, beforeEach } from "vitest";
import { setLang } from "../src/i18n";
import { deckClient, deckResultOf } from "../src/llm-client";
import { effectiveContext } from "../src/llm/model-info";
import { fetchEndpointContext } from "../src/vendor/kit-obsidian/backend-probe";
import type { CapabilityFetch } from "../src/vendor/kit/capabilities";
import type { LlmResult } from "../src/vendor/kit-obsidian/llm-connection";

// Chat, Fristen, Abbruch und Fallback sind Kit-Code (chat-client, llm-connection) und dort getestet.
// Hier steht, was dieses Plugin daraus macht: der Deck-Ergebnis-Adapter und die Kontextlaenge.

const TIMING = { startedAt: 0, endedAt: 1 };
const SOURCE = {} as LlmResult["source"];
const ok = (over: Record<string, unknown> = {}): LlmResult => ({
  ok: true, content: "# Folie", reasoning: "", toolCalls: [], finishReason: "stop", truncated: false, streamed: true,
  timing: TIMING, facts: null, deviations: [], source: SOURCE, ...over,
} as LlmResult);
const fail = (kind: string, detail: string, over: Record<string, unknown> = {}): LlmResult => ({
  ok: false, kind, detail, partial: "", reasoning: "", timing: TIMING, facts: null, deviations: [], source: SOURCE, ...over,
} as LlmResult);

describe("deckResultOf", () => {
  beforeEach(() => setLang("en"));

  it("traegt Inhalt, Denken und Abschlussgrund durch; usedFallback ist 'kam nicht als Stream'", () => {
    expect(deckResultOf(ok())).toEqual({ content: "# Folie", reasoning: "", finishReason: "stop", usedFallback: false });
    expect(deckResultOf(ok({ streamed: false })).usedFallback).toBe(true);
  });

  it("abgeschnitten OHNE Text bleibt ein leeres Ergebnis mit finish_reason length (Formatpruefung -> Wiederholung), keine Ausnahme", () => {
    expect(deckResultOf(ok({ content: "", reasoning: "gedacht", finishReason: "length", truncated: true })))
      .toMatchObject({ content: "", reasoning: "gedacht", finishReason: "length" });
  });

  it("ein Abbruch bleibt ein AbortError — der Ablauf verzweigt auf den Namen", () => {
    expect(() => deckResultOf(fail("aborted", "x"))).toThrowError(expect.objectContaining({ name: "AbortError" }));
  });

  it("Servermeldung kommt als nackter Grund an (generate-deck rahmt sie als 'Server error')", () => {
    expect(() => deckResultOf(fail("http", "model not loaded", { status: 400 }))).toThrowError("model not loaded");
  });

  it("Zeitueberschreitung, Netz und zu langer Eingang haben eigene Saetze mit dem Grund", () => {
    expect(() => deckResultOf(fail("timeout", "120s"))).toThrowError(/120s/);
    expect(() => deckResultOf(fail("network", "ECONNREFUSED"))).toThrowError(/ECONNREFUSED/);
    expect(() => deckResultOf(fail("overflow", "8k"))).toThrowError(/8k/);
  });

  it("kein Endpunkt: eigener Text mit dem Grund des Managers, nicht der rohe Schluessel", () => {
    expect(() => deckResultOf(fail("no-endpoint", "disabled"))).toThrowError("no endpoint available (disabled)");
    setLang("de");
    expect(() => deckResultOf(fail("no-endpoint", "disabled"))).toThrowError("kein Endpoint verfügbar (disabled)");
  });
});

describe("deckClient", () => {
  it("leitet Tokens, Abbruch und das frei getippte Modell an die Verbindung", async () => {
    const complete = vi.fn(async (_req: unknown, h?: { onToken?: (t: string) => void; model?: string }) => { h?.onToken?.("a"); return ok(); });
    const seen: string[] = [];
    const ac = new AbortController();
    await deckClient({ complete } as never, "mein-modell").generate([{ role: "user", content: "x" }], (t) => seen.push(t), () => {}, ac.signal);
    expect(seen).toEqual(["a"]);
    expect(complete.mock.calls[0]![1]).toMatchObject({ model: "mein-modell", signal: ac.signal });
  });

  it("reicht onContentReset an die Verbindung (Gemma 4 ohne Oeffner)", async () => {
    const reset = vi.fn();
    const complete = vi.fn(async (_req: unknown, h?: { onContentReset?: () => void }) => { h?.onContentReset?.(); return ok(); });
    await deckClient({ complete } as never, "").generate([], () => {}, () => {}, undefined, reset);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("ohne Modell sendet es kein 'model' mit — dann gilt das aufgeloeste", async () => {
    const complete = vi.fn(async (_req: unknown, _h?: object) => ok());
    await deckClient({ complete } as never, "").generate([], () => {}, () => {});
    expect(complete.mock.calls[0]![1]).not.toHaveProperty("model");
  });
});

describe("Kontext-Abruf der Generate-Ansicht (fetchEndpointContext aus dem Kit)", () => {
  // Der Abruf gehoert dem Kit (Tests dort); hier: dass die gevendorte Fassung in DIESEM Buendel mit Schluessel,
  // /v1-Normalisierung und Zeitgrenze arbeitet, wie es die Ansicht verlangt.
  const timers = { setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms) as unknown as number, clearTimeout: (id: number) => globalThis.clearTimeout(id) };
  const http = (seen: (Record<string, string> | undefined)[], lm: boolean, oll: unknown): CapabilityFetch => async (p) => {
    seen.push(p.headers);
    if (p.url.includes("/api/v0/models")) return lm ? { json: { data: [{ id: "m1", loaded_context_length: 4096, max_context_length: 32768 }] } } : null;
    return { json: oll };
  };

  it("liest die Kontextlaenge von LM Studio", async () => {
    expect(await fetchEndpointContext("http://localhost:1234", "m1", undefined, { fetch: http([], true, {}), timers })).toMatchObject({ loadedContextLength: 4096, maxContextLength: 32768 });
  });

  it("normalisiert einen /v1-Endpunkt", async () => {
    const urls: string[] = [];
    await fetchEndpointContext("http://localhost:1234/v1", "m1", undefined, { fetch: async (p) => { urls.push(p.url); return null; }, timers });
    expect(urls[0]).toBe("http://localhost:1234/api/v0/models");
  });

  it("sendet den Schluessel auf BEIDEN Wegen — LM Studio muss scheitern, damit der Ollama-Weg mitgemessen wird", async () => {
    const seen: (Record<string, string> | undefined)[] = [];
    await fetchEndpointContext("https://openrouter.ai/api", "m1", "sk-x", { fetch: http(seen, false, { model_info: { context_length: 1234 } }), timers });
    expect(seen.length).toBe(2);
    expect(seen[0]).toMatchObject({ Authorization: "Bearer sk-x" });
    expect(seen[1]).toMatchObject({ Authorization: "Bearer sk-x", "Content-Type": "application/json" });
  });

  it("ohne Schluessel kein Authorization-Header — lokale Server bleiben unberuehrt", async () => {
    const seen: (Record<string, string> | undefined)[] = [];
    await fetchEndpointContext("http://localhost:1234", "m1", undefined, { fetch: http(seen, true, {}), timers });
    expect(seen[0]).not.toHaveProperty("Authorization");
  });

  it("null, wenn nichts antwortet — wirft nie", async () => {
    expect(await fetchEndpointContext("http://x", "m1", undefined, { fetch: async () => { throw new Error("down"); }, timers })).toBeNull();
  });

  it("ein Server, der die Verbindung annimmt und nie antwortet, haelt nicht auf: 5 s je Versuch (Welle 18)", async () => {
    const calls: string[] = [];
    const fired: number[] = [];
    const instant = { setTimeout: (fn: () => void, ms: number) => { fired.push(ms); queueMicrotask(fn); return 1; }, clearTimeout: () => {} };
    const hanging: CapabilityFetch = (p) => { calls.push(p.url); return new Promise(() => {}); };
    expect(await fetchEndpointContext("http://x", "m1", undefined, { fetch: hanging, timers: instant })).toBeNull();
    expect(calls).toEqual(["http://x/api/v0/models", "http://x/api/show"]);
    expect(fired).toEqual([5000, 5000]);
  });

  describe("Anbieter Claude (provider: anthropic) — nur die vendorte Huelle, nicht die Durchreichung in generate-deck-view (die misst CX1)", () => {
    const claude = { data: [{ id: "claude-haiku-5-5", max_input_tokens: 200000, max_tokens: 64000 }] };
    const rec = () => {
      const reqs: { url: string; headers: Record<string, string> | undefined }[] = [];
      const fetch: CapabilityFetch = async (p) => { reqs.push({ url: p.url, headers: p.headers }); return p.url.includes("/v1/models") ? { json: claude } : null; };
      return { reqs, fetch };
    };

    it("fragt genau eine Models-Anfrage mit x-api-key und anthropic-version und liest max_input_tokens als Grenze", async () => {
      const { reqs, fetch } = rec();
      const ctx = await fetchEndpointContext("https://api.anthropic.com", "claude-haiku-5-5", "sk-ant-x", { provider: "anthropic", fetch, timers });
      expect(effectiveContext(ctx)).toBe(200000);
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.url).toBe("https://api.anthropic.com/v1/models?limit=1000");
      expect(reqs[0]!.headers).toMatchObject({ "x-api-key": "sk-ant-x", "anthropic-version": "2023-06-01" });
      expect(reqs[0]!.headers).not.toHaveProperty("Authorization");
      expect(reqs.some((r) => r.url.includes("/api/v0/models"))).toBe(false);
    });

    it("Gegenprobe: dieselbe Gegenstelle ohne provider fragt den lokalen Weg und findet keine Grenze", async () => {
      const { reqs, fetch } = rec();
      const ctx = await fetchEndpointContext("https://api.anthropic.com", "claude-haiku-5-5", "sk-ant-x", { fetch, timers });
      expect(effectiveContext(ctx)).toBeNull();
      expect(reqs.map((r) => r.url)).toEqual(["https://api.anthropic.com/api/v0/models", "https://api.anthropic.com/api/show"]);
    });

    it("Gegenprobe: ein Modell, das die Liste nicht traegt, liefert keine Grenze", async () => {
      const { reqs, fetch } = rec();
      const ctx = await fetchEndpointContext("https://api.anthropic.com", "claude-gibt-es-nicht", "sk-ant-x", { provider: "anthropic", fetch, timers });
      expect(effectiveContext(ctx)).toBeNull();
      expect(reqs).toHaveLength(1);
    });
  });
});
