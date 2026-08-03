// Bündelt golden-capture-entry.ts mit denselben esbuild-Einstellungen wie der
// Plugin-Build und führt das Ergebnis in Node aus. Vorbild: scripts/bundle-smoke.mjs.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outfile, ...decks] = process.argv.slice(2);
if (!outfile || decks.length === 0) {
  console.error("usage: node scripts/golden-capture.mjs <out.json> <deck.md…>");
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "sd-golden-"));
const bundled = join(dir, "capture.cjs");
try {
  await esbuild.build({
    entryPoints: ["scripts/golden-capture-entry.ts"],
    bundle: true,
    format: "cjs",
    target: "es2022",
    platform: "node",
    outfile: bundled,
    loader: { ".css": "text" },
  });
  execFileSync(process.execPath, [bundled, outfile, ...decks], { stdio: "inherit" });
  console.log(`golden capture → ${outfile}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
