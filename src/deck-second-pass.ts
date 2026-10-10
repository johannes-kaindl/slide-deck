import { renderMarkdown } from "./vendor/deck-core/pure/render/md2html";
import { neutralizeModelMarkdown } from "./vendor/kit/safe-markdown";
import { neutralizeRemoteResourcesInTree } from "./vendor/kit/remote-resources";

/** Zweite Schicht fuer erzeugte Decks (Welle 16): die erste Schicht (`neutralizeRemoteResources`) liest
 *  Markdown als Text und ist nie ganz dicht. Diese hier rendert jede Folie INERT (Dokument ohne
 *  Browsing-Kontext, nichts laedt) und laesst die DOM-Entschaerfung des Kits darueber laufen. Der Baum wird
 *  nur gelesen, nie serialisiert und neu geparst (mXSS, Modulkopf von remote-resources). Ein Fund heisst:
 *  die erste Schicht hat etwas uebersehen; diese Folie wird dann als Text gespeichert. */

export interface SecondPassFinding {
  /** 1-basiert, gezaehlt ueber die Folien mit Inhalt (Frontmatter zaehlt nicht). */
  slide: number;
  tag: string;
  attr: string;
}

export interface SecondPassDeps {
  /** Parst in ein Dokument OHNE Browsing-Kontext (`new DOMParser().parseFromString(html, "text/html")`); ein `<img>` darin laedt nicht. */
  parseHtml: (html: string) => Document;
  /** Ersatz fuer die Folien-Entschaerfung; nur der Test setzt es, um den Restfall herzustellen. */
  neutralizeSlide?: (markdown: string) => string;
}

export interface SecondPassResult {
  markdown: string;
  /** Folien (1-basiert), die als Text gespeichert werden, weil die erste Schicht sie nicht dicht hatte. */
  replaced: number[];
  /** Funde, die auch nach der Folien-Entschaerfung bleiben: nicht schreiben. */
  remaining: SecondPassFinding[];
  /** Funde der ersten Pruefung, ohne die Quelle (sie kann ein wiederhergestelltes Geheimnis tragen). */
  findings: SecondPassFinding[];
}

interface Chunk { lines: string[]; slide: boolean }

const FENCE_RE = /^\s*(```|~~~)/;
const REMOTE_EMBED_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Wie `parseDeck` (deck-core): Frontmatter, dann Folien an `---`-Zeilen ausserhalb von Fences. Die Zeilen
 *  bleiben unveraendert (auch `\r`), damit ein Deck ohne Fund byte-gleich zurueckgeht. */
function splitDeck(markdown: string): Chunk[] {
  const lines = markdown.split("\n");
  const chunks: Chunk[] = [];
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (close > 0) { chunks.push({ lines: lines.slice(0, close + 1), slide: false }); start = close + 1; }
  }
  let buf: string[] = [];
  let inFence = false;
  let marker = "";
  const flush = (): void => { chunks.push({ lines: buf, slide: buf.some((l) => l.trim() !== "") }); buf = []; };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fm = FENCE_RE.exec(line);
    if (fm) {
      if (!inFence) { inFence = true; marker = fm[1]; }
      else if (fm[1] === marker) { inFence = false; marker = ""; }
      buf.push(line);
    } else if (!inFence && line.trim() === "---") {
      flush();
      chunks.push({ lines: [line], slide: false });
    } else buf.push(line);
  }
  flush();
  return chunks;
}

function findingsOf(slideText: string, slide: number, deps: SecondPassDeps): SecondPassFinding[] {
  // Ein lokaler Embed bekommt einen festen Platzhalter, eine Fern-URL keinen: die Vorschau loest sie ebenfalls nicht auf.
  const { html } = renderMarkdown({ markdown: slideText, resolveEmbed: (ref) => (REMOTE_EMBED_RE.test(ref.trim()) ? null : "#embed") });
  return neutralizeRemoteResourcesInTree(deps.parseHtml(html).body).removed.map((r) => ({ slide, tag: r.tag, attr: r.attr }));
}

export function secondPassDeck(markdown: string, deps: SecondPassDeps): SecondPassResult {
  const chunks = splitDeck(markdown);
  const neutralize = deps.neutralizeSlide ?? neutralizeModelMarkdown;
  const findings: SecondPassFinding[] = [];
  const replaced: number[] = [];
  const remaining: SecondPassFinding[] = [];
  let slide = 0;
  for (const chunk of chunks) {
    if (!chunk.slide) continue;
    slide++;
    const found = findingsOf(chunk.lines.join("\n"), slide, deps);
    if (found.length === 0) continue;
    findings.push(...found);
    chunk.lines = neutralize(chunk.lines.join("\n")).split("\n");
    replaced.push(slide);
    remaining.push(...findingsOf(chunk.lines.join("\n"), slide, deps));
  }
  return { markdown: chunks.flatMap((c) => c.lines).join("\n"), replaced, remaining, findings };
}
