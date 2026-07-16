import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type SlideDeckPlugin from "./main";
import type { DeckGenInput } from "./main";
import { makeDeckLlmClient } from "./llm-client";
import { resolveActiveEndpoint } from "./vendor/kit/endpoint";
import { frontmatterRange } from "./core/llm/deck-sanitize";
import { stripNoteFrontmatter } from "./core/llm/deck-prompt";
import { estimateTokens, contextOverflow } from "./core/llm/model-info";
import { modelFieldMode, statusKindKey, initialModelSelection } from "./core/llm/ai-settings-model";
import { paintStatus } from "./ai-settings-ui";
import type { GenState, GenerationHandle } from "./generate-deck";
import { t } from "./i18n";

export const VIEW_TYPE_GENERATE = "slide-deck-generate";

/** A note "looks like a deck" if it has frontmatter with a theme: line and a body --- separator. */
function looksLikeDeck(md: string): boolean {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = frontmatterRange(lines);
  if (!range) return false;
  const hasTheme = lines.slice(1, range.end).some((l) => /^theme:\s/.test(l));
  const hasSep = lines.slice(range.end + 1).some((l) => l.trim() === "---");
  return hasTheme && hasSep;
}

/** Right-sidebar control for generating a deck from the active note (replaces the old modal).
 *  Persistent: the source is whatever note is active when you press Generate. Attaches to the
 *  plugin's generation handle, so progress survives switching away and back. */
export class GenerateDeckView extends ItemView {
  private endpoint: string | null = null;
  private model = "";
  private currentSource: TFile | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: number | null = null;
  private startedAt = 0;
  private starting = false;                     // guards start() across its first await (F1)
  private closed = false;                        // set on onClose so late callbacks bail (F2)
  private mode: "input" | "running" = "input";   // real view mode (F4)

  // input-state elements refreshed when the active note changes
  private sourceLabel?: HTMLElement;
  private existsBox?: HTMLElement;
  private deckHintEl?: HTMLElement;
  private warnEl?: HTMLElement;
  private genBtn?: HTMLButtonElement;
  private replace = true;
  private countSel?: HTMLSelectElement;
  private hintInput?: HTMLInputElement;
  private themeSel?: HTMLSelectElement;

