import { describe, it, expect } from "vitest";
import { buildDeckParams, loadRequestSettings, MODE, LEGACY_DEFAULT_TEMPERATURE } from "../src/llm/request-params";
import type { BackendId, FamilyId } from "../src/vendor/kit/sampling-profiles";

const families: (FamilyId | null)[] = ["qwen3.8", "qwen3.6", "gemma4", "gpt-oss", null];
const backends: BackendId[] = ["lmstudio", "openwebui", "unknown"];

// Goldene Requests (Sampling-Plan Rezept 8): ueber die Request-Bau-Funktion DES PLUGINS
// (buildDeckParams, fester Modus "creative") — nicht ueber resolveRequestParams direkt. Das Budget
// ist slide-decks eigenes (llmMaxTokens, Standard 8192); die Familien-Reserve hebt es an, wo
// Denken es sonst auffrisst — das ist im goldenen Request sichtbar.
describe("goldene Requests — creative, Denkstufe aus, Budget 8192, ohne Ueberschreibung", () => {
  const EXPECTED: Record<string, Record<string, Record<string, number | string>>> = {
    "qwen3.8": {
      lmstudio: { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, reasoning_effort: "none", max_tokens: 8192 },
      openwebui: { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5, reasoning_effort: "none", max_tokens: 8192 },
      unknown: { temperature: 0.7, top_p: 0.8, reasoning_effort: "none", max_tokens: 8192 },
    },
    "qwen3.6": {
      lmstudio: { temperature: 0.7, top_p: 0.95, top_k: 20, reasoning_effort: "none", max_tokens: 8192 },
      openwebui: { temperature: 0.7, top_p: 0.95, top_k: 20, reasoning_effort: "none", max_tokens: 8192 },
      unknown: { temperature: 0.7, top_p: 0.95, reasoning_effort: "none", max_tokens: 8192 },
    },
    "gemma4": {
      lmstudio: { temperature: 0.7, top_p: 0.95, top_k: 64, reasoning_effort: "none", max_tokens: 8192 },
      openwebui: { temperature: 0.7, top_p: 0.95, top_k: 64, reasoning_effort: "none", max_tokens: 8192 },
      unknown: { temperature: 0.7, top_p: 0.95, reasoning_effort: "none", max_tokens: 8192 },
    },
    "gpt-oss": {
      lmstudio: { temperature: 0.7, top_p: 1, reasoning_effort: "minimal", max_tokens: 8192 },
      openwebui: { temperature: 0.7, top_p: 1, reasoning_effort: "minimal", max_tokens: 8192 },
      unknown: { temperature: 0.7, top_p: 1, reasoning_effort: "minimal", max_tokens: 8192 },
    },
    "null": {
      lmstudio: { temperature: 0.7, reasoning_effort: "none", max_tokens: 8192 },
      openwebui: { temperature: 0.7, reasoning_effort: "none", max_tokens: 8192 },
      unknown: { temperature: 0.7, max_tokens: 8192 },
    },
  };
  for (const family of families) {
    for (const backend of backends) {
      it(`${family ?? "unbekannt"} × ${backend}`, () => {
        const { params } = buildDeckParams({ family, backend, thinking: "off", maxTokens: 8192 });
        expect(params).toEqual(EXPECTED[family ?? "null"]![backend]);
      });
    }
  }

  it("nie chat_template_kwargs oder reasoning_budget", () => {
    for (const family of families) for (const backend of backends) {
      const { params } = buildDeckParams({ family, backend, thinking: "off", maxTokens: 8192 });
      expect(params).not.toHaveProperty("chat_template_kwargs");
      expect(params).not.toHaveProperty("reasoning_budget");
    }
  });

  it("der Modus ist creative", () => { expect(MODE).toBe("creative"); });

  it("die Temperatur des Modus steht im Body, eine Ueberschreibung gewinnt", () => {
    const base = buildDeckParams({ family: "gemma4", backend: "lmstudio", thinking: "off", maxTokens: 8192 }).params;
    expect(base.temperature).toBe(0.7);
    const own = buildDeckParams({ family: "gemma4", backend: "lmstudio", thinking: "off", maxTokens: 8192, overrides: { temperature: 0.2 } }).params;
    expect(own.temperature).toBe(0.2);
  });

  it("das eigene Budget geht als max_tokens mit, ein kleines wird auf die Reserve der Familie angehoben", () => {
    const big = buildDeckParams({ family: "gpt-oss", backend: "lmstudio", thinking: "high", maxTokens: 100000 }).params;
    expect(big.max_tokens).toBe(100000);
    const small = buildDeckParams({ family: "gpt-oss", backend: "lmstudio", thinking: "high", maxTokens: 64 }).params;
    expect(Number(small.max_tokens)).toBeGreaterThan(64);
  });

  it("Denkstufe low sendet eine andere reasoning_effort als aus (gemma4)", () => {
    const on = buildDeckParams({ family: "gemma4", backend: "lmstudio", thinking: "low", maxTokens: 8192 }).params;
    const off = buildDeckParams({ family: "gemma4", backend: "lmstudio", thinking: "off", maxTokens: 8192 }).params;
    expect(on.reasoning_effort).not.toBe(off.reasoning_effort);
  });
});

