// Request-Bau DIESES Plugins (Sampling-Plan Rezept 4/8) und das Laden der Anfrage-Einstellungen
// samt Migration der Altfelder `llmSuppressThinking` und `llmTemperature`. Kein obsidian-Import.
import {
  onLevelFor, resolveRequestParams, sanitizeRequestSettings, validateOverride,
  type BackendId, type FamilyId, type FieldId, type ModeId, type RequestSettings, type ResolvedRequest, type ThinkingLevel,
} from "../vendor/kit/sampling-profiles";

/** Modus dieses Plugins in der Sampling-Profile-Tabelle: Folien entstehen aus einer Notiz und
 *  dürfen formulieren (Spec § 4.1 „creative"). Nur EIN Modus, deshalb fest verdrahtet. */
export const MODE: ModeId = "creative";

/** Der alte feste Standard von `llmTemperature` (Default in DEFAULT_SETTINGS bis 0.12.0). Ein
 *  Altwert, der ihm gleicht, war keine Entscheidung des Nutzers und wird verworfen. */
export const LEGACY_DEFAULT_TEMPERATURE = 0.3;

/** Die Request-Bau-Funktion DES PLUGINS: nur sie kennt den festen Modus. Die goldenen Requests
 *  (tests/request-params.test.ts) laufen dagegen, nicht gegen `resolveRequestParams` direkt.
 *  `maxTokens` ist slide-decks eigenes Budget (`llmMaxTokens`). */
export function buildDeckParams(input: {
  family: FamilyId | null;
  backend: BackendId;
  thinking: ThinkingLevel;
  maxTokens: number;
  overrides?: Partial<Record<FieldId, number | string>>;
}): ResolvedRequest {
  return resolveRequestParams({
    family: input.family, mode: MODE, backend: input.backend, thinking: input.thinking,
    maxTokens: input.maxTokens,
    ...(input.overrides ? { overrides: input.overrides } : {}),
  });
}

export interface LoadedRequest {
  request: RequestSettings;
  /** Pfade gespeicherter Werte, die ungültig waren und auf den Profilwert zurückfielen. */
  dropped: string[];
  /** Die übernommene Legacy-Temperatur (nur wenn sie vom alten Standard abwich und eine
   *  Überschreibung daraus wurde) — der Aufrufer meldet sie einmal per Notice. */
  legacyTemperature: number | null;
}

/** Lädt `request` aus den gespeicherten Plugin-Daten (`raw` = GANZE Daten aus `loadData()`) und
 *  zieht die Altfelder nach. Abweichung von Rezept 3, deren Grund im CHANGELOG steht: die Familie
 *  ist beim Laden nicht aufgelöst, eine abweichende Legacy-Temperatur wird deshalb unter
 *  `"unknown"` abgelegt statt unter einer Familie. `llmSuppressThinking: true` → „aus", `false` →
 *  Ein-Stufe des Modus. Schon gespeicherte Werte gewinnen. Der Aufrufer entfernt die Altfelder. */
export function loadRequestSettings(raw: unknown): LoadedRequest {
  const data = raw !== null && typeof raw === "object"
    ? (raw as { request?: unknown; llmSuppressThinking?: unknown; llmTemperature?: unknown })
    : {};
  const { settings: request, dropped } = sanitizeRequestSettings(data.request);

  if (typeof data.llmSuppressThinking === "boolean" && request.thinking[MODE] === undefined) {
    request.thinking[MODE] = data.llmSuppressThinking ? "off" : onLevelFor(request, MODE);
  }

  let legacyTemperature: number | null = null;
  const legacy = data.llmTemperature;
  if (typeof legacy === "number" && legacy !== LEGACY_DEFAULT_TEMPERATURE && request.overrides[MODE]?.unknown?.temperature === undefined) {
    const valid = validateOverride("temperature", legacy);
    if (typeof valid === "number") {
      ((request.overrides[MODE] ??= {}).unknown ??= {}).temperature = valid;
      legacyTemperature = valid;
    }
  }
  return { request, dropped, legacyTemperature };
}
