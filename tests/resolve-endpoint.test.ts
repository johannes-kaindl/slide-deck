import { describe, expect, it, vi } from "vitest";
import { resolveDeckEndpoint } from "../src/llm/resolve-endpoint";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";
import type { LlmEndpointManagerApi } from "../src/vendor/kit/endpoint-source";

/** Ein Manager, der nur die Methoden hat, die resolveEndpointSource ruft. */
function fakeManager(over: Partial<LlmEndpointManagerApi> = {}): LlmEndpointManagerApi {
  return {
    version: 1,
    list: () => [],
    resolve: vi.fn(async () => ({ id: "m1", label: "M", config: { url: "http://manager:1234" }, defaultModel: "qwen3" })),
    materialize: vi.fn(async (id: string) => ({ id, label: id, config: { url: `http://${id}:1234` }, defaultModel: "gpt-oss" })),
    models: vi.fn(async () => []),
    importEndpoints: vi.fn(async () => ({ added: [], merged: [], skipped: [] })),
    on: () => () => {},
    ...over,
  } as unknown as LlmEndpointManagerApi;
}

const up = async () => true;
const settings = { ...DEFAULT_SETTINGS, llmEndpoints: [{ url: "http://local:1234" }], llmModel: "lokal-modell" };

describe("resolveDeckEndpoint", () => {
  it("ohne Manager: lokale Liste, Modell aus llmModel", async () => {
    const r = await resolveDeckEndpoint(settings, null, up);
    expect(r.kind).toBe("local");
    expect(r.config?.url).toBe("http://local:1234");
    expect(r.model).toBe("lokal-modell");
  });

  it("mit Manager: der Manager gewinnt, Modell = defaultModel des Endpunkts", async () => {
    const m = fakeManager();
    const r = await resolveDeckEndpoint(settings, m, up);
    expect(r.kind).toBe("manager");
    expect(r.config?.url).toBe("http://manager:1234");
    expect(r.model).toBe("qwen3");
    expect(m.resolve).toHaveBeenCalledWith("chat", { caller: "slide-deck" });
  });

  it("choice haelt Endpunkt und Modell gegenueber dem Manager", async () => {
    const m = fakeManager();
    const r = await resolveDeckEndpoint({ ...settings, choice: { endpointId: "ep7", model: "mein-modell" } }, m, up);
    expect(m.materialize).toHaveBeenCalledWith("ep7", { caller: "slide-deck" });
    expect(r.config?.url).toBe("http://ep7:1234");
    expect(r.model).toBe("mein-modell");
  });

  it("Manager ohne Endpunkt: kein lokaler Rueckfall, Grund wird durchgereicht", async () => {
    const m = fakeManager({ resolve: vi.fn(async () => ({ error: "no-endpoint" as const })) });
    const r = await resolveDeckEndpoint(settings, m, up);
    expect(r.kind).toBe("manager");
    expect(r.config).toBeNull();
    expect(r.reason).toBe("no-endpoint");
  });
});

describe("loadSettings · choice", () => {
  it("fehlt in alten data.json → leere Wahl", () => {
    expect(loadSettings({}).choice).toEqual({});
  });
  it("traegt nur nicht-leere Strings", () => {
    expect(loadSettings({ choice: { endpointId: "a", model: 5 } }).choice).toEqual({ endpointId: "a" });
    expect(loadSettings({ choice: "quatsch" }).choice).toEqual({});
  });
});
