import { isImageFunction, type ImageFunction } from "./functions";

export interface SlotBlock { funktion: ImageFunction | null; prompt: string }

/** Der Codeblock-Name — EINZIGE Stelle, die ihn kennt. Registrierung
 *  (slot-card.ts), Einfuege-Vorlage (insert-slot.ts) und Rueckschreiben (main.ts) importieren
 *  ihn hier, statt ihn je einzeln zu buchstabieren (G1: sonst koennen sie auseinanderlaufen). */
export const SLOT_LANG = "slide-image";

/** Umschliesst einen Blockkoerper mit der Fence-Form, in der er in der Notiz steht. Dieselbe
 *  Funktion baut den Such-Block fuers Rueckschreiben (main.ts) UND kann fuer die Vorpruefung
 *  (W2) benutzt werden, bevor der teure Lauf ueberhaupt beginnt. */
export function fenceSlot(body: string): string {
  return "```" + SLOT_LANG + "\n" + body.replace(/\n$/, "") + "\n```";
}

/** Nur FUEHRENDE Zeilen dieser Form gelten als Kopfzeile; die erste Zeile, die nicht passt,
 *  beginnt den Prompt — ab da wird nichts mehr als Schluessel gelesen. */
const KEY_RE = /^([a-z][a-z0-9_-]*):\s*(.*)$/;

export function parseSlot(body: string): SlotBlock {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let funktion: ImageFunction | null = null;
  const zurueck: string[] = [];   // unbekannte Kopfzeilen — sie gehen NICHT verloren
  let i = 0;
  for (; i < lines.length; i++) {
    const m = KEY_RE.exec(lines[i]);
    if (!m) break;
    if (m[1] === "funktion") {
      const v = m[2].trim();
      funktion = isImageFunction(v) ? v : null;
    } else {
      zurueck.push(lines[i]);
    }
  }
  const rest = lines.slice(i);
  return { funktion, prompt: [...zurueck, ...rest].join("\n").trim() };
}

/** Der gefuellte Zustand ist gewoehnliches Deck-Markdown: ein Embed, davor der Prompt als
 *  Kommentar fuer einen spaeteren Re-Roll. Einzeilig — ein Umbruch traegt fuer ein Bildmodell
 *  keine Bedeutung und machte das Wiederfinden zerbrechlicher. */
export function filledMarkdown(funktion: ImageFunction | null, prompt: string, imagePath: string): string {
  const eineZeile = prompt.replace(/\s*\n\s*/g, " ").trim().replace(/-->/g, "--&gt;");
  return `<!-- image: ${funktion ?? "none"} | ${eineZeile} -->\n![[${imagePath}]]`;
}

/** Ob `block` in `source` GENAU EINMAL vorkommt — fehlend und mehrdeutig sind gleich schlimm.
 *  Grundlage von `replaceSlot` (nach dem Lauf) UND der Vorpruefung vor `generate()` (W2): drei
 *  der Faelle, in denen das Zurueckschreiben scheitert (andere Fence-Form, Mehrfachvorkommen,
 *  Einrueckung), sind schon beim Klick sichtbar — sie muessen keine Minute GPU-Zeit kosten,
 *  um entdeckt zu werden. */
export function findSlotOnce(source: string, block: string): boolean {
  const first = source.indexOf(block);
  if (first === -1) return false;
  return source.indexOf(block, first + block.length) === -1;
}

/** Ersetzen ueber TEXTIDENTITAET, nicht ueber Zeilennummern: der Lauf dauert Minuten, und in
 *  der Zeit kann sich die Notiz geaendert haben. Mehrdeutig ist so schlimm wie fehlend —
 *  ein Bild an der falschen Stelle ist schlimmer als eines, das der Nutzer selbst einsetzt. */
export function replaceSlot(source: string, block: string, replacement: string): string | null {
  if (!findSlotOnce(source, block)) return null;
  const first = source.indexOf(block);
  return source.slice(0, first) + replacement + source.slice(first + block.length);
}
