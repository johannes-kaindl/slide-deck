import { Notice, Platform, type App, type TFile } from "obsidian";
import { domToCanvas } from "modern-screenshot";
import { loadDeck } from "./adapter";
import { dataUrlToBytes } from "./vendor/kit/data-url";
import { buildIsolatedDeck } from "./vendor/deck-core/dom/render-dom";
import { createIsolatedDeckIframe, isolatedDeckHtml } from "./vendor/deck-core/dom/iframe-host";
import { PRINT_CSS } from "./vendor/deck-core/dom/chrome-css";
import { isDesktopPrintAvailable, printHtmlToPdf, PrintToPdfError } from "./vendor/kit-obsidian/print-to-pdf";
import { geometryFor } from "./vendor/deck-core/pure/geometry";
import { t } from "./i18n";
import type { DeckDirectives, SlideDeck } from "./vendor/deck-core/pure/slide-model";
import type { ThemeRegistry } from "./vendor/deck-core/pure/presets";
import { ensureDir } from "./vendor/kit/ensure-dir";
import { collectFontFaces } from "./vendor/kit/font-faces";
import type { StyleSheetSource } from "./vendor/kit/collect-css";

/** Schriften, die Obsidian im Hauptdokument per `@font-face` laedt und die Themes beim Namen nennen (deck-core-Presets: `"Inter", system-ui, …`). */
export const HOST_FONT_FAMILIES: readonly string[] = ["Inter"];

/** Das eigene CSS des Nutzers mit Obsidians `@font-face`-Regeln fuer `HOST_FONT_FAMILIES` davor, fuer Vorschau, Messung und Export.
 *  Ohne sie faellt der Inter-Stack im isolierten Deck auf `system-ui`, und modern-screenshot setzt `system-ui` im foreignObject-Bild
 *  breiter als die Vorschau (Obsidian 1.15.1: 590,8 gegen 666,5 px); mit ihnen rendern Vorschau, Fit-Messung und PNG dieselbe Inter.
 *  Im PDF (Druckmodul und mobile HTML-Datei) sperrt die Policy (`font-src data:`) die `app:`-URL, dort bleibt es beim Rueckfall auf die
 *  Systemschrift; sie laeuft schmaler als Inter, die Fit-Messung bleibt also auf der sicheren Seite. */
export function withHostFonts(doc: StyleSheetSource, customCss: string): string {
  const { css } = collectFontFaces(doc, HOST_FONT_FAMILIES);
  return css === "" ? customCss : `${css}\n${customCss}`;
}

/** Apply an explicit theme override (the toolbar's ephemeral try-on) onto a loaded deck. */
function withTheme(deck: SlideDeck, themeOverride?: string): SlideDeck {
  return themeOverride ? { ...deck, directives: { ...deck.directives, theme: themeOverride } } : deck;
}

/** Content-Security-Policy der losen Datei des mobilen PDF-Exports. Die Datei liegt im Vault und
 *  wird vom Betriebssystem geoeffnet, ohne den `sandbox`-Rahmen des Desktop-Pfads; Skripte aus der
 *  Notiz (`html: true` im Markdown-Weg, kein Sanitizer) liefen dort. `default-src 'none'` sperrt
 *  Skripte, Rahmen und Verbindungen; Stile, `data:`-Bilder und -Schriften bleiben (Deck-CSS, KaTeX,
 *  Mermaid-SVG). Fernbilder ueber https bleiben erlaubt: ein Bild fuehrt nichts aus, und die Vorschau
 *  laedt sie im eigenen Deck bewusst (Smoke V11). */
export const MOBILE_EXPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; base-uri 'none'; form-action 'none'";

/** Die lose Datei des mobilen PDF-Exports: der Assembler des Kerns, der die Policy
 *  (`MOBILE_EXPORT_CSP`) selbst hinter das charset-meta setzt. */
export function mobileDeckHtml(opts: { css: string; bodyHtml: string; extraCss?: string }): string {
  return isolatedDeckHtml({ ...opts, contentSecurityPolicy: MOBILE_EXPORT_CSP });
}

/** Mobile PDF path (letterhead pattern): window.print() is a no-op in the Obsidian
 *  mobile WebView, so write the self-contained deck HTML into the vault and hand it
 *  to the OS via openWithDefaultApp — the user prints/shares it to PDF from there. */
async function exportDeckHtmlAndOpen(app: App, file: TFile | null, slidesHtml: string[], css: string, geo: { width: number; height: number }, exportFolder: string): Promise<void> {
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  await ensureDir(adapter, root);
  const path = `${root}/${base}.html`;
  await adapter.write(path, mobileDeckHtml({ css, bodyHtml: slidesHtml.join(""), extraCss: PRINT_CSS(geo.width, geo.height) }));
  const open = (app as unknown as { openWithDefaultApp?: (p: string) => Promise<void> }).openWithDefaultApp;
  if (typeof open === "function") { try { await open.call(app, path); } catch { /* fall through to the path notice */ } }
  new Notice(t("notice.pdfOpened", path));
}

/** Rueckfall des Desktop-Exports: den isolierten iframe ueber den Druckdialog des Systems drucken.
 *  `allow-modals` braucht `contentWindow.print()` an einem Rahmen mit `sandbox`. */
