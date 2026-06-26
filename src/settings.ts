import { App, PluginSettingTab, Setting } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { PRESETS } from "./core/presets";

export interface SlideDeckSettings { defaultTheme: string; minFontPx: number; imageScale: number; customCss: string; exportFolder: string; }
export const DEFAULT_SETTINGS: SlideDeckSettings = { defaultTheme: "default", minFontPx: 24, imageScale: 2, customCss: "", exportFolder: "Slide-Deck-Export" };

export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.heading")).setHeading();

    // Coerce an unknown persisted theme to "default" so the dropdown always has a valid value.
    if (!(this.plugin.settings.defaultTheme in PRESETS)) this.plugin.settings.defaultTheme = "default";

    new Setting(containerEl).setName(t("settings.theme.name")).setDesc(t("settings.theme.desc"))
      .addDropdown((c) => {
        for (const p of Object.values(PRESETS)) c.addOption(p.id, p.label);
        c.setValue(this.plugin.settings.defaultTheme)
          .onChange(async (v) => { this.plugin.settings.defaultTheme = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl).setName(t("settings.minFont.name")).setDesc(t("settings.minFont.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.minFontPx)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.minFontPx = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.imageScale.name")).setDesc(t("settings.imageScale.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.imageScale)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.imageScale = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.exportFolder.name")).setDesc(t("settings.exportFolder.desc"))
      .addText((c) => c.setValue(this.plugin.settings.exportFolder).onChange(async (v) => { this.plugin.settings.exportFolder = v.trim() || "Slide-Deck-Export"; await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName(t("settings.customCss.name")).setDesc(t("settings.customCss.desc"))
      .addTextArea((c) => c.setValue(this.plugin.settings.customCss).onChange(async (v) => { this.plugin.settings.customCss = v; await this.plugin.saveSettings(); }));
  }
}
