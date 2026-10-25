import { Notice, Platform, type App, type TFile } from "obsidian";
import { domToCanvas } from "modern-screenshot";
import { loadDeck } from "./adapter";
import { dataUrlToBytes } from "./vendor/kit/data-url";
import { buildIsolatedDeck } from "./vendor/deck-core/dom/render-dom";
import { createIsolatedDeckIframe, isolatedDeckHtml } from "./vendor/deck-core/dom/iframe-host";
import { PRINT_CSS } from "./vendor/deck-core/dom/chrome-css";
import { geometryFor } from "./vendor/deck-core/pure/geometry";
import { t } from "./i18n";
import type { DeckDirectives, SlideDeck } from "./vendor/deck-core/pure/slide-model";
import type { ThemeRegistry } from "./vendor/deck-core/pure/presets";

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

const CHARSET_META = `<meta charset="utf-8">`;

/** Setzt das Policy-`meta` direkt hinter das `meta charset` des Kopfes. Findet es die Stelle nicht,
 *  wirft es: eine lose Datei ohne Policy darf nie still entstehen. Gesucht wird nur im Kopf, damit
 *  ein `meta charset` im Inhalt einer Folie nicht als Anker taugt. */
export function withContentSecurityPolicy(html: string): string {
  const head = html.indexOf("<head>");
  const headEnd = html.indexOf("</head>");
  const at = head === -1 || headEnd === -1 ? -1 : html.indexOf(CHARSET_META, head);
  if (at === -1 || at > headEnd) throw new Error("export: meta charset not found in deck head, cannot set Content-Security-Policy");
  const end = at + CHARSET_META.length;
  return `${html.slice(0, end)}<meta http-equiv="Content-Security-Policy" content="${MOBILE_EXPORT_CSP}">${html.slice(end)}`;
}

/** Die lose Datei des mobilen PDF-Exports: der Assembler des Kerns plus Policy. */
export function mobileDeckHtml(opts: { css: string; bodyHtml: string; extraCss?: string }): string {
  return withContentSecurityPolicy(isolatedDeckHtml(opts));
}

/** Mobile PDF path (letterhead pattern): window.print() is a no-op in the Obsidian
 *  mobile WebView, so write the self-contained deck HTML into the vault and hand it
 *  to the OS via openWithDefaultApp — the user prints/shares it to PDF from there. */
async function exportDeckHtmlAndOpen(app: App, file: TFile | null, slidesHtml: string[], css: string, geo: { width: number; height: number }, exportFolder: string): Promise<void> {
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  if (!(await adapter.exists(root))) await adapter.mkdir(root);
  const path = `${root}/${base}.html`;
  await adapter.write(path, mobileDeckHtml({ css, bodyHtml: slidesHtml.join(""), extraCss: PRINT_CSS(geo.width, geo.height) }));
  const open = (app as unknown as { openWithDefaultApp?: (p: string) => Promise<void> }).openWithDefaultApp;
  if (typeof open === "function") { try { await open.call(app, path); } catch { /* fall through to the path notice */ } }
  new Notice(t("notice.pdfOpened", path));
}

/** `mobile` waehlt nur zwischen den zwei vorhandenen Zweigen (lose HTML-Datei oder Druck des iframe); der
 *  Vorgabewert ist die Plattform, nur der GUI-Smoke (PD1) gibt ihn vor, weil `emulateMobile` `Platform.isDesktopApp` nicht aendert. */
export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, customCss = "", themeOverride?: string, exportFolder = "Slide-Deck-Export", mobile = !Platform.isDesktopApp): Promise<void> {
 try {
  const loaded = await loadDeck(app, file, defaults, { registry, themeKey: themeOverride });
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
  new Notice(t("notice.exporting"));
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, customCss);
  if (mobile) { await exportDeckHtmlAndOpen(app, file, slidesHtml, css, geo, exportFolder); return; }
  // Desktop: print the isolated iframe directly.
  // allow-modals is required for contentWindow.print() on a sandboxed frame (print opens a modal).
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
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, customCss);
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  const folder = `${root}/${base}`;
  if (!(await adapter.exists(root))) await adapter.mkdir(root);
  if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
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
