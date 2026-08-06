// Core purity: der Vendor-Kern (src/vendor/deck-core) darf kein Obsidian, kein Netz,
// keine Laufzeit kennen. pure/ zusätzlich: kein Fenster — dom/ darf genau das, sonst
// nichts. Zwei Ebenen, zwei Regelmengen — Quelle der Wahrheit ist
// deck-core/scripts/check-purity.mjs, hier nur an den Vendor-Ordner angepasst.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Verboten auf allen drei Ebenen: das Haus, das Netz, die Laufzeit. */
const EVERYWHERE = [
  /from ["']obsidian["']/,
  /from ["']node:/,
  /\brequire\s*\(/,
  /\bprocess\./,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
];

/** Zusätzlich verboten in pure/: alles, was ein Fenster voraussetzt. */
const NEEDS_A_WINDOW = [
  /\bactiveDocument\b/, /\bactiveWindow\b/,
  /\bdocument\./, /\bwindow\./, /\bself\./, /\btop\./, /\bglobalThis\./,
];

/** kit ist "pure" in einem anderen Sinn als deck-core/pure: obsidian-frei, aber kein
 *  Versprechen zum Netz oder zur Laufzeit (sse.ts spricht absichtlich XMLHttpRequest).
 *  Deshalb die alte, engere Regel — unverändert seit vor dieser Herauslösung. */
const OBSIDIAN_AND_WINDOW = [
  /from ["']obsidian["']/,
  /\bactiveDocument\b/, /\bactiveWindow\b/,
  /\bdocument\./, /\bwindow\./,
];

const RULES = [
  { dir: "src/vendor/deck-core/pure", bad: [...EVERYWHERE, ...NEEDS_A_WINDOW] },
  { dir: "src/vendor/deck-core/dom", bad: EVERYWHERE },
  // vendored kit modules are pure by kit design — pin that, so core may import them
  { dir: "src/vendor/kit", bad: OBSIDIAN_AND_WINDOW },
];

/** Kommentare vor der Prüfung entfernen. Ein vendortes Kit-Modul darf in seiner Doku
 *  erklären, warum es `window.setTimeout` NICHT ruft (timeout.ts tut genau das) — ein
 *  Checker, der Prosa als Code liest, meldet dann das Gegenteil dessen, was dasteht.
 *
 *  Bewusst konservativ: entfernt werden Block-Kommentare und Zeilen, die nach Whitespace
 *  mit `//` oder `*` beginnen. Ein nachgestelltes `// ...` hinter Code bleibt stehen. Das
 *  kann höchstens ein Falsch-POSITIV erzeugen (laut und behebbar) — die Umkehrung, ein
 *  `//` in einem String-Literal als Kommentarstart zu lesen, würde echten Code hinter
 *  einer URL verschlucken und einen Verstoß still durchlassen. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

let failed = false;

function walk(dir, bad) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, bad);
    else if (p.endsWith(".ts")) {
      const src = stripComments(readFileSync(p, "utf8"));
      for (const re of bad) {
        if (re.test(src)) {
          console.error(`Core purity violation in ${p}: ${re}`);
          failed = true;
        }
      }
    }
  }
}

for (const { dir, bad } of RULES) walk(dir, bad);
if (failed) process.exit(1);
console.log("core purity OK");