async function printViaIframe(doc: Document, win: Window, slidesHtml: string[], css: string, geo: { width: number; height: number }): Promise<void> {
  const host = await createIsolatedDeckIframe(doc, { css, extraCss: PRINT_CSS(geo.width, geo.height), bodyHtml: slidesHtml.join(""), width: geo.width, sandbox: "allow-same-origin allow-modals" });
  const frameWin = host.iframe.contentWindow;
  let done = false;
  let safetyTimer: ReturnType<typeof win.setTimeout> | undefined;
  const cleanup = () => {
    if (done) return;
    done = true;
    if (safetyTimer !== undefined) win.clearTimeout(safetyTimer);
    frameWin?.removeEventListener("afterprint", cleanup);
    host.dispose();
  };
  // afterprint fires on the printed window — the iframe's own contentWindow, not the parent.
  frameWin?.addEventListener("afterprint", cleanup);
  win.setTimeout(() => { try { frameWin?.print(); } catch { new Notice(t("notice.printFailed")); cleanup(); } }, 200);
  safetyTimer = win.setTimeout(cleanup, 60000);
}

/** Legt `<Exportordner>/<Notizname>.<ext>` an (Ordner bei Bedarf) und liefert den Pfad. */
async function writeExportFile(app: App, file: TFile | null, exportFolder: string, ext: "pdf", bytes: Uint8Array): Promise<string> {
  const adapter = app.vault.adapter;
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  await ensureDir(adapter, root);
  const path = `${root}/${file?.basename ?? "deck"}.${ext}`;
  await adapter.writeBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return path;
}

/** `mobile` waehlt zwischen den Zweigen (lose HTML-Datei oder Desktop-Druck: Kit-Druckmodul, sonst Druck des iframe); `printer` ersetzt das Kit-Modul in Tests und im GUI-Smoke; der
 *  Vorgabewert ist die Plattform, nur der GUI-Smoke (PD1) gibt ihn vor, weil `emulateMobile` `Platform.isDesktopApp` nicht aendert. */
export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, customCss = "", themeOverride?: string, exportFolder = "Slide-Deck-Export", mobile = !Platform.isDesktopApp, printer: typeof printHtmlToPdf = printHtmlToPdf): Promise<void> {
 try {
  const loaded = await loadDeck(app, file, defaults, { registry, themeKey: themeOverride });
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
  new Notice(t("notice.exporting"));
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, withHostFonts(doc, customCss));
  if (mobile) { await exportDeckHtmlAndOpen(app, file, slidesHtml, css, geo, exportFolder); return; }
  // Desktop: das Kit-Druckmodul schreibt das PDF ohne Dialog in den Exportordner. `@page { size: <Canvas>px }` aus PRINT_CSS bestimmt die
  // Seite (das Modul druckt mit `preferCSSPageSize`), die Policy-Datei ist dieselbe wie im mobilen Weg. Scheitert der Druck, bleibt der alte Weg.
  if (isDesktopPrintAvailable()) {
    try {
      const html = mobileDeckHtml({ css, bodyHtml: slidesHtml.join(""), extraCss: PRINT_CSS(geo.width, geo.height) });
      const bytes = await printer(doc, html, { pageSize: "A4", printBackground: true });
      const path = await writeExportFile(app, file, exportFolder, "pdf", bytes);
      new Notice(t("notice.pdfSaved", path));
      return;
    } catch (e) {
      if (!(e instanceof PrintToPdfError)) throw e;
      new Notice(t("notice.printModuleFailed", e.kind));
    }
  }
  await printViaIframe(doc, win, slidesHtml, css, geo);
 } catch (e) { new Notice(t("notice.exportFailed", String(e))); }
}

export async function exportImages(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, scale = 2, customCss = "", exportFolder = "Slide-Deck-Export", themeOverride?: string): Promise<void> {
  void win;
 try {
  const loaded = await loadDeck(app, file, defaults, { registry, themeKey: themeOverride });
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
  new Notice(t("notice.exporting"));
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, withHostFonts(doc, customCss));
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  const folder = `${root}/${base}`;
  await ensureDir(adapter, folder);   // legt die Wurzel mit an
  const host = await createIsolatedDeckIframe(doc, { css, bodyHtml: slidesHtml.join(""), width: geo.width });
  try {
    const slides = Array.from(host.contentDoc.querySelectorAll<HTMLElement>(".sd-slide"));
    const view = host.contentDoc.defaultView;
    for (let i = 0; i < slides.length; i++) {
      // modern-screenshot's backgroundColor option fills the canvas AND forces
      // `background-color !important` on the cloned root. Passing the slide's own
      // computed --sd-bg keeps the theme background (a hardcoded "#fff" would paint
      // every theme white); fall back to white only if the slide is transparent.
      const slideBg = view ? view.getComputedStyle(slides[i]).backgroundColor : "";
      const backgroundColor = slideBg && slideBg !== "rgba(0, 0, 0, 0)" && slideBg !== "transparent" ? slideBg : "#fff";
      const canvas = await domToCanvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor });
      const bytes = dataUrlToBytes(canvas.toDataURL("image/png"));
      const path = `${folder}/${String(i + 1).padStart(2, "0")}-${base}.png`;
      await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
    }
    new Notice(t("export.done", slides.length));
  } finally { host.dispose(); }
 } catch (e) { new Notice(t("notice.exportFailed", String(e))); }
}
