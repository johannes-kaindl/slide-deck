import { Plugin, getLanguage, TFile, TAbstractFile, Notice, normalizePath } from "obsidian";
import { exportPdf, exportImages } from "./export";
import { SlideDeckView, VIEW_TYPE } from "./preview-view";
import { t, pickLang, setLang } from "./i18n";
import { DEFAULT_SETTINGS, SlideDeckSettings, SlideDeckSettingTab } from "./settings";
import { ThemeStore } from "./theme-registry";
import { buildHideCss, normalizeFolder } from "./core/folder-hide";
import { GenerateDeckView, VIEW_TYPE_GENERATE } from "./generate-deck-view";
import { runGenerateDeck, type GenState, type GenerateResult, type GenerationHandle } from "./generate-deck";
import { makeDeckLlmClient } from "./llm-client";
import { buildDeckPrompt } from "./core/llm/deck-prompt";
import { getAuthoringContract } from "./core/constraints/contract";
import { mergeSettings } from "./vendor/kit/settings";

export interface DeckGenInput {
  sourceBody: string; slideTarget: number | "auto"; hint: string;
  themeKey: string; model: string; endpoint: string; targetPath: string; replace: boolean;
  sourceLink: string; // "[[Note]]" backlink to the origin note
}

export default class SlideDeckPlugin extends Plugin {
  declare public settings: SlideDeckSettings;
  public themeStore!: ThemeStore;
  private hideSheet: CSSStyleSheet | null = null;
  public activeGeneration: GenerationHandle | null = null;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    this.settings = mergeSettings(DEFAULT_SETTINGS, await this.loadData());

    this.themeStore = new ThemeStore(this.app, () => this.settings.themesFolder);
    await this.themeStore.refresh();
    this.applyFolderHide();

    this.addSettingTab(new SlideDeckSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new SlideDeckView(leaf, this));
    this.registerView(VIEW_TYPE_GENERATE, (leaf) => new GenerateDeckView(leaf, this));
    this.addRibbonIcon("wand-2", t("cmd.generateDeck"), () => void this.activateGenerateView());

