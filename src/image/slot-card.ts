import { setIcon } from "obsidian";
import type SlideDeckPlugin from "../main";
import { t } from "../i18n";
import { parseSlot, SLOT_LANG } from "./slot-format";
import { readImageApi, LOCAL_IMAGE_GENERATOR_URL } from "./image-api";
import { cardVm, type CardState, type CardVm } from "./slot-card-model";

/** Der eigene Maler derselben §8-Vokabel. Bewusst NICHT `paintStatus` aus ai-settings-ui:
 *  das nimmt einen EndpointStatusKind und kennt drei Endpunkt-Zustaende — ein Bildlauf ist
 *  kein Endpunkt. Geteilt wird die Sprache, nicht die Funktion. */
function paintSlotStatus(el: HTMLElement, vm: CardVm): void {
  el.empty();
  el.removeClasses(["is-checking", "is-ok", "is-error"]);
  // G6: ein leeres aria-label ist etwas anderes als KEINES — ein Screenreader liest das
  // Element sonst als "leer beschriftet" statt als unbeschriftet vor.
  if (!vm.status || !vm.statusIcon) { el.removeAttribute("aria-label"); return; }
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
  if (vm.empty) {
    // §8-Empty-State-Kanon: Kopfzeile + Empty-Zeile + genau EIN mod-cta, sonst nichts — kein
    // Vorbau aus Funktion/Prompt/Statuszeile, die hier nur denselben Satz doppelt zeigen wuerden.
    const leer = host.createDiv({ cls: "sd-slot-empty" });
    leer.createDiv({ text: vm.statusLabel });
    // W3: der Knopf war bisher tot — hier fuehrt er wortwoertlich zu der Beschriftung, die
    // er traegt: dem Repo von local-image-generator, dem einzigen ehrlichen Ziel.
    leer.createEl("button", { text: t("image.unavailable.cta"), cls: "mod-cta" })
      .addEventListener("click", () => window.open(LOCAL_IMAGE_GENERATOR_URL, "_blank"));
    return;
  }
  host.createDiv({ cls: "sd-slot-function", text: vm.functionName });
  host.createDiv({ cls: "sd-slot-prompt", text: vm.prompt });
  if (vm.hint) host.createDiv({ cls: "sd-slot-hint", text: vm.hint });
  if (vm.statusLabel) host.createDiv({ cls: "sd-slot-state", text: vm.statusLabel });
  if (vm.progress !== null) {
    const bar = host.createDiv({ cls: "sd-slot-bar" });
    bar.createDiv({ cls: "sd-slot-bar-fill" }).style.width = `${vm.progress}%`;
  }
  const aktionen = host.createDiv({ cls: "sd-slot-actions" });
  const knopf = aktionen.createEl("button", { text: vm.buttonLabel, cls: "mod-cta" });
  knopf.disabled = !vm.buttonEnabled;
  knopf.addEventListener("click", onClick);
}

export function registerSlotCard(plugin: SlideDeckPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(SLOT_LANG, (source, el, ctx) => {
    const block = parseSlot(source);
    // W4: die API ist ein synchroner, netzfreier Zugriff (kein Zwischenspeichern noetig) — sie
    // beim Rendern zu lesen ist billig und zeigt Mobile/ohne-LIG sofort den Empty-State statt
    // eines einladenden Knopfs, der erst nach dem Klick in eine Sackgasse fuehrt. Beim Klick
    // wird trotzdem erneut gelesen (in plugin.runSlot) — der Ablauf aendert sich nicht.
    let state: CardState = readImageApi(plugin.app) ? { kind: "idle" } : { kind: "unavailable" };
    const zeichne = (): void => renderCard(el, cardVm(block, state), () => {
      // G4: den Knopf SOFORT sperren, nicht erst nach dem ersten await in runSlot — sonst
      // startet ein Doppelklick zwei Laeufe.
      state = { kind: "running", phase: "loading-model", pct: null };
      zeichne();
      void plugin.runSlot(source, ctx, (s) => { state = s; zeichne(); });
    });
    zeichne();
  });
}
