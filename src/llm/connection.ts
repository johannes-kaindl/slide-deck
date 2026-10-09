// Verdrahtung der Kit-Verbindung (`createLlmConnection`) mit den Settings DIESES Plugins. Eigene Datei,
// damit ein Test die echte Zuordnung der Felder trifft (llmEndpoints/llmModel/choice/request) statt einer Kopie.
import type { App } from "obsidian";
import { getLang } from "../i18n";
import type { SlideDeckSettings } from "../settings";
import type { LlmConnectionOptions } from "../vendor/kit-obsidian/llm-connection";
import { MODE } from "./request-params";

export const ENDPOINT_CALLER = "slide-deck";

export function deckConnectionOptions(o: {
  app: App;
  pluginId: string;
  settings: () => SlideDeckSettings;
  save: () => Promise<void>;
  /** Nur Tests: eigene Transporte statt XHR-Stream. */
  transports?: LlmConnectionOptions["transports"];
}): LlmConnectionOptions {
  return {
    app: o.app,
    pluginId: o.pluginId,
    caller: ENDPOINT_CALLER,
    capability: "chat",
    // Folien entstehen aus einer Notiz und duerfen formulieren: Modus "creative".
    mode: MODE,
    // Plugin-Budget (`max_tokens`); die Familien-Reserve kann es anheben.
    maxTokens: () => o.settings().llmMaxTokens,
    lang: () => getLang(),
    ...(o.transports ? { transports: o.transports } : {}),
    getSettings: () => {
      const s = o.settings();
      return { endpoints: s.llmEndpoints, choice: s.choice, model: s.llmModel, request: s.request };
    },
    // Erst in die Settings schreiben, dann speichern: die Endpunkt-Liste liest ihre Zeilen danach zurueck.
    persist: (patch) => {
      const s = o.settings();
      if (patch.endpoints !== undefined) s.llmEndpoints = patch.endpoints;
      if (patch.choice !== undefined) s.choice = patch.choice;
      if (patch.model !== undefined) s.llmModel = patch.model;
      if (patch.request !== undefined) s.request = patch.request;
      return o.save();
    },
  };
}
