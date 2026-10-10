import { renderMarkdown } from "./vendor/deck-core/pure/render/md2html";
import { parseDeck } from "./vendor/deck-core/pure/slide-model";
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

const REMOTE_EMBED_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
/** Mermaid laedt ausserhalb jedes DOM-Baums: `A@{ img: "https://…" }` ruft `new Image().src`, `classDef … background:url(…)`
 *  erzeugt CSS. Der Kern reicht den Fence nur als `<div class="sd-mermaid" data-src=base64>` durch, der Baum-Durchgang sieht den
 *  Inhalt also nie. Ein Quelltext mit `//`, `url(` oder `@import` gilt deshalb als Fund (data:-Bilder und relative `img:` haben kein `//`). */
/** Fail-closed statt Formen aufzaehlen: ein Mermaid-Quelltext ist ein Fund, sobald er CSS-Funktionen oder -Importe (`url`, `src(`,
 *  `image-set(`, `@import`), ein CSS-Kommentar `/*` (Mermaid kommentiert mit `%%`; in einem Kommentar-Skip steckte ein exponentielles Backtracking), einen Backslash (CSS-Escapes, `\\host`), ein `//` oder einen
 *  `img:`-Wert traegt, der nicht eindeutig lokal ist (nur `data:image/…` oder ein relativer Pfad ohne `:`). */
const MERMAID_CSS_RE = /(?:url|src|image-set|image|cross-fade)\s*\(|\/\*|@import|\\|\/\//i;
const MERMAID_IMG_RE = /\bimg\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s,}]+))/gi;

function mermaidLoads(src: string): boolean {
  if (MERMAID_CSS_RE.test(src)) return true;
  for (const m of src.matchAll(MERMAID_IMG_RE)) {
    const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!/^data:image\//i.test(v) && /^[\s\S]*:/.test(v)) return true;
  }
  return false;
}

function decodeBase64Utf8(b64: string): string {
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "\u0000fail-closed//"; // nicht lesbar: wie ein Fund behandeln
  }
}

/** Jede Region wie in der Vorschau (`render-dom.ts`): einzeln rendern, einzeln parsen. Ein offenes `<textarea>` in Region 1
 *  darf Region 2 nicht verschlucken, nur weil der Pruefling beide in einem Aufruf rendert. */
function regionFindings(region: string, slide: number, deps: SecondPassDeps): SecondPassFinding[] {
  // Ein lokaler Embed bekommt einen festen Platzhalter, eine Fern-URL keinen (wie `adapter.ts`: null).
  const { html } = renderMarkdown({ markdown: region, resolveEmbed: (ref) => (REMOTE_EMBED_RE.test(ref.trim()) ? null : "#embed") });
  const body = deps.parseHtml(html).body;
  const found: SecondPassFinding[] = neutralizeRemoteResourcesInTree(body).removed.map((r) => ({ slide, tag: r.tag, attr: r.attr }));
  for (const el of Array.from(body.querySelectorAll(".sd-mermaid"))) {
    if (mermaidLoads(decodeBase64Utf8(el.getAttribute("data-src") ?? ""))) found.push({ slide, tag: "mermaid", attr: "source" });
  }
  return found;
}

function deckFindings(markdown: string, deps: SecondPassDeps): { slide: number; startLine: number; found: SecondPassFinding[] }[] {
  return parseDeck(markdown).slides.map((s, i) => ({
    slide: i + 1,
    startLine: s.startLine,
    found: s.regions.flatMap((region) => regionFindings(region, i + 1, deps)),
  }));
}

/** Letzte Zeile einer Folie: von der Zeile vor der naechsten Folie rueckwaerts ueber Leerzeilen und `---`.
 *  Zwischen zwei Folien steht nichts anderes — jede andere nichtleere Zeile beginnt in `parseDeck` eine Folie. */
function slideEnd(lines: string[], nextStart: number | undefined): number {
  let end = (nextStart ?? lines.length) - 1;
  while (end > 0 && (lines[end]?.trim() === "" || lines[end]?.trim() === "---")) end--;
  return end;
}

export function secondPassDeck(markdown: string, deps: SecondPassDeps): SecondPassResult {
  const neutralize = deps.neutralizeSlide ?? neutralizeModelMarkdown;
  const scan = deckFindings(markdown, deps);
  const findings = scan.flatMap((s) => s.found);
  const hit = scan.filter((s) => s.found.length > 0);
  if (hit.length === 0) return { markdown, replaced: [], remaining: [], findings };
  // Die Zeilen bleiben wie sie sind (auch `\r`): `startLine` zaehlt nach `\r\n` → `\n`, die Zeilenzahl bleibt gleich.
  const lines = markdown.split("\n");
  const remaining: SecondPassFinding[] = [];
  // Von hinten nach vorn, damit die Zeilenindizes der frueheren Folien gelten.
  for (const h of [...hit].reverse()) {
    const next = scan[h.slide]?.startLine;
    const end = slideEnd(lines, next);
    const text = neutralize(lines.slice(h.startLine, end + 1).join("\n"));
    lines.splice(h.startLine, end - h.startLine + 1, ...text.split("\n"));
    remaining.push(...deckFindings(text, deps).flatMap((s) => s.found.map((f) => ({ ...f, slide: h.slide }))));
  }
  return { markdown: lines.join("\n"), replaced: hit.map((h) => h.slide), remaining: remaining.reverse(), findings };
}
