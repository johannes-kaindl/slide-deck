import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { revealFolder, writeThemeCss } from "./theme-source";
import { THEME_ALIASES } from "./vendor/deck-core/pure/presets";
import { endpointListStrings, renderModelField, renderThinkingTestRow } from "./ai-settings-ui";
import { makeDeckLlmClient } from "./llm-client";
import { BACKENDS, DEFAULT_REQUEST_SETTINGS, FAMILIES, type BackendId, type FamilyId, type FieldExplain, type RequestSettings } from "./vendor/kit/sampling-profiles";
import { MODE, buildDeckParams, loadRequestSettings } from "./llm/request-params";
import { deviationDetail } from "./llm/request-text";
import { buildRequestSection } from "./vendor/kit-obsidian/request-section";
import { ENDPOINT_CALLER } from "./llm/resolve-endpoint";
import { reasoningHappened } from "./vendor/kit/reasoning";
import { githubHelpUrls, helpSettingDefinition } from "./vendor/kit-obsidian/help-setting";
import { writeClipboard } from "./vendor/kit/clipboard";
import { mergeSettings } from "./vendor/kit/settings";
import { migrateEndpointList, type EndpointConfig } from "./vendor/kit/endpoint_config";
import type { EndpointChoice } from "./vendor/kit/endpoint-source";
import { buildEndpointSourceSection, findEndpointManager } from "./vendor/kit-obsidian/endpoint-source";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab, installTabRefreshOnOpen } from "./vendor/kit-obsidian/settings_walker";
import { buildEndpointList } from "./vendor/kit-obsidian/endpoint-list";
import { createModelListCache } from "./vendor/kit/model-list-cache";
import { ENDPOINT_PRESETS } from "./vendor/kit/endpoint_diagnostics";
import { IMAGE_FUNCTIONS, DEFAULT_SUFFIXES, type ImageFunction } from "./image/functions";

export interface SlideDeckSettings {
  defaultTheme: string;
  minFontPx: number;
  imageScale: number;
  customCss: string;
  exportFolder: string;
  themesFolder: string;
  hideThemesFolder: boolean;
  /** Ordered fallback chain; the first reachable one wins. Each row carries its own API key
   *  so local and hosted providers can live in ONE list. */
  llmEndpoints: EndpointConfig[];
  /** Wahl gegenueber dem LLM Endpoint Manager (Endpunkt + Modell). Leer = automatisch. Nur
   *  relevant, solange der Manager installiert ist; sonst gilt `llmEndpoints` + `llmModel`. */
  choice: EndpointChoice;
  llmModel: string;
  /** Plugin-Budget (`max_tokens`): geht als Budget in den Request-Bau, die Familien-Reserve kann es anheben. */
  llmMaxTokens: number;
  /** Anfrage-Einstellungen (Sampling-Profil, Modus `creative`): Denkstufe und Ueberschreibungen je
   *  Familie. Ersetzt die Altfelder `llmTemperature`/`llmSuppressThinking` (migriert in `llm/request-params.ts`). */
  request: RequestSettings;
  /** Per-Funktion editierter Baustein — ueberschreibt DEFAULT_SUFFIXES aus image/functions.ts.
   *  Leer bis Task 10 eine Bedienoberflaeche dafuer baut. */
  imageSuffixes: Partial<Record<ImageFunction, string>>;
}
export const DEFAULT_SETTINGS: SlideDeckSettings = {
  defaultTheme: "kami", minFontPx: 24, imageScale: 2, customCss: "",
  exportFolder: "Slide-Deck-Export", themesFolder: "Slide-Deck-Themes", hideThemesFolder: true,
  llmEndpoints: [{ url: "http://localhost:1234" }], choice: {}, llmModel: "", llmMaxTokens: 8192, request: structuredClone(DEFAULT_REQUEST_SETTINGS),
  imageSuffixes: {},
};

