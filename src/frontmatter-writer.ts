import { type App, type TFile } from "obsidian";

/** Surgically set the note's "theme:" frontmatter key (creates the YAML block if absent). */
export async function setNoteTheme(app: App, file: TFile, key: string): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => { (fm as Record<string, unknown>).theme = key; });
}
