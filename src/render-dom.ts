import mermaid from "mermaid";
import { renderMarkdown } from "./core/render/md2html";
import { computeFit } from "./core/layout/fit";
import { collectWarnings, collectDeckWarnings, type Warning, type SlideWarning } from "./core/constraints/engine";
import { deckCss } from "./deck-css";
import { geometryFor } from "./core/geometry";
import { presetFor } from "./core/presets";
import type { SlideDeck } from "./core/slide-model";
import { createIsolatedDeckIframe } from "./iframe-host";

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
  warnings.push(...collectDeckWarnings(deck));
  container.replaceChildren();

  // Pass 1 — build every slide's DOM (native createElement; runs in any realm).
  const built: { box: HTMLElement; inner: HTMLElement; slide: SlideDeck["slides"][number]; renderWarnings: SlideWarning[] }[] = [];
  for (const slide of deck.slides) {
    const box = doc.createElement("div");
    box.className = `sd-slide sd-layout-${slide.layout}`;
    box.style.setProperty("--sd-w", `${geo.width}px`);
    box.style.setProperty("--sd-h", `${geo.height}px`);
    const inner = doc.createElement("div");
    inner.className = "sd-content";
    box.appendChild(inner);
    const renderWarnings: SlideWarning[] = [];
    for (const region of slide.regions) {
      const r = renderMarkdown({ markdown: region, resolveEmbed });
      const regionEl = doc.createElement("div");
      regionEl.className = "sd-region";
      regionEl.innerHTML = r.html; // self-generated, controlled core HTML
      inner.appendChild(regionEl);
      renderWarnings.push(...r.warnings);
    }
    await renderMermaidSlots(inner, slide.index, warnings);
    container.appendChild(box);
    built.push({ box, inner, slide, renderWarnings });
  }

  // Fonts must be decoded before measuring (KaTeX glyph metrics shift scrollHeight).
  await doc.fonts.ready;

  // Pass 2 — measure the padded content area and bake one shared scale per slide.
  for (const { box, inner, slide, renderWarnings } of built) {
    const fit = computeFit(
      { contentWidth: inner.scrollWidth, contentHeight: inner.scrollHeight },
      { width: inner.clientWidth, height: inner.clientHeight },
      minScale,
    );
    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${fit.scale})`;
    const slideWarnings = collectWarnings(slide, renderWarnings, fit);
    if (slideWarnings.some((w) => w.kind === "overflow" || w.kind === "belowFloor")) box.classList.add("sd-slide-warn");
    else if (slideWarnings.length > 0) box.classList.add("sd-slide-warn-soft");
    warnings.push(...slideWarnings);
  }
  return warnings;
}

export async function buildIsolatedDeck(
  ownerDoc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null, customCss = "",
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const css = deckCss(deck.directives.theme, customCss);
  // Measure inside a theme-ISOLATED off-screen iframe: a parent staging div lives in the
  // themed document and would bake theme metrics — the exact leak this change removes.
  const host = await createIsolatedDeckIframe(ownerDoc, { css, bodyHtml: "" });
  try {
    const warnings = await renderDeckToContainer(host.contentDoc, host.contentDoc.body, deck, resolveEmbed);
    const slidesHtml = Array.from(host.contentDoc.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css, warnings };
  } finally {
    host.dispose();
  }
}
