// README-Bilder aufnehmen: rendert Fixture-Decks in Headless Chrome und schreibt die
// Ergebnisse nach docs/images/. Usage:
//   node scripts/shots.mjs            # alle Bilder
//   node scripts/shots.mjs themes     # nur eines
// Chrome-Pfad überschreibbar via $CHROME_BIN.
//
// Warum ohne Obsidian: die Folien entstehen in deck-core, nicht in der Obsidian-Schicht —
// derselbe Renderer, dieselben Themes, dieselbe Fit-Messung. Nur Bilder, die Obsidians
// eigene Oberfläche zeigen (Vorschau-Pane, Einstellungen), brauchen ein laufendes Obsidian;
// die nimmt scripts/shots-obsidian.ts auf.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE = "docs/images/fixture";
const OUT = "docs/images";

const NORDSTERN = ["shiro", "kuro", "sumi", "kairo", "kurenai"];
const CRIMSON = ["crimson-dark", "crimson-dark-lc", "crimson-light", "crimson-light-lc"];
const LAYOUTS = ["title", "section", "quote", "image-focus", "two-column", "columns-3", "stat", "cover-image", "default"];

/** Ein Eintrag = ein ausgeliefertes Bild. `cells` ist (Theme × Folienindex); die Reihenfolge
 *  füllt das Raster zeilenweise. */
const SHOTS = {
  hero: {
    deck: "hero.md",
    cells: [{ theme: "shiro", slide: 0 }],
    columns: 1, cellWidth: 1280, pad: 0, gap: 0, deviceScale: 2, bg: "#ffffff", frame: false,
  },
  callouts: {
    deck: "callouts.md",
    cells: [{ theme: "shiro", slide: 0 }],
    columns: 1, cellWidth: 1280, pad: 0, gap: 0, deviceScale: 2, bg: "#ffffff", frame: false,
  },
  themes: {
    deck: "theme-sample.md",
    cells: [...NORDSTERN, ...CRIMSON].map((t) => ({ theme: t, slide: 0, label: t })),
    columns: 3, cellWidth: 720, pad: 40, gap: 28, deviceScale: 1, bg: "#ffffff", frame: true,
  },
  // Diagnose, nicht ausgeliefert: cover-image in hellem vs. dunklem Theme.
  "_cover-check": {
    deck: "layouts.md",
    cells: [{ theme: "shiro", slide: 7, label: "shiro (light)" }, { theme: "kuro", slide: 7, label: "kuro (dark)" }],
    columns: 2, cellWidth: 900, pad: 40, gap: 28, deviceScale: 1, bg: "#ffffff", frame: true,
  },
  layouts: {
    deck: "layouts.md",
    cells: LAYOUTS.map((name, i) => ({ theme: "shiro", slide: i, label: name })),
    columns: 3, cellWidth: 720, pad: 40, gap: 28, deviceScale: 1, bg: "#ffffff", frame: true,
  },
};

// Das Demo-Bild lebt als eigene SVG-Datei (lesbar, diffbar) und wird erst hier zur data-URL.
// Ein relativer Pfad im Markdown zeigte sonst ins Temp-Verzeichnis der Aufnahme-Seite.
//
// Der Umweg ueber PNG ist Pflicht, nicht Geschmack: markdown-its validateLink laesst data:-URLs
// nur fuer gif/png/jpeg/webp durch. Ein SVG als data:-URL wird nicht zum Bild, sondern bleibt
// als roher Markdown-Text auf der Folie stehen — ohne Fehler, ohne Warnung.
function demoImageUrl(workDir) {
  const svgPath = resolve(FIXTURE, "assets/demo-chart.svg");
  const pngPath = join(workDir, "demo-chart.png");
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--window-size=640,400", "--force-device-scale-factor=2",
    "--default-background-color=00000000",
    `--screenshot=${pngPath}`, `file://${svgPath}`,
  ], { stdio: "pipe" });
  return `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
}

/** pngquant auf ein fertiges PNG. Ohne diesen Schritt liegt jedes Bild ueber dem
 *  400-KB-Budget des Bild-Standards; gemessen spart es 60-75 % ohne sichtbaren Verlust auf
 *  UI-Flaechen. Exit 99 = Zielqualitaet nicht erreichbar; dann bleibt das Original stehen,
 *  statt ein schlechteres Bild auszuliefern. */
function compress(file) {
  const before = statSync(file).size;
  try {
    execFileSync("pngquant", ["--quality", "82-98", "--speed", "1", "--force", "--output", file, file], { stdio: "pipe" });
  } catch (e) {
    if (e.status === 99) { console.log(`  pngquant: Qualitaet 82-98 nicht erreichbar, Original bleibt (${Math.round(before / 1024)} KB)`); return before; }
    if (e.code === "ENOENT") { console.log("  pngquant fehlt (brew install pngquant) — unkomprimiert"); return before; }
    throw e;
  }
  const after = statSync(file).size;
  return after;
}

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SHOTS).filter((n) => !n.startsWith("_"));
for (const n of names) if (!SHOTS[n]) throw new Error(`unbekanntes Bild: ${n} (bekannt: ${Object.keys(SHOTS).join(", ")})`);

const dir = mkdtempSync(join(tmpdir(), "sd-shots-"));
try {
  const entryOut = join(dir, "entry.js");
  await esbuild.build({
    entryPoints: ["scripts/shots-entry.ts"],
    bundle: true, format: "iife", target: "es2022", outfile: entryOut,
    loader: { ".css": "text" }, logLevel: "silent",
  });
  const js = readFileSync(entryOut, "utf8");
  const demoUrl = demoImageUrl(dir);
  mkdirSync(OUT, { recursive: true });

  for (const name of names) {
    const s = SHOTS[name];
    const md = readFileSync(join(FIXTURE, s.deck), "utf8").replaceAll("DEMO_IMAGE", demoUrl);
    const aspect = /^aspect:\s*"?4:3"?/m.test(md) ? 3 / 4 : 9 / 16;
    const cellHeight = Math.round(s.cellWidth * aspect);
    const labelH = s.cells.some((c) => c.label) ? 34 : 0;
    const rows = Math.ceil(s.cells.length / s.columns);
    const width = s.pad * 2 + s.columns * s.cellWidth + (s.columns - 1) * s.gap;
    const height = s.pad * 2 + rows * (cellHeight + labelH) + (rows - 1) * s.gap;

    const spec = {
      md, cells: s.cells, columns: s.columns, cellWidth: s.cellWidth,
      gap: s.gap, pad: s.pad, bg: s.bg, frame: s.frame, labelColor: "#3d4450",
    };
    const html = `<!doctype html><meta charset="utf-8"><body></body>`
      + `<script>window.__SHOT__=${JSON.stringify(spec)};</script><script>${js}</script>`;
    const htmlPath = join(dir, `${name}.html`);
    writeFileSync(htmlPath, html);

    const out = resolve(OUT, `${name}.png`);
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${s.deviceScale}`,
      "--virtual-time-budget=20000",
      `--screenshot=${out}`,
      `file://${resolve(htmlPath)}`,
    ], { stdio: "pipe" });
    const kb = Math.round(compress(out) / 1024);
    const over = kb > 400 ? "  ⚠ ueber dem Budget von 400 KB" : "";
    console.log(`shots: ${name} → ${OUT}/${name}.png  (${width}x${height} @${s.deviceScale}x, ${s.cells.length} Folien, ${kb} KB)${over}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
