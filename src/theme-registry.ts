import { type App } from "obsidian";
import { mergeThemes, listThemes, resolveTheme, type ThemeEntry, type ThemeRegistry } from "./vendor/deck-core/pure/presets";
import { builtinThemeEntries, userThemeEntry } from "./vendor/deck-core/pure/deck-css";
import { scanThemeFiles } from "./theme-source";
import { VENDOR_CSS } from "./vendor-css";

/** Owns the merged theme registry (builtins + user .css). refresh() re-scans the folder. */
export class ThemeStore {
  private map: ThemeRegistry = mergeThemes(builtinThemeEntries(VENDOR_CSS), []).map;
  constructor(private app: App, private getFolder: () => string) {}

  getMap(): ThemeRegistry { return this.map; }
  getThemes(): ThemeEntry[] { return listThemes(this.map); }
  resolve(key: string): ThemeEntry { return resolveTheme(this.map, key); }

  async refresh(): Promise<void> {
    const files = await scanThemeFiles(this.app.vault.adapter, this.getFolder());
    const users = files.map((f) => userThemeEntry(f.key, f.css, VENDOR_CSS));
    const { map, warnings } = mergeThemes(builtinThemeEntries(VENDOR_CSS), users);
    this.map = map;
    for (const w of warnings) console.warn(`[slide-deck] ${w}`);
  }
}
