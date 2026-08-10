import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { revealFolder, writeThemeCss } from "./theme-source";
import { THEME_ALIASES } from "./vendor/deck-core/pure/presets";
import { endpointListStrings, renderModelField, renderThinkingRow } from "./ai-settings-ui";
import { makeDeckLlmClient } from "./llm-client";
import { reasoningHappened } from "./vendor/kit/reasoning";
import { mergeSettings } from "./vendor/kit/settings";
import { migrateEndpointList, resolveActiveEndpointConfig, type EndpointConfig } from "./vendor/kit/endpoint_config";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab } from "./vendor/kit-obsidian/settings_walker";
import { buildEndpointList } from "./vendor/kit-obsidian/endpoint-list";
import { createModelListCache } from "./vendor/kit/model-list-cache";
import { ENDPOINT_PRESETS } from "./vendor/kit/endpoint_diagnostics";

export interface SlideDeckSettings {
  defaultTheme: string;
  minFontPx: number;
  imageScale: number;
  customCss: string;
  exportFolder: string;
  themesFolder: string;
  hideThemesFolder: boolean;
  /** Ordered fallback chain; the first reachable one wins. Each row carries its own API key
   *  so local and hosted providers can live in ONE list. */
  llmEndpoints: EndpointConfig[];
  llmModel: string;
  llmMaxTokens: number;
  llmTemperature: number;
  llmSuppressThinking: boolean;
}
export const DEFAULT_SETTINGS: SlideDeckSettings = {
  defaultTheme: "shiro", minFontPx: 24, imageScale: 2, customCss: "",
  exportFolder: "Slide-Deck-Export", themesFolder: "Slide-Deck-Themes", hideThemesFolder: true,
  llmEndpoints: [{ url: "http://localhost:1234" }], llmModel: "", llmMaxTokens: 8192, llmTemperature: 0.3, llmSuppressThinking: true,
};

/** Merge persisted data over defaults, then migrate `llmEndpoints`: pre-0.7 data.json files
 *  carry a bare `string[]`, current ones an `EndpointConfig[]` — mergeSettings is a shallow,
 *  type-blind merge, so the migration has to run as a second pass right after it. Single
 *  extracted entry point so main.ts and tests share the exact same load path. */
export function loadSettings(raw: unknown): SlideDeckSettings {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);
  // Shallow, type-blind merge: llmEndpoints may still be string[] from an old data.json.
  const rawList = merged.llmEndpoints as unknown as (string | EndpointConfig)[] | undefined;
  return { ...merged, llmEndpoints: migrateEndpointList(undefined, rawList) };
}

/** Migrate a persisted 0.4.x `defaultTheme` (e.g. "default"/"dark") to its Nordstern successor
 *  via THEME_ALIASES. Pure — call once right after settings are loaded, before anything reads
 *  `settings.defaultTheme`. Unknown/canonical keys pass through untouched. */
export function migrateLegacyThemeKeys(s: SlideDeckSettings): SlideDeckSettings {
  const alias = THEME_ALIASES[s.defaultTheme];
  return alias ? { ...s, defaultTheme: alias } : s;
}

/** Declarative settings tab (Obsidian ≥ 1.13: getSettingDefinitions, not the deprecated
 *  imperative display()). Plain controls bind via key ↔ get/setControlValue; the two pieces
 *  that need bespoke UI (the theme-key chip list, the export dropdown+button) use render. */
