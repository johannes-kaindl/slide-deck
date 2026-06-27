import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { revealFolder, writeThemeCss } from "./theme-source";

export interface SlideDeckSettings {
  defaultTheme: string;
  minFontPx: number;
  imageScale: number;
  customCss: string;
  exportFolder: string;
  themesFolder: string;
  hideThemesFolder: boolean;
}
export const DEFAULT_SETTINGS: SlideDeckSettings = {
  defaultTheme: "default", minFontPx: 24, imageScale: 2, customCss: "",
  exportFolder: "Slide-Deck-Export", themesFolder: "Slide-Deck-Themes", hideThemesFolder: true,
};

export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.heading")).setHeading();

    const themes = this.plugin.themeStore.getThemes();
    // Coerce an unknown persisted default to "default" so the dropdown always has a valid value.
    if (!this.plugin.themeStore.getMap().has(this.plugin.settings.defaultTheme)) this.plugin.settings.defaultTheme = "default";

    new Setting(containerEl).setName(t("settings.theme.name")).setDesc(t("settings.theme.desc"))
      .addDropdown((c) => {
        for (const e of themes) c.addOption(e.key, e.key);
        c.setValue(this.plugin.settings.defaultTheme)
          .onChange(async (v) => { this.plugin.settings.defaultTheme = v; await this.plugin.saveSettings(); });
      });

    // Available themes reference — the live list of valid frontmatter theme: values.
    const ref = new Setting(containerEl).setName(t("settings.availableThemes.name")).setDesc(t("settings.availableThemes.desc"));
    const chips = ref.controlEl.createDiv({ cls: "sd-theme-chips" });
    for (const e of themes) {
      const tag = e.source === "user" ? t("settings.userTag") : t("settings.builtinTag");
      const label = /\s/.test(e.key) ? `"${e.key}"` : e.key;
      const chip = chips.createSpan({ cls: "sd-theme-chip", text: `${label} (${tag})` });
      chip.addEventListener("click", () => void navigator.clipboard?.writeText(e.key));
    }

    new Setting(containerEl).setName(t("settings.minFont.name")).setDesc(t("settings.minFont.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.minFontPx)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.minFontPx = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.imageScale.name")).setDesc(t("settings.imageScale.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.imageScale)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.imageScale = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.exportFolder.name")).setDesc(t("settings.exportFolder.desc"))
      .addText((c) => c.setValue(this.plugin.settings.exportFolder).onChange(async (v) => { this.plugin.settings.exportFolder = v.trim() || "Slide-Deck-Export"; await this.plugin.saveSettings(); }));

    // Themes folder path
    new Setting(containerEl).setName(t("settings.themesFolder.name")).setDesc(t("settings.themesFolder.desc"))
      .addText((c) => c.setValue(this.plugin.settings.themesFolder).onChange(async (v) => {
        this.plugin.settings.themesFolder = v.trim() || "Slide-Deck-Themes";
        await this.plugin.saveSettings();
        await this.plugin.refreshThemes();
        this.plugin.applyFolderHide();
      }));

    // Open in Finder
    new Setting(containerEl).setName(t("settings.openFolder.name")).setDesc(t("settings.openFolder.desc"))
      .addButton((b) => b.setButtonText(t("settings.openFolder.button")).onClick(() => revealFolder(this.app, this.plugin.settings.themesFolder)));

    // Export a theme as .css
    let exportPick = themes[0]?.key ?? "default";
    new Setting(containerEl).setName(t("settings.exportTheme.name")).setDesc(t("settings.exportTheme.desc"))
      .addDropdown((c) => { for (const e of themes) c.addOption(e.key, e.key); c.setValue(exportPick).onChange((v) => { exportPick = v; }); })
      .addButton((b) => b.setButtonText(t("settings.exportTheme.button")).onClick(async () => {
        const entry = this.plugin.themeStore.resolve(exportPick);
        const path = await writeThemeCss(this.app.vault.adapter, this.plugin.settings.themesFolder, entry.key, entry.themeCss);
        new Notice(t("notice.themeExported", path));
        await this.plugin.refreshThemes();
        this.display();
      }));

    // Hide themes folder
    new Setting(containerEl).setName(t("settings.hideFolder.name")).setDesc(t("settings.hideFolder.desc"))
      .addToggle((c) => c.setValue(this.plugin.settings.hideThemesFolder).onChange(async (v) => {
        this.plugin.settings.hideThemesFolder = v; await this.plugin.saveSettings(); this.plugin.applyFolderHide();
      }));

    new Setting(containerEl).setName(t("settings.customCss.name")).setDesc(t("settings.customCss.desc"))
      .addTextArea((c) => c.setValue(this.plugin.settings.customCss).onChange(async (v) => { this.plugin.settings.customCss = v; await this.plugin.saveSettings(); }));
  }
}