/** `choice` kommt aus einer data.json und ist damit untrusted: nur nicht-leere Strings bleiben. */
function sanitizeChoice(raw: unknown): EndpointChoice {
  if (raw === null || typeof raw !== "object") return {};
  const { endpointId, model } = raw as EndpointChoice;
  return {
    ...(typeof endpointId === "string" && endpointId ? { endpointId } : {}),
    ...(typeof model === "string" && model ? { model } : {}),
  };
}

/** Merge persisted data over defaults, then migrate `llmEndpoints`: pre-0.7 data.json files
 *  carry a bare `string[]`, current ones an `EndpointConfig[]` — mergeSettings is a shallow,
 *  type-blind merge, so the migration has to run as a second pass right after it. Single
 *  extracted entry point so main.ts and tests share the exact same load path. */
export function loadSettings(raw: unknown): SlideDeckSettings {
  return loadSettingsWithReport(raw).settings;
}

/** Like `loadSettings`, plus what the caller has to tell the user: request values that were invalid
 *  (`dropped`) and a legacy temperature that became an override (`legacyTemperature`), and whether
 *  legacy fields were present at all (`migrated` → save once so the old fields are gone and the
 *  notice cannot repeat). */
export function loadSettingsWithReport(raw: unknown): { settings: SlideDeckSettings; dropped: string[]; legacyTemperature: number | null; migrated: boolean } {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);
  // Shallow, type-blind merge: llmEndpoints may still be string[] from an old data.json.
  const rawList = merged.llmEndpoints as unknown as (string | EndpointConfig)[] | undefined;
  const { request, dropped, legacyTemperature } = loadRequestSettings(raw);
  const legacy = merged as unknown as Record<string, unknown>;
  const migrated = "llmSuppressThinking" in legacy || "llmTemperature" in legacy;
  delete legacy.llmSuppressThinking;
  delete legacy.llmTemperature;
  const settings = { ...merged, llmEndpoints: migrateEndpointList(undefined, rawList), choice: sanitizeChoice(merged.choice), request };
  return { settings, dropped, legacyTemperature, migrated };
}

/** Migrate a persisted 0.4.x `defaultTheme` (e.g. "default"/"dark") to its Nordstern successor
 *  via THEME_ALIASES. Pure — call once right after settings are loaded, before anything reads
 *  `settings.defaultTheme`. Unknown/canonical keys pass through untouched. */
export function migrateLegacyThemeKeys(s: SlideDeckSettings): SlideDeckSettings {
  const alias = THEME_ALIASES[s.defaultTheme];
  return alias ? { ...s, defaultTheme: alias } : s;
}

/** Declarative settings tab (Obsidian ≥ 1.13: getSettingDefinitions, not the deprecated
 *  imperative display()). Plain controls bind via key ↔ get/setControlValue; the two pieces
 *  that need bespoke UI (the theme-key chip list, the export dropdown+button) use render. */
export class SlideDeckSettingTab extends PluginSettingTab {
  private uninstallRefresh: () => void = () => {};