describe("loadRequestSettings — Legacy llmSuppressThinking / llmTemperature", () => {
  it("llmSuppressThinking: true (alter Default) → Stufe aus", () => {
    expect(loadRequestSettings({ llmSuppressThinking: true }).request.thinking.creative).toBe("off");
  });
  it("llmSuppressThinking: false → die Ein-Stufe des Modus", () => {
    expect(loadRequestSettings({ llmSuppressThinking: false }).request.thinking.creative).toBe("medium");
  });
  it("eine schon gespeicherte Stufe gewinnt gegen das Altfeld", () => {
    expect(loadRequestSettings({ llmSuppressThinking: true, request: { thinking: { creative: "high" } } }).request.thinking.creative).toBe("high");
  });

  it("Temperatur gleich dem alten Default → verworfen, keine Notice", () => {
    const r = loadRequestSettings({ llmTemperature: LEGACY_DEFAULT_TEMPERATURE });
    expect(r.request.overrides).toEqual({});
    expect(r.legacyTemperature).toBeNull();
  });
  it("Temperatur abweichend → Ueberschreibung unter \"unknown\", einmal gemeldet", () => {
    const r = loadRequestSettings({ llmTemperature: 0.9 });
    expect(r.request.overrides.creative?.unknown?.temperature).toBe(0.9);
    expect(r.legacyTemperature).toBe(0.9);
  });
  it("ungueltige Legacy-Temperatur (NaN, negativ, Text) wird verworfen, nie gespeichert", () => {
    for (const v of [Number.NaN, -1, "heiss", 99, null]) {
      const r = loadRequestSettings({ llmTemperature: v });
      expect(r.request.overrides).toEqual({});
      expect(r.legacyTemperature).toBeNull();
    }
  });
  it("eine schon vorhandene Ueberschreibung wird vom Altfeld nicht ueberschrieben", () => {
    const r = loadRequestSettings({ llmTemperature: 0.9, request: { overrides: { creative: { unknown: { temperature: 0.5 } } } } });
    expect(r.request.overrides.creative?.unknown?.temperature).toBe(0.5);
    expect(r.legacyTemperature).toBeNull();
  });

  it("ohne Altfelder: Profilwert, nichts gesetzt", () => {
    const r = loadRequestSettings({});
    expect(r.request.thinking.creative).toBeUndefined();
    expect(r.request.overrides).toEqual({});
    expect(r.dropped).toEqual([]);
  });
  it("null/Nicht-Objekt wie leer", () => {
    expect(loadRequestSettings(null).request.thinking).toEqual({});
    expect(loadRequestSettings("x").request.thinking).toEqual({});
  });
  it("ungueltige gespeicherte Werte werden gemeldet", () => {
    expect(loadRequestSettings({ request: { overrides: { creative: { unknown: { temperature: 99 } } } } }).dropped.length).toBeGreaterThan(0);
  });
});
