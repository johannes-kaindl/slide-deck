import type { DeckDirectives } from "../slide-model";
import { geometryFor, type SlideGeometry } from "../geometry";

export interface AuthoringContract {
  geometry: SlideGeometry;
  minFontPx: number;
  aspect: string;
  slideSeparator: "---";
  features: string[];
  unsupported: string[];
}

export function getAuthoringContract(d: DeckDirectives): AuthoringContract {
  return {
    geometry: geometryFor(d.aspect),
    minFontPx: d.minFontPx,
    aspect: d.aspect,
    slideSeparator: "---",
    features: ["headings", "lists", "images (![[name]])", "inline & block math ($…$)", "fenced code", "callouts (> [!type])", "mermaid"],
    unsupported: ["dataview", "runtime queries", "transclusion of other notes"],
  };
}

export function contractToPrompt(c: AuthoringContract): string {
  return [
    `Build a slide deck as Markdown. Separate slides with a line containing only "${c.slideSeparator}".`,
    `Each slide must fit a fixed ${c.geometry.width}x${c.geometry.height}px canvas with body text no smaller than ${c.minFontPx}px.`,
    `Keep slides sparse: few bullets, short lines. Every element must have a clear function.`,
    `Supported: ${c.features.join(", ")}.`,
    `Not supported (do not use): ${c.unsupported.join(", ")}.`,
  ].join("\n");
}