  constructor(app: App, private plugin: SlideDeckPlugin) {
    super(app, plugin);
    // "Last request" and deviations must be current when the tab opens. The full rebuild is
    // `renderImperative()`, NOT `refreshUi()`: that goes through the native `update()`, which calls
    // `renderTab()` — the hook itself — and the tab would stay empty on first open.
    this.uninstallRefresh = installTabRefreshOnOpen(this, () => this.renderImperative());
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const themes = this.plugin.themeStore.getThemes();
    const themeOptions = Object.fromEntries(themes.map((e) => [e.key, e.label ?? e.key]));
    // Hilfe-Zeile (UI-STANDARD §8): ERSTES Element, keine Gruppe. Unter 1.13 ruft der Host display()
    // nie; der Walker-Fallback zeichnet sie darunter von selbst.
    const help = helpSettingDefinition({
      ...githubHelpUrls("slide-deck"),
      texts: {
        name: t("settings.help.name"),
        desc: t("settings.help.desc"),
        openDocs: t("settings.help.openDocs"),
        reportIssue: t("settings.help.reportIssue"),
      },
    });
    return [
      help,
      {
        type: "group",
        heading: t("settings.heading"),
        items: [
          { name: t("settings.theme.name"), desc: t("settings.theme.desc"),
            control: { type: "dropdown", key: "defaultTheme", options: themeOptions } },
          { name: t("settings.availableThemes.name"), desc: t("settings.availableThemes.desc"),
            render: (setting) => this.renderThemeChips(setting) },
          { name: t("settings.minFont.name"), desc: t("settings.minFont.desc"),
            control: { type: "number", key: "minFontPx", min: 1 } },
          { name: t("settings.imageScale.name"), desc: t("settings.imageScale.desc"),
            control: { type: "number", key: "imageScale", min: 1, step: "any" } },
          { name: t("settings.exportFolder.name"), desc: t("settings.exportFolder.desc"),
            control: { type: "folder", key: "exportFolder", placeholder: DEFAULT_SETTINGS.exportFolder, includeRoot: true } },
          { name: t("settings.themesFolder.name"), desc: t("settings.themesFolder.desc"),
            control: { type: "folder", key: "themesFolder", placeholder: DEFAULT_SETTINGS.themesFolder, includeRoot: true } },
          { name: t("settings.openFolder.name"), desc: t("settings.openFolder.desc"),
            render: (setting) => {
              setting.addButton((b) => b.setButtonText(t("settings.openFolder.button"))
                .onClick(() => revealFolder(this.app, this.plugin.settings.themesFolder)));
            } },
          { name: t("settings.exportTheme.name"), desc: t("settings.exportTheme.desc"),
            render: (setting) => this.renderExportTheme(setting) },
          { name: t("settings.hideFolder.name"), desc: t("settings.hideFolder.desc"),
            control: { type: "toggle", key: "hideThemesFolder" } },
          { name: t("settings.customCss.name"), desc: t("settings.customCss.desc"),
            control: { type: "textarea", key: "customCss" } },
        ],
      },
      {
        type: "group",
        heading: t("deck.settings.heading"),
        items: [
          { name: t("deck.settings.endpoints.name"), desc: t("deck.settings.endpoints.desc"),
            render: (setting) => this.renderEndpoints(setting) },
          { name: t("deck.settings.model.name"), desc: t("deck.settings.model.desc"),
            render: (setting) => this.renderModel(setting) },
          { name: t("deck.settings.maxTokens.name"), desc: t("deck.settings.maxTokens.desc"),
            control: { type: "number", key: "llmMaxTokens", min: 256 } },
          { name: "", render: (setting) => this.renderRequestSection(setting) },
          { name: t("deck.settings.thinkingTest.name"), desc: t("deck.settings.thinkingTest.desc"),
            render: (setting) => this.renderThinkingTest(setting) },
        ],
      },
      {
        type: "group",
        heading: t("settings.imageFunctions.heading"),
        items: IMAGE_FUNCTIONS.map((fn) => ({
          name: t(`image.fn.${fn}.name`),
          desc: t(`image.fn.${fn}.desc`),
          render: (setting: Setting) => this.renderSuffixRow(setting, fn),
        })),
      },
    ];
  }

  /** Thin wrapper around the kit walker's settingBodyHost(): the §8 blocks draw several
   *  Setting rows, but the walker hands us exactly one — settingBodyHost() strips Obsidian's
   *  "setting-item" flex-row class so nested rows stack instead of becoming flex children.
   *  `sd-settings-host` (styles.css) is this repo's own addition on top: it carries the
   *  vertical rhythm (border-top + padding) a top-level setting-item row would otherwise have
   *  contributed, so spacing to neighboring settings in the tab is preserved. Kept local
   *  rather than folded into the kit call sites because the class is repo-specific CSS, not
   *  part of the shared walker contract. */
  private hostFor(setting: Setting): HTMLElement {
    const host = settingBodyHost(setting);
    host.addClass("sd-settings-host");
    return host;
  }

  /** Model lists per endpoint, shared by every row of the kit's endpoint editor. Owned by the
   *  TAB, not by a render pass: it deliberately outlives the rebuilds a row edit triggers, so
   *  three rows do not each fire their own `/v1/models`. Cleared in `hide()` — see there. */
  private readonly modelCache = createModelListCache();

