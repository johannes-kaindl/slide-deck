import { App, Modal, TFile } from "obsidian";
import type SlideDeckPlugin from "./main";
import type { DeckGenInput } from "./main";
import { makeDeckLlmClient } from "./llm-client";
import { resolveActiveEndpoint } from "./core/llm/endpoint";
import { frontmatterRange } from "./core/llm/deck-sanitize";
import { stripNoteFrontmatter } from "./core/llm/deck-prompt";
import { estimateTokens, contextOverflow } from "./core/llm/model-info";
import type { GenState, GenerationHandle } from "./generate-deck";
import { t } from "./i18n";

/** A note "looks like a deck" if it has frontmatter with a theme: line and a body --- separator. */
function looksLikeDeck(md: string): boolean {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = frontmatterRange(lines);
  if (!range) return false;
  const hasTheme = lines.slice(1, range.end).some((l) => /^theme:\s/.test(l));
  const hasSep = lines.slice(range.end + 1).some((l) => l.trim() === "---");
  return hasTheme && hasSep;
}

export class GenerateDeckModal extends Modal {
  private endpoint: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: number | null = null;
  private startedAt = 0;

  constructor(app: App, private plugin: SlideDeckPlugin, private sourceFile: TFile) { super(app); }

  async onOpen(): Promise<void> {
    this.titleEl.setText(t("deck.modal.title"));
    if (this.plugin.activeGeneration) { this.renderRunning(this.plugin.activeGeneration); return; }
    await this.renderInput();
  }

  onClose(): void {
    // Close ≠ Abort: leave any running generation alone; just detach listeners/timers.
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    this.contentEl.empty();
  }

  private async renderInput(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    const raw = await this.app.vault.read(this.sourceFile);
    const body = stripNoteFrontmatter(raw);

    const status = contentEl.createDiv({ cls: "sd-gen-status" });
    const pingEl = status.createSpan({ cls: "sd-gen-ping", text: "…" });

    const countRow = contentEl.createDiv({ cls: "sd-gen-row" });
    countRow.createEl("label", { text: t("deck.modal.slideCount") });
    const countSel = countRow.createEl("select");
    countSel.createEl("option", { value: "auto", text: t("deck.modal.auto") });
    for (const n of [3, 5, 6, 8, 10, 12]) countSel.createEl("option", { value: String(n), text: String(n) });

    const modelRow = contentEl.createDiv({ cls: "sd-gen-row" });
    modelRow.createEl("label", { text: t("deck.modal.model") });
    const modelHolder = modelRow.createSpan();
    let model = this.plugin.settings.llmModel;
    const modelInput = modelHolder.createEl("input", { type: "text" });
    modelInput.value = model;
    modelInput.addEventListener("input", () => { model = modelInput.value.trim(); updateEnabled(); });

    const hintRow = contentEl.createDiv({ cls: "sd-gen-row" });
    hintRow.createEl("label", { text: t("deck.modal.hint") });
    const hintInput = hintRow.createEl("input", { type: "text" });
    hintInput.placeholder = t("deck.modal.hintPlaceholder");

    const themeRow = contentEl.createDiv({ cls: "sd-gen-row" });
    themeRow.createEl("label", { text: t("deck.modal.theme") });
    const themeSel = themeRow.createEl("select");
    for (const e of this.plugin.themeStore.getThemes()) themeSel.createEl("option", { value: e.key, text: e.key });
    themeSel.value = this.plugin.settings.defaultTheme;

    const parentPath = this.sourceFile.parent?.path ?? "";
    const dir = parentPath && parentPath !== "/" ? `${parentPath}/` : "";
    const targetBase = `${dir}${this.sourceFile.basename} — Deck`;
    const existsAt = (p: string): boolean => this.app.vault.getAbstractFileByPath(p) instanceof TFile;
    let replace = true;
    if (existsAt(`${targetBase}.md`)) {
      const box = contentEl.createDiv({ cls: "sd-gen-exists" });
      box.createEl("p", { text: t("deck.modal.existsLabel") });
      const rep = box.createEl("label"); const repRadio = rep.createEl("input", { type: "radio" }); repRadio.name = "sd-collide"; repRadio.checked = true; rep.createSpan({ text: ` ${t("deck.modal.existsReplace")}` });
      const cop = box.createEl("label"); const copRadio = cop.createEl("input", { type: "radio" }); copRadio.name = "sd-collide"; cop.createSpan({ text: ` ${t("deck.modal.existsCopy")}` });
      repRadio.addEventListener("change", () => { replace = true; });
      copRadio.addEventListener("change", () => { replace = false; });
    }

    if (looksLikeDeck(raw)) contentEl.createDiv({ cls: "sd-gen-hint", text: t("deck.modal.sourceIsDeck") });
    const warnEl = contentEl.createDiv({ cls: "sd-gen-hint" });

    const cta = contentEl.createDiv({ cls: "sd-gen-cta" });
    const genBtn = cta.createEl("button", { cls: "mod-cta", text: t("deck.modal.generate") });
    cta.createEl("button", { text: t("deck.modal.cancel") }).addEventListener("click", () => this.close());

    const updateEnabled = (): void => { genBtn.disabled = !this.endpoint || !model; };
    updateEnabled();

    // Resolve endpoint + ping + models + context check (async).
    this.endpoint = await resolveActiveEndpoint(this.plugin.settings.llmEndpoints, (ep) => makeDeckLlmClient(ep, "").ping());
    pingEl.classList.toggle("sd-gen-ping-ok", !!this.endpoint);
    pingEl.classList.toggle("sd-gen-ping-err", !this.endpoint);
    if (!this.endpoint) {
      pingEl.setText(`✗ ${t("deck.modal.unreachable")}`);
      warnEl.setText(t("deck.modal.noEndpoint"));
    } else {
      pingEl.setText(`✓ ${this.endpoint} (${t("deck.modal.reachable")})`);
      const models = await makeDeckLlmClient(this.endpoint, "").listModels();
      if (models.length) {
        modelHolder.empty();
        const sel = modelHolder.createEl("select");
        for (const m of models) sel.createEl("option", { value: m, text: m });
        model = models.includes(this.plugin.settings.llmModel) ? this.plugin.settings.llmModel : models[0];
        sel.value = model;
        sel.addEventListener("change", () => { model = sel.value; updateEnabled(); });
      }
      const ctx = await makeDeckLlmClient(this.endpoint, model).modelContext(model);
      const limit = ctx?.loadedContextLength ?? ctx?.maxContextLength;
      const inputTokens = estimateTokens(body.length) + 400; // + rough prompt overhead
      if (contextOverflow(inputTokens, this.plugin.settings.llmMaxTokens, limit) || (limit == null && body.length > 30000)) {
        warnEl.setText(t("deck.modal.contextWarn", inputTokens, limit != null ? String(limit) : "?"));
      }
    }
    updateEnabled();

    const start = (): void => {
      if (this.plugin.activeGeneration) return;   // non-reentrant (review C9): never start a 2nd run
      if (!this.endpoint || !model) return;
      genBtn.disabled = true;
      const slideTarget: number | "auto" = countSel.value === "auto" ? "auto" : Number(countSel.value);
      let targetPath = `${targetBase}.md`;
      if (!replace) { let n = 2; while (existsAt(targetPath)) { targetPath = `${targetBase} ${n}.md`; n++; } }
      const input: DeckGenInput = { sourceBody: body, slideTarget, hint: hintInput.value, themeKey: themeSel.value, model, endpoint: this.endpoint, targetPath, replace };
      const handle = this.plugin.startDeckGeneration(input);
      this.renderRunning(handle);
    };
    genBtn.addEventListener("click", start);
    this.scope.register([], "Enter", (e) => { e.preventDefault(); start(); return false; });
  }

