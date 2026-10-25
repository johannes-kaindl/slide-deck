import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t, getLang } from "./i18n";
import { revealFolder, writeThemeCss } from "./theme-source";
import { THEME_ALIASES } from "./vendor/deck-core/pure/presets";
import { renderThinkingTestRow } from "./ai-settings-ui";
import { deckResultOf } from "./llm-client";
import { DEFAULT_REQUEST_SETTINGS, type RequestSettings } from "./vendor/kit/sampling-profiles";
import { loadRequestSettings } from "./llm/request-params";
import { reasoningHappened } from "./vendor/kit/reasoning";
import { githubHelpUrls, helpSettingDefinition } from "./vendor/kit-obsidian/help-setting";
import { writeClipboard } from "./vendor/kit/clipboard";
import { mergeSettings } from "./vendor/kit/settings";
import { fillMissingRowModels, migrateEndpointList, type EndpointConfig } from "./vendor/kit/endpoint_config";
import { sanitizeChoice, type EndpointChoice } from "./vendor/kit/endpoint-source";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab, installTabRefreshOnOpen } from "./vendor/kit-obsidian/settings_walker";
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
   *  relevant, solange der Manager installiert ist; sonst gilt `llmEndpoints` (das Modell steht je Zeile). */
  choice: EndpointChoice;
  /** Altfeld (globales Modell, bis Welle 17): wird nicht mehr gelesen. `loadSettingsWithReport` zieht den
   *  Wert einmal in die Zeilen ohne Modell und entfernt den Schluessel. */
  llmModel?: string;
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
  llmEndpoints: [{ url: "http://localhost:1234" }], choice: {}, llmMaxTokens: 8192, request: structuredClone(DEFAULT_REQUEST_SETTINGS),
  imageSuffixes: {},
};

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
  const migrated = "llmSuppressThinking" in legacy || "llmTemperature" in legacy || "llmModel" in legacy;
  delete legacy.llmSuppressThinking;
  delete legacy.llmTemperature;
  // Globales Modell (bis Welle 17): einmal in die Zeilen ohne Modell, danach ist der Schluessel weg und ein
  // zweiter Lauf aendert nichts — eine vom Nutzer geleerte Zeile bleibt leer.
  const legacyModel = legacy.llmModel;
  delete legacy.llmModel;
  const settings = { ...merged, llmEndpoints: fillMissingRowModels(migrateEndpointList(undefined, rawList), legacyModel), choice: sanitizeChoice(merged.choice), request };
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
  /** Ob der zuletzt gemeldete Endpunkt Claude war: `onSourceResolved` zeichnet nur bei einem Wechsel neu. */
  private lastClaude = false;

  constructor(app: App, private plugin: SlideDeckPlugin) {
    super(app, plugin);
    // "Last request" and deviations must be current when the tab opens. The full rebuild is
    // `renderImperative()`, NOT `refreshUi()`: that goes through the native `update()`, which calls
    // `renderTab()` — the hook itself — and the tab would stay empty on first open.
    this.uninstallRefresh = installTabRefreshOnOpen(this, () => this.renderImperative());
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    // Auf Claude gibt es kein "aus" (das Kit sendet dort den niedrigsten Aufwand), ein Denktext im Ergebnis ist kein Fehler des
    // Servers: die Frage des Tests ("denkt es trotz aus?") hat dort keinen Gegenstand. Vor der ersten Aufloesung ist die Familie
    // neutral (null): die Zeile steht dann da, und `onSourceResolved` nimmt sie nach der Aufloesung zurueck.
    const claude = this.plugin.llm.source().family === "claude";
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
          // Quelle, Liste und Anfrage-Abschnitt zeichnet die Kit-Verbindung in einem Zug.
          { name: "", render: (setting) => this.renderConnection(setting) },
          { name: t("deck.settings.maxTokens.name"), desc: t("deck.settings.maxTokens.desc"),
            control: { type: "number", key: "llmMaxTokens", min: 256 } },
          ...(claude ? [] : [{ name: t("deck.settings.thinkingTest.name"), desc: t("deck.settings.thinkingTest.desc"),
            render: (setting: Setting) => this.renderThinkingTest(setting) }]),
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

  /** The connection draws source, endpoint list and the "Request" section. It empties its container on
   *  every redraw, so it gets a container of its own — never the host shared with other rows. */
  private renderConnection(setting: Setting): void {
    const host = this.hostFor(setting);
    this.plugin.llm.renderSettings(host.createDiv({ cls: "sd-connection" }), { lang: getLang() });
  }

  private renderThinkingTest(setting: Setting): void {
    renderThinkingTestRow(this.hostFor(setting), {
      getModel: async () => (await this.plugin.llm.resolve()).model,
      testSuppress: (model) => this.runSuppressTest(model),
    });
  }

  /** One real, minimal call with thinking off: did the model think anyway? This is the only place
   *  that replaces a name guess with evidence. Built through `buildDeckParams` like every other request. */
  private async runSuppressTest(model: string): Promise<{ thought: boolean }> {
    const r = deckResultOf(await this.plugin.llm.complete(
      { messages: [{ role: "user", content: "Reply with the single word: ok" }] },
      { model, thinking: "off", overrides: { temperature: 0, max_tokens: 32 } },
    ));
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
    this.plugin.llm.hideSettings();
    this.uninstallRefresh();
    super.hide();
  }

  private cleanupPrevious: () => void = () => {};

  /** Die Verbindung hat aufgeloest (Endpunkt oder Modell geaendert): die Zeile "Thinking test" haengt an der Familie und folgt ihr.
   *  Das Kit zeichnet im offenen Tab nur seinen eigenen Behaelter neu; ohne diesen Haken bliebe die Zeile bis zum naechsten Oeffnen stehen.
   *  Nur bei einem Wechsel neu zeichnen: jede Aufloesung ruft diesen Haken, und das Neuzeichnen loest selbst auf (Kreis). */
  onSourceResolved(): void {
    const claude = this.plugin.llm.source().family === "claude";
    if (claude === this.lastClaude) return;
    this.lastClaude = claude;
    this.refreshUi();
  }

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
