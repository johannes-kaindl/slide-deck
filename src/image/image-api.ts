import type { App } from "obsidian";

/** Der Vertrag von local-image-generator (Provider-API v1), hier STRUKTURELL nachgebildet —
 *  ein Import waere eine harte Kopplung an ein Nachbarplugin, das fehlen darf. */
export const IMAGE_FAILURES = [
  "busy", "not-configured", "unreachable", "model-not-downloaded", "no-gpu", "failed",
] as const;
export type ImageFailure = (typeof IMAGE_FAILURES)[number];

export interface ImageCapabilities {
  negativePrompt: boolean; cfg: boolean; maxSteps: number;
  fixedSize: { width: number; height: number } | null;
  initImage: boolean;
  sizes: readonly { width: number; height: number }[] | null;
}
export interface ImageStatus {
  apiVersion: number; engine: "builtin" | "server";
  ready: boolean; reason: ImageFailure | null; capabilities: ImageCapabilities;
}
export interface ImageParams {
  prompt: string; negativePrompt: string; width: number; height: number;
  steps: number; seed: number; cfg: number; model: string; created: string;
  denoising: number | null;
}
export interface GeneratedImage { base64: string; params: ImageParams }
export type ImageResult =
  | { ok: true; image: GeneratedImage }
  | { ok: false; reason: Exclude<ImageFailure, "failed"> }
  | { ok: false; reason: "failed"; message: string };
export type ImageSaveResult =
  | { ok: true; imagePath: string; notePath: string | null }
  | { ok: false; reason: "write-failed"; message: string };

export interface ImageRequest {
  prompt: string; negativePrompt?: string;
  onProgress?: (pct: number | null, phase: "loading-model" | "generating") => void;
}

export interface ImageApi {
  readonly apiVersion: number;
  status(): ImageStatus;
  /** Optional: erst ab LIG 0.10.0 vorhanden. `apiVersion` blieb dabei 1 — die
   *  Versionspruefung allein reicht deshalb NICHT, die Methode wird selbst geprueft. */
  recheck?(): Promise<ImageStatus>;
  generate(req: ImageRequest): Promise<ImageResult>;
  save(image: GeneratedImage, opts?: { createNote?: boolean }): Promise<ImageSaveResult>;
}

const API_VERSION = 1;

/** Bei JEDEM Aufruf neu lesen — das Nachbarplugin kann zur Laufzeit deaktiviert werden.
 *  Form UND Version pruefen (Muster: koda-agent/src/obsidian/retrieval.ts). */
export function readImageApi(app: App): ImageApi | null {
  const plugins = (app as unknown as {
    plugins?: { plugins?: Record<string, { api?: unknown } | undefined> };
  }).plugins?.plugins;
  const api = plugins?.["local-image-generator"]?.api as Partial<ImageApi> | undefined;
  if (!api || api.apiVersion !== API_VERSION) return null;
  if (typeof api.status !== "function") return null;
  if (typeof api.generate !== "function") return null;
  if (typeof api.save !== "function") return null;
  return api as ImageApi;
}

/** `status()` ist per Vertrag netzfrei und synchron und kann deshalb einen veralteten
 *  Serverzustand nicht heilen. Genau dann — und nur dann — kostet es einen Netzaufruf. */
export async function ensureReady(api: ImageApi): Promise<ImageStatus> {
  const s = api.status();
  if (!s.ready && s.reason === "unreachable" && typeof api.recheck === "function") {
    return await api.recheck();
  }
  return s;
}

export function failureKey(reason: ImageFailure): string { return `image.fail.${reason}`; }

/** W3: ehrliches CTA-Ziel des Empty-States — die einzige Stelle, die diesen Verbund bereits
 *  im README nennt (Zeilen 38/157). Kein Store-/Marketplace-Link: local-image-generator liegt
 *  nicht dort. */
export const LOCAL_IMAGE_GENERATOR_URL = "https://git.jkaindl.de/jkaindl/local-image-generator";