export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const themes = this.plugin.themeStore.getThemes();
    const themeOptions = Object.fromEntries(themes.map((e) => [e.key, e.label ?? e.key]));
    return [
      {
        type: "group",
        heading: t("settings.heading"),
        items: [
          { name: t("settings.theme.name"), desc: t("settings.theme.desc"),
            control: { type: "dropdown", key: "defaultTheme", options: themeOptions } },
          { name: t("settings.availableThemes.name"), desc: t("settings.availableThemes.desc"),
            render: (setting) => this.renderThemeChips(setting) },
          { name: t("settings.minFont.name"), desc: t("settings.minFont.desc"),
            control: { type: "number", key: "minFontPx", min: 1 } },
          { name: t("settings.imageScale.name"), desc: t("settings.imageScale.desc"),
            control: { type: "number", key: "imageScale", min: 1, step: "any" } },
          { name: t("settings.exportFolder.name"), desc: t("settings.exportFolder.desc"),
            control: { type: "text", key: "exportFolder", placeholder: DEFAULT_SETTINGS.exportFolder } },
          { name: t("settings.themesFolder.name"), desc: t("settings.themesFolder.desc"),
            control: { type: "text", key: "themesFolder", placeholder: DEFAULT_SETTINGS.themesFolder } },
          { name: t("settings.openFolder.name"), desc: t("settings.openFolder.desc"),
            render: (setting) => {
              setting.addButton((b) => b.setButtonText(t("settings.openFolder.button"))
                .onClick(() => revealFolder(this.app, this.plugin.settings.themesFolder)));
            } },
          { name: t("settings.exportTheme.name"), desc: t("settings.exportTheme.desc"),
            render: (setting) => this.renderExportTheme(setting) },
          { name: t("settings.hideFolder.name"), desc: t("settings.hideFolder.desc"),
            control: { type: "toggle", key: "hideThemesFolder" } },
          { name: t("settings.customCss.name"), desc: t("settings.customCss.desc"),
            control: { type: "textarea", key: "customCss" } },
        ],
      },
      {
        type: "group",
        heading: t("deck.settings.heading"),
        items: [
          { name: t("deck.settings.endpoints.name"), desc: t("deck.settings.endpoints.desc"),
            render: (setting) => this.renderEndpoints(setting) },
          { name: t("deck.settings.model.name"), desc: t("deck.settings.model.desc"),
            render: (setting) => this.renderModel(setting) },
          { name: t("deck.settings.maxTokens.name"), desc: t("deck.settings.maxTokens.desc"),
            control: { type: "number", key: "llmMaxTokens", min: 256 } },
          { name: t("deck.settings.temperature.name"), desc: t("deck.settings.temperature.desc"),
            control: { type: "number", key: "llmTemperature", min: 0, step: "any" } },
          { name: t("deck.settings.suppressThinking.name"), desc: t("deck.settings.suppressThinking.desc"),
            render: (setting) => this.renderThinking(setting) },
        ],
      },
    ];
  }

  /** Thin wrapper around the kit walker's settingBodyHost(): the §8 blocks draw several
   *  Setting rows, but the walker hands us exactly one — settingBodyHost() strips Obsidian's
   *  "setting-item" flex-row class so nested rows stack instead of becoming flex children.
   *  `sd-settings-host` (styles.css) is this repo's own addition on top: it carries the
   *  vertical rhythm (border-top + padding) a top-level setting-item row would otherwise have
   *  contributed, so spacing to neighboring settings in the tab is preserved. Kept local
   *  rather than folded into the kit call sites because the class is repo-specific CSS, not
   *  part of the shared walker contract. */
  private hostFor(setting: Setting): HTMLElement {
    const host = settingBodyHost(setting);
    host.addClass("sd-settings-host");
    return host;
  }

  /** Model lists per endpoint, shared by every row of the kit's endpoint editor. Owned by the
   *  TAB, not by a render pass: it deliberately outlives the rebuilds a row edit triggers, so
   *  three rows do not each fire their own `/v1/models`. Cleared in `hide()` — see there. */
  private readonly modelCache = createModelListCache();

  /** URL of the endpoint the resolver currently picks, or `null` while unresolved. The kit asks
   *  for this SYNCHRONOUSLY (per row, to label it "in use" vs "reachable, position N") while the
   *  answer is a network question — so it is resolved once per render into this field and read
   *  from here. */
  private activeUrl: string | null = null;

  private renderEndpoints(setting: Setting): void {
    buildEndpointList({
      containerEl: this.hostFor(setting),
      label: t("deck.settings.endpoints.name"),
      desc: t("deck.settings.endpoints.desc"),
      placeholder: ENDPOINT_PRESETS[0].url,
      strings: endpointListStrings(),
      cache: this.modelCache,
      get: () => this.plugin.settings.llmEndpoints,
      // Synchronous in-memory mutation; the kit calls save() right after and awaits both.
      set: (eps) => { this.plugin.settings.llmEndpoints = eps; },
      active: () => this.activeUrl,
      // ONE client per row carries both the reachability probe and the model list, so the
      // status icon and the model dropdown can never describe different endpoints.
      clientFor: (cfg) => makeDeckLlmClient(cfg, ""),
      globalModel: () => this.plugin.settings.llmModel,
      save: () => this.plugin.saveSettings(),
      reconnect: () => this.syncActiveUrl().then(() => undefined),
      rerender: () => this.refreshUi(),
    });
    // First resolve of this render pass. Re-renders only when the answer actually changed,
    // which terminates: the follow-up pass resolves the same value and stops there.
    void this.syncActiveUrl().then((changed) => { if (changed) this.refreshUi(); });
  }

  /** Resolve who is in use and report whether that changed. */
  private async syncActiveUrl(): Promise<boolean> {
    const before = this.activeUrl;
    this.activeUrl = (await this.activeEndpoint())?.url ?? null;
    return this.activeUrl !== before;
  }

  private renderModel(setting: Setting): void {
    renderModelField(this.hostFor(setting), {
      getModel: () => this.plugin.settings.llmModel,
      setModel: async (m) => { this.plugin.settings.llmModel = m.trim(); await this.plugin.saveSettings(); },
      listModels: async () => {
        const ep = await this.activeEndpoint();
        return ep ? makeDeckLlmClient(ep, "").listModels() : [];
      },
      modelContext: async (m) => {
        const ep = await this.activeEndpoint();
        return ep ? makeDeckLlmClient(ep, m).modelContext(m) : null;
      },
    });
  }

  private renderThinking(setting: Setting): void {
    renderThinkingRow(this.hostFor(setting), {
      getModel: () => this.plugin.settings.llmModel,
      getSuppress: () => this.plugin.settings.llmSuppressThinking,
      setSuppress: async (v) => { this.plugin.settings.llmSuppressThinking = v; await this.plugin.saveSettings(); },
      testSuppress: (model) => this.runSuppressTest(model),
      rerender: () => this.refreshUi(),
    });
  }

  private async activeEndpoint(): Promise<EndpointConfig | null> {
    return resolveActiveEndpointConfig(this.plugin.settings.llmEndpoints, (ep) => makeDeckLlmClient(ep, "").ping());
  }

  /** One real, minimal call with suppression on: did the model think anyway?
   *  This is the only place that replaces the gpt-oss/harmony name heuristic with evidence. */
  private async runSuppressTest(model: string): Promise<{ thought: boolean }> {
    const ep = await this.activeEndpoint();
    if (!ep) throw new Error(t("deck.modal.noEndpoint"));
    const client = makeDeckLlmClient(ep, model);
    const r = await client.generate(
      [{ role: "user", content: "Reply with the single word: ok" }],
      { model, temperature: 0, maxTokens: 32, suppressThinking: true },
      () => {}, () => {},
    );
    return { thought: reasoningHappened(r.content, r.reasoning) };
  }

  /** Imperative fallback for Obsidian < 1.13 (which does not call getSettingDefinitions).
   *  On ≥ 1.13 the framework renders declaratively and this is never called; it just
   *  delegates to the walker so there is a single source of truth. */
  display(): void { this.renderImperative(); }

  /** Obsidian calls this when the tab closes. Clearing the model cache is a REQUIREMENT, not
   *  housekeeping: it holds promises and deliberately survives tab rebuilds, so without this a
   *  server that was down when first probed stays "not reachable" for the rest of the session —
   *  starting LM Studio and reopening the settings would change nothing. */
  hide(): void {
    this.modelCache.clear();
    super.hide();
  }

  private cleanupPrevious: () => void = () => {};

  private renderImperative(): void {
    this.cleanupPrevious();
    const { containerEl } = this;
    containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(
      containerEl,
      this.getSettingDefinitions(),
      this,
      this.app,
    );
  }

  /** Read the current value for a bound control key. Called on every render. */
  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    switch (key) {
      // Coerce an unknown persisted default to "shiro" so the dropdown shows a valid option.
      case "defaultTheme": {
        const map = this.plugin.themeStore.getMap();
        if (map.has(s.defaultTheme)) return s.defaultTheme;
        const alias = THEME_ALIASES[s.defaultTheme];
        return alias && map.has(alias) ? alias : "shiro";
      }
      case "minFontPx": return s.minFontPx;
      case "imageScale": return s.imageScale;
      case "exportFolder": return s.exportFolder;
      case "themesFolder": return s.themesFolder;
      case "hideThemesFolder": return s.hideThemesFolder;
      case "customCss": return s.customCss;
      case "llmModel": return s.llmModel;
      case "llmMaxTokens": return s.llmMaxTokens;
      case "llmTemperature": return s.llmTemperature;
      case "llmSuppressThinking": return s.llmSuppressThinking;
      default: return undefined;
    }
  }

  /** Persist a changed control value (+ run the key's side effects), then save. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    switch (key) {
      case "defaultTheme": s.defaultTheme = String(value); break;
      case "minFontPx": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.minFontPx = n; break; }
      case "imageScale": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.imageScale = n; break; }
      case "exportFolder": s.exportFolder = String(value).trim() || DEFAULT_SETTINGS.exportFolder; break;
      case "customCss": s.customCss = String(value); break;
      case "llmModel": s.llmModel = String(value).trim(); break;
      case "llmMaxTokens": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.llmMaxTokens = Math.floor(n); break; }
      case "llmTemperature": { const n = Number(value); if (Number.isFinite(n) && n >= 0) s.llmTemperature = n; break; }
      case "llmSuppressThinking": s.llmSuppressThinking = Boolean(value); break;
      case "themesFolder":
        s.themesFolder = String(value).trim() || DEFAULT_SETTINGS.themesFolder;
        await this.plugin.saveSettings();
        await this.plugin.refreshThemes();
        this.plugin.applyFolderHide();
        return;
      case "hideThemesFolder":
        s.hideThemesFolder = Boolean(value);
        await this.plugin.saveSettings();
        this.plugin.applyFolderHide();
        return;
      default: return;
    }
    await this.plugin.saveSettings();
  }

  /** Available-themes reference — the live list of valid frontmatter `theme:` values. */
  private renderThemeChips(setting: Setting): void {
    const chips = setting.controlEl.createDiv({ cls: "sd-theme-chips" });
    for (const e of this.plugin.themeStore.getThemes()) {
      const tag = e.source === "user" ? t("settings.userTag") : t("settings.builtinTag");
      const label = /\s/.test(e.key) ? `"${e.key}"` : e.key;
      const chip = chips.createSpan({ cls: "sd-theme-chip", text: `${label} (${tag})` });
      chip.addEventListener("click", () => void navigator.clipboard?.writeText(e.key));
    }
  }

  /** Export any theme as an editable `.css` starting point (dropdown picks which). */
  private renderExportTheme(setting: Setting): void {
    const themes = this.plugin.themeStore.getThemes();
    let exportPick = themes[0]?.key ?? "default";
    setting.addDropdown((c) => { for (const e of themes) c.addOption(e.key, e.label ?? e.key); c.setValue(exportPick).onChange((v) => { exportPick = v; }); });
    setting.addButton((b) => b.setButtonText(t("settings.exportTheme.button")).onClick(async () => {
      const entry = this.plugin.themeStore.resolve(exportPick);
      const path = await writeThemeCss(this.app.vault.adapter, this.plugin.settings.themesFolder, entry.key, entry.themeCss);
      new Notice(t("notice.themeExported", path));
      await this.plugin.refreshThemes();
      this.refreshUi(); // a new theme file may have appeared → re-render definitions (dropdown + chips)
    }));
  }

  /** Re-render the tab. On ≥ 1.13 the declarative framework exposes update(); on the < 1.13
   *  fallback that method does not exist, so re-run our imperative display() instead. */
  private refreshUi(): void {
    refreshSettingsTab(this, () => this.renderImperative());
  }
}
