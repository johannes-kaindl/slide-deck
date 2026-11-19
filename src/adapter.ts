import { type App, TFile } from "obsidian";
import { parseDeck, type DeckDirectives, type SlideDeck } from "./vendor/deck-core/pure/slide-model";
import { resolveTheme, type ThemeRegistry } from "./vendor/deck-core/pure/presets";
import { binaryToDataUrl, mimeForExtension } from "./vendor/kit/data-url";

/** The modifier names a theme declares for itself (`/* sd-modifiers: … *\/`), for handing to
 *  `parseDeck` as `knownModifiers`. Without them a theme with its own variants reports one
 *  `modifier-unknown` per slide for a state that is exactly as intended.
 *
 *  Pulled out of `loadDeck` on purpose: in there a test would need an App mock, here a
 *  registry suffices. `resolveTheme` is total and falls back to kami, so an unknown key
 *  yields the fallback's declarations — not the last theme's. */
export function knownModifiersFor(registry: ThemeRegistry, themeKey: string | undefined): readonly string[] | undefined {
  if (!themeKey) return undefined;
  return resolveTheme(registry, themeKey).modifiers;
}

/** The path part of an embed reference: cut at the first `|` (size or alt text follow), a `\`
 *  right before it belongs to the table syntax and goes too. Same reading as deck-core's
 *  `splitEmbedRef`, which hands exactly this to `resolveEmbed`. */
function embedPath(ref: string): string {
  const bar = ref.indexOf("|");
  return (bar < 0 ? ref : ref.slice(0, bar).replace(/\\$/, "")).trim();
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
  // deck-core ruft `resolveEmbed` nur mit dem Pfad (`![[a.svg|48]]` -> "a.svg"); Cache und
  // Suche arbeiten deshalb am Pfad. Ein `\` direkt vor dem `|` gehört zur Tabellensyntax.
  for (const s of deck.slides) for (const m of s.markdown.matchAll(/!\[\[([^\]]+?)\]\]/g)) refs.add(embedPath(m[1]));
  for (const ref of refs) {
    const dest = app.metadataCache.getFirstLinkpathDest(ref, file.path);
    if (dest instanceof TFile && mimeForExtension(dest.extension) !== null) {
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
