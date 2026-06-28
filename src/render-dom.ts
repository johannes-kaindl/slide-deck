import mermaid from "mermaid";
import { renderMarkdown } from "./core/render/md2html";
import { computeFit } from "./core/layout/fit";
import { shouldCenterCompose } from "./core/layout/compose";
import { collectWarnings, collectDeckWarnings, type Warning, type SlideWarning } from "./core/constraints/engine";
import { deckCss } from "./deck-css";
import { geometryFor } from "./core/geometry";
import { resolveTheme, type ThemeRegistry } from "./core/presets";
import type { SlideDeck } from "./core/slide-model";
import { createIsolatedDeckIframe } from "./iframe-host";

let mermaidSeq = 0;

function appendSlots(doc: Document, box: HTMLElement, deck: SlideDeck, slideIndex: number): void {
  const d = deck.directives;
  const make = (cls: string, text: string) => {
    const el = doc.createElement("div");
    el.className = cls;
    el.textContent = text;
    box.appendChild(el);
  };
  if (d.header) make("sd-slide-header", d.header);
  if (d.footer) make("sd-slide-footer", d.footer);
  if (d.paginate) make("sd-slide-pagination", `${slideIndex + 1} / ${deck.slides.length}`);
}

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
  registry: ThemeRegistry,
): Promise<Warning[]> {
  const geo = geometryFor(deck.directives.aspect);
  const entry = resolveTheme(registry, deck.directives.theme);
  const minScale = deck.directives.minFontPx / entry.baseFontPx;
  mermaid.initialize({ startOnLoad: false, theme: entry.mermaid });
  const warnings: Warning[] = [];
  warnings.push(...collectDeckWarnings(deck, registry));
  container.replaceChildren();

  // Pass 1 — build every slide's DOM (native createElement; runs in any realm).
  const built: { box: HTMLElement; inner: HTMLElement; slide: SlideDeck["slides"][number]; renderWarnings: SlideWarning[] }[] = [];
  for (const slide of deck.slides) {
    const box = doc.createElement("div");
    const modClasses = slide.modifiers.map((m) => `sd-mod-${m}`).join(" ");
    box.className = `sd-slide sd-layout-${slide.layout}${modClasses ? " " + modClasses : ""}`;
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
    // Multi-column: hoist a leading h1/h2 out of the first column so it spans all columns.
    if (slide.layout === "two-column" || slide.layout === "columns-3") {
      const firstRegion = inner.querySelector(".sd-region");
      const first = firstRegion?.firstElementChild;
      if (first && (first.tagName === "H1" || first.tagName === "H2")) {
        const titleEl = doc.createElement("div");
        titleEl.className = "sd-region sd-region-title";
        titleEl.appendChild(first); // moves the node
        inner.insertBefore(titleEl, firstRegion);
      }
    }
    // cover-image: pull the first image out into a full-bleed background layer + scrim.
    if (slide.layout === "cover-image") {
      const img = inner.querySelector<HTMLImageElement>("img");
      if (img) {
        const media = doc.createElement("img");
        media.className = "sd-cover-media";
        media.src = img.getAttribute("src") ?? "";
        const scrim = doc.createElement("div");
        scrim.className = "sd-cover-scrim";
        img.remove();
        box.insertBefore(scrim, inner);
        box.insertBefore(media, scrim);
      } else {
        renderWarnings.push({ kind: "cover-no-image", message: "cover-image slide has no image — rendering title only." });
      }
    }
    appendSlots(doc, box, deck, slide.index);
    await renderMermaidSlots(inner, slide.index, warnings);
    container.appendChild(box);
    built.push({ box, inner, slide, renderWarnings });
  }

  // Fonts must be decoded before measuring (KaTeX glyph metrics shift scrollHeight).
  await doc.fonts.ready;

  // Pass 2 — measure the padded content area and bake one shared scale per slide.
  for (const { box, inner, slide, renderWarnings } of built) {
    const contentHeight = inner.scrollHeight;
    const clientHeight = inner.clientHeight;
    const fit = computeFit(
      { contentWidth: inner.scrollWidth, contentHeight },
      { width: inner.clientWidth, height: clientHeight },
      minScale,
    );
    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${fit.scale})`;
    const composable = slide.layout === "default" || slide.layout === "two-column" || slide.layout === "columns-3";
    if (composable && shouldCenterCompose(contentHeight, clientHeight, fit)) {
      box.classList.add("sd-compose-center");
    }
    const slideWarnings = collectWarnings(slide, renderWarnings, fit);
    if (slideWarnings.some((w) => w.kind === "overflow" || w.kind === "belowFloor")) box.classList.add("sd-slide-warn");
    else if (slideWarnings.length > 0) box.classList.add("sd-slide-warn-soft");
    warnings.push(...slideWarnings);
  }
  return warnings;
}

export async function buildIsolatedDeck(
  ownerDoc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
  registry: ThemeRegistry, customCss = "",
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const css = deckCss(resolveTheme(registry, deck.directives.theme), customCss);
  const host = await createIsolatedDeckIframe(ownerDoc, { css, bodyHtml: "" });
  try {
    const warnings = await renderDeckToContainer(host.contentDoc, host.contentDoc.body, deck, resolveEmbed, registry);
    const slidesHtml = Array.from(host.contentDoc.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css, warnings };
  } finally {
    host.dispose();
  }
}
