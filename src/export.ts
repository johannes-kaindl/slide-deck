import { Notice, type App, type TFile } from "obsidian";
import html2canvas from "html2canvas";
import { loadDeck } from "./adapter";
import { buildIsolatedDeck } from "./render-dom";
import { createIsolatedDeckIframe } from "./iframe-host";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";
import type { DeckDirectives } from "./core/slide-model";

function printRootCss(w: number, h: number, preset: string): string {
  return (
    `${preset}\n#sd-print-root{display:none;}\n@media print{@page{size:${w}px ${h}px;margin:0;}` +
    `html,body{margin:0!important;padding:0!important;background:#fff!important;}` +
    `body>*:not(#sd-print-root){display:none!important;}#sd-print-root{display:block!important;}` +
    `.sd-slide{break-after:page;}}`
  );
}

export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, defaults?: Partial<DeckDirectives>, customCss = ""): Promise<void> {
 try {
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildIsolatedDeck(doc, loaded.deck, loaded.resolveEmbed, customCss);
  doc.getElementById("sd-print-root")?.remove();
  doc.getElementById("sd-print-style")?.remove();
  const style = doc.createElement("style"); style.id = "sd-print-style";
  style.textContent = printRootCss(geo.width, geo.height, css); doc.head.appendChild(style);
  const root = doc.createElement("div"); root.id = "sd-print-root";
  root.innerHTML = slidesHtml.join(""); // bewusst: selbst-erzeugtes, isoliertes Export-HTML
  doc.body.appendChild(root);
  let done = false;
  let safetyTimer: ReturnType<typeof win.setTimeout> | undefined;
  const cleanup = () => {
    if (done) return;
    done = true;
    if (safetyTimer !== undefined) win.clearTimeout(safetyTimer);
    root.remove();
    style.remove();
    win.removeEventListener("afterprint", cleanup);
  };
  win.addEventListener("afterprint", cleanup);
  win.setTimeout(() => { try { win.print(); } catch { new Notice("Print failed"); cleanup(); } }, 200);
  safetyTimer = win.setTimeout(cleanup, 60000);
 } catch (e) { new Notice(t("notice.exportFailed", String(e))); }
}

export async function exportImages(app: App, doc: Document, win: Window, file: TFile | null, defaults?: Partial<DeckDirectives>, scale = 2, customCss = "", exportFolder = "Slide-Deck-Export"): Promise<void> {
  void win; // win not used in image path; kept for API symmetry with exportPdf
 try {
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildIsolatedDeck(doc, loaded.deck, loaded.resolveEmbed, customCss);
  const host = await createIsolatedDeckIframe(doc, { css, bodyHtml: slidesHtml.join(""), offscreen: true, width: geo.width });
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  const folder = `${root}/${base}`;
  if (!(await adapter.exists(root))) await adapter.mkdir(root);
  if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
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
