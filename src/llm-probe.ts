// uebernommen aus lingotuner/src/obsidian/http.ts (fetchJsonAdapter/cachedProbe), 2026-09-30
import { requestUrl } from "obsidian";
import { type CapabilityFetch, probeEndpoint as probeBackend, probeBaseUrl } from "./vendor/kit/capabilities";
import type { BackendId } from "./vendor/kit/sampling-profiles";

/** `CapabilityFetch` (Kit) over `requestUrl`: a status outside 2xx or a body that is not JSON
 *  yields `null`, so one probe step reports "no hit" instead of throwing. */
export const fetchJsonAdapter: CapabilityFetch = async (req) => {
  const res = await requestUrl({ url: req.url, method: req.method ?? "GET", headers: req.headers, body: req.body, throw: false });
  if (res.status < 200 || res.status >= 300) return null;
  try { return { json: JSON.parse(res.text) as unknown }; } catch { return null; }
};

const BACKEND_CACHE_MS = 30_000;
let backendCache: { url: string; backend: BackendId; at: number } | null = null;

/** Which backend sits behind a URL — cached 30 s per URL (same rule as the model-list cache),
 *  dropped when the URL changes. Sampling-profile spec § 3.1. */
export async function cachedProbe(url: string, model: string): Promise<BackendId | null> {
  const now = Date.now();
  if (backendCache && backendCache.url === url && now - backendCache.at < BACKEND_CACHE_MS) return backendCache.backend;
  const { backend } = await probeBackend(fetchJsonAdapter, probeBaseUrl(url), model);
  backendCache = { url, backend, at: now };
  return backend;
}
