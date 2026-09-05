import { setIcon } from "obsidian";
import type SlideDeckPlugin from "../main";
import { parseSlot } from "./slot-format";
import { cardVm, type CardState, type CardVm } from "./slot-card-model";

/** Der eigene Maler derselben §8-Vokabel. Bewusst NICHT `paintStatus` aus ai-settings-ui:
 *  das nimmt einen EndpointStatusKind und kennt drei Endpunkt-Zustaende — ein Bildlauf ist
 *  kein Endpunkt. Geteilt wird die Sprache, nicht die Funktion. */
function paintSlotStatus(el: HTMLElement, vm: CardVm): void {
  el.empty();
  el.removeClasses(["is-checking", "is-ok", "is-error"]);
  if (!vm.status || !vm.statusIcon) { el.setAttribute("aria-label", ""); return; }
  el.addClass(vm.status);
  setIcon(el, vm.statusIcon);
  el.setAttribute("aria-label", vm.statusLabel);
}

export function renderCard(host: HTMLElement, vm: CardVm, onClick: () => void): void {
  host.empty();
  host.addClass("sd-slot-card");
  const kopf = host.createDiv({ cls: "sd-slot-head" });
  kopf.createEl("h3", { text: vm.title, cls: "sd-slot-title" });
  paintSlotStatus(kopf.createSpan({ cls: "sd-slot-status" }), vm);
  for (const zeile of vm.meta) host.createDiv({ cls: "sd-slot-meta", text: zeile });
  if (vm.hint) host.createDiv({ cls: "sd-slot-hint", text: vm.hint });
  if (vm.statusLabel) host.createDiv({ cls: "sd-slot-state", text: vm.statusLabel });
  if (vm.progress !== null) {
    const bar = host.createDiv({ cls: "sd-slot-bar" });
    bar.createDiv({ cls: "sd-slot-bar-fill" }).style.width = `${vm.progress}%`;
  }
  if (vm.empty) {
    host.createDiv({ cls: "sd-slot-empty", text: vm.statusLabel });
    return;
  }
  const aktionen = host.createDiv({ cls: "sd-slot-actions" });
  const knopf = aktionen.createEl("button", { text: vm.buttonLabel, cls: "mod-cta" });
  knopf.disabled = !vm.buttonEnabled;
  knopf.addEventListener("click", onClick);
}

export function registerSlotCard(plugin: SlideDeckPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("slide-image", (source, el, ctx) => {
    const block = parseSlot(source);
    let state: CardState = { kind: "idle" };
    const zeichne = (): void => renderCard(el, cardVm(block, state), () => {
      void plugin.runSlot(source, ctx, (s) => { state = s; zeichne(); });
    });
    zeichne();
  });
}
