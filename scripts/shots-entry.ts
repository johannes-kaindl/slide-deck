// Browser-IIFE: von scripts/shots.mjs gebündelt und in eine Headless-Chrome-Seite injiziert.
// Baut ein Raster aus theme-isolierten Folien-iframes für die README-Bilder. Rendert durch
// dieselbe Pipeline wie das Plugin (parseDeck → buildIsolatedDeck), damit ein Bild zeigt, was
// der Nutzer sieht — nicht was ein Aufnahme-Skript nachbaut.
//
// Warum iframes statt eines gemeinsamen Dokuments: deckCss deklariert `.sd-slide`-Regeln
// global. Neun Themes auf einer Seite würden einander überschreiben; die Isolation ist
// derselbe Mechanismus, den Preview und Export benutzen.
import { parseDeck } from "../src/vendor/deck-core/pure/slide-model";
import { geometryFor } from "../src/vendor/deck-core/pure/geometry";
import { mergeThemes } from "../src/vendor/deck-core/pure/presets";
import { builtinThemeEntries } from "../src/vendor/deck-core/pure/deck-css";
import { buildIsolatedDeck } from "../src/vendor/deck-core/dom/render-dom";
import { isolatedDeckHtml } from "../src/vendor/deck-core/dom/iframe-host";
import { VENDOR_CSS } from "../src/vendor-css";

interface Cell { theme: string; slide: number; label?: string }
interface ShotSpec {
  md: string;
  cells: Cell[];
  columns: number;
  cellWidth: number;
  gap: number;
  pad: number;
  bg: string;
  frame: boolean;
  labelColor: string;
}
declare global {
  interface Window { __SHOT__: ShotSpec; __DONE__?: boolean; __ERROR__?: string; __WARNINGS__?: string[] }
}

(async () => {
  try {
    const spec = window.__SHOT__;
    const deck = parseDeck(spec.md);
    const geo = geometryFor(deck.directives.aspect);
    const scale = spec.cellWidth / geo.width;
    const { map } = mergeThemes(builtinThemeEntries(VENDOR_CSS), []);

    // Ein Build pro Theme, nicht pro Zelle — buildIsolatedDeck rendert und misst das ganze
    // Deck, und die Fit-Messung ist der teure Teil.
    const themes = Array.from(new Set(spec.cells.map((c) => c.theme)));
    const built: Record<string, { css: string; slidesHtml: string[] }> = {};
    const warnings: string[] = [];
    for (const theme of themes) {
      deck.directives.theme = theme;
      const r = await buildIsolatedDeck(document, deck, () => null, map);
      built[theme] = { css: r.css, slidesHtml: r.slidesHtml };
      for (const w of r.warnings) warnings.push(`${theme}: slide ${w.slideIndex + 1} ${w.kind}`);
    }
    window.__WARNINGS__ = warnings;

    document.body.style.margin = "0";
    document.body.style.background = spec.bg;
    document.body.style.padding = `${spec.pad}px`;
    const labelH = spec.cells.some((c) => c.label) ? 34 : 0;

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${spec.columns}, ${spec.cellWidth}px)`;
    grid.style.gap = `${spec.gap}px`;
    grid.style.width = "max-content";
    document.body.appendChild(grid);

    const loads: Promise<void>[] = [];
    for (const cell of spec.cells) {
      const source = built[cell.theme];
      const html = source.slidesHtml[cell.slide];
      if (html === undefined) throw new Error(`slide ${cell.slide} missing (theme ${cell.theme}, deck has ${source.slidesHtml.length})`);

      const wrap = document.createElement("div");
      wrap.style.width = `${spec.cellWidth}px`;
      wrap.style.height = `${geo.height * scale + labelH}px`;

      const box = document.createElement("div");
      box.style.width = `${spec.cellWidth}px`;
      box.style.height = `${geo.height * scale}px`;
      box.style.overflow = "hidden";
      // Rahmen als box-shadow, nicht als border: eine border würde die Zellgröße ändern und
      // damit die vorausberechnete Fenstergröße — der Screenshot bekäme einen Rand aus Leere.
      if (spec.frame) box.style.boxShadow = "0 0 0 1px rgba(0,0,0,.20)";

      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.style.width = `${geo.width}px`;
      frame.style.height = `${geo.height}px`;
      frame.style.border = "0";
      frame.style.display = "block";
      frame.style.transform = `scale(${scale})`;
      frame.style.transformOrigin = "top left";
      loads.push(new Promise<void>((resolve) => {
        const onLoad = () => { frame.removeEventListener("load", onLoad); resolve(); };
        frame.addEventListener("load", onLoad);
      }));
      // srcdoc VOR dem Einhängen setzen — sonst lädt zuerst about:blank und feuert dafür
      // ein `load` (Kommentar-Begründung s. iframe-host.ts).
      frame.srcdoc = isolatedDeckHtml({ css: source.css, bodyHtml: html });
      box.appendChild(frame);
      wrap.appendChild(box);

      if (cell.label) {
        const cap = document.createElement("div");
        cap.textContent = cell.label;
        cap.style.font = "500 19px/34px ui-monospace, SFMono-Regular, Menlo, monospace";
        cap.style.color = spec.labelColor;
        cap.style.textAlign = "center";
        cap.style.height = `${labelH}px`;
        wrap.appendChild(cap);
      }
      grid.appendChild(wrap);
    }

    await Promise.all(loads);
    // Schriften des ELTERN-Dokuments (die Label-Zeilen); die der iframes hat
    // buildIsolatedDeck bereits abgewartet.
    if (document.fonts) await document.fonts.ready;
    window.__DONE__ = true;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    window.__ERROR__ = msg;
    // In den Body schreiben, nicht nur ins window-Objekt: der Screenshot ist das einzige,
    // was dieser Lauf zurückgibt — ein Fehler, der nur in der Konsole steht, erzeugt ein
    // leeres Bild, das wie ein Renderproblem aussieht.
    document.body.style.background = "#fff5f5";
    const pre = document.createElement("pre");
    pre.textContent = `shots-entry failed:\n${msg}`;
    pre.style.font = "16px/1.5 ui-monospace, Menlo, monospace";
    pre.style.color = "#b00020";
    pre.style.padding = "24px";
    pre.style.whiteSpace = "pre-wrap";
    document.body.appendChild(pre);
    window.__DONE__ = true;
  }
})();
