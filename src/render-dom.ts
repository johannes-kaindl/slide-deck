import mermaid from "mermaid";
import { renderMarkdown } from "./core/render/md2html";
import { computeFit } from "./core/layout/fit";
import { collectWarnings, type Warning, type SlideWarning } from "./core/constraints/engine";
import { deckCss } from "./deck-css";
import { geometryFor } from "./core/geometry";
import { presetFor } from "./core/presets";
import type { SlideDeck } from "./core/slide-model";

let mermaidSeq = 0;

async function renderMermaidSlots(scope: HTMLElement, slideIndex: number, warnings: Warning[]): Promise<void> {
  const slots = Array.from(scope.querySelectorAll<HTMLElement>(".sd-mermaid"));
  for (let i = 0; i < slots.length; i++) {
    const src = atob(slots[i].dataset.src ?? "");
    try {
      const renderId = `sd-mm-${mermaidSeq++}`;
      const { svg } = await mermaid.render(renderId, src);
      slots[i].innerHTML = svg;
    } catch {
      slots[i].textContent = "⚠ Mermaid error";
      warnings.push({ slideIndex, kind: "mermaid-error", message: "Mermaid diagram failed to parse" });
    }
  }
}

export async function renderDeckToContainer(
  doc: Document, container: HTMLElement, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
): Promise<Warning[]> {
  const geo = geometryFor(deck.directives.aspect);
  const preset = presetFor(deck.directives.theme);
  const minScale = deck.directives.minFontPx / preset.baseFontPx;
  mermaid.initialize({ startOnLoad: false, theme: preset.mermaid });
  const warnings: Warning[] = [];
  void doc; // doc used by buildSelfContainedDeckHtml — kept for API symmetry
  container.empty();
  for (const slide of deck.slides) {
    const box = container.createDiv({ cls: `sd-slide sd-layout-${slide.layout}` });
    box.style.setProperty("--sd-w", `${geo.width}px`);
    box.style.setProperty("--sd-h", `${geo.height}px`);
    const inner = box.createDiv({ cls: "sd-content" });
    const renderWarnings: SlideWarning[] = [];
    for (const region of slide.regions) {
      const r = renderMarkdown({ markdown: region, resolveEmbed });
      const regionEl = inner.createDiv({ cls: "sd-region" });
      regionEl.innerHTML = r.html; // self-generated, controlled core HTML
      renderWarnings.push(...r.warnings);
    }
    await renderMermaidSlots(inner, slide.index, warnings);
    // Measure the whole padded content area (one shared scale for all regions).
    const fit = computeFit(
      { contentWidth: inner.scrollWidth, contentHeight: inner.scrollHeight },
      { width: inner.clientWidth, height: inner.clientHeight },
      minScale,
    );
    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${fit.scale})`;
    const slideWarnings = collectWarnings(slide, renderWarnings, fit);
    if (slideWarnings.some((w) => w.kind === "overflow" || w.kind === "belowFloor")) box.addClass("sd-slide-warn");
    warnings.push(...slideWarnings);
  }
  return warnings;
}

export async function buildSelfContainedDeckHtml(
  doc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const staging = doc.createElement("div");
  staging.style.position = "fixed"; staging.style.left = "-99999px"; staging.style.top = "0";
  // Inject the deck CSS into the staging tree so slides are STYLED while we measure them
  // (fit/overflow needs the real padded geometry). renderDeckToContainer empties its host,
  // so render into a child and keep the <style> as a sibling.
  const style = doc.createElement("style");
  style.textContent = deckCss(deck.directives.theme);
  staging.appendChild(style);
  const host = doc.createElement("div");
  staging.appendChild(host);
  doc.body.appendChild(staging);
  try {
    const warnings = await renderDeckToContainer(doc, host, deck, resolveEmbed);
    const slidesHtml = Array.from(host.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css: deckCss(deck.directives.theme), warnings };
  } finally {
    staging.remove();
  }
}
