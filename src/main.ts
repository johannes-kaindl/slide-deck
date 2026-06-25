import { Plugin, getLanguage } from "obsidian";
import { exportPdf, exportImages } from "./export";
import { SlideDeckView, VIEW_TYPE } from "./preview-view";
import { t, pickLang, setLang } from "./i18n";
import { DEFAULT_SETTINGS, SlideDeckSettings, SlideDeckSettingTab } from "./settings";

export default class SlideDeckPlugin extends Plugin {
  declare public settings: SlideDeckSettings;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<SlideDeckSettings>);
    this.addSettingTab(new SlideDeckSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new SlideDeckView(leaf, this));
    this.addCommand({
      id: "open-preview",
      name: t("cmd.openPreview"),
      callback: () => void this.activatePreview(),
    });
    this.addCommand({
      id: "export-pdf",
      name: t("cmd.exportPdf"),
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }),
    });
    this.addCommand({
      id: "export-images",
      name: t("cmd.exportImages"),
      callback: () => void exportImages(this.app, activeDocument, activeWindow, { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.imageScale),
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activatePreview(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    void workspace.revealLeaf(leaf);
  }
}
