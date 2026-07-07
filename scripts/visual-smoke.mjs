// Visual smoke: rendert ein Deck pro Theme in Headless Chrome und schreibt ein
// gestapeltes PNG nach _visual/. Usage:
//   node scripts/visual-smoke.mjs [deck.md] [theme ...]      (Default: demo-deck, alle Built-ins)
// Chrome-Pfad überschreibbar via $CHROME_BIN.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ALL_THEMES = ["shiro", "kuro", "sumi", "kairo", "kurenai"];
const [deckArg, ...themeArgs] = process.argv.slice(2);
const deckPath = deckArg ?? "docs/themes/demo-deck.md";
const themes = themeArgs.length ? themeArgs : ALL_THEMES;
const md = readFileSync(deckPath, "utf8");
// Folienzahl: Separator-Zeilen minus die zwei Frontmatter-Fences.
const seps = (md.match(/^---\s*$/gm) ?? []).length;
const slideCount = Math.max(1, seps - (md.trimStart().startsWith("---") ? 2 : 0) + 1);

const dir = mkdtempSync(join(tmpdir(), "sd-visual-"));
try {
  const entryOut = join(dir, "entry.js");
  await esbuild.build({
    entryPoints: ["scripts/visual-smoke-entry.ts"],
    bundle: true, format: "iife", target: "es2022", outfile: entryOut,
    loader: { ".css": "text" }, logLevel: "silent",
  });
  const js = readFileSync(entryOut, "utf8");
  mkdirSync("_visual", { recursive: true });
  for (const theme of themes) {
    const html = `<!doctype html><meta charset="utf-8"><body></body><script>window.__DECK_MD__=${JSON.stringify(md)};window.__THEME__=${JSON.stringify(theme)};</script><script>${js}</script>`;
    const htmlPath = join(dir, `${theme}.html`);
    writeFileSync(htmlPath, html);
    const out = resolve("_visual", `${theme}.png`);
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      `--window-size=1280,${720 * slideCount}`,
      "--virtual-time-budget=10000",
      `--screenshot=${out}`,
      `file://${resolve(htmlPath)}`,
    ], { stdio: "pipe" });
    console.log(`visual-smoke: ${theme} → _visual/${theme}.png`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
