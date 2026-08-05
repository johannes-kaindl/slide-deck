import { describe, it, expect, vi } from "vitest";
import type { EndpointConfig } from "../src/vendor/kit/endpoint_config";
import type { EndpointStatus } from "../src/vendor/kit/endpoint_diagnostics";

// Track every Setting instance created during a render pass, in creation order, so the test
// can reach into a specific row's components (the mock's Setting has no other handle back to
// the caller). renderEndpointEditor creates one Setting per row (in row order) then a trailing
// "actions" Setting — see src/ai-settings-ui.ts.
const settingInstances: unknown[] = [];

vi.mock("obsidian", async () => {
  const actual = await vi.importActual<typeof import("./__mocks__/obsidian")>("obsidian");
  // The vendored mock predates `controlEl` (real Obsidian's Setting exposes it for the
  // control-side children); src/ai-settings-ui.ts relies on it, so the test double adds it
  // rather than reaching further into production code to route around a real DOM node.
  class TrackedSetting extends actual.Setting {
    controlEl = actual.makeFakeEl();
    constructor(containerEl: unknown) {
      super(containerEl as never);
      settingInstances.push(this);
    }
  }
  return { ...actual, Setting: TrackedSetting };
});

const { makeFakeEl, ExtraButtonComponent } = await vi.importActual<typeof import("./__mocks__/obsidian")>("obsidian");
const { renderEndpointEditor } = await import("../src/ai-settings-ui");
type EndpointEditorDeps = import("../src/ai-settings-ui").EndpointEditorDeps;

/** Deps whose setList mutates the backing array SYNCHRONOUSLY before resolving — mirroring
 *  settings.ts's `setList: async (next) => { this.plugin.settings.llmEndpoints = next; await
 *  this.plugin.saveSettings(); }`. That's what makes the race in Finding 1 possible: a second
 *  handler that captured an earlier render's `index` can run against the already-mutated list
 *  before `rerender()` (queued in the first handler's `.then()`) has fired. */
function makeRaceyDeps(initial: EndpointConfig[]) {
  let list = initial;
  let rerenderCount = 0;
  const setListCalls: EndpointConfig[][] = [];
  const deps: EndpointEditorDeps = {
    getList: () => list,
    setList: (next) => {
      list = next; // synchronous mutation — the whole point of the race
      setListCalls.push(next);
      return Promise.resolve();
    },
    probe: () => Promise.resolve({ reachable: true, kind: "ok", klartext: "" } as EndpointStatus),
    rerender: () => { rerenderCount += 1; },
  };
  return { deps, getList: () => list, getRerenderCount: () => rerenderCount, getSetListCalls: () => setListCalls };
}

/** Row Settings only, in render order (the trailing "actions" Setting is dropped). */
function rowSettings(rowCount: number): any[] {
  return settingInstances.splice(0, rowCount + 1 /* + adder row */);
}

function extraButtons(setting: any): any[] {
  return setting.components.filter((c: unknown) => c instanceof ExtraButtonComponent);
}

describe("renderEndpointEditor — stale-index guard (Finding 1)", () => {
  it("trash: does not delete the wrong row when an earlier row vanished mid-race", () => {
    settingInstances.length = 0;
    const initial: EndpointConfig[] = [
      { url: "http://a" }, { url: "http://b" }, { url: "http://c" },
      { url: "http://d" }, { url: "http://e", apiKey: "secret-e" },
    ];
    const { deps, getList, getRerenderCount } = makeRaceyDeps(initial);
    const containerEl = makeFakeEl();
    renderEndpointEditor(containerEl, deps);

    const rows = rowSettings(initial.length);
    // Row 3 (index 3, "d") is the one whose trash button we'll click AFTER the list shifted —
    // its render-time `cfg` was captured as { url: "http://d" }.
    const buttonsRow3 = extraButtons(rows[3]);
    const trashBtn = buttonsRow3[buttonsRow3.length - 1]; // trash is added last (after move-to-front)

    // Simulate row 0's URL being emptied and committed (blur) BEFORE row 3's trash click lands:
    // this removes "a", shifting "e" (and its API key) from index 4 down to index 3.
    const urlField = rows[0].components[0];
    urlField.setValue("");
    urlField.inputEl.dispatchEvent({ type: "blur" });
    expect(getList()).toEqual([{ url: "http://b" }, { url: "http://c" }, { url: "http://d" }, { url: "http://e", apiKey: "secret-e" }]);

    // Now the stale click: it captured index=3 with cfg "d", but index 3 now holds "e".
    trashBtn.clickCB?.();

    // Must NOT have deleted "e" (the row now actually at index 3) — the guard must detect the
    // mismatch and bail to a rerender instead of acting on the wrong row.
    expect(getList()).toEqual([{ url: "http://b" }, { url: "http://c" }, { url: "http://d" }, { url: "http://e", apiKey: "secret-e" }]);
    expect(getRerenderCount()).toBeGreaterThan(0);
  });

  it("move-to-front: does not promote the wrong row when an earlier row vanished mid-race", () => {
    settingInstances.length = 0;
    const initial: EndpointConfig[] = [
      { url: "http://a" }, { url: "http://b" }, { url: "http://c" },
      { url: "http://d" }, { url: "http://e", apiKey: "secret-e" },
    ];
    const { deps, getList, getRerenderCount } = makeRaceyDeps(initial);
    const containerEl = makeFakeEl();
    renderEndpointEditor(containerEl, deps);

    const rows = rowSettings(initial.length);
    const buttonsRow3 = extraButtons(rows[3]);
    const moveBtn = buttonsRow3[0]; // move-to-front is added before trash

    const urlField = rows[0].components[0];
    urlField.setValue("");
    urlField.inputEl.dispatchEvent({ type: "blur" });
    const afterRemoval = [{ url: "http://b" }, { url: "http://c" }, { url: "http://d" }, { url: "http://e", apiKey: "secret-e" }];
    expect(getList()).toEqual(afterRemoval);

    moveBtn.clickCB?.();

    // Must NOT have promoted "e" to the front believing it was "d" — list stays untouched and
    // the guard requests a rerender instead.
    expect(getList()).toEqual(afterRemoval);
    expect(getRerenderCount()).toBeGreaterThan(0);
  });
});
