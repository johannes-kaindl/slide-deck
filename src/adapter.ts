import { type App, TFile } from "obsidian";
import { parseDeck, type SlideDeck } from "./core/slide-model";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export function binaryToDataUrl(buf: ArrayBuffer, ext: string): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const mime = MIME[ext.toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${btoa(bin)}`;
}

export async function loadActiveDeck(app: App): Promise<{ deck: SlideDeck; resolveEmbed: (ref: string) => string | null } | null> {
  const file = app.workspace.getActiveFile();
  if (!file) return null;
  const source = await app.vault.read(file);
  const deck = parseDeck(source);
  // Embeds vorab zu Data-URLs (synchroner resolveEmbed-Vertrag fürs Core)
  const cache = new Map<string, string>();
  const refs = new Set<string>();
  for (const s of deck.slides) for (const m of s.markdown.matchAll(/!\[\[([^\]]+?)\]\]/g)) refs.add(m[1].trim());
  for (const ref of refs) {
    const dest = app.metadataCache.getFirstLinkpathDest(ref, file.path);
    if (dest instanceof TFile && dest.extension in MIME) {
      try { cache.set(ref, binaryToDataUrl(await app.vault.readBinary(dest), dest.extension)); } catch { /* missing -> warning later */ }
    }
  }
  return { deck, resolveEmbed: (ref) => cache.get(ref) ?? null };
}
