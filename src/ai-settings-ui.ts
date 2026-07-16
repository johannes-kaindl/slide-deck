// Render layer for the AI settings blocks (UI-STANDARD §8). All decisions live in
// core/llm/ai-settings-model.ts — this file only draws. Shared by the settings tab and the
// generate-deck view so both speak the same icon vocabulary.
import { Setting, setIcon } from "obsidian";
import { t } from "./i18n";
import {
  applyEndpointEdit, activeIndexFromStatuses, statusKindKey, warnRuleKey,
} from "./core/llm/ai-settings-model";
import {
  validateEndpointInput, ENDPOINT_PRESETS, type EndpointStatus, type EndpointStatusKind,
} from "./vendor/kit/endpoint_diagnostics";

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

export interface EndpointEditorDeps {
  getList: () => string[];
  setList: (next: string[]) => Promise<void>;
  probe: (endpoint: string) => Promise<EndpointStatus>;
  rerender: () => void;
}

/** Row editor for the endpoint list: one Setting row per endpoint + a trailing adder row.
 *  Name/desc only on row 0. Live probe icon per row, active marker on the first reachable one. */
export function renderEndpointEditor(containerEl: HTMLElement, deps: EndpointEditorDeps): void {
  const list = deps.getList();
  const rows = [...list, ""]; // trailing adder
  const statuses: (EndpointStatusKind | null)[] = list.map(() => null);
  const icons: HTMLElement[] = [];

  rows.forEach((value, index) => {
    const isAdder = index === list.length;
    const setting = new Setting(containerEl);
    if (index === 0) {
      setting.setName(t("deck.settings.endpoints.name")).setDesc(t("deck.settings.endpoints.desc"));
    }
    setting.settingEl.addClass("sd-endpoint-row");

    setting.addText((txt) => {
      txt.setValue(value);
      txt.setPlaceholder(ENDPOINT_PRESETS[0].url);
      // Mutate on blur, never onChange: onChange would persist every keystroke — the adder
      // would grow entries "h", "ht", "htt", … (UI-STANDARD §8).
      txt.inputEl.addEventListener("blur", () => {
        const next = applyEndpointEdit(deps.getList(), index, txt.getValue(), isAdder);
        if (JSON.stringify(next) === JSON.stringify(deps.getList())) return; // nothing changed
        void deps.setList(next).then(() => deps.rerender());
      });
    });

    if (!isAdder) {
      const icon = setting.controlEl.createSpan({ cls: "sd-endpoint-status" });
      paintStatus(icon, null, t("deck.settings.endpoint.probing"));
      icons.push(icon);

      for (const w of validateEndpointInput(value)) {
        const warn = setting.controlEl.createSpan({ cls: "sd-endpoint-warn" });
        setIcon(warn, "alert-triangle");
        const text = t(warnRuleKey(w.rule));
        warn.setAttribute("aria-label", text);
        warn.setAttribute("title", text);
      }

      setting.addExtraButton((b) => b
        .setIcon("trash-2")
        .setTooltip(t("deck.settings.endpoint.remove"))
        .onClick(() => {
          const next = applyEndpointEdit(deps.getList(), index, "", false);
          void deps.setList(next).then(() => deps.rerender());
        }));
    }
  });

  // Presets + re-check, one row below the list.
  const actions = new Setting(containerEl);
  actions.settingEl.addClass("sd-endpoint-actions");
  for (const preset of ENDPOINT_PRESETS) {
    actions.addButton((b) => b
      .setButtonText(t("deck.settings.endpoint.addPreset", preset.label))
      .onClick(() => {
        const next = applyEndpointEdit(deps.getList(), deps.getList().length, preset.url, true);
        void deps.setList(next).then(() => deps.rerender());
      }));
  }
  actions.addButton((b) => b
    .setButtonText(t("deck.settings.endpoint.check"))
    .onClick(() => void probeAll()));

  /** Probe every row in parallel — one dead endpoint must not block the others. Never throws:
   *  probe() already degrades a failure to a classified status. */
  async function probeAll(): Promise<void> {
    for (const icon of icons) paintStatus(icon, null, t("deck.settings.endpoint.probing"));
    await Promise.all(list.map(async (ep, i) => {
      const st = await deps.probe(ep);
      statuses[i] = st.kind;
      const label = st.kind === "unknown" && st.raw
        ? `${t(statusKindKey("unknown"))} — ${st.raw}`
        : t(statusKindKey(st.kind));
      paintStatus(icons[i], st.kind, label);
    }));
    const active = activeIndexFromStatuses(statuses);
    if (active >= 0) icons[active]?.addClass("is-active");
  }

  void probeAll(); // auto-probe on open
}
