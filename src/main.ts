import { Plugin, getLanguage, TFile, TAbstractFile, Notice, normalizePath } from "obsidian";
import { exportPdf, exportImages } from "./export";
import { SlideDeckHubView, VIEW_TYPE_HUB } from "./hub-view";
import { t, pickLang, setLang } from "./i18n";
import { SlideDeckSettings, SlideDeckSettingTab, migrateLegacyThemeKeys, loadSettings } from "./settings";
import { ThemeStore } from "./theme-registry";
import { buildHideCss, normalizeFolder } from "./folder-hide";
import { runGenerateDeck, type GenState, type GenerateResult, type GenerationHandle } from "./generate-deck";
import { makeDeckLlmClient } from "./llm-client";
import { resolveDeckEndpoint } from "./llm/resolve-endpoint";
import type { EndpointSourceResult } from "./vendor/kit/endpoint-source";
import { findEndpointManager } from "./vendor/kit-obsidian/endpoint-source";
import type { EndpointConfig } from "./vendor/kit/endpoint_config";
import { buildDeckPrompt } from "./vendor/deck-core/pure/llm/deck-prompt";
import { getAuthoringContract } from "./vendor/deck-core/pure/constraints/contract";
import { registerSlotCard } from "./image/slot-card";
import type { CardState } from "./image/slot-card-model";
import type { MarkdownPostProcessorContext } from "obsidian";   // TFile ist bereits importiert
import { readImageApi, ensureReady } from "./image/image-api";
import { parseSlot, filledMarkdown, replaceSlot, findSlotOnce, fenceSlot } from "./image/slot-format";
import { buildRequest } from "./image/functions";
import { insertImageSlot } from "./image/insert-slot";

export interface DeckGenInput {
  sourceBody: string; slideTarget: number | "auto"; hint: string;
  themeKey: string; model: string; endpoint: EndpointConfig; targetPath: string; replace: boolean;
  sourceLink: string; // "[[Note]]" backlink to the origin note
}

export default class SlideDeckPlugin extends Plugin {
  declare public settings: SlideDeckSettings;
  public themeStore!: ThemeStore;
  private hideSheet: CSSStyleSheet | null = null;
  public activeGeneration: GenerationHandle | null = null;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    this.settings = migrateLegacyThemeKeys(loadSettings(await this.loadData()));

    this.themeStore = new ThemeStore(this.app, () => this.settings.themesFolder);
    await this.themeStore.refresh();
    // After layout-ready, not here: the hide targets the file explorer and adopts into
    // `rootSplit.doc`, neither of which is guaranteed to exist this early in onload.
    this.app.workspace.onLayoutReady(() => this.applyFolderHide());

