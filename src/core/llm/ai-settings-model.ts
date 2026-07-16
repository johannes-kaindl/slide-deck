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

export interface ThinkToggleView {
  labelKey: "deck.settings.thinking.on" | "deck.settings.thinking.off" | "deck.settings.thinking.always";
  cls: "" | "is-off" | "is-disabled";
  disabled: boolean;
}

/** gpt-oss/harmony cannot be switched off → disabled + "always on". Otherwise on/off per flag. */
export function thinkToggleView(model: string, suppress: boolean): ThinkToggleView {
  if (isAlwaysOnThinker(model)) return { labelKey: "deck.settings.thinking.always", cls: "is-disabled", disabled: true };
  if (suppress) return { labelKey: "deck.settings.thinking.off", cls: "is-off", disabled: false };
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

/** i18n key for an input warning rule (the render layer calls `t(key)`). */
export function warnRuleKey(rule: string): string {
  return `deck.settings.endpoint.warn.${rule}`;
}
