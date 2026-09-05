import { describe, it, expect, vi } from "vitest";
import { readImageApi, failureKey, ensureReady, IMAGE_FAILURES } from "../src/image/image-api";
import { t, setLang } from "../src/i18n";
import type { App } from "obsidian";

const vollständig = {
  apiVersion: 1,
  status: () => ({ apiVersion: 1, engine: "builtin", ready: true, reason: null, capabilities: {} }),
  recheck: async () => ({ apiVersion: 1, engine: "server", ready: true, reason: null, capabilities: {} }),
  generate: async () => ({ ok: true }),
  save: async () => ({ ok: true, imagePath: "x.png", notePath: null }),
};
const appMit = (api: unknown): App =>
  ({ plugins: { plugins: { "local-image-generator": api === undefined ? {} : { api } } } }) as unknown as App;

describe("readImageApi", () => {
  it("returns the api when version and shape are right", () => {
    expect(readImageApi(appMit(vollständig))).not.toBeNull();
  });

  it("returns null when the plugin is absent", () => {
    expect(readImageApi({ plugins: { plugins: {} } } as unknown as App)).toBeNull();
  });

  it("returns null on a wrong apiVersion", () => {
    expect(readImageApi(appMit({ ...vollständig, apiVersion: 2 }))).toBeNull();
  });

  it("returns null when a required method is missing — version alone is not enough", () => {
    const { save: _weg, ...ohneSave } = vollständig;
    expect(readImageApi(appMit(ohneSave))).toBeNull();
  });

  it("accepts an installation without recheck (0.7.0–0.9.0 also report apiVersion 1)", () => {
    const { recheck: _weg, ...ohneRecheck } = vollständig;
    const api = readImageApi(appMit(ohneRecheck));
    expect(api).not.toBeNull();
    expect(api?.recheck).toBeUndefined();
  });
});

describe("ensureReady", () => {
  it("rechecks exactly once when a stale unreachable blocks", async () => {
    const recheck = vi.fn(async () => ({ apiVersion: 1, engine: "server", ready: true, reason: null, capabilities: {} }));
    const api = { ...vollständig, recheck,
      status: () => ({ apiVersion: 1, engine: "server", ready: false, reason: "unreachable", capabilities: {} }) };
    const s = await ensureReady(readImageApi(appMit(api))!);
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(s.ready).toBe(true);
  });

  it("does not recheck for any other reason — one net call, not one per generation", async () => {
    const recheck = vi.fn(async () => ({ apiVersion: 1, engine: "builtin", ready: true, reason: null, capabilities: {} }));
    const api = { ...vollständig, recheck,
      status: () => ({ apiVersion: 1, engine: "builtin", ready: false, reason: "no-gpu", capabilities: {} }) };
    await ensureReady(readImageApi(appMit(api))!);
    expect(recheck).not.toHaveBeenCalled();
  });
});

describe("failure texts", () => {
  it("has an EN and a DE text for every failure — CORE-TEST-04", () => {
    for (const lang of ["en", "de"] as const) {
      setLang(lang);
      for (const f of IMAGE_FAILURES) expect(t(failureKey(f))).not.toBe(failureKey(f));
    }
    setLang("en");
  });

  // G3: diese beiden werden dem Nutzer tatsaechlich gezeigt (main.ts::runSlot), stehen aber
  // ausserhalb von IMAGE_FAILURES/failureKey — ohne diese Zeile lief die Vollstaendigkeits-
  // Pruefung an ihnen vorbei, obwohl ein anderer Test (EN/DE-Paritaet) nur Schluesselgleichheit
  // sichert, nicht dass der Wert vom Schluessel abweicht.
  it("has an EN and a DE text for the two out-of-band failure keys — G3", () => {
    const keys = ["image.fail.not-ready", "image.fail.write-failed"] as const;
    for (const lang of ["en", "de"] as const) {
      setLang(lang);
      for (const k of keys) expect(t(k)).not.toBe(k);
    }
    setLang("en");
  });
});
