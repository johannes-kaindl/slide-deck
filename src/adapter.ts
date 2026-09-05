import { type App, TFile } from "obsidian";
import { parseDeck, type DeckDirectives, type SlideDeck } from "./vendor/deck-core/pure/slide-model";
import { resolveTheme, type ThemeRegistry } from "./vendor/deck-core/pure/presets";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export function binaryToDataUrl(buf: ArrayBuffer, ext: string): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const mime = MIME[ext.toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${btoa(bin)}`;
}

/** The modifier names a theme declares for itself (`/* sd-modifiers: … *\/`), for handing to
 *  `parseDeck` as `knownModifiers`. Without them a theme with its own variants reports one
 *  `modifier-unknown` per slide for a state that is exactly as intended.
 *
 *  Pulled out of `loadDeck` on purpose: in there a test would need an App mock, here a
 *  registry suffices. `resolveTheme` is total and falls back to shiro, so an unknown key
 *  yields the fallback's declarations — not the last theme's. */
export function knownModifiersFor(registry: ThemeRegistry, themeKey: string | undefined): readonly string[] | undefined {
  if (!themeKey) return undefined;
  return resolveTheme(registry, themeKey).modifiers;
}

export interface LoadedDeck {
  deck: SlideDeck;
  resolveEmbed: (ref: string) => string | null;
  frontmatterTheme?: string; // the note's OWN theme: key (undefined if it has none) — drives the preview source label
}

/** Load a specific Markdown file as a deck. Returns null for a missing or non-Markdown file. */
export async function loadDeck(
  app: App, file: TFile | null, defaults?: Partial<DeckDirectives>,
  opts?: { registry?: ThemeRegistry; themeKey?: string },
): Promise<LoadedDeck | null> {
  if (!file || file.extension !== "md") return null; // only Markdown notes become decks (skip PDFs etc.)
  const source = await app.vault.read(file);
  // Which theme's modifiers count has to be known BEFORE parsing — and it is: Obsidian has
  // already parsed the frontmatter, so `theme:` is readable without touching the deck. An
  // explicit `themeKey` (preview dropdown, export override) outranks it, because that is the
  // theme the slides will actually be rendered with.
  const fmThemeEarly = app.metadataCache.getFileCache(file)?.frontmatter?.theme as unknown;
  const themeKey = opts?.themeKey
    ?? (typeof fmThemeEarly === "string" ? fmThemeEarly : undefined)
    ?? defaults?.theme;
  const knownModifiers = opts?.registry ? knownModifiersFor(opts.registry, themeKey) : undefined;
  const deck = parseDeck(source, defaults, knownModifiers ? { knownModifiers } : undefined);
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
  const fmTheme = app.metadataCache.getFileCache(file)?.frontmatter?.theme as unknown;
  const frontmatterTheme = typeof fmTheme === "string" ? fmTheme : undefined;
  return { deck, resolveEmbed: (ref) => cache.get(ref) ?? null, frontmatterTheme };
}

/** Convenience: load the currently active note as a deck. */
export function loadActiveDeck(app: App, defaults?: Partial<DeckDirectives>): Promise<LoadedDeck | null> {
  return loadDeck(app, app.workspace.getActiveFile(), defaults);
}
