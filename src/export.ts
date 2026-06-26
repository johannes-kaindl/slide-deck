import { Notice, type App } from "obsidian";
import html2canvas from "html2canvas";
import { loadActiveDeck } from "./adapter";
import { buildSelfContainedDeckHtml } from "./render-dom";
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

export async function exportPdf(app: App, doc: Document, win: Window, defaults?: Partial<DeckDirectives>): Promise<void> {
 try {
  const loaded = await loadActiveDeck(app, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed);
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

export async function exportImages(app: App, doc: Document, win: Window, defaults?: Partial<DeckDirectives>, scale = 2): Promise<void> {
  void win; // win not used in image path; kept for API symmetry with exportPdf
 try {
  const loaded = await loadActiveDeck(app, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed);
  const holder = doc.createElement("div");
  holder.style.position = "fixed"; holder.style.left = "-99999px"; holder.style.top = "0"; // off-screen staging
  const style = doc.createElement("style"); style.textContent = css; holder.appendChild(style);
  doc.body.appendChild(holder);
  const adapter = app.vault.adapter;
  const sourcePath = app.workspace.getActiveFile()?.path ?? "";
  const base = app.workspace.getActiveFile()?.basename ?? "deck";
  try {
    for (let i = 0; i < slidesHtml.length; i++) {
      holder.insertAdjacentHTML("beforeend", slidesHtml[i]); // bewusst: selbst-erzeugtes, isoliertes Export-HTML
      const el = holder.lastElementChild as HTMLElement;
      const canvas = await html2canvas(el, { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      // atob → char codes → Uint8Array → .buffer gives ArrayBuffer for writeBinary
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const filename = `${base}-${String(i + 1).padStart(2, "0")}.png`;
      // Honour the vault's configured attachment location (Settings → Files & Links)
      const path = await app.fileManager.getAvailablePathForAttachment(filename, sourcePath);
      const folder = path.substring(0, path.lastIndexOf("/"));
      if (folder && !(await adapter.exists(folder))) await adapter.mkdir(folder);
      await adapter.writeBinary(path, bytes.buffer);
      el.remove();
    }
    new Notice(t("export.done", slidesHtml.length));
  } finally { holder.remove(); }
 } catch (e) { new Notice(t("notice.exportFailed", String(e))); }
}
