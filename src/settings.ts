import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { revealFolder, writeThemeCss } from "./theme-source";
import { parseEndpointList } from "./core/llm/endpoint";

export interface SlideDeckSettings {
  defaultTheme: string;
  minFontPx: number;
  imageScale: number;
  customCss: string;
  exportFolder: string;
  themesFolder: string;
  hideThemesFolder: boolean;
  llmEndpoints: string[];
  llmModel: string;
  llmMaxTokens: number;
  llmTemperature: number;
  llmSuppressThinking: boolean;
}
export const DEFAULT_SETTINGS: SlideDeckSettings = {
  defaultTheme: "default", minFontPx: 24, imageScale: 2, customCss: "",
  exportFolder: "Slide-Deck-Export", themesFolder: "Slide-Deck-Themes", hideThemesFolder: true,
  llmEndpoints: ["http://localhost:1234"], llmModel: "", llmMaxTokens: 8192, llmTemperature: 0.3, llmSuppressThinking: true,
};

/** Declarative settings tab (Obsidian ≥ 1.13: getSettingDefinitions, not the deprecated
 *  imperative display()). Plain controls bind via key ↔ get/setControlValue; the two pieces
 *  that need bespoke UI (the theme-key chip list, the export dropdown+button) use render. */
export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const themes = this.plugin.themeStore.getThemes();
    const themeOptions = Object.fromEntries(themes.map((e) => [e.key, e.key]));
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
            control: { type: "textarea", key: "llmEndpoints", placeholder: DEFAULT_SETTINGS.llmEndpoints[0] } },
          { name: t("deck.settings.model.name"), desc: t("deck.settings.model.desc"),
            control: { type: "text", key: "llmModel", placeholder: "qwen3" } },
          { name: t("deck.settings.maxTokens.name"), desc: t("deck.settings.maxTokens.desc"),
            control: { type: "number", key: "llmMaxTokens", min: 256 } },
          { name: t("deck.settings.temperature.name"), desc: t("deck.settings.temperature.desc"),
            control: { type: "number", key: "llmTemperature", min: 0, step: "any" } },
          { name: t("deck.settings.suppressThinking.name"), desc: t("deck.settings.suppressThinking.desc"),
            control: { type: "toggle", key: "llmSuppressThinking" } },
        ],
      },
    ];
  }

  /** Read the current value for a bound control key. Called on every render. */
  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    switch (key) {
      // Coerce an unknown persisted default to "default" so the dropdown shows a valid option.
      case "defaultTheme": return this.plugin.themeStore.getMap().has(s.defaultTheme) ? s.defaultTheme : "default";
      case "minFontPx": return s.minFontPx;
      case "imageScale": return s.imageScale;
      case "exportFolder": return s.exportFolder;
      case "themesFolder": return s.themesFolder;
      case "hideThemesFolder": return s.hideThemesFolder;
      case "customCss": return s.customCss;
      case "llmEndpoints": return s.llmEndpoints.join("\n");
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
      case "llmEndpoints": s.llmEndpoints = parseEndpointList(String(value)); break;
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
    setting.addDropdown((c) => { for (const e of themes) c.addOption(e.key, e.key); c.setValue(exportPick).onChange((v) => { exportPick = v; }); });
    setting.addButton((b) => b.setButtonText(t("settings.exportTheme.button")).onClick(async () => {
      const entry = this.plugin.themeStore.resolve(exportPick);
      const path = await writeThemeCss(this.app.vault.adapter, this.plugin.settings.themesFolder, entry.key, entry.themeCss);
      new Notice(t("notice.themeExported", path));
      await this.plugin.refreshThemes();
      this.update(); // a new theme file may have appeared → re-render definitions (dropdown + chips)
    }));
  }
}
