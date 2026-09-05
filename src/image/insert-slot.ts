import { SuggestModal, type App, type Editor } from "obsidian";
import { t } from "../i18n";
import { IMAGE_FUNCTIONS, type ImageFunction } from "./functions";

export function slotSnippet(fn: ImageFunction): string {
  return "```slide-image\n" + `funktion: ${fn}\n` + "\n```\n";
}

/** Der einzige Ort, an dem die Taxonomie sich selbst erklärt — ohne ihn lernt sie niemand. */
export class ImageFunctionModal extends SuggestModal<ImageFunction> {
  constructor(app: App, private onPick: (fn: ImageFunction) => void) {
    super(app);
    this.setPlaceholder(t("cmd.insertImageSlot"));
  }

  getSuggestions(query: string): ImageFunction[] {
    const q = query.toLowerCase();
    return IMAGE_FUNCTIONS.filter(
      (fn) =>
        fn.includes(q) ||
        t(`image.fn.${fn}.name`).toLowerCase().includes(q),
    );
  }

  renderSuggestion(fn: ImageFunction, el: HTMLElement): void {
    el.createDiv({ text: t(`image.fn.${fn}.name`) });
    el.createEl("small", {
      text: t(`image.fn.${fn}.desc`),
      cls: "sd-slot-suggest-desc",
    });
  }

  onChooseSuggestion(fn: ImageFunction): void {
    this.onPick(fn);
  }
}

export function insertImageSlot(app: App, editor: Editor): void {
  new ImageFunctionModal(app, (fn) => {
    editor.replaceSelection(slotSnippet(fn));
    // Cursor in die leere Prompt-Zeile: zwei Zeilen über das Fence-Ende.
    const c = editor.getCursor();
    editor.setCursor({ line: c.line - 2, ch: 0 });
  }).open();
}
