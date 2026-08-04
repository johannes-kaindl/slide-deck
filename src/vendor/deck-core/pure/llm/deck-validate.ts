import { parseDeck, type SlideDeck } from "../slide-model";
import { collectWarnings, type Warning } from "../constraints/engine";
import type { FitResult } from "../layout/fit";

const STUB_FIT: FitResult = { scale: 1, overflow: false };

export interface DeckValidation { fatal?: string; deck: SlideDeck; warnings: Warning[] }

/** Static (no-DOM) validation of sanitized deck markdown. Fatal only for empty output or
 *  zero slides. Directive/layout/region warnings are collected but never block (fit-or-warn).
 *  overflow / missing-embed / mermaid-error are only knowable at render time → excluded. */
export function validateDeckOutput(md: string): DeckValidation {
  const deck = parseDeck(md);
  if (md.trim() === "") return { fatal: "empty output", deck, warnings: [] };
  if (deck.slides.length === 0) return { fatal: "0 slides after sanitizing", deck, warnings: [] };
  const warnings: Warning[] = [];
  for (const slide of deck.slides) warnings.push(...collectWarnings(slide, [], STUB_FIT));
  return { deck, warnings };
}
