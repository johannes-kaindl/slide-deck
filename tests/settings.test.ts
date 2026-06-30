import { describe, it, expect, vi } from "vitest";
import { SlideDeckSettingTab, DEFAULT_SETTINGS, type SlideDeckSettings } from "../src/settings";

// A control definition's `key` is a plain string, so the compiler cannot prove it matches a
// case in get/setControlValue. These tests exercise the round-trip to catch a typo'd or
// unhandled key — the one bug class the type-checker can't see in the declarative migration.

function makeFakePlugin(settings: SlideDeckSettings) {
  const themes = [
    { key: "default", source: "builtin" as const },
    { key: "dark", source: "builtin" as const },
    { key: "mytheme", source: "user" as const },
  ];
  const calls = { saveSettings: 0, refreshThemes: 0, applyFolderHide: 0 };
  const plugin = {
    settings,
    themeStore: {
      getThemes: () => themes,
      getMap: () => new Map(themes.map((e) => [e.key, {}])),
      resolve: (k: string) => ({ key: k, themeCss: "" }),
    },
    saveSettings: vi.fn(() => { calls.saveSettings++; return Promise.resolve(); }),
    refreshThemes: vi.fn(() => { calls.refreshThemes++; return Promise.resolve(); }),
    applyFolderHide: vi.fn(() => { calls.applyFolderHide++; }),
  };
  return { plugin, calls };
}

function controlItems(tab: SlideDeckSettingTab) {
  const defs = tab.getSettingDefinitions();
  const group = defs[0] as { type: string; items: any[] };
  expect(group.type).toBe("group");
  return group.items.filter((i) => i && typeof i === "object" && "control" in i && i.control) as Array<{ control: { key: string; type: string } }>;
}

describe("SlideDeckSettingTab (declarative)", () => {
  it("returns one group whose every control key is a real settings key and round-trips", async () => {
    const settings: SlideDeckSettings = { ...DEFAULT_SETTINGS };
    const { plugin, calls } = makeFakePlugin(settings);
    const tab = new SlideDeckSettingTab({} as any, plugin as any);

    const controls = controlItems(tab);
    const keys = controls.map((c) => c.control.key);
    // The exact bound set — guards against an accidentally dropped/added control.
    expect(new Set(keys)).toEqual(new Set(["defaultTheme", "minFontPx", "imageScale", "exportFolder", "themesFolder", "hideThemesFolder", "customCss"]));

    // Every key must be a real SlideDeckSettings field and read back its current value.
    for (const key of keys) {
      expect(key in DEFAULT_SETTINGS).toBe(true);
      expect(tab.getControlValue(key)).toBe(settings[key as keyof SlideDeckSettings]);
    }

    // Round-trip a new value through setControlValue for each key.
    const newValues: Record<string, unknown> = {
      defaultTheme: "dark", minFontPx: 30, imageScale: 3,
      exportFolder: "Out", themesFolder: "Themes", hideThemesFolder: false, customCss: "body{}",
    };
    for (const key of keys) {
      await tab.setControlValue(key, newValues[key]);
      expect(settings[key as keyof SlideDeckSettings]).toBe(newValues[key]);
      expect(tab.getControlValue(key)).toBe(newValues[key]);
    }
    expect(calls.saveSettings).toBeGreaterThanOrEqual(keys.length);
  });

  it("runs the themesFolder + hideThemesFolder side effects", async () => {
    const settings: SlideDeckSettings = { ...DEFAULT_SETTINGS };
    const { plugin, calls } = makeFakePlugin(settings);
    const tab = new SlideDeckSettingTab({} as any, plugin as any);

    await tab.setControlValue("themesFolder", "NewThemes");
    expect(settings.themesFolder).toBe("NewThemes");
    expect(calls.refreshThemes).toBe(1);
    expect(calls.applyFolderHide).toBe(1);

    await tab.setControlValue("hideThemesFolder", false);
    expect(settings.hideThemesFolder).toBe(false);
    expect(calls.applyFolderHide).toBe(2);
  });

  it("falls back to defaults on empty folder values and coerces an unknown default theme", async () => {
    const settings: SlideDeckSettings = { ...DEFAULT_SETTINGS, defaultTheme: "ghost" };
    const { plugin } = makeFakePlugin(settings);
    const tab = new SlideDeckSettingTab({} as any, plugin as any);

    // unknown persisted theme → dropdown reads back "default" (a valid option)
    expect(tab.getControlValue("defaultTheme")).toBe("default");

    await tab.setControlValue("exportFolder", "   ");
    expect(settings.exportFolder).toBe(DEFAULT_SETTINGS.exportFolder);
    await tab.setControlValue("themesFolder", "");
    expect(settings.themesFolder).toBe(DEFAULT_SETTINGS.themesFolder);
  });
});