    this.addCommand({ id: "open-preview", name: t("cmd.openPreview"), callback: () => void this.activatePreview() });
    this.addCommand({
      id: "export-pdf", name: t("cmd.exportPdf"),
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.customCss, undefined, this.settings.exportFolder),
    });
    this.addCommand({
      id: "export-images", name: t("cmd.exportImages"),
      callback: () => void exportImages(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.imageScale, this.settings.customCss, this.settings.exportFolder),
    });
    this.addCommand({ id: "generate-deck", name: t("cmd.generateDeck"), callback: () => void this.activateGenerateView() });

    // Refresh the registry when a .css under the themes folder is added/removed/renamed.
    const underThemes = (path: string) => normalizeFolder(path).startsWith(normalizeFolder(this.settings.themesFolder) + "/") && path.toLowerCase().endsWith(".css");
    const onVault = (f: TAbstractFile) => { if (underThemes(f.path)) void this.refreshThemes(); };
    this.registerEvent(this.app.vault.on("create", (f) => { if (f instanceof TFile) onVault(f); }));
    this.registerEvent(this.app.vault.on("delete", (f) => { if (f instanceof TFile) onVault(f); }));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { if (f instanceof TFile) onVault(f); if (underThemes(oldPath)) void this.refreshThemes(); }));
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Re-scan the themes folder, then refresh any open preview so the dropdown reflects it. */
  async refreshThemes(): Promise<void> {
    await this.themeStore.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SlideDeckView) void leaf.view.refresh();
    }
  }

  /** Apply (or clear) the explorer-hide stylesheet for the themes folder. */
  applyFolderHide(): void {
    if (!this.hideSheet) { this.hideSheet = new CSSStyleSheet(); activeDocument.adoptedStyleSheets = [...activeDocument.adoptedStyleSheets, this.hideSheet]; }
    this.hideSheet.replaceSync(buildHideCss(this.settings.themesFolder, this.settings.hideThemesFolder));
  }

  onunload(): void {
    if (this.hideSheet) activeDocument.adoptedStyleSheets = activeDocument.adoptedStyleSheets.filter((s) => s !== this.hideSheet);
  }

  async activatePreview(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    void workspace.revealLeaf(leaf);
  }

  /** Open (or reveal) the generation sidebar. */
  async activateGenerateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_GENERATE)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_GENERATE, active: true });
    void workspace.revealLeaf(leaf);
  }

  /** Refresh every open preview leaf (SlideDeckView has no active-leaf listener). */
  async refreshActivePreview(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SlideDeckView) await leaf.view.refresh();
    }
  }

  /** Open a generated deck note, then activate + refresh the preview (order matters). */
  async openDeckNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf(false).openFile(file);
    await this.activatePreview();
    await this.refreshActivePreview();
  }

  /** Write the deck note, returning the path actually written. Replace overwrites in place; a copy
   *  (or a raced/occupied create target) gets a fresh " N" suffix so vault.create can never throw. */
  private async writeDeckNote(path: string, markdown: string, replace: boolean): Promise<string> {
    const p = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing instanceof TFile && replace) { await this.app.vault.modify(existing, markdown); return p; }
    let target = p;
    if (this.app.vault.getAbstractFileByPath(target)) {
      const base = p.replace(/\.md$/, "");
      let n = 2;
      while (this.app.vault.getAbstractFileByPath(target)) { target = `${base} ${n}.md`; n++; }
    }
    await this.app.vault.create(target, markdown);
    return target;
  }

  /** Start a generation. Returns a handle the modal attaches to; the run survives modal close. */
  startDeckGeneration(input: DeckGenInput): GenerationHandle {
    const controller = new AbortController();
    let state: GenState = { phase: "running", attempt: 1, content: "", reasoning: "" };
    const subs = new Set<(s: GenState) => void>();
    const notify = (s: GenState): void => { state = s; for (const fn of subs) fn(s); };

    const contract = getAuthoringContract({ theme: this.settings.defaultTheme, aspect: "16:9", minFontPx: this.settings.minFontPx });
    const messages = buildDeckPrompt(input.sourceBody, { slideTarget: input.slideTarget, hint: input.hint }, contract);
    const client = makeDeckLlmClient(input.endpoint, input.model);
    const streamOpts = { model: input.model, temperature: this.settings.llmTemperature, maxTokens: this.settings.llmMaxTokens, suppressThinking: this.settings.llmSuppressThinking };

    const done: Promise<GenerateResult> = (async () => {
      const result = await runGenerateDeck({ client, messages, streamOpts, themeKey: input.themeKey, sourceLink: input.sourceLink, signal: controller.signal, onState: notify });
      if (result.status === "ok" && result.markdown != null) {
        try {
          const writtenPath = await this.writeDeckNote(input.targetPath, result.markdown, input.replace);
          await this.openDeckNote(writtenPath);
          if (result.usedFallback) new Notice(t("deck.error.cors"));
          new Notice(result.incomplete ? t("deck.notice.incomplete") : t("deck.notice.done", writtenPath));
        } catch (e) {
          // A write/open failure (create race, folder collision, refresh error) must not reject `done`
          // — surface it as an error state so the modal clears its timer and shows the reason.
          const msg = (e as Error).message;
          notify({ phase: "error", attempt: state.attempt, content: state.content, reasoning: state.reasoning, error: msg });
          new Notice(t("deck.error.write", msg));
          return { status: "fatal", error: msg, kind: "format" };
        }
      } else if (result.status === "fatal") {
        notify({ phase: "error", attempt: state.attempt, content: state.content, reasoning: state.reasoning, error: result.error });
        new Notice(result.kind === "server" ? t("deck.error.envelope", result.error ?? "") : t("deck.error.invalid", result.error ?? ""));
      }
      return result;
    })();
    void done.finally(() => { if (this.activeGeneration === handle) this.activeGeneration = null; });

    const handle: GenerationHandle = {
      snapshot: () => state,
      subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
      abort: () => controller.abort(),
      done,
      targetLabel: input.targetPath,
      startedAt: Date.now(),
    };
    this.activeGeneration = handle;
    return handle;
  }
}
