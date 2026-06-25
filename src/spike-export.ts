import { Notice, Platform } from "obsidian";
import html2canvas from "html2canvas";

const GEO = { width: 1280, height: 720 };

const DEMO_SLIDES = [
  `<h1>Slide one</h1><p style="font-size:28px">Readable body text — KaTeX: <span class="katex-test">E=mc²</span></p>`,
  `<h2>Slide two</h2><ul style="font-size:28px"><li>Bullet A</li><li>Bullet B</li></ul>`,
];

const PRINT_CSS = `
#sd-print-root{ display:none; }
@media print{
  @page{ size:${GEO.width}px ${GEO.height}px; margin:0; }
  html,body{ margin:0 !important; padding:0 !important; background:#fff !important; }
  body > *:not(#sd-print-root){ display:none !important; }
  #sd-print-root{ display:block !important; }
  .sd-slide{ width:${GEO.width}px; height:${GEO.height}px; box-sizing:border-box;
    padding:64px; overflow:hidden; break-after:page; background:#fff; color:#111; }
}
.sd-slide{ width:${GEO.width}px; height:${GEO.height}px; box-sizing:border-box;
  padding:64px; overflow:hidden; background:#fff; color:#111; }
`;

function buildPrintRoot(doc: Document, slidesHtml: string[]): { root: HTMLElement; style: HTMLStyleElement } {
  doc.getElementById("sd-print-root")?.remove();
  doc.getElementById("sd-print-style")?.remove();
  const style = doc.createElement("style");
  style.id = "sd-print-style";
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  const root = doc.createElement("div");
  root.id = "sd-print-root";
  for (const html of slidesHtml) {
    const slide = doc.createElement("div");
    slide.className = "sd-slide";
    slide.innerHTML = html; // bewusst: selbst-erzeugtes, isoliertes Export-HTML
    root.appendChild(slide);
  }
  doc.body.appendChild(root);
  return { root, style };
}

export function printDeck(doc: Document, win: Window, slidesHtml: string[]): void {
  const { root, style } = buildPrintRoot(doc, slidesHtml);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    root.remove();
    style.remove();
    win.removeEventListener("afterprint", cleanup);
  };
  win.addEventListener("afterprint", cleanup);
  win.setTimeout(() => { try { win.print(); } catch { new Notice("Print failed"); cleanup(); } }, 150);
  win.setTimeout(cleanup, 60000);
}

export async function captureSlidePng(doc: Document, html: string): Promise<string> {
  const holder = doc.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-99999px";
  holder.style.top = "0";
  const slide = doc.createElement("div");
  slide.className = "sd-slide";
  slide.innerHTML = html;
  holder.appendChild(slide);
  doc.body.appendChild(holder);
  try {
    const canvas = await html2canvas(slide, { width: GEO.width, height: GEO.height, scale: 2, backgroundColor: "#fff" });
    return canvas.toDataURL("image/png");
  } finally {
    holder.remove();
  }
}

export async function runSpike(doc: Document, win: Window): Promise<void> {
  if (!Platform.isDesktopApp) { new Notice("Spike: desktop only"); return; }
  const png = await captureSlidePng(doc, DEMO_SLIDES[0]);
  // PNG-Validierung: ins Devtools-Log, manuell prüfen
  console.log("sd-spike png length", png.length, png.slice(0, 40));
  printDeck(doc, win, DEMO_SLIDES);
}