    this.addSettingTab(new SlideDeckSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_HUB, (leaf) => new SlideDeckHubView(leaf, this));
    registerSlotCard(this);
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
    this.addCommand({
      id: "insert-image-slot", name: t("cmd.insertImageSlot"),
      editorCallback: (editor) => insertImageSlot(this.app, editor),
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

  /** Model the last resolveEndpoint() picked (choice.model → manager default → llmModel).
   *  Read by the settings tab, which must not resolve on every paint. */
  public activeModel = "";

  /** EINZIGER Weg zum Endpunkt: Manager zuerst (bei JEDEM Aufruf frisch gefunden, nie
   *  gecacht — das Plugin kann jederzeit deaktiviert werden), sonst die lokale Liste. */
  async resolveEndpoint(): Promise<EndpointSourceResult> {
    const r = await resolveDeckEndpoint(
      this.settings, findEndpointManager(this.app),
      (ep) => makeDeckLlmClient(ep, "").ping(),
    );
    this.activeModel = r.model;
    return r;
  }

  async runSlot(source: string, ctx: MarkdownPostProcessorContext, onState: (s: CardState) => void): Promise<void> {
    const api = readImageApi(this.app);
    if (!api) { onState({ kind: "unavailable" }); return; }
    // Der Vertrag von local-image-generator sagt zu, dass seine Aufrufe nicht werfen — aber
    // ein FREMDES Plugin kann trotzdem werfen, und ohne dieses try bliebe die Karte fuer den
    // Rest der Sitzung im Lade-Zustand haengen. Jede Ausnahme endet deshalb im sichtbaren
    // error-Zustand, nie in einem haengenden.
    try {
      // W2: der Block muss VOR dem minutenlangen Lauf eindeutig auffindbar sein — die Spec
      // verlangt "geschrieben -> geprueft -> gerechnet", nicht umgekehrt. Drei der Faelle, in
      // denen das Rueckschreiben sonst scheitert (andere Fence-Form, Mehrfachvorkommen,
      // Einrueckung), sind schon jetzt sichtbar; nur "waehrend des Laufs geaendert" ist es
      // nicht — dafuer bleibt die Pruefung nach dem Lauf weiter unten stehen.
      const voll = fenceSlot(source);
      const vorDatei = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(vorDatei instanceof TFile)) {
        onState({ kind: "error", message: t("image.slot.notFound") });
        return;
      }
      const vorInhalt = await this.app.vault.read(vorDatei);
      if (!findSlotOnce(vorInhalt, voll)) {
        onState({ kind: "error", message: t("image.slot.notFound") });
        return;
      }

      const status = await ensureReady(api);
      if (!status.ready) {
        // `reason` ist UNABHAENGIG von `ready` typisiert — `ready:false, reason:null` ist eine
        // gueltige Kombination und darf NICHT durchfallen: das Backend hat sich gerade selbst
        // als nicht bereit gemeldet. Kein erfundener Fehlgrund, sondern eine ehrliche Meldung.
        if (status.reason) onState({ kind: "blocked", reason: status.reason });
        else onState({ kind: "error", message: t("image.fail.not-ready") });
        return;
      }

      const block = parseSlot(source);
      const req = buildRequest(block, status.capabilities, this.settings.imageSuffixes);
      onState({ kind: "running", phase: "loading-model", pct: null });

      const res = await api.generate({ ...req,
        onProgress: (pct, phase) => onState({ kind: "running", phase, pct }) });
      if (!res.ok) {
        if (res.reason === "failed") onState({ kind: "error", message: t("image.fail.failed", res.message) });
        else onState({ kind: "blocked", reason: res.reason });
        return;
      }

      // `createNote` bewusst WEGGELASSEN: dann gilt die Einstellung des Nutzers in LIG.
      const saved = await api.save(res.image);
      if (!saved.ok) { onState({ kind: "error", message: t("image.fail.write-failed", saved.message) }); return; }

      const datei = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      // Erzeugen UND Speichern sind an dieser Stelle bereits geglueckt — das Bild existiert,
      // wir koennen es nur nicht mehr einsetzen. Fuer den Nutzer ist das derselbe Fall wie
      // "Block nicht mehr auffindbar": er braucht den Pfad SEINES BILDES, nicht den der Notiz.
      if (!(datei instanceof TFile)) { onState({ kind: "error", message: t("image.slot.lost", saved.imagePath) }); return; }

      // Der Block wird ueber TEXTIDENTITAET wiedergefunden, nicht ueber die Zeilen aus
      // getSectionInfo: zwischen Start und Ende liegen Minuten, in denen die Notiz sich
      // geaendert haben kann. Nicht gefunden oder mehrdeutig -> NICHT schreiben.
      const ersatz = filledMarkdown(block.funktion, block.prompt, saved.imagePath);
      let getroffen = false;
      await this.app.vault.process(datei, (inhalt) => {
        const neu = replaceSlot(inhalt, voll, ersatz);
        if (neu === null) return inhalt;
        getroffen = true;
        return neu;
      });
      if (getroffen) onState({ kind: "done", path: saved.imagePath });
      else onState({ kind: "error", message: t("image.slot.lost", saved.imagePath) });
    } catch (err) {
      onState({ kind: "error", message: t("image.fail.failed", err instanceof Error ? err.message : String(err)) });
    }
  }

  /** Re-scan the themes folder, then refresh any open preview so the dropdown reflects it. */
  async refreshThemes(): Promise<void> {
    await this.themeStore.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HUB)) {
      if (leaf.view instanceof SlideDeckHubView) void leaf.view.refreshPreview();
    }
  }

  /** The main window's document — where the file explorer lives. Deliberately NOT
   *  `activeDocument`: at load time that can point at a restored popout window, and adopting
   *  a constructed sheet into a document from another realm throws NotAllowedError ("Sharing
   *  constructed stylesheets in multiple documents") — that killed onload (0.4.0, Windows +
   *  popout), and the 0.5.0 activeDocument-realm fix still parked the CSS in the popout, away
   *  from the explorer. `rootSplit.doc` is the bundle's own realm, so constructor-document ==
   *  adopt target always. */
  private get mainDoc(): Document {
    return this.app.workspace.rootSplit.doc;
  }

  /** Apply (or clear) the explorer-hide stylesheet for the themes folder.
   *  try/catch as last resort: the hide is cosmetic and must never break plugin load. */
  applyFolderHide(): void {
    try {
      const doc = this.mainDoc;
      if (!this.hideSheet) {
        this.hideSheet = new CSSStyleSheet();
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.hideSheet];
      }
      this.hideSheet.replaceSync(buildHideCss(this.settings.themesFolder, this.settings.hideThemesFolder));
    } catch (err) {
      console.error("slide-deck: applyFolderHide failed — themes folder stays visible (cosmetic)", err);
    }
  }

  onunload(): void {
    if (!this.hideSheet) return;
    const doc = this.mainDoc;
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== this.hideSheet);
  }

  /** Open (or reveal) the hub and switch it to the given tab. Both commands and the ribbon
   *  icon share one leaf/view now (UI-STANDARD §8 hub) instead of two separate leaves. */
  private async activateHub(tab: "preview" | "generate"): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_HUB)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_HUB, active: true });
    void workspace.revealLeaf(leaf);
    if (leaf.view instanceof SlideDeckHubView) leaf.view.setTab(tab);
  }

  async activatePreview(): Promise<void> { await this.activateHub("preview"); }

  /** Open (or reveal) the hub on the generation tab. */
  async activateGenerateView(): Promise<void> { await this.activateHub("generate"); }

  /** Refresh the preview panel in every open hub leaf, regardless of which tab is active —
   *  the same guarantee the former standalone SlideDeckView gave (no active-leaf listener). */
  async refreshActivePreview(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HUB)) {
      if (leaf.view instanceof SlideDeckHubView) await leaf.view.refreshPreview();
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
      const result = await runGenerateDeck({ client, messages, streamOpts, themeKey: input.themeKey, sourceLink: input.sourceLink, model: input.model, signal: controller.signal, onState: notify });
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
