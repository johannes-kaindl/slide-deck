import { ItemView, WorkspaceLeaf, MarkdownView, debounce } from "obsidian";
import { loadActiveDeck } from "./adapter";
import { renderDeckToContainer } from "./render-dom";
import { deckCss } from "./deck-css";
import { activeDoc } from "./dom-safe";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";
import type SlideDeckPlugin from "./main";

export const VIEW_TYPE = "slide-deck-preview";

export class SlideDeckView extends ItemView {
  private warnEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private deckInner!: HTMLElement;
  private styleEl?: HTMLStyleElement;
  private resizeObs?: ResizeObserver;
  private geoWidth = 1280;
  private rerender = debounce(() => void this.refresh(), 300, true);

  constructor(leaf: WorkspaceLeaf, private plugin: SlideDeckPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Slide deck"; }
  getIcon(): string { return "presentation"; }

  async onOpen(): Promise<void> {
    this.styleEl = this.contentEl.createEl("style");
    this.warnEl = this.contentEl.createDiv({ cls: "sd-warnings" });
    this.deckEl = this.contentEl.createDiv({ cls: "sd-deck" });
    this.deckInner = this.deckEl.createDiv({ cls: "sd-deck-inner" });
    this.resizeObs = new ResizeObserver(() => this.fitToWidth());
    this.resizeObs.observe(this.deckEl);
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.rerender()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.rerender()));
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const loaded = await loadActiveDeck(this.app, { theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
      this.warnEl.empty();
      this.deckInner.empty();
      if (!loaded || loaded.deck.slides.length === 0) { this.deckInner.createDiv({ text: t("preview.empty") }); return; }
      this.styleEl!.textContent = deckCss(loaded.deck.directives.theme);
      this.geoWidth = geometryFor(loaded.deck.directives.aspect).width;
      const warnings = await renderDeckToContainer(activeDoc(), this.deckInner, loaded.deck, loaded.resolveEmbed);
      this.fitToWidth();
      for (const w of warnings) {
        const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
        if (w.sourceLine !== undefined) row.addEventListener("click", () => this.jumpTo(w.sourceLine!));
      }
    } catch (e) {
      this.deckInner.empty();
      this.deckInner.createDiv({ cls: "sd-error", text: t("preview.error", String(e)) });
    }
  }

  /** Scale the native 1280-wide slides down to the preview pane width. Chromium's `zoom`
   *  reflows layout (unlike transform), so the vertical scrollbar stays correct. */
  private fitToWidth(): void {
    if (!this.deckInner) return;
    const avail = this.deckEl.clientWidth - 16;
    if (avail <= 0) return;
    const factor = Math.min(1, avail / this.geoWidth);
    this.deckInner.style.setProperty("zoom", String(factor));
  }

  private jumpTo(line: number): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    view?.editor.setCursor({ line, ch: 0 });
  }

  async onClose(): Promise<void> {
    this.resizeObs?.disconnect();
    this.styleEl?.remove();
    this.warnEl?.empty();
    this.deckInner?.empty();
  }
}
