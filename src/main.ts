import { Plugin, getLanguage, TFile, TAbstractFile } from "obsidian";
import { exportPdf, exportImages } from "./export";
import { SlideDeckView, VIEW_TYPE } from "./preview-view";
import { t, pickLang, setLang } from "./i18n";
import { DEFAULT_SETTINGS, SlideDeckSettings, SlideDeckSettingTab } from "./settings";
import { ThemeStore } from "./theme-registry";
import { buildHideCss, normalizeFolder } from "./core/folder-hide";

export default class SlideDeckPlugin extends Plugin {
  declare public settings: SlideDeckSettings;
  public themeStore!: ThemeStore;
  private hideSheet: CSSStyleSheet | null = null;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<SlideDeckSettings>);

    this.themeStore = new ThemeStore(this.app, () => this.settings.themesFolder);
    await this.themeStore.refresh();
    this.applyFolderHide();

    this.addSettingTab(new SlideDeckSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new SlideDeckView(leaf, this));

    this.addCommand({ id: "open-preview", name: t("cmd.openPreview"), callback: () => void this.activatePreview() });
    this.addCommand({
      id: "export-pdf", name: t("cmd.exportPdf"),
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.customCss),
    });
    this.addCommand({
      id: "export-images", name: t("cmd.exportImages"),
      callback: () => void exportImages(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.imageScale, this.settings.customCss, this.settings.exportFolder),
    });

    // Refresh the registry when a .css under the themes folder is added/removed/renamed.
    const underThemes = (path: string) => normalizeFolder(path).startsWith(normalizeFolder(this.settings.themesFolder) + "/") && path.toLowerCase().endsWith(".css");
    const onVault = (f: TAbstractFile) => { if (underThemes(f.path)) void this.refreshThemes(); };
    this.registerEvent(this.app.vault.on("create", (f) => { if (f instanceof TFile) onVault(f); }));
    this.registerEvent(this.app.vault.on("delete", (f) => { if (f instanceof TFile) onVault(f); }));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { if (f instanceof TFile) onVault(f); if (underThemes(oldPath)) void this.refreshThemes(); }));
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Re-scan the themes folder, then refresh any open preview so the dropdown reflects it. */
  async refreshThemes(): Promise<void> {
    await this.themeStore.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SlideDeckView) void leaf.view.refresh();
    }
  }

  /** Apply (or clear) the explorer-hide stylesheet for the themes folder. */
  applyFolderHide(): void {
    if (!this.hideSheet) { this.hideSheet = new CSSStyleSheet(); activeDocument.adoptedStyleSheets = [...activeDocument.adoptedStyleSheets, this.hideSheet]; }
    this.hideSheet.replaceSync(buildHideCss(this.settings.themesFolder, this.settings.hideThemesFolder));
  }

  onunload(): void {
    if (this.hideSheet) activeDocument.adoptedStyleSheets = activeDocument.adoptedStyleSheets.filter((s) => s !== this.hideSheet);
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
