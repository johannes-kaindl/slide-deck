// scripts/check-render-realm.mjs
// Guards the iframe-bound builder: renderDeckToContainer runs against an iframe
// contentDocument whose realm does NOT have Obsidian's prototype augmentations. Any of
// these calls would throw "X is not a function" at runtime (TS can't catch it — the global
// augmentation makes the methods appear present on every HTMLElement).
import { readFileSync } from "node:fs";
const FILE = "src/render-dom.ts";
const BAD = [/\.createDiv\(/, /\.createEl\(/, /\.createSpan\(/, /\.empty\(\)/, /\.addClass\(/, /\.removeClass\(/, /\.setText\(/, /\.setAttr\(/];
const src = readFileSync(FILE, "utf8");
const hits = BAD.filter((re) => re.test(src)).map((re) => re.source);
if (hits.length > 0) {
  console.error(`render realm violation in ${FILE}: ${hits.join(", ")}`);
  process.exit(1);
}
console.log("render realm OK");