  /** URL of the endpoint the resolver currently picks, or `null` while unresolved. The kit asks
   *  for this SYNCHRONOUSLY (per row, to label it "in use" vs "reachable, position N") while the
   *  answer is a network question — so it is resolved once per render into this field and read
   *  from here. */
  private activeUrl: string | null = null;

  private renderEndpoints(setting: Setting): void {
    const host = this.hostFor(setting);
    buildEndpointSourceSection({
      app: this.app, containerEl: host, capability: "chat", caller: ENDPOINT_CALLER,
      choice: () => this.plugin.settings.choice,
      setChoice: async (c) => { this.plugin.settings.choice = c; await this.plugin.saveSettings(); await this.plugin.resolveEndpoint(); },
      local: () => this.plugin.settings.llmEndpoints,
      strings: {
        managed: t("deck.settings.source.managed"), managedDesc: t("deck.settings.source.managedDesc"),
        openManager: t("deck.settings.source.openManager"), pickEndpoint: t("deck.settings.source.pickEndpoint"),
        automatic: t("deck.settings.source.automatic"), model: t("deck.settings.model.name"),
        importLocal: t("deck.settings.source.importLocal"),
        imported: (r) => t("deck.settings.source.imported", String(r.added.length), String(r.merged.length)),
        importFailed: t("deck.settings.source.importFailed"),
        modelHint: (key) => (key ? t(`deck.settings.model.hint.${key}`) : ""),
        savedSuffix: t("deck.settings.model.saved"), refreshModels: t("deck.settings.model.refresh"),
        saveFailed: t("deck.settings.endpoint.saveFailed"),
      },
      renderLocalList: () => this.renderLocalEndpointList(host),
      rerender: () => this.refreshUi(),
    });
  }

  /** The local list editor — shown only while no LLM Endpoint Manager is installed. */
  private renderLocalEndpointList(host: HTMLElement): void {
    buildEndpointList({
      containerEl: host,
      label: t("deck.settings.endpoints.name"),
      desc: t("deck.settings.endpoints.desc"),
      placeholder: ENDPOINT_PRESETS[0].url,
      strings: endpointListStrings(),
      cache: this.modelCache,
      get: () => this.plugin.settings.llmEndpoints,
      // Synchronous in-memory mutation; the kit calls save() right after and awaits both.
      set: (eps) => { this.plugin.settings.llmEndpoints = eps; },
      active: () => this.activeUrl,
      // ONE client per row carries both the reachability probe and the model list, so the
      // status icon and the model dropdown can never describe different endpoints.
      clientFor: (cfg) => makeDeckLlmClient(cfg, ""),
      globalModel: () => this.plugin.settings.llmModel,
      save: () => this.plugin.saveSettings(),
      reconnect: () => this.syncActiveUrl().then(() => undefined),
      rerender: () => this.refreshUi(),
    });
    // First resolve of this render pass. Re-renders only when the answer actually changed,
    // which terminates: the follow-up pass resolves the same value and stops there.
    void this.syncActiveUrl().then((changed) => { if (changed) this.refreshUi(); });
  }

  /** Resolve who is in use and report whether that changed. */
  private async syncActiveUrl(): Promise<boolean> {
    const before = this.activeUrl;
    this.activeUrl = (await this.activeEndpoint())?.url ?? null;
    return this.activeUrl !== before;
  }

  private renderModel(setting: Setting): void {
    // With the manager, the model is chosen inside the endpoint section (choice.model). Decided
    // HERE, not while building the definitions: Obsidian >= 1.13 may cache that list across the
    // manager appearing or vanishing, while render() runs on every open of the tab.
    if (findEndpointManager(this.app)) { setting.settingEl.addClass("sd-setting-managed"); return; }
    renderModelField(this.hostFor(setting), {
      getModel: () => this.plugin.settings.llmModel,
      setModel: async (m) => { this.plugin.settings.llmModel = m.trim(); await this.plugin.saveSettings(); },
      listModels: async () => {
        const ep = await this.activeEndpoint();
        return ep ? makeDeckLlmClient(ep, "").listModels() : [];
      },
      modelContext: async (m) => {
        const ep = await this.activeEndpoint();
        return ep ? makeDeckLlmClient(ep, m).modelContext(m) : null;
      },
    });
  }