  private renderRunning(handle: GenerationHandle): void {
    const { contentEl } = this;
    contentEl.empty();
    this.startedAt = Date.now();

    const head = contentEl.createDiv({ cls: "sd-gen-running" });
    const phaseEl = head.createSpan({ cls: "sd-gen-phase", text: t("deck.modal.generating") });
    const elapsedEl = head.createSpan({ cls: "sd-gen-elapsed" });

    const details = contentEl.createEl("details", { cls: "sd-gen-reasoning" });
    details.createEl("summary", { text: t("deck.modal.reasoning") });
    const reasoningEl = details.createEl("pre");

    const tailEl = contentEl.createEl("pre", { cls: "sd-gen-tail" });

    const cta = contentEl.createDiv({ cls: "sd-gen-cta" });
    cta.createEl("button", { cls: "mod-warning", text: t("deck.modal.stop") }).addEventListener("click", () => { handle.abort(); this.close(); });

    const render = (s: GenState): void => {
      phaseEl.setText(s.phase === "retrying" ? t("deck.modal.attempt", s.attempt) : s.phase === "error" ? (s.error ?? "") : t("deck.modal.generating"));
      reasoningEl.setText(s.reasoning.slice(-4000));
      tailEl.setText(s.content.slice(-1200));
      if (s.phase === "error" && this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    };
    render(handle.snapshot());
    this.unsubscribe = handle.subscribe(render);
    this.timer = window.setInterval(() => { elapsedEl.setText(t("deck.modal.elapsed", Math.round((Date.now() - this.startedAt) / 1000))); }, 500);

    void handle.done.then((r) => { if (r.status === "ok") this.close(); });
  }
}
