import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const BAD = [/from ["']obsidian["']/, /\bactiveDocument\b/, /\bactiveWindow\b/, /\bdocument\./, /\bwindow\./];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) {
      const src = readFileSync(p, "utf8");
      for (const re of BAD) if (re.test(src)) { console.error(`Core purity violation in ${p}: ${re}`); process.exit(1); }
    }
  }
}
walk("src/core");
walk("src/vendor/kit");   // vendored kit modules are pure by kit design — pin that, so core may import them
console.log("core purity OK");