  /** The "Request" section — sampling profile of mode `creative` (Kit `request-section`). The
   *  Thinking level lives here; the plugin's own token budget (`llmMaxTokens`) is passed in so the
   *  section shows when the family reserve raises it. Family and backend are translated by the plugin. */
  private renderRequestSection(setting: Setting): void {
    const host = this.hostFor(setting);
    buildRequestSection({
      containerEl: host,
      modes: [MODE],
      state: () => this.plugin.requestSectionState(),
      settings: () => this.plugin.settings.request,
      save: (s) => this.plugin.saveRequestSettings(s),
      maxTokens: () => this.plugin.settings.llmMaxTokens,
      session: this.plugin.requestSession,
      rerender: () => this.refreshUi(),
      strings: {
        title: t("request.title"),
        head: (family, familySource, backend, backendSource) => {
          const famLabel = family === "—" ? "—" : (FAMILIES[family as FamilyId]?.label ?? family);
          const backLabel = backend === "unknown" ? t("request.backendSource.none") : (BACKENDS[backend as BackendId]?.label ?? backend);
          return t("request.head", famLabel, t(`request.familySource.${familySource}`), backLabel, t(`request.backendSource.${backendSource}`));
        },
        unknownFamily: t("request.unknownFamily"),
        jitWarning: (model, defaultModel) => t("request.jitWarning", model, defaultModel),
        sentAs: (model) => t("request.sentAs", model),
        modeHeading: (mode) => t(`request.mode.${mode}`),
        fieldName: (field) => t(`request.field.${field}`),
        fieldDesc: (e) => this.fieldStateText(e),
        reset: t("request.reset"),
        thinkingLevel: t("request.thinkingLevel"),
        level: (l) => t(`request.level.${l}`),
        levelPicker: t("request.levelPicker"),
        levelPickerDesc: t("request.levelPickerDesc"),
        dormant: (fam) => t("request.dormant", fam === "unknown" ? t("request.familySource.none") : (FAMILIES[fam]?.label ?? fam)),
        deleteDormant: t("request.deleteDormant"),
        lastRequest: t("request.lastRequest"),
        lastRequestNone: t("request.lastRequestNone"),
        copy: t("request.copy"),
        copied: t("request.copied"),
        deviationsOk: t("request.deviationsOk"),
        deviationsWarn: (n) => t("request.deviationsWarn", String(n)),
        deviation: (kind, count, detail) => `${deviationDetail(kind, detail)} (${count}×)`,
      },
    });
  }

  /** Explanation per field: state (sent / not sent and why) plus note. */
  private fieldStateText(e: FieldExplain): string {
    const key = {
      "sent-effective": "request.state.sentEffective",
      "sent-unproven": "request.state.sentUnproven",
      "not-sent-ignored": "request.state.notSentIgnored",
      "not-sent-unsupported": "request.state.notSentUnsupported",
      "not-sent-unknown-family": "request.state.notSentUnknownFamily",
      "not-sent-no-value": "request.state.notSentNoValue",
    }[e.state];
    let s = t(key);
    const noteKey = e.note ? {
      "raised-to-reserve": "request.note.raisedToReserve",
      "raised-to-thinking-floor": "request.note.raisedToThinkingFloor",
      "below-thinking-floor": "request.note.belowThinkingFloor",
      "off-not-possible": "request.note.offNotPossible",
    }[e.note] : undefined;
    if (noteKey) s += ` ${t(noteKey)}`;
    if (e.field === "top_p") s += t("request.top_p.hint");
    return s;
  }

