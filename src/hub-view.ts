import { ItemView, WorkspaceLeaf } from "obsidian";
import { buildHubInto, type HubController, type HubPanel } from "./vendor/kit-obsidian/hub";
import { PreviewPanel } from "./preview-view";
import { GeneratePanel } from "./generate-deck-view";
import { t } from "./i18n";
import type SlideDeckPlugin from "./main";

export const VIEW_TYPE_HUB = "slide-deck-hub";
export type HubTabId = "preview" | "generate";

/** Sidebar-Hub der beiden bisherigen Einzel-Views (Vorschau, Erzeugen) — UI-STANDARD §8,
 *  Kit-Baustein `buildHubInto` (`obsidian-kit`@0.35.0 `src/obsidian/hub.ts`). Ersetzt die
 *  zwei getrennten Leaves `slide-deck-preview`/`slide-deck-generate`: „alle Funktionen mit
 *  Tabs in einer Sidebar zusammenfuehren, wie bei den anderen Plugins" (Johannes). */
export class SlideDeckHubView extends ItemView {
  private hub: HubController<HubTabId> | null = null;
  private previewPanel!: PreviewPanel;

  constructor(leaf: WorkspaceLeaf, private plugin: SlideDeckPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE_HUB; }
  getDisplayText(): string { return t("hub.title"); }
  getIcon(): string { return "presentation"; }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("sd-hub-view");
    this.previewPanel = new PreviewPanel(this.plugin);
    const panels: HubPanel<HubTabId>[] = [this.previewPanel, new GeneratePanel(this.plugin)];
    this.hub = buildHubInto(this.contentEl, panels, "preview");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.hub?.notifyFileOpen(this.app.workspace.getActiveFile()?.path ?? null);
    }));
  }

  setTab(id: HubTabId): void { this.hub?.setTab(id); }

  /** Direkter Zugriff auf das Vorschau-Panel, UNABHAENGIG vom aktiven Tab — main.refreshThemes()
   *  und refreshActivePreview() aktualisierten frueher die separate Vorschau-View immer, egal
   *  welcher Obsidian-Tab gerade fokussiert war; dieselbe Zusage gilt jetzt fuer den Tab-Zustand
   *  des Hubs. `refresh()` bleibt zusaetzlich als Alias fuer GUI-Smoke/Alt-Aufrufer, die
   *  `leaf.view.refresh()` auf der ehemaligen Vorschau-View erwarten. */
  async refreshPreview(): Promise<void> { await this.previewPanel.refresh(); }
  async refresh(): Promise<void> { await this.refreshPreview(); }

  async onClose(): Promise<void> {
    this.hub?.destroy();
    this.hub = null;
    this.contentEl.empty();
  }
}
