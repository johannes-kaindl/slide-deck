import { describe, it, expect } from "vitest";
import { loadSettings, loadSettingsWithReport, DEFAULT_SETTINGS } from "../src/settings";

describe("loadSettings — endpoint migration", () => {
  it("turns a pre-0.7 string list into configs", () => {
    const out = loadSettings({ llmEndpoints: ["http://localhost:1234", "http://192.168.1.5:1234"] });
    expect(out.llmEndpoints).toEqual([
      { url: "http://localhost:1234" },
      { url: "http://192.168.1.5:1234" },
    ]);
  });

  it("keeps already-migrated configs including the key", () => {
    const eps = [{ url: "https://openrouter.ai/api", apiKey: "sk-x" }];
    expect(loadSettings({ llmEndpoints: eps }).llmEndpoints).toEqual(eps);
  });

  it("falls back to the default when the field is missing", () => {
    expect(loadSettings({}).llmEndpoints).toEqual(DEFAULT_SETTINGS.llmEndpoints);
  });

  it("drops blank entries instead of keeping a dead row", () => {
    expect(loadSettings({ llmEndpoints: ["", "  ", "http://a:1234"] }).llmEndpoints)
      .toEqual([{ url: "http://a:1234" }]);
  });
});

describe("loadSettingsWithReport — request settings (Welle 14)", () => {
  it("turns the legacy fields into request values and removes them from the settings", () => {
    const r = loadSettingsWithReport({ llmSuppressThinking: true, llmTemperature: 0.9, llmMaxTokens: 4096 });
    expect(r.settings.request.thinking.creative).toBe("off");
    expect(r.settings.request.overrides.creative?.unknown?.temperature).toBe(0.9);
    expect(r.legacyTemperature).toBe(0.9);
    expect(r.migrated).toBe(true);
    expect("llmSuppressThinking" in r.settings).toBe(false);
    expect("llmTemperature" in r.settings).toBe(false);
    expect(r.settings.llmMaxTokens).toBe(4096);   // the plugin's own budget stays
  });
  it("a legacy temperature equal to the old default is dropped without a notice", () => {
    const r = loadSettingsWithReport({ llmTemperature: 0.3 });
    expect(r.legacyTemperature).toBeNull();
    expect(r.settings.request.overrides).toEqual({});
    expect(r.migrated).toBe(true);   // the field is still removed on the next save
  });
  it("fresh and already-migrated data report nothing", () => {
    expect(loadSettingsWithReport({}).migrated).toBe(false);
    const again = loadSettingsWithReport({ request: { thinking: { creative: "high" } } });
    expect(again.migrated).toBe(false);
    expect(again.legacyTemperature).toBeNull();
    expect(again.settings.request.thinking.creative).toBe("high");
  });
  it("default settings carry a profile-default request and no legacy fields", () => {
    expect(DEFAULT_SETTINGS.request).toEqual({ overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false });
    expect("llmTemperature" in DEFAULT_SETTINGS).toBe(false);
  });
  it("two loads never share the request object with DEFAULT_SETTINGS", () => {
    const a = loadSettings({}); a.request.thinking.creative = "high";
    expect(DEFAULT_SETTINGS.request.thinking.creative).toBeUndefined();
    expect(loadSettings({}).request.thinking.creative).toBeUndefined();
  });
});

describe("loadSettingsWithReport — globales Modell (Welle 17)", () => {
  const rows = (r: ReturnType<typeof loadSettingsWithReport>) => r.settings.llmEndpoints;

  it("zieht den Altwert einmal in die Zeilen ohne Modell und entfernt den Schluessel", () => {
    const r = loadSettingsWithReport({ llmModel: "  qwen/qwen3.8-27b ", llmEndpoints: [{ url: "http://a:1" }, { url: "http://b:2", model: "eigenes" }] });
    expect(rows(r)).toEqual([{ url: "http://a:1", model: "qwen/qwen3.8-27b" }, { url: "http://b:2", model: "eigenes" }]);
    expect("llmModel" in r.settings).toBe(false);
    expect(r.migrated).toBe(true);
  });

  it("fuellt auch die Default-Zeile, wenn die data.json keine Liste traegt", () => {
    const r = loadSettingsWithReport({ llmModel: "m" });
    expect(rows(r)).toEqual([{ url: "http://localhost:1234", model: "m" }]);
  });

  it("zweiter Lauf aendert nichts; eine vom Nutzer geleerte Zeile bleibt leer", () => {
    const first = loadSettingsWithReport({ llmModel: "m", llmEndpoints: [{ url: "http://a:1" }] });
    const cleared = { ...first.settings, llmEndpoints: [{ url: "http://a:1", model: "" }] };
    const second = loadSettingsWithReport(JSON.parse(JSON.stringify(cleared)));
    expect(second.migrated).toBe(false);
    expect(rows(second).map((e) => e.model ?? "")).toEqual([""]); // geleert bleibt geleert
    const again = loadSettingsWithReport(JSON.parse(JSON.stringify(first.settings)));
    expect(again.migrated).toBe(false);
    expect(rows(again)).toEqual(rows(first));
  });

  it("ein leerer Altwert entfernt den Schluessel, ohne Zeilen zu aendern", () => {
    const r = loadSettingsWithReport({ llmModel: "", llmEndpoints: [{ url: "http://a:1" }] });
    expect(rows(r)).toEqual([{ url: "http://a:1" }]);
    expect("llmModel" in r.settings).toBe(false);
    expect(r.migrated).toBe(true);
  });

  it("frische Daten tragen kein Modell-Feld", () => {
    expect("llmModel" in loadSettingsWithReport({}).settings).toBe(false);
  });
});
