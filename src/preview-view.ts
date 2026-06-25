import { ItemView, WorkspaceLeaf, MarkdownView, debounce } from "obsidian";
import { loadActiveDeck } from "./adapter";
import { renderDeckToContainer } from "./render-dom";
import { activeDoc } from "./dom-safe";
import { t } from "./i18n";

export const VIEW_TYPE = "slide-deck-preview";

export class SlideDeckView extends ItemView {
  private warnEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private rerender = debounce(() => void this.refresh(), 300, true);

  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Slide deck"; }
  getIcon(): string { return "presentation"; }

  async onOpen(): Promise<void> {
    this.warnEl = this.contentEl.createDiv({ cls: "sd-warnings" });
    this.deckEl = this.contentEl.createDiv({ cls: "sd-deck" });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.rerender()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.rerender()));
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const loaded = await loadActiveDeck(this.app);
    this.warnEl.empty();
    this.deckEl.empty();
    if (!loaded || loaded.deck.slides.length === 0) { this.deckEl.createDiv({ text: t("preview.empty") }); return; }
    const warnings = await renderDeckToContainer(activeDoc(), this.deckEl, loaded.deck, loaded.resolveEmbed);
    for (const w of warnings) {
      const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
      if (w.sourceLine !== undefined) row.addEventListener("click", () => this.jumpTo(w.sourceLine!));
    }
  }

  private jumpTo(line: number): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    view?.editor.setCursor({ line, ch: 0 });
  }

  async onClose(): Promise<void> { this.warnEl?.empty(); this.deckEl?.empty(); }
}
