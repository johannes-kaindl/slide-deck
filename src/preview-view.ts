import { ItemView, WorkspaceLeaf, MarkdownView, setIcon, type TFile } from "obsidian";
import { loadDeck } from "./adapter";
import { buildIsolatedDeck } from "./render-dom";
import { createIsolatedDeckIframe, type IsolatedIframe } from "./iframe-host";
import { PREVIEW_CHROME_CSS } from "./chrome-css";
import { exportPdf, exportImages } from "./export";
import { activeDoc, activeWin } from "./dom-safe";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";
import type SlideDeckPlugin from "./main";

export const VIEW_TYPE = "slide-deck-preview";

export class SlideDeckView extends ItemView {
  private warnEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private deckHost!: HTMLElement;        // the in-pane container that holds the iframe
  private messageEl!: HTMLElement;
  private fileLabel!: HTMLElement;
  private previewFrame?: IsolatedIframe; // current deck iframe (disposed on refresh/close)
  private resizeObs?: ResizeObserver;
  private currentFile: TFile | null = null;
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

  private buildToolbar(): void {
    const bar = this.contentEl.createDiv({ cls: "sd-toolbar" });
    const defaults = () => ({ theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
    const mkBtn = (icon: string, label: string, onClick: () => void): void => {
      const b = bar.createEl("button", { cls: "sd-toolbar-btn" });
      setIcon(b.createSpan({ cls: "sd-toolbar-icon" }), icon);
      b.createSpan({ text: label });
      b.addEventListener("click", onClick);
    };
    mkBtn("refresh-cw", t("toolbar.refresh"), () => void this.refresh());
    // Export the file the preview currently SHOWS (this.currentFile), not the active file —
    // so the buttons never silently export a different note than what's on screen.
    mkBtn("file-text", t("toolbar.exportPdf"), () => void exportPdf(this.app, activeDoc(), activeWin(), this.currentFile, defaults(), this.plugin.settings.customCss));
    mkBtn("image", t("toolbar.exportImages"), () => void exportImages(this.app, activeDoc(), activeWin(), this.currentFile, defaults(), this.plugin.settings.imageScale, this.plugin.settings.customCss, this.plugin.settings.exportFolder));
    this.fileLabel = bar.createSpan({ cls: "sd-toolbar-file" });
  }

  /** Manual only — captures the active Markdown note, renders it, and binds the export
   *  buttons to THAT file so export always matches what the preview shows. */
  async refresh(): Promise<void> {
    try {
      const active = this.app.workspace.getActiveFile();
      this.currentFile = active && active.extension === "md" ? active : null;
      this.fileLabel.setText(this.currentFile ? this.currentFile.basename : "");
      const loaded = await loadDeck(this.app, this.currentFile, { theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
      this.warnEl.empty();
      this.messageEl.empty();
      this.messageEl.removeClass("sd-error");
      this.disposeFrame();
      if (!loaded) { this.messageEl.setText(t("preview.hint")); return; }
      if (loaded.deck.slides.length === 0) { this.messageEl.setText(t("preview.empty")); return; }
      this.geoWidth = geometryFor(loaded.deck.directives.aspect).width;
      const { slidesHtml, css, warnings } = await buildIsolatedDeck(activeDoc(), loaded.deck, loaded.resolveEmbed, this.plugin.settings.customCss);
      const bodyHtml = `<div class="sd-deck-inner">${slidesHtml.join("")}</div>`;
      this.previewFrame = await createIsolatedDeckIframe(this.deckHost.ownerDocument, { css, extraCss: PREVIEW_CHROME_CSS, bodyHtml, width: this.geoWidth, mount: this.deckHost });
      this.previewFrame.iframe.addClass("sd-deck-iframe");
      // Size the iframe to its content (parent .sd-deck scrolls; zoom scales the element).
      // The iframe was created INSIDE deckHost (parked offscreen during load) — we must not
      // re-parent it, since moving an iframe reloads it and blanks the srcdoc.
      const ch = this.previewFrame.contentDoc.documentElement.scrollHeight;
      this.previewFrame.iframe.style.height = `${ch}px`;
      this.fitToWidth();
      this.previewFrame.reveal();
      for (const w of warnings) {
        const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
        if (w.sourceLine !== undefined) row.addEventListener("click", () => this.jumpTo(w.sourceLine!));
      }
    } catch (e) {
      this.disposeFrame();
      this.messageEl.empty();
      this.messageEl.addClass("sd-error");
      this.messageEl.setText(t("preview.error", String(e)));
    }
  }

  private disposeFrame(): void {
    this.previewFrame?.dispose();
    this.previewFrame = undefined;
  }

  /** Scale the native 1280-wide slides down to the preview pane width. Chromium's `zoom`
   *  reflows layout (unlike transform), so the vertical scrollbar stays correct. */
  private fitToWidth(): void {
    const frame = this.previewFrame?.iframe;
    if (!frame) return;
    const avail = this.deckEl.clientWidth - 16;
    if (avail <= 0) return;
    const factor = Math.min(1, avail / this.geoWidth);
    frame.style.setProperty("zoom", String(factor));
  }

  /** Reveal the previewed note's editor and move the cursor to the slide's source line. */
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
