import { Plugin } from "obsidian";
import { runSpike } from "./spike-export";
import { SlideDeckView, VIEW_TYPE } from "./preview-view";
import { t } from "./i18n";

export default class SlideDeckPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, (leaf) => new SlideDeckView(leaf));
    // Folgetasks registrieren Commands, Settings, View hier.
    this.addCommand({
      id: "spike-export",
      name: "Spike: export demo deck",
      callback: () => { void runSpike(activeDocument, activeWindow); },
    });
    this.addCommand({
      id: "open-preview",
      name: t("cmd.openPreview"),
      callback: () => void this.activatePreview(),
    });
  }

  private async activatePreview(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getRightLeaf(false)!;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    void workspace.revealLeaf(leaf);
  }
}