  private renderThinkingTest(setting: Setting): void {
    renderThinkingTestRow(this.hostFor(setting), {
      getModel: () => this.effectiveModel(),
      testSuppress: (model) => this.runSuppressTest(model),
    });
  }

  private async activeEndpoint(): Promise<EndpointConfig | null> {
    return (await this.plugin.resolveEndpoint()).config;
  }

  /** Model the endpoint source resolves to — with the manager active the global `llmModel` field
   *  is not shown, so the thinking row must follow the resolved one. */
  private effectiveModel(): string {
    return findEndpointManager(this.app) ? this.plugin.activeModel : this.plugin.settings.llmModel;
  }

  /** One real, minimal call with thinking off: did the model think anyway? This is the only place
   *  that replaces a name guess with evidence. Built through `buildDeckParams` like every other request. */
  private async runSuppressTest(model: string): Promise<{ thought: boolean }> {
    const ep = await this.activeEndpoint();
    if (!ep) throw new Error(t("deck.modal.noEndpoint"));
    const src = this.plugin.deckSource(model);
    const { params } = buildDeckParams({ family: src.family, backend: src.backend, thinking: "off", maxTokens: 32, overrides: { temperature: 0 } });
    const client = makeDeckLlmClient(ep, model);
    const r = await client.generate(
      [{ role: "user", content: "Reply with the single word: ok" }],
      { model, sentModel: src.sentModel, params },
      () => {}, () => {},
    );
    return { thought: reasoningHappened(r.content, r.reasoning) };
  }

  /** Imperative fallback for Obsidian < 1.13 (which does not call getSettingDefinitions).
   *  On ≥ 1.13 the framework renders declaratively and this is never called; it just
   *  delegates to the walker so there is a single source of truth. */
  display(): void { this.renderImperative(); }

  /** Obsidian calls this when the tab closes. Clearing the model cache is a REQUIREMENT, not
   *  housekeeping: it holds promises and deliberately survives tab rebuilds, so without this a
   *  server that was down when first probed stays "not reachable" for the rest of the session —
   *  starting LM Studio and reopening the settings would change nothing. */
  hide(): void {
    this.modelCache.clear();
    this.uninstallRefresh();
    super.hide();
  }

  private cleanupPrevious: () => void = () => {};

  private renderImperative(): void {
    this.cleanupPrevious();
    const { containerEl } = this;
    containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(
      containerEl,
      this.getSettingDefinitions(),
      this,
      this.app,
    );
  }

