import { App, PluginSettingTab, Setting } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";

export interface SlideDeckSettings { defaultTheme: string; minFontPx: number; imageScale: number; }
export const DEFAULT_SETTINGS: SlideDeckSettings = { defaultTheme: "default", minFontPx: 24, imageScale: 2 };

export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.heading")).setHeading();
    new Setting(containerEl).setName(t("settings.theme.name")).setDesc(t("settings.theme.desc"))
      .addText((c) => c.setValue(this.plugin.settings.defaultTheme).onChange(async (v) => { this.plugin.settings.defaultTheme = v.trim() || "default"; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t("settings.minFont.name")).setDesc(t("settings.minFont.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.minFontPx)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.minFontPx = n; await this.plugin.saveSettings(); } }));
    new Setting(containerEl).setName(t("settings.imageScale.name")).setDesc(t("settings.imageScale.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.imageScale)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.imageScale = n; await this.plugin.saveSettings(); } }));
  }
}
