// Bundle the render smoke entry with the SAME esbuild settings as the plugin build,
// then run it in Node. Catches ESM/CJS interop bugs that vitest's Vite resolution
// hides (e.g. a default export wrapped as `{ default: fn }` in the real CJS bundle).
// See scripts/bundle-smoke-entry.ts.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sd-bundle-smoke-"));
const out = join(dir, "smoke.cjs");
try {
  await esbuild.build({
    entryPoints: ["scripts/bundle-smoke-entry.ts"],
    bundle: true,
    format: "cjs",
    target: "es2022",
    outfile: out,
    loader: { ".css": "text" },
    logLevel: "silent",
  });
  execFileSync(process.execPath, [out], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
