import { describe, it, expect, vi, beforeEach } from "vitest";
import { setLang } from "../src/i18n";
import { deckClient, deckResultOf, fetchModelContext, type HttpJson } from "../src/llm-client";
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

  it("ohne Modell sendet es kein 'model' mit — dann gilt das aufgeloeste", async () => {
    const complete = vi.fn(async (_req: unknown, _h?: object) => ok());
    await deckClient({ complete } as never, "").generate([], () => {}, () => {});
    expect(complete.mock.calls[0]![1]).not.toHaveProperty("model");
  });
});

describe("fetchModelContext", () => {
  const http = (seen: (Record<string, string> | undefined)[], lm: number, oll: unknown): HttpJson => async (p) => {
    seen.push(p.headers);
    if (p.url.includes("/api/v0/models")) return { status: lm, json: { data: [{ id: "m1", loaded_context_length: 4096, max_context_length: 32768 }] }, text: "{}" };
    return { status: 200, json: oll, text: "{}" };
  };

  it("liest die Kontextlaenge von LM Studio", async () => {
    expect(await fetchModelContext({ url: "http://localhost:1234" }, "m1", http([], 200, {}))).toMatchObject({ loadedContextLength: 4096, maxContextLength: 32768 });
  });

  it("normalisiert einen /v1-Endpunkt", async () => {
    const urls: string[] = [];
    await fetchModelContext({ url: "http://localhost:1234/v1" }, "m1", async (p) => { urls.push(p.url); return { status: 404, json: {}, text: "" }; });
    expect(urls[0]).toBe("http://localhost:1234/api/v0/models");
  });

  it("sendet den Schluessel auf BEIDEN Wegen — LM Studio muss scheitern, damit der Ollama-Weg mitgemessen wird", async () => {
    const seen: (Record<string, string> | undefined)[] = [];
    await fetchModelContext({ url: "https://openrouter.ai/api", apiKey: "sk-x" }, "m1", http(seen, 404, { model_info: { context_length: 1234 } }));
    expect(seen.length).toBe(2);
    expect(seen[0]).toMatchObject({ Authorization: "Bearer sk-x" });
    expect(seen[1]).toMatchObject({ Authorization: "Bearer sk-x" });
  });

  it("ohne Schluessel kein Authorization-Header — lokale Server bleiben unberuehrt", async () => {
    const seen: (Record<string, string> | undefined)[] = [];
    await fetchModelContext({ url: "http://localhost:1234" }, "m1", http(seen, 200, {}));
    expect(seen[0]).not.toHaveProperty("Authorization");
  });

  it("null, wenn nichts antwortet — wirft nie", async () => {
    expect(await fetchModelContext({ url: "http://x" }, "m1", async () => { throw new Error("down"); })).toBeNull();
  });
});
