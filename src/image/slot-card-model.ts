import { t } from "../i18n";
import type { SlotBlock } from "./slot-format";
import { failureKey, type ImageFailure } from "./image-api";

export type CardState =
  | { kind: "idle" }
  | { kind: "unavailable" }
  | { kind: "blocked"; reason: ImageFailure }
  | { kind: "running"; phase: "loading-model" | "generating"; pct: number | null }
  | { kind: "error"; message: string }
  | { kind: "done"; path: string };

export interface CardVm {
  title: string;
  functionName: string;
  prompt: string;
  hint: string | null;
  empty: boolean;
  buttonLabel: string;
  buttonEnabled: boolean;
  /** §8-Vokabel. Der Bildlauf hat drei sinnvolle Zustaende und bleibt bei dreien. */
  status: "is-checking" | "is-ok" | "is-error" | null;
  statusIcon: "loader" | "circle-check" | "circle-x" | null;
  statusLabel: string;
  progress: number | null;
}

export function cardVm(block: SlotBlock, state: CardState): CardVm {
  const funktionsName = block.funktion ? t(`image.fn.${block.funktion}.name`) : t("image.slot.noFunction");
  const base: CardVm = {
    title: t("image.slot.title"),
    functionName: funktionsName,
    prompt: block.prompt,
    // Eine Erinnerung, KEINE Warnung: der Schaden in dieser Kategorie entsteht durch
    // UNBEABSICHTIGTE Dekoration — ein deklarierter Schmuck ist ihr Gegenteil.
    hint: block.funktion === "decorative" ? t("image.slot.decorativeHint") : null,
    empty: false,
    buttonLabel: t("image.slot.generate"),
    buttonEnabled: false,
    status: null, statusIcon: null, statusLabel: "", progress: null,
  };
  switch (state.kind) {
    case "idle":
      return { ...base, buttonEnabled: true };
    case "unavailable":
      return { ...base, empty: true, statusLabel: t("image.unavailable") };
    case "blocked":
      return { ...base, status: "is-error", statusIcon: "circle-x",
               statusLabel: t(failureKey(state.reason)) };
    case "running":
      return { ...base, status: "is-checking", statusIcon: "loader",
               statusLabel: t(`image.phase.${state.phase}`), progress: state.pct };
    case "error":
      // state.message ist bereits eine FERTIGE, uebersetzte Meldung — wer einen echten
      // Generierungsfehler meldet, verpackt ihn an der Aufrufstelle (image.fail.failed),
      // nicht hier. Alles verpacken machte jede Meldung zu "Generation failed", auch eine
      // bereits uebersetzte (Bildpfad-Meldung nach gegluecktem Speichern).
      return { ...base, buttonEnabled: true, status: "is-error", statusIcon: "circle-x",
               statusLabel: state.message };
    case "done":
      return { ...base, status: "is-ok", statusIcon: "circle-check",
               statusLabel: t("image.slot.done", state.path) };
  }
}
