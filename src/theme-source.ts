import { App, FileSystemAdapter, Notice, type DataAdapter } from "obsidian";
import { keyFromFilename } from "./core/theme-key";
import { normalizeFolder } from "./core/folder-hide";

/** List *.css in the themes folder; each becomes { key, css }. Unreadable files are skipped. */
export async function scanThemeFiles(adapter: DataAdapter, folder: string): Promise<{ key: string; css: string }[]> {
  const dir = normalizeFolder(folder);
  if (!dir || !(await adapter.exists(dir))) return [];
  const listing = await adapter.list(dir);
  const out: { key: string; css: string }[] = [];
  for (const path of listing.files) {
    if (!path.toLowerCase().endsWith(".css")) continue;
    try {
      const css = await adapter.read(path);
      const base = path.split("/").pop() ?? path;
      out.push({ key: keyFromFilename(base), css });
    } catch { /* unreadable -> skip */ }
  }
  return out;
}

/** Write a theme's CSS into the folder as <key>.css (or <key>-copy.css… to avoid clobbering).
 *  Returns the path written. Creates the folder on demand. */
export async function writeThemeCss(adapter: DataAdapter, folder: string, key: string, css: string): Promise<string> {
  const dir = normalizeFolder(folder);
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
  const pathFor = (name: string) => (dir ? `${dir}/${name}` : name);
  let path = pathFor(`${key}.css`);
  let n = 1;
  while (await adapter.exists(path)) { path = pathFor(`${key}-copy${n > 1 ? n : ""}.css`); n++; }
  const header = `/* slide-deck theme: ${key} — edit the --sd-* tokens below.\n   The frontmatter "theme:" value is this file's name without ".css". */\n`;
  await adapter.write(path, header + css);
  return path;
}

/** Open the themes folder in the system file manager (desktop only). Falls back to a Notice. */
export function revealFolder(app: App, folder: string): void {
  const adapter = app.vault.adapter;
  const dir = normalizeFolder(folder);
  if (!(adapter instanceof FileSystemAdapter)) { new Notice(dir); return; }
  const full = `${adapter.getBasePath()}/${dir}`;
  try {
    // Desktop-only plugin; electron is marked external by esbuild. Dynamic require keeps it lazy.
    // window.require is the CJS loader Obsidian/Electron exposes in the renderer process.
    const { shell } = (window as unknown as { require: (m: string) => { shell: { openPath: (p: string) => Promise<string> } } }).require("electron");
    void shell.openPath(full);
  } catch {
    new Notice(full);
  }
}