  /** Read the current value for a bound control key. Called on every render. */
  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    switch (key) {
      // Coerce an unknown persisted default to "kami" so the dropdown shows a valid option.
      case "defaultTheme": {
        const map = this.plugin.themeStore.getMap();
        if (map.has(s.defaultTheme)) return s.defaultTheme;
        const alias = THEME_ALIASES[s.defaultTheme];
        return alias && map.has(alias) ? alias : "kami";
      }
      case "minFontPx": return s.minFontPx;
      case "imageScale": return s.imageScale;
      case "exportFolder": return s.exportFolder;
      case "themesFolder": return s.themesFolder;
      case "hideThemesFolder": return s.hideThemesFolder;
      case "customCss": return s.customCss;
      case "llmModel": return s.llmModel;
      case "llmMaxTokens": return s.llmMaxTokens;
      default: return undefined;
    }
  }

  /** Persist a changed control value (+ run the key's side effects), then save. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    switch (key) {
      case "defaultTheme": s.defaultTheme = String(value); break;
      case "minFontPx": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.minFontPx = n; break; }
      case "imageScale": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.imageScale = n; break; }
      case "exportFolder": s.exportFolder = String(value).trim() || DEFAULT_SETTINGS.exportFolder; break;
      case "customCss": s.customCss = String(value); break;
      case "llmModel": s.llmModel = String(value).trim(); break;
      case "llmMaxTokens": { const n = Number(value); if (Number.isFinite(n) && n > 0) s.llmMaxTokens = Math.floor(n); break; }
      case "themesFolder":
        s.themesFolder = String(value).trim() || DEFAULT_SETTINGS.themesFolder;
        await this.plugin.saveSettings();
        await this.plugin.refreshThemes();
        this.plugin.applyFolderHide();
        return;
      case "hideThemesFolder":
        s.hideThemesFolder = Boolean(value);
        await this.plugin.saveSettings();
        this.plugin.applyFolderHide();
        return;
      default: return;
    }
    await this.plugin.saveSettings();
  }

  /** Available-themes reference — the live list of valid frontmatter `theme:` values. */
  private renderThemeChips(setting: Setting): void {
    const chips = setting.controlEl.createDiv({ cls: "sd-theme-chips" });
    for (const e of this.plugin.themeStore.getThemes()) {
      const tag = e.source === "user" ? t("settings.userTag") : t("settings.builtinTag");
      const label = /\s/.test(e.key) ? `"${e.key}"` : e.key;
      const chip = chips.createSpan({ cls: "sd-theme-chip", text: `${label} (${tag})` });
      chip.addEventListener("click", () => void writeClipboard(e.key));
    }
  }

  /** Export any theme as an editable `.css` starting point (dropdown picks which). */
  private renderExportTheme(setting: Setting): void {
    const themes = this.plugin.themeStore.getThemes();
    let exportPick = themes[0]?.key ?? "default";
    setting.addDropdown((c) => { for (const e of themes) c.addOption(e.key, e.label ?? e.key); c.setValue(exportPick).onChange((v) => { exportPick = v; }); });
    setting.addButton((b) => b.setButtonText(t("settings.exportTheme.button")).onClick(async () => {
      const entry = this.plugin.themeStore.resolve(exportPick);
      const path = await writeThemeCss(this.app.vault.adapter, this.plugin.settings.themesFolder, entry.key, entry.themeCss);
      new Notice(t("notice.themeExported", path));
      await this.plugin.refreshThemes();
      this.refreshUi(); // a new theme file may have appeared → re-render definitions (dropdown + chips)
    }));
  }

  /** Eine Zeile pro Bildfunktion. Mutation bei `blur`, NICHT bei `onChange` — sonst
   *  persistiert jeder Tastendruck. Der Reset erscheint nur, wenn etwas zu resetten ist —
   *  und das muss sich live aktualisieren, wenn der Nutzer beim `blur` erst einen eigenen
   *  Wert einträgt. Neu gezeichnet wird aber NUR, wenn sich die Sichtbarkeit des Knopfes
   *  tatsächlich ändert (Eintrag entsteht/verschwindet) — ein Tab, der bei jedem `blur`
   *  neu aufbaut, springt und kann den Fokus wegnehmen, auch wenn sich nichts geändert hat. */
  private renderSuffixRow(setting: Setting, fn: ImageFunction): void {
    const aktuell = this.plugin.settings.imageSuffixes[fn] ?? "";
    setting.addText((text) => {
      text.setPlaceholder(DEFAULT_SUFFIXES[fn]).setValue(aktuell);
      text.inputEl.addEventListener("blur", () => {
        const hatteEintrag = fn in this.plugin.settings.imageSuffixes;
        const wert = text.getValue().trim();
        if (wert === "" || wert === DEFAULT_SUFFIXES[fn]) delete this.plugin.settings.imageSuffixes[fn];
        else this.plugin.settings.imageSuffixes[fn] = wert;
        void this.plugin.saveSettings();
        const hatEintrag = fn in this.plugin.settings.imageSuffixes;
        if (hatteEintrag !== hatEintrag) this.refreshUi();
      });
    });
    if (aktuell !== "") {
      setting.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip(t("settings.imageFunctions.reset"))
        .onClick(() => {
          delete this.plugin.settings.imageSuffixes[fn];
          void this.plugin.saveSettings();
          this.refreshUi();
        }));
    }
  }

  /** Re-render the tab. On ≥ 1.13 the declarative framework exposes update(); on the < 1.13
   *  fallback that method does not exist, so re-run our imperative display() instead. */
  private refreshUi(): void {
    refreshSettingsTab(this, () => this.renderImperative());
  }
}
