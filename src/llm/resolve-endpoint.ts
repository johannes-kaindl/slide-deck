// Quellenwahl der Deck-Generierung: zuerst der LLM Endpoint Manager (falls installiert), sonst
// die lokale Liste dieses Plugins. Kein obsidian-Import — das Finden des Managers braucht `app`
// und bleibt beim Aufrufer (main.ts). Muster: yijing-oracle/src/core/llm/resolve-endpoint.ts.
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import {
  resolveEndpointSource,
  type EndpointSourceResult,
  type LlmEndpointManagerApi,
} from "../vendor/kit/endpoint-source";
import type { SlideDeckSettings } from "../settings";

export const ENDPOINT_CALLER = "slide-deck";

/** Ein Durchlauf. `ping` prueft EINEN Endpunkt (nur der lokale Pfad braucht ihn). */
export function resolveDeckEndpoint(
  settings: Pick<SlideDeckSettings, "llmEndpoints" | "llmModel" | "choice">,
  manager: LlmEndpointManagerApi | null,
  ping: (cfg: EndpointConfig) => Promise<boolean>,
): Promise<EndpointSourceResult> {
  return resolveEndpointSource(
    {
      manager,
      local: settings.llmEndpoints,
      localModel: settings.llmModel,
      capability: "chat",
      choice: settings.choice,
      caller: ENDPOINT_CALLER,
    },
    ping,
  );
}
