import { type App } from "obsidian";
import { mergeThemes, listThemes, resolveTheme, type ThemeEntry, type ThemeRegistry } from "./core/presets";
import { builtinThemeEntries, userThemeEntry } from "./deck-css";
import { scanThemeFiles } from "./theme-source";

/** Owns the merged theme registry (builtins + user .css). refresh() re-scans the folder. */
export class ThemeStore {
  private map: ThemeRegistry = mergeThemes(builtinThemeEntries(), []).map;
  constructor(private app: App, private getFolder: () => string) {}

  getMap(): ThemeRegistry { return this.map; }
  getThemes(): ThemeEntry[] { return listThemes(this.map); }
  resolve(key: string): ThemeEntry { return resolveTheme(this.map, key); }

  async refresh(): Promise<void> {
    const files = await scanThemeFiles(this.app.vault.adapter, this.getFolder());
    const users = files.map((f) => userThemeEntry(f.key, f.css));
    const { map, warnings } = mergeThemes(builtinThemeEntries(), users);
    this.map = map;
    for (const w of warnings) console.warn(`[slide-deck] ${w}`);
  }
}
