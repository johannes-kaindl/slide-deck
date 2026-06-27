import { Notice, type App, type TFile } from "obsidian";
import html2canvas from "html2canvas";
import { loadDeck } from "./adapter";
import { buildIsolatedDeck } from "./render-dom";
import { createIsolatedDeckIframe } from "./iframe-host";
import { PRINT_CSS } from "./chrome-css";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";
import type { DeckDirectives, SlideDeck } from "./core/slide-model";
import type { ThemeRegistry } from "./core/presets";

/** Apply an explicit theme override (the toolbar's ephemeral try-on) onto a loaded deck. */
function withTheme(deck: SlideDeck, themeOverride?: string): SlideDeck {
  return themeOverride ? { ...deck, directives: { ...deck.directives, theme: themeOverride } } : deck;
}

export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, customCss = "", themeOverride?: string): Promise<void> {
 try {
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, customCss);
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
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
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
    for (let i = 0; i < slides.length; i++) {
      const canvas = await html2canvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${folder}/${String(i + 1).padStart(2, "0")}-${base}.png`;
      await adapter.writeBinary(path, bytes.buffer);
    }
    new Notice(t("export.done", slides.length));
  } finally { host.dispose(); }
 } catch (e) { new Notice(t("notice.exportFailed", String(e))); }
}
