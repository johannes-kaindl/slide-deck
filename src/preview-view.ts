import { ItemView, WorkspaceLeaf, MarkdownView, Notice, setIcon, type TFile } from "obsidian";
import { loadDeck } from "./adapter";
import { buildIsolatedDeck } from "./render-dom";
import { createIsolatedDeckIframe, type IsolatedIframe } from "./iframe-host";
import { PREVIEW_CHROME_CSS } from "./chrome-css";
import { exportPdf, exportImages } from "./export";
import { setNoteTheme } from "./frontmatter-writer";
import { activeDoc, activeWin } from "./dom-safe";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";
import type { SlideDeck } from "./core/slide-model";
import type SlideDeckPlugin from "./main";

export const VIEW_TYPE = "slide-deck-preview";

export class SlideDeckView extends ItemView {
  private warnEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private deckHost!: HTMLElement;
  private messageEl!: HTMLElement;
  private fileLabel!: HTMLElement;
  private themeSelect!: HTMLSelectElement;
  private sourceLabel!: HTMLElement;
  private setBtn!: HTMLButtonElement;
  private previewFrame?: IsolatedIframe;
  private resizeObs?: ResizeObserver;
  private currentFile: TFile | null = null;
  private currentDeck: SlideDeck | null = null;
  private persistedTheme?: string;   // the note's own frontmatter theme (undefined = none)
  private ephemeralTheme?: string;   // live try-on; never written to disk
  private resolveEmbedFn: (r: string) => string | null = () => null;
  private geoWidth = 1280;

  constructor(leaf: WorkspaceLeaf, private plugin: SlideDeckPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Slide deck"; }
  getIcon(): string { return "presentation"; }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("sd-view");
    this.buildToolbar();
    this.warnEl = this.contentEl.createDiv({ cls: "sd-warnings" });
    this.deckEl = this.contentEl.createDiv({ cls: "sd-deck" });
    this.messageEl = this.deckEl.createDiv({ cls: "sd-message" });
    this.deckHost = this.deckEl.createDiv({ cls: "sd-deck-host" });
    this.resizeObs = new ResizeObserver(() => this.fitToWidth());
    this.resizeObs.observe(this.deckEl);
    await this.refresh();
  }

  private get effectiveTheme(): string { return this.ephemeralTheme ?? this.persistedTheme ?? this.plugin.settings.defaultTheme; }
  private get dirty(): boolean { return this.ephemeralTheme !== undefined && this.ephemeralTheme !== this.persistedTheme; }

  private buildToolbar(): void {
    const bar = this.contentEl.createDiv({ cls: "sd-toolbar" });
    const mkBtn = (icon: string, label: string, onClick: () => void): HTMLButtonElement => {
      const b = bar.createEl("button", { cls: "sd-toolbar-btn" });
      setIcon(b.createSpan({ cls: "sd-toolbar-icon" }), icon);
      b.createSpan({ text: label });
      b.addEventListener("click", onClick);
      return b;
    };
    mkBtn("refresh-cw", t("toolbar.refresh"), () => void this.refresh());

    // Theme switcher (ephemeral try-on)
    bar.createSpan({ cls: "sd-toolbar-themelabel", text: t("toolbar.theme") });
    this.themeSelect = bar.createEl("select", { cls: "sd-toolbar-theme" });
    this.themeSelect.addEventListener("change", () => { this.ephemeralTheme = this.themeSelect.value; void this.rerenderTheme(); });
    this.sourceLabel = bar.createSpan({ cls: "sd-toolbar-source" });
    this.setBtn = bar.createEl("button", { cls: "sd-toolbar-btn sd-toolbar-set", text: t("toolbar.setTheme") });
    this.setBtn.addEventListener("click", () => void this.commitTheme());

    const defaults = () => ({ theme: this.effectiveTheme, minFontPx: this.plugin.settings.minFontPx });
    mkBtn("file-text", t("toolbar.exportPdf"), () => void exportPdf(this.app, activeDoc(), activeWin(), this.currentFile, this.plugin.themeStore.getMap(), defaults(), this.plugin.settings.customCss, this.effectiveTheme));
    mkBtn("image", t("toolbar.exportImages"), () => void exportImages(this.app, activeDoc(), activeWin(), this.currentFile, this.plugin.themeStore.getMap(), defaults(), this.plugin.settings.imageScale, this.plugin.settings.customCss, this.plugin.settings.exportFolder, this.effectiveTheme));
    this.fileLabel = bar.createSpan({ cls: "sd-toolbar-file" });
  }

  /** Rebuild the theme dropdown options from the registry and select the effective theme. */
  private syncThemeControls(): void {
    this.themeSelect.empty();
    for (const e of this.plugin.themeStore.getThemes()) this.themeSelect.createEl("option", { value: e.key, text: e.key });
    this.themeSelect.value = this.effectiveTheme;
    this.sourceLabel.setText(this.dirty ? `● ${t("source.unsaved")}` : (this.persistedTheme ? t("source.frontmatter") : t("source.default")));
    this.sourceLabel.toggleClass("sd-source-dirty", this.dirty);
    this.setBtn.toggle(this.dirty && !!this.currentFile);
  }

