import { describe, it, expect } from "vitest";
import { loadRequestSettings, MODE, LEGACY_DEFAULT_TEMPERATURE } from "../src/llm/request-params";

// Die goldenen Requests (Familie x Backend) laufen seit dem Verbindungs-Tausch durch die echte Kit-
// Verbindung: tests/connection.test.ts.
describe("Modus", () => {
  it("der Modus ist creative", () => { expect(MODE).toBe("creative"); });
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
