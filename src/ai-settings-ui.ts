// Render layer for the AI settings blocks (UI-STANDARD §8). All decisions live in
// core/llm/ai-settings-model.ts — this file only draws. Shared by the settings tab and the
// generate-deck view so both speak the same icon vocabulary.
import { Notice, Setting, setIcon } from "obsidian";
import { t } from "./i18n";
import {
  applyEndpointEdit, activeIndexFromStatuses, statusKindKey, warnRuleKey,
  modelFieldMode, thinkToggleView,
} from "./core/llm/ai-settings-model";
import type { ModelContext } from "./core/llm/model-info";
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
  // Generation counter: guards probeAll() against overlapping runs (see below).
  let probeGen = 0;

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
   *  probe() already degrades a failure to a classified status.
   *  `probeGen` guards against overlapping runs (auto-probe on open + manual "check"
   *  button): a superseded run must not paint over a newer run's results, nor place the
   *  active marker from a statuses[] mix of two runs. */
  async function probeAll(): Promise<void> {
    const gen = ++probeGen;
    for (const icon of icons) paintStatus(icon, null, t("deck.settings.endpoint.probing"));
    await Promise.all(list.map(async (ep, i) => {
      const st = await deps.probe(ep);
      if (gen !== probeGen) return; // superseded — a newer run owns the icons now
      statuses[i] = st.kind;
      const label = st.kind === "unknown" && st.raw
        ? `${t(statusKindKey("unknown"))} — ${st.raw}`
        : t(statusKindKey(st.kind));
      paintStatus(icons[i], st.kind, label);
    }));
    if (gen !== probeGen) return; // superseded — do not place the active marker
    const active = activeIndexFromStatuses(statuses);
    if (active >= 0) icons[active]?.addClass("is-active");
  }

  void probeAll(); // auto-probe on open
}

export interface ModelFieldDeps {
  getModel: () => string;
  setModel: (m: string) => Promise<void>;
  listModels: () => Promise<string[]>;
  modelContext: (m: string) => Promise<ModelContext | null>;
  rerender: () => void;
}

/** Model field: dropdown from the server probe, freetext fallback when offline.
 *  A saved model missing from the list is kept as an extra option — never silently dropped. */
export function renderModelField(containerEl: HTMLElement, deps: ModelFieldDeps): void {
  const setting = new Setting(containerEl)
    .setName(t("deck.settings.model.name"))
    .setDesc(t("deck.settings.model.desc"));
  const holder = setting.controlEl.createDiv({ cls: "sd-model-holder" });
  const info = containerEl.createDiv({ cls: "sd-model-info" });

  drawFreetext(); // until the probe returns
  void load();

  function drawFreetext(): void {
    holder.empty();
    const input = holder.createEl("input", { type: "text", cls: "sd-model-input" });
    input.value = deps.getModel();
    // "qwen3" is a model id (LM Studio/Ollama ids are lowercase), not UI prose — the
    // sentence-case rule targets labels/buttons and false-positives here.
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- model id, not UI text
    input.placeholder = "qwen3";
    input.addEventListener("blur", () => void deps.setModel(input.value.trim()).then(() => showContext()));
  }

  /** Compute the option list and the value the dropdown should show, without persisting
   *  anything: a `<select>` must display a value, but that display choice is not a user
   *  decision yet (see drawDropdown). */
  function computeSelection(models: string[]): { options: string[]; initial: string } {
    const saved = deps.getModel();
    // Keep a saved-but-absent model selectable instead of losing it (UI-STANDARD §8).
    const options = saved && !models.includes(saved) ? [saved, ...models] : models;
    const initial = saved && options.includes(saved) ? saved : options[0];
    return { options, initial };
  }

  /** Draws the dropdown and returns the model it shows as selected. Never writes to settings
   *  on its own: preselecting models[0] when llmModel is "" (never set) must not materialize
   *  that guess as a saved value — only a real `change` event may persist (see the cross-project
   *  read-modify-write-over-absence lesson). The caller uses the return value to drive
   *  showContext() for what's on screen without writing anything either. */
  function drawDropdown(models: string[]): string {
    holder.empty();
    const { options, initial } = computeSelection(models);
    const select = holder.createEl("select", { cls: "dropdown" });
    for (const m of options) select.createEl("option", { value: m, text: m });
    select.value = initial;
    select.addEventListener("change", () => void deps.setModel(select.value).then(() => showContext()));
    return initial;
  }

  async function load(): Promise<void> {
    const models = await deps.listModels();
    if (modelFieldMode(models) === "dropdown") {
      const shown = drawDropdown(models);
      await showContext(shown);
    } else {
      drawFreetext();
      info.setText(t("deck.settings.model.none"));
    }
  }

  /** Context length is best-effort: when the server does not report it, stay silent
   *  rather than guess. `shown` lets callers pass the model currently displayed by the
   *  dropdown (which may differ from the persisted llmModel when nothing was saved yet)
   *  without that display choice being written to settings. */
  async function showContext(shown?: string): Promise<void> {
    const model = shown ?? deps.getModel();
    if (!model) { info.setText(""); return; }
    const ctx = await deps.modelContext(model);
    if (!ctx?.maxContextLength) { info.setText(""); return; }
    const max = ctx.maxContextLength.toLocaleString();
    info.setText(ctx.loadedContextLength
      ? t("deck.settings.model.contextLoaded", max, ctx.loadedContextLength.toLocaleString())
      : t("deck.settings.model.context", max));
  }

  setting.addButton((b) => b
    .setButtonText(t("deck.settings.model.load"))
    .onClick(async () => {
      b.setButtonText(t("deck.settings.model.loading")).setDisabled(true);
      const models = await deps.listModels();
      b.setButtonText(t("deck.settings.model.load")).setDisabled(false);
      if (modelFieldMode(models) === "dropdown") {
        const shown = drawDropdown(models);
        new Notice(t("deck.settings.model.loaded", String(models.length))); // make the click visible
        await showContext(shown);
      } else {
        new Notice(t("deck.settings.model.none"));
      }
    }));
}

export interface ThinkingDeps {
  getModel: () => string;
  getSuppress: () => boolean;
  setSuppress: (v: boolean) => Promise<void>;
  testSuppress: (model: string) => Promise<{ thought: boolean }>;
  rerender: () => void;
}

/** Thinking toggle + live verification. isAlwaysOnThinker only knows gpt-oss/harmony — the test
 *  button is what turns a guess into a fact. Never runs on its own: it costs a real LLM call. */
export function renderThinkingRow(containerEl: HTMLElement, deps: ThinkingDeps): void {
  const view = thinkToggleView(deps.getModel(), deps.getSuppress());
  const setting = new Setting(containerEl)
    .setName(t("deck.settings.suppressThinking.name"))
    .setDesc(t(view.labelKey));
  if (view.cls) setting.settingEl.addClass(view.cls);

  setting.addToggle((tg) => {
    tg.setValue(deps.getSuppress());
    tg.setDisabled(view.disabled);
    tg.onChange((v) => void deps.setSuppress(v).then(() => deps.rerender()));
  });

  setting.addButton((b) => b
    .setButtonText(t("deck.settings.thinking.test"))
    .setDisabled(view.disabled)
    .onClick(async () => {
      const model = deps.getModel();
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
