// Render layer for the AI settings blocks (UI-STANDARD §8): this file only draws. Shared by the settings tab and the
// generate-deck view so both speak the same icon vocabulary.
import { Notice, Setting, setIcon } from "obsidian";
import { t } from "./i18n";
import type { EndpointStatusKind } from "./vendor/kit/endpoint_diagnostics";

/** Status icon per UI-STANDARD §8: shape AND colour AND state class AND aria-label — colour is
 *  never the only carrier (WCAG 1.4.1). `null` kind = not probed yet. */
export function paintStatus(el: HTMLElement, kind: EndpointStatusKind | null, label: string): void {
  el.empty();
  el.removeClasses(["is-ok", "is-error", "is-checking", "is-active"]);
  if (kind === null) { el.addClass("is-checking"); setIcon(el, "loader"); }
  else if (kind === "ok") { el.addClass("is-ok"); setIcon(el, "circle-check"); }
  else { el.addClass("is-error"); setIcon(el, "circle-x"); }
  el.setAttribute("aria-label", label);
  el.setAttribute("title", label);
}

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
