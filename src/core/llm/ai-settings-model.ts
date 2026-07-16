// Pure state logic of the AI settings UI: obsidian-free, DOM-free, node-testable and pinned by
// check-core-purity. The render layer (ai-settings-ui.ts) calls these and stays thin.
import type { EndpointStatusKind } from "../../vendor/kit/endpoint_diagnostics";
import { isAlwaysOnThinker } from "../../vendor/kit/reasoning";

/** Applies one row-editor edit to the endpoint list.
 *  - trims the value;
 *  - `isAdder` (the trailing blank row) appends a non-empty value; an empty one is a no-op;
 *  - an existing row cleared to empty is removed, otherwise replaced in place;
 *  - blank entries are always filtered out — never persist an empty line. */
export function applyEndpointEdit(list: string[], index: number, value: string, isAdder: boolean): string[] {
  const v = value.trim();
  let next: string[];
  if (isAdder) {
    next = v ? [...list, v] : [...list];
  } else {
    next = [...list];
    if (v) next[index] = v;
    else next.splice(index, 1);
  }
  return next.filter((e) => e.trim().length > 0);
}

/** Index of the first `ok` row (= the active endpoint, exactly resolveActiveEndpoint semantics),
 *  else -1. `null` means "not probed yet" — that is not an error, just not active. */
export function activeIndexFromStatuses(statuses: (EndpointStatusKind | null)[]): number {
  return statuses.findIndex((s) => s === "ok");
}

/** Mode of the model field: `dropdown` as soon as any models were loaded, else `freetext`
 *  (offline / not yet probed). A saved model missing from the list does NOT hide the dropdown —
 *  the render layer keeps it as an extra option (never lose it, but make it selectable). */
export function modelFieldMode(models: string[]): "dropdown" | "freetext" {
  return models.length > 0 ? "dropdown" : "freetext";
}

export interface ModelSelection { options: string[]; initial: string }

/** Options + preselection for a model dropdown. A saved model absent from the server list is kept
 *  as an extra option and stays selected — never silently drop what the user configured
 *  (UI-STANDARD §8). Without a saved value the first server model is shown, but showing is not
 *  choosing: the caller must not persist this without a real user action. */
export function initialModelSelection(models: string[], saved: string): ModelSelection {
  const options = saved && !models.includes(saved) ? [saved, ...models] : models;
  const initial = saved && options.includes(saved) ? saved : (options[0] ?? "");
  return { options, initial };
}

export interface ThinkToggleView {
  labelKey: "deck.settings.thinking.on" | "deck.settings.thinking.off" | "deck.settings.thinking.always";
  cls: "" | "is-disabled";
  disabled: boolean;
}

/** gpt-oss/harmony cannot be switched off → disabled + "always on". Otherwise on/off per flag.
 *  On/off carries no `cls` of its own: the native Obsidian toggle control already shows the
 *  state visually (switch position) plus the row's `labelKey` text — a same-styled "is-off"
 *  row class would be a second, invisible channel for information the control already renders.
 *  `is-disabled` stays because it drives a real style (`.setting-item.is-disabled` dims the
 *  name) that the toggle's own disabled look does not cover for the row as a whole. */
export function thinkToggleView(model: string, suppress: boolean): ThinkToggleView {
  if (isAlwaysOnThinker(model)) return { labelKey: "deck.settings.thinking.always", cls: "is-disabled", disabled: true };
  if (suppress) return { labelKey: "deck.settings.thinking.off", cls: "", disabled: false };
  return { labelKey: "deck.settings.thinking.on", cls: "", disabled: false };
}

/** Effective suppress for the request: only when the user wants it AND the model can be switched
 *  off. Always-on models (gpt-oss/harmony) reject reasoning_effort:"none" — never suppress there
 *  (mirrors the toggle's disabled state onto the request side). */
export function effectiveSuppress(model: string, suppress: boolean): boolean {
  return suppress && !isAlwaysOnThinker(model);
}

/** i18n key for an endpoint status kind (the render layer calls `t(key)`).
 *  Kit's own `klartext` is hardcoded German — never surface it; map via `kind`. */
export function statusKindKey(kind: EndpointStatusKind): string {
  return `deck.settings.endpoint.status.${kind}`;
}

export interface StatusLabelParts { key: string; suffix?: string }

/** Decomposes a probed status into the i18n key + optional raw-detail suffix, so both the
 *  settings endpoint editor and the generate-deck modal render the identical rule instead of
 *  duplicating it. `raw` (the kit's untranslated detail message) is only ever appended for
 *  `kind === "unknown"` — every other kind has a stable, fully translated message and must
 *  never leak kit-internal text, even if a caller happened to pass a `raw` along with it. */
export function statusLabelParts(kind: EndpointStatusKind, raw?: string): StatusLabelParts {
  const key = statusKindKey(kind);
  return kind === "unknown" && raw ? { key, suffix: raw } : { key };
}

/** i18n key for an input warning rule (the render layer calls `t(key)`). */
export function warnRuleKey(rule: string): string {
  return `deck.settings.endpoint.warn.${rule}`;
}
