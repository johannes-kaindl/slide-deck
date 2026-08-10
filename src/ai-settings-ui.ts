// Render layer for the AI settings blocks (UI-STANDARD §8). All decisions live in
// core/llm/ai-settings-model.ts — this file only draws. Shared by the settings tab and the
// generate-deck view so both speak the same icon vocabulary.
import { Notice, Setting, setIcon } from "obsidian";
import { t } from "./i18n";
import {
  warnRuleKey, roleKindKey,
  modelFieldMode, thinkToggleView, statusLabelParts,
} from "./llm/ai-settings-model";
import type { ModelContext } from "./llm/model-info";
import type { EndpointStatusKind } from "./vendor/kit/endpoint_diagnostics";
import type { EndpointListStrings } from "./vendor/kit-obsidian/endpoint-list";
import { resolveModelChoice, type ModelHintKey } from "./vendor/kit/model-choice";

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

/** Every user-visible string of the kit's endpoint row editor. The kit deliberately phrases
 *  nothing itself (it is German-internal, this plugin is EN-canonical), so translation happens
 *  here — the same `t()` vocabulary the rest of the tab uses. Kept beside `paintStatus` because
 *  it is render-layer glue, not state logic. */
export function endpointListStrings(): EndpointListStrings {
  return {
    addPlaceholder: t("deck.settings.endpoint.addPlaceholder"),
    apiKeyPlaceholder: t("deck.settings.endpoint.keyPlaceholder"),
    modelPlaceholder: t("deck.settings.model.placeholder"),
    ariaUrl: t("deck.settings.endpoint.ariaUrl"),
    ariaAdd: t("deck.settings.endpoint.ariaAdd"),
    ariaApiKey: (url) => t("deck.settings.endpoint.ariaKeyFor", url),
    ariaModel: (url) => t("deck.settings.endpoint.ariaModelFor", url),
    // The kit hands the raw global model through, empty included — spelling out "not set"
    // instead of rendering "Global model ()" is this layer's job, in this layer's language.
    emptyModelLabel: (globalModel) => t("deck.settings.endpoint.modelGlobal",
      globalModel || t("deck.settings.endpoint.modelGlobalUnset")),
    modelHint: (key: ModelHintKey) => (key ? t(`deck.settings.model.hint.${key}`) : ""),
    savedSuffix: t("deck.settings.model.saved"),
    refreshModels: t("deck.settings.model.refresh"),
    moveToFront: t("deck.settings.endpoint.moveToFront"),
    remove: t("deck.settings.endpoint.remove"),
    thirdParty: t("deck.settings.endpoint.thirdParty"),
    probing: t("deck.settings.endpoint.probing"),
    // `raw` only ever reaches the user for kind "unknown" — every other kind has a fully
    // translated message, and the kit's own `klartext` is hardcoded German (never surface it).
    statusTooltip: (status) => {
      const parts = statusLabelParts(status.kind, status.raw);
      return parts.suffix ? `${t(parts.key)} — ${parts.suffix}` : t(parts.key);
    },
    role: (role) => t(roleKindKey(role), String(role.kind === "standby" ? role.position : "")),
    warnings: (warnings) => warnings.map((w) => t(warnRuleKey(w.rule))).join(" · "),
    presetLabel: (preset) => t("deck.settings.endpoint.addPreset", preset.label),
    presetTooltip: (preset) => t("deck.settings.endpoint.presetTooltip", preset.label, preset.url),
    checkConnection: t("deck.settings.endpoint.check"),
    saveFailed: t("deck.settings.endpoint.saveFailed"),
  };
}

export interface ModelFieldDeps {
  getModel: () => string;
  setModel: (m: string) => Promise<void>;
  listModels: () => Promise<string[]>;
  modelContext: (m: string) => Promise<ModelContext | null>;
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
    // Model ids are lowercase (LM Studio/Ollama), so a bare "qwen3" trips the sentence-case
    // rule — which store review does not allow us to disable. Phrasing it as a sentence keeps
    // the id verbatim; "such as" rather than "e.g." because the rule reads the trailing dot as
    // a sentence break and then demands "Qwen3".
    input.placeholder = t("deck.settings.model.placeholder");
    input.addEventListener("blur", () => void deps.setModel(input.value.trim()).then(() => showContext()));
  }

  /** Draws the dropdown and returns the model it shows as selected. Never writes to settings on
   *  its own — only a real `change` event may persist (cross-project read-modify-write-over-
   *  absence lesson). That rule used to make the field LIE: with nothing saved it preselected
   *  `models[0]`, so the tab showed a model while `llmModel` was still empty — and once the
   *  endpoint rows started spelling the global model out ("Global model (not set)"), the two
   *  halves of the same tab visibly contradicted each other. `resolveModelChoice` fixes it at
   *  the root: with an empty saved value it puts an explicit empty option FIRST and selects it,
   *  so "nothing chosen yet" is what the user actually sees. A saved model missing from the
   *  server list still survives as its own option (never silently dropped). */
  function drawDropdown(models: string[]): string {
    holder.empty();
    // reachable: true — this path only runs once models came back, which proves reachability.
    const choice = resolveModelChoice({ reachable: true, models, current: deps.getModel() });
    const select = holder.createEl("select", { cls: "dropdown" });
    for (const o of choice.options) {
      const text = o.value === "" ? t("deck.settings.model.unset")
        : o.suffix === "saved" ? `${o.label} ${t("deck.settings.model.saved")}`
        : o.label;
      select.createEl("option", { value: o.value, text });
    }
    select.value = choice.value;
    select.addEventListener("change", () => void deps.setModel(select.value).then(() => showContext()));
    return choice.value;
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
    // hostFor() blanks settingEl before this block draws, so unlike the plain fields this
    // block must restate its own description — dropping it here silently removed the
    // explanation that the five plain-text fields still show (Finding 2). Keep both: the
    // static "what this does" plus the live on/off/always-on state.
    .setDesc(`${t("deck.settings.suppressThinking.desc")} — ${t(view.labelKey)}`);
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
