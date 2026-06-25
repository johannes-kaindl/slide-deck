import mermaid from "mermaid";
import { renderMarkdown } from "./core/render/md2html";
import { computeFit } from "./core/layout/fit";
import { collectWarnings, type Warning } from "./core/constraints/engine";
import { deckCss } from "./deck-css";
import { geometryFor } from "./core/geometry";
import type { SlideDeck } from "./core/slide-model";

mermaid.initialize({ startOnLoad: false, theme: "default" });

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
  const minScale = deck.directives.minFontPx / 28; // 28 = --sd-base
  const warnings: Warning[] = [];
  void doc; // doc used by buildSelfContainedDeckHtml (doc.createElement, doc.body) — kept for API symmetry
  container.empty();
  for (const slide of deck.slides) {
    const box = container.createDiv({ cls: "sd-slide" });
    box.style.setProperty("--sd-w", `${geo.width}px`);
    box.style.setProperty("--sd-h", `${geo.height}px`);
    const rendered = renderMarkdown({ markdown: slide.markdown, resolveEmbed });
    const inner = box.createDiv({ cls: "sd-content" });
    inner.innerHTML = rendered.html; // self-generated, controlled core HTML
    await renderMermaidSlots(inner, slide.index, warnings);
    const fit = computeFit({ contentWidth: inner.scrollWidth, contentHeight: inner.scrollHeight }, geo, minScale);
    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${fit.scale})`;
    warnings.push(...collectWarnings(slide.index, rendered, fit, slide.startLine));
  }
  return warnings;
}

export async function buildSelfContainedDeckHtml(
  doc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const staging = doc.createElement("div");
  staging.style.position = "fixed"; staging.style.left = "-99999px"; staging.style.top = "0";
  doc.body.appendChild(staging);
  try {
    const warnings = await renderDeckToContainer(doc, staging, deck, resolveEmbed);
    const slidesHtml = Array.from(staging.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css: deckCss(deck.directives.theme), warnings };
  } finally {
    staging.remove();
  }
}