  constructor(leaf: WorkspaceLeaf, private plugin: SlideDeckPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE_GENERATE; }
  getDisplayText(): string { return t("deck.modal.title"); }
  getIcon(): string { return "wand-2"; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.addClass("sd-gen-view");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => { if (this.mode === "input") this.refreshSourceBits(); }));
    if (this.plugin.activeGeneration) { this.renderRunning(this.plugin.activeGeneration); return; }
    await this.renderInput();
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    this.contentEl.empty();
  }

  private targetBase(file: TFile): string {
    const parentPath = file.parent?.path ?? "";
    const dir = parentPath && parentPath !== "/" ? `${parentPath}/` : "";
    return `${dir}${file.basename} — Deck`;
  }
  private existsAt(p: string): boolean { return this.app.vault.getAbstractFileByPath(p) instanceof TFile; }
  private updateEnabled(): void { if (this.genBtn) this.genBtn.disabled = !this.endpoint || !this.model || !this.currentSource; }

  private async renderInput(): Promise<void> {
    const { contentEl } = this;
    this.mode = "input";
    contentEl.empty();

    const status = contentEl.createDiv({ cls: "sd-gen-status" });
    const pingEl = status.createSpan({ cls: "sd-gen-ping" });
    const pingLabelEl = status.createSpan({ cls: "sd-gen-ping-label" });
    paintStatus(pingEl, null, t("deck.settings.endpoint.probing"));

    this.sourceLabel = contentEl.createDiv({ cls: "sd-gen-source-label" });

    const countRow = contentEl.createDiv({ cls: "sd-gen-row" });
    countRow.createEl("label", { text: t("deck.modal.slideCount") });
    this.countSel = countRow.createEl("select");
    this.countSel.createEl("option", { value: "auto", text: t("deck.modal.auto") });
    for (const n of [3, 5, 6, 8, 10, 12]) this.countSel.createEl("option", { value: String(n), text: String(n) });

    const modelRow = contentEl.createDiv({ cls: "sd-gen-row" });
    modelRow.createEl("label", { text: t("deck.modal.model") });
    const modelHolder = modelRow.createSpan();
    this.model = this.plugin.settings.llmModel;
    const modelInput = modelHolder.createEl("input", { type: "text" });
    modelInput.value = this.model;
    modelInput.addEventListener("input", () => { this.model = modelInput.value.trim(); this.updateEnabled(); });

    const hintRow = contentEl.createDiv({ cls: "sd-gen-row" });
    hintRow.createEl("label", { text: t("deck.modal.hint") });
    this.hintInput = hintRow.createEl("input", { type: "text" });
    this.hintInput.placeholder = t("deck.modal.hintPlaceholder");
    this.hintInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void this.start(); } });

    const themeRow = contentEl.createDiv({ cls: "sd-gen-row" });
    themeRow.createEl("label", { text: t("deck.modal.theme") });
    this.themeSel = themeRow.createEl("select");
    for (const e of this.plugin.themeStore.getThemes()) this.themeSel.createEl("option", { value: e.key, text: e.label ?? e.key });
    // Resolve through the theme store — a legacy/alias/unknown persisted default (or a stale
    // 0.4.x key that slipped past the settings migration) must still land on a real <option>.
    this.themeSel.value = this.plugin.themeStore.resolve(this.plugin.settings.defaultTheme).key;

    this.existsBox = contentEl.createDiv();
    this.deckHintEl = contentEl.createDiv({ cls: "sd-gen-hint" });
    this.warnEl = contentEl.createDiv({ cls: "sd-gen-hint" });

    const cta = contentEl.createDiv({ cls: "sd-gen-cta" });
    this.genBtn = cta.createEl("button", { cls: "mod-cta", text: t("deck.modal.generate") });
    this.genBtn.addEventListener("click", () => void this.start());

    this.refreshSourceBits();

    // Resolve endpoint + ping + models (once per open).
    this.endpoint = await resolveActiveEndpoint(this.plugin.settings.llmEndpoints, (ep) => makeDeckLlmClient(ep, "").ping());
    if (!this.endpoint) {
      // No resolved endpoint → nothing left to probe() for a kind; "unknown" carries the
      // shared error visual (circle-x/is-error) while the label stays the specific,
      // actionable message instead of the generic "not reachable" klartext.
      paintStatus(pingEl, "unknown", t("deck.modal.noEndpoint"));
      pingLabelEl.setText(t("deck.modal.noEndpoint"));
      this.warnEl.setText(t("deck.modal.noEndpoint"));
    } else {
      const st = await makeDeckLlmClient(this.endpoint, "").probe();
      const label = st.kind === "unknown" && st.raw
        ? `${t(statusKindKey("unknown"))} — ${st.raw}`
        : t(statusKindKey(st.kind));
      paintStatus(pingEl, st.kind, label);
      pingLabelEl.setText(`${this.endpoint} — ${label}`);
      const models = await makeDeckLlmClient(this.endpoint, "").listModels();
      if (modelFieldMode(models) === "dropdown") {
        // Keep a saved-but-absent model selectable instead of losing it (UI-STANDARD §8,
        // same rule as the settings model field).
        const { options, initial } = initialModelSelection(models, this.plugin.settings.llmModel);
        modelHolder.empty();
        const sel = modelHolder.createEl("select");
        for (const m of options) sel.createEl("option", { value: m, text: m });
        this.model = initial;
        sel.value = this.model;
        sel.addEventListener("change", () => { this.model = sel.value; this.updateEnabled(); });
      }
    }
    this.updateEnabled();
    // Endpoint is only known now → re-run the source check so the context-overflow warning
    // can actually fire on first open (F3: the earlier refreshSourceBits ran with endpoint null).
    if (this.currentSource) void this.checkSourceAsync(this.currentSource);
  }

  /** Update the source-note-dependent widgets (label, replace choice, deck hint, context warn). */
  private refreshSourceBits(): void {
    const active = this.app.workspace.getActiveFile();
    this.currentSource = active && active.extension === "md" ? active : null;
    if (!this.sourceLabel || !this.existsBox || !this.deckHintEl) return;
    this.existsBox.empty();
    this.deckHintEl.setText("");
    // Clear a stale context-overflow warning; keep a "no endpoint" message (only set when endpoint is null).
    if (this.endpoint) this.warnEl?.setText("");
    this.replace = true;

    if (!this.currentSource) { this.sourceLabel.setText(t("preview.hint")); this.updateEnabled(); return; }
    this.sourceLabel.setText(`${this.currentSource.basename}`);

    if (this.existsAt(`${this.targetBase(this.currentSource)}.md`)) {
      const box = this.existsBox.createDiv({ cls: "sd-gen-exists" });
      box.createEl("p", { text: t("deck.modal.existsLabel") });
      const rep = box.createEl("label", { cls: "sd-collide-opt" }); const repRadio = rep.createEl("input", { type: "radio" }); repRadio.name = "sd-collide"; repRadio.checked = true; rep.createSpan({ text: t("deck.modal.existsReplace") });
      const cop = box.createEl("label", { cls: "sd-collide-opt" }); const copRadio = cop.createEl("input", { type: "radio" }); copRadio.name = "sd-collide"; cop.createSpan({ text: t("deck.modal.existsCopy") });
      repRadio.addEventListener("change", () => { this.replace = true; });
      copRadio.addEventListener("change", () => { this.replace = false; });
    }
    void this.checkSourceAsync(this.currentSource);
    this.updateEnabled();
  }

  /** Deck-lookalike hint + context-length warning (needs a vault read + optional model probe). */
  private async checkSourceAsync(file: TFile): Promise<void> {
    const raw = await this.app.vault.read(file);
    if (this.currentSource !== file) return; // switched away while reading
    if (this.deckHintEl && looksLikeDeck(raw)) this.deckHintEl.setText(t("deck.modal.sourceIsDeck"));
    if (!this.endpoint || !this.warnEl) return;
    const body = stripNoteFrontmatter(raw);
    const ctx = await makeDeckLlmClient(this.endpoint, this.model).modelContext(this.model);
    if (this.currentSource !== file) return;
    const limit = ctx?.loadedContextLength ?? ctx?.maxContextLength;
    const inputTokens = estimateTokens(body.length) + 400;
    if (contextOverflow(inputTokens, this.plugin.settings.llmMaxTokens, limit) || (limit == null && body.length > 30000)) {
      this.warnEl.setText(t("deck.modal.contextWarn", inputTokens, limit != null ? String(limit) : "?"));
    } else {
      this.warnEl.setText("");
    }
  }

  private async start(): Promise<void> {
    // Non-reentrant across the await: `starting` closes the TOCTOU window before startDeckGeneration
    // sets activeGeneration (F1 — key-repeat Enter / Enter+click could otherwise spawn two runs).
    if (this.plugin.activeGeneration || this.starting) return;
    if (!this.endpoint || !this.model || !this.currentSource) return;
    if (!this.countSel || !this.hintInput || !this.themeSel) return;
    this.starting = true;
    try {
      const source = this.currentSource;
      const raw = await this.app.vault.read(source);
      const body = stripNoteFrontmatter(raw);
      const slideTarget: number | "auto" = this.countSel.value === "auto" ? "auto" : Number(this.countSel.value);
      let targetPath = `${this.targetBase(source)}.md`;
      if (!this.replace) { let n = 2; while (this.existsAt(targetPath)) { targetPath = `${this.targetBase(source)} ${n}.md`; n++; } }
      const input: DeckGenInput = {
        sourceBody: body, slideTarget, hint: this.hintInput.value, themeKey: this.themeSel.value,
        model: this.model, endpoint: this.endpoint, targetPath, replace: this.replace,
        sourceLink: `[[${source.basename}]]`,
      };
      const handle = this.plugin.startDeckGeneration(input);
      this.renderRunning(handle);
    } finally { this.starting = false; }
  }

  private renderRunning(handle: GenerationHandle): void {
    const { contentEl } = this;
    this.mode = "running";
    // Restore the "at most one live timer/subscription" invariant before wiring new ones.
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    contentEl.empty();
    this.startedAt = handle.startedAt; // reattach-stable (F6): real start, not now

    const head = contentEl.createDiv({ cls: "sd-gen-running" });
    const phaseEl = head.createSpan({ cls: "sd-gen-phase", text: t("deck.modal.generating") });
    const elapsedEl = head.createSpan({ cls: "sd-gen-elapsed" });

    const details = contentEl.createEl("details", { cls: "sd-gen-reasoning" });
    details.createEl("summary", { text: t("deck.modal.reasoning") });
    const reasoningEl = details.createEl("pre");
    const tailEl = contentEl.createEl("pre", { cls: "sd-gen-tail" });

    const cta = contentEl.createDiv({ cls: "sd-gen-cta" });
    cta.createEl("button", { cls: "mod-warning", text: t("deck.modal.stop") }).addEventListener("click", () => handle.abort());

    const stopTimer = (): void => { if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; } };
    const render = (s: GenState): void => {
      phaseEl.setText(s.phase === "retrying" ? t("deck.modal.attempt", s.attempt) : s.phase === "error" ? (s.error ?? "") : t("deck.modal.generating"));
      reasoningEl.setText(s.reasoning.slice(-4000));
      tailEl.setText(s.content.slice(-1200));
      if (s.phase === "error") stopTimer();
    };
    render(handle.snapshot());
    this.unsubscribe = handle.subscribe(render);
    this.timer = window.setInterval(() => { elapsedEl.setText(t("deck.modal.elapsed", Math.round((Date.now() - this.startedAt) / 1000))); }, 500);

    void handle.done.then(
      (r) => {
        stopTimer();
        if (this.closed) return; // view was closed mid-run; do not touch DOM or re-ping (F2)
        if (r.status === "ok" || r.status === "aborted") { void this.renderInput(); return; }
        // fatal: keep the error text visible; offer a fresh start.
        cta.empty();
        cta.createEl("button", { cls: "mod-cta", text: t("deck.modal.generate") }).addEventListener("click", () => void this.renderInput());
      },
      () => stopTimer(),
    );
  }
}
