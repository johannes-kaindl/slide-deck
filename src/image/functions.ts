import type { ImageCapabilities, ImageRequest } from "./image-api";
import type { SlotBlock } from "./slot-format";

/** Die Bildfunktions-Taxonomie: welche Rolle ein Bild auf einer Folie spielt.
 *  Die IDs sind ENGLISCH und sprachunabhängig — sie stehen im Dokument, nicht in der
 *  Oberfläche; eine deutsche ID machte dieselbe Notiz unter englischer App-Sprache unlesbar. */
export const IMAGE_FUNCTIONS = [
  "documentary",
  "analytical",
  "metaphorical",
  "emotional",
  "navigational",
  "decorative",
] as const;
export type ImageFunction = (typeof IMAGE_FUNCTIONS)[number];

export function isImageFunction(value: string): value is ImageFunction {
  return (IMAGE_FUNCTIONS as readonly string[]).includes(value);
}

/** Die Bausteine sind ENGLISCH, auch bei deutscher Oberfläche: sie sind Modell-Eingabe,
 *  kein UI-Text, und Bildmodelle sind auf englischen Bildunterschriften trainiert. */
export const DEFAULT_SUFFIXES: Record<ImageFunction, string> = {
  documentary: "photographic, realistic lighting, documentary photography, natural colors",
  analytical: "clean diagram, flat vector illustration, minimal, high contrast, no text",
  metaphorical: "symbolic illustration, single clear metaphor, uncluttered composition",
  emotional: "cinematic lighting, evocative atmosphere, shallow depth of field",
  navigational: "simple pictogram, bold silhouette, centered, plain background",
  decorative: "abstract texture, subtle, low contrast",
};

/** Wird NUR gesendet, wenn `capabilities.negativePrompt` — im builtin-Modus kann das Backend
 *  keinen Negativ-Prompt, und ein Feld, das nichts bewirkt, wäre eine Attrappe. */
export const DEFAULT_NEGATIVES: Record<ImageFunction, string> = {
  documentary: "illustration, cartoon, text, watermark",
  analytical: "photorealistic, clutter, text, watermark",
  metaphorical: "text, watermark, busy background",
  emotional: "text, watermark, flat lighting",
  navigational: "photorealistic, gradient, text, watermark",
  decorative: "text, watermark, faces",
};

const SEP = ", ";
function parts(text: string): string[] {
  return text.split(",").map((p) => p.trim()).filter((p) => p !== "");
}

/** Baustein an den Prompt hängen — kommasepariert, ohne Dubletten. Dieselbe Grammatik, die
 *  local-image-generator intern für seine Stil-Presets benutzt (`splitParts` in
 *  `src/core/presets.ts`); geteilt wird der Trenner, nicht der Code. */
export function composePrompt(prompt: string, suffix: string): string {
  const have = parts(prompt);
  const add = parts(suffix).filter((p) => !have.includes(p));
  return [...have, ...add].join(SEP);
}

/** Baustein anhaengen und den Negativ-Prompt NUR mitschicken, wenn das Backend ihn kann —
 *  ein Feld, das nichts bewirkt, waere eine Attrappe. */
export function buildRequest(
  block: SlotBlock,
  caps: ImageCapabilities,
  overrides: Partial<Record<ImageFunction, string>>,
): ImageRequest {
  if (!block.funktion) return { prompt: block.prompt };
  const suffix = overrides[block.funktion] ?? DEFAULT_SUFFIXES[block.funktion];
  const negativ = DEFAULT_NEGATIVES[block.funktion];
  const req: ImageRequest = { prompt: composePrompt(block.prompt, suffix) };
  if (caps.negativePrompt && negativ) req.negativePrompt = negativ;
  return req;
}