  async refresh(): Promise<void> {
    try {
      const active = this.app.workspace.getActiveFile();
      this.currentFile = active && active.extension === "md" ? active : null;
      this.fileLabel.setText(this.currentFile ? this.currentFile.basename : "");
      this.ephemeralTheme = undefined; // a fresh load drops any try-on
      const loaded = await loadDeck(this.app, this.currentFile, { theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
      this.warnEl.empty();
      this.messageEl.empty();
      this.messageEl.removeClass("sd-error");
      this.disposeFrame();
      if (!loaded) { this.currentDeck = null; this.persistedTheme = undefined; this.syncThemeControls(); this.messageEl.setText(t("preview.hint")); return; }
      if (loaded.deck.slides.length === 0) { this.currentDeck = null; this.persistedTheme = loaded.frontmatterTheme; this.syncThemeControls(); this.messageEl.setText(t("preview.empty")); return; }
      this.currentDeck = loaded.deck;
      this.persistedTheme = loaded.frontmatterTheme;
      this.resolveEmbedFn = loaded.resolveEmbed;
      this.geoWidth = geometryFor(loaded.deck.directives.aspect).width;
      await this.renderCurrent();
    } catch (e) {
      this.disposeFrame();
      this.messageEl.empty();
      this.messageEl.addClass("sd-error");
      this.messageEl.setText(t("preview.error", String(e)));
    }
  }

  /** Re-render only because the theme try-on changed — reuse the loaded deck. */
  private async rerenderTheme(): Promise<void> {
    if (!this.currentDeck) { this.syncThemeControls(); return; }
    await this.renderCurrent();
  }

  /** Render currentDeck with the effective theme into a fresh iframe + sync toolbar state. */
  private async renderCurrent(): Promise<void> {
    if (!this.currentDeck) return;
    const deck: SlideDeck = { ...this.currentDeck, directives: { ...this.currentDeck.directives, theme: this.effectiveTheme } };
    this.warnEl.empty();
    this.disposeFrame();
    const { slidesHtml, css, warnings } = await buildIsolatedDeck(activeDoc(), deck, this.resolveEmbedFn, this.plugin.themeStore.getMap(), this.plugin.settings.customCss);
    const bodyHtml = `<div class="sd-deck-inner">${slidesHtml.join("")}</div>`;
    this.previewFrame = await createIsolatedDeckIframe(this.deckHost.ownerDocument, { css, extraCss: PREVIEW_CHROME_CSS, bodyHtml, width: this.geoWidth, mount: this.deckHost });
    this.previewFrame.iframe.addClass("sd-deck-iframe");
    const ch = this.previewFrame.contentDoc.documentElement.scrollHeight;
    this.previewFrame.iframe.style.height = `${ch}px`;
    this.fitToWidth();
    this.previewFrame.reveal();
    for (const w of warnings) {
      const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
      if (w.sourceLine !== undefined) row.addEventListener("click", () => this.jumpTo(w.sourceLine!));
    }
    this.syncThemeControls();
  }

  /** Write the effective theme into the note's frontmatter (explicit commit). */
  private async commitTheme(): Promise<void> {
    if (!this.currentFile) return;
    const key = this.effectiveTheme;
    await setNoteTheme(this.app, this.currentFile, key);
    this.persistedTheme = key;       // optimistic — metadataCache updates async
    this.ephemeralTheme = undefined;
    new Notice(t("notice.themeSet", key));
    this.syncThemeControls();
  }

  private disposeFrame(): void { this.previewFrame?.dispose(); this.previewFrame = undefined; }

  private fitToWidth(): void {
    const frame = this.previewFrame?.iframe;
    if (!frame) return;
    const avail = this.deckEl.clientWidth - 16;
    if (avail <= 0) return;
    frame.style.setProperty("zoom", String(Math.min(1, avail / this.geoWidth)));
  }

  private jumpTo(line: number): void {
    if (!this.currentFile) return;
    const path = this.currentFile.path;
    const leaf = this.app.workspace.getLeavesOfType("markdown").find((l) => l.view instanceof MarkdownView && l.view.file?.path === path);
    if (leaf && leaf.view instanceof MarkdownView) {
      void this.app.workspace.revealLeaf(leaf);
      leaf.view.editor.setCursor({ line, ch: 0 });
      leaf.view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    } else {
      void this.app.workspace.openLinkText(path, "", false);
    }
  }

  async onClose(): Promise<void> {
    this.resizeObs?.disconnect();
    this.disposeFrame();
    this.warnEl?.empty();
    this.messageEl?.empty();
  }
}
