// Render layer for the AI settings blocks (UI-STANDARD §8): this file only draws. The status line is the kit's
// status indicator (`buildStatus` / `paintStatus`), used directly by the generate-deck view.
import { Notice, Setting } from "obsidian";
import { t } from "./i18n";

export interface ThinkingTestDeps {
  getModel: () => string | Promise<string>;
  testSuppress: (model: string) => Promise<{ thought: boolean }>;
}

/** "Thinking test": one real, minimal call with thinking off. The Thinking LEVEL itself lives in the
 *  "Request" section; this button is what turns a name guess ("does this model think anyway?") into
 *  a fact. Never runs on its own: it costs a real LLM call. */
export function renderThinkingTestRow(containerEl: HTMLElement, deps: ThinkingTestDeps): void {
  // hostFor() blanks settingEl before this block draws, so the block must restate its own
  // name and description (Finding 2 of the earlier thinking row).
  const setting = new Setting(containerEl)
    .setName(t("deck.settings.thinkingTest.name"))
    .setDesc(t("deck.settings.thinkingTest.desc"));
  setting.addButton((b) => b
    .setButtonText(t("deck.settings.thinking.test"))
    .onClick(async () => {
      const model = await deps.getModel();
      if (!model) { new Notice(t("deck.settings.thinking.testNoModel")); return; }
      b.setButtonText(t("deck.settings.thinking.testing")).setDisabled(true);
      try {
        const { thought } = await deps.testSuppress(model);
        new Notice(thought ? t("deck.settings.thinking.testFail") : t("deck.settings.thinking.testOk"));
      } catch (e) {
        new Notice(t("deck.settings.thinking.testError", (e as Error)?.message ?? String(e)));
      } finally {
        b.setButtonText(t("deck.settings.thinking.test")).setDisabled(false);
      }
    }));
}
