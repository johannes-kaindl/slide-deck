import { contractToPrompt, type AuthoringContract } from "../constraints/contract";
import { frontmatterRange } from "./deck-sanitize";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface DeckPromptOpts { slideTarget: number | "auto"; hint: string }

const MAX_ECHO = 2000;

/** Strip the note's own frontmatter block (schema keys would burn context / be echoed as content). */
export function stripNoteFrontmatter(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = frontmatterRange(lines);
  return range ? lines.slice(range.end + 1).join("\n").replace(/^\n+/, "") : md;
}

/** Build the system+user messages that turn a source note body into slide-deck Markdown.
 *  The contract's theme line is omitted (includeTheme:false) — the deck theme is set
 *  deterministically afterwards, so the model must not choose one. */
export function buildDeckPrompt(sourceBody: string, opts: DeckPromptOpts, contract: AuthoringContract): ChatMessage[] {
  const bodyOnly = stripNoteFrontmatter(sourceBody);
  const target = opts.slideTarget === "auto"
    ? "Choose the slide count from the content structure — typically 5–12; a short note yields few slides."
    : `Produce about ${opts.slideTarget} slides.`;
  const system = [
    "You convert a Markdown note into slide-deck Markdown.",
    contractToPrompt(contract, { includeTheme: false }),
    "",
    "Rules:",
    "- Structure AND condense: turn prose into sparse, presentable bullet points. Do not invent facts, numbers, or claims not in the source.",
    "- Write the deck in the same language as the note.",
    "- Output ONLY the deck markdown. No preamble, no explanation, no surrounding code fences.",
    "- The output begins with the frontmatter block, and NEVER begins with a slide separator line.",
    "- Do not put quotes around frontmatter values.",
    "- Use ONLY the exact layout names listed above in <!-- layout: NAME --> — never invent one (e.g. use cover-image or title, not \"cover\").",
    "- Hero layouts (title, section, quote, cover-image) are ONLY for sparse content: at most ~3 short lines — never lists or code blocks on them.",
    "- Put list-heavy content on default, two-column or columns-3 slides, at most 5 bullets per region; keep each bullet a short fragment (about 10 words or fewer).",
    "- On a hero slide, an optional ## line next to the # title is a kicker (eyebrow): at most ~4 words.",
    "- Put header:, footer: and paginate: INSIDE the top frontmatter block (never as body lines on the first slide).",
    "- For a two-column or columns-3 slide, write the slide title as one leading # heading, then split the columns with <!-- column -->.",
    "- Only image embeds (![[name]]) are supported; drop transclusions of other notes.",
    `- ${target}`,
  ].join("\n");

  const userParts = [`Source note:\n\n${bodyOnly}`];
  if (opts.hint.trim()) userParts.push(`\nAuthor hint: ${opts.hint.trim()}`);
  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}

/** Corrective feedback for the single allowed auto-retry: echo the failed output (truncated)
 *  as the assistant turn, then a user turn naming why it failed. */
export function buildRetryFeedback(failedOutput: string, reason: string): ChatMessage[] {
  const echo = failedOutput.length > MAX_ECHO ? failedOutput.slice(0, MAX_ECHO) : failedOutput;
  return [
    { role: "assistant", content: echo },
    { role: "user", content: `That was not a valid deck because: ${reason}. Output ONLY the deck markdown, starting with the frontmatter block.` },
  ];
}
