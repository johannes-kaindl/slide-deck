// tests/core/structure-css.test.ts
import { describe, it, expect } from "vitest";
import { STRUCTURE_CSS } from "../../src/core/presets/structure.css";

describe("STRUCTURE_CSS", () => {
  it("references tokens and keeps fit-critical rules", () => {
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; transform-origin:top left; }");
    expect(STRUCTURE_CSS).toContain("overflow:hidden");
    expect(STRUCTURE_CSS).toContain("var(--sd-bg)");
    expect(STRUCTURE_CSS).toContain("var(--sd-fg)");
    expect(STRUCTURE_CSS).toContain("font-size:var(--sd-base)");
  });
  it("does NOT declare --sd-base (single source is presetTokensCss)", () => {
    expect(STRUCTURE_CSS).not.toContain("--sd-base:");
  });
  it("code blocks use a token bg and no hardcoded dark colors", () => {
    expect(STRUCTURE_CSS).toContain(".sd-slide pre.hljs");
    expect(STRUCTURE_CSS).toContain("background:var(--sd-code-bg)");
    expect(STRUCTURE_CSS).not.toContain("#0d1117");
    expect(STRUCTURE_CSS).not.toContain("#e6edf3");
  });
  it("keeps accessible callout shapes (icon ::before)", () => {
    expect(STRUCTURE_CSS).toContain(".sd-callout-warning");
    expect(STRUCTURE_CSS).toContain("::before");
  });
});

describe("STRUCTURE_CSS callout tokenization", () => {
  it("derives callout surface + text from tokens with current fallbacks", () => {
    expect(STRUCTURE_CSS).toContain("var(--sd-surface,#f4f6f8)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-fg,#16181d)");
  });
  it("derives each callout signal color from a token", () => {
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-note,#3b6db5)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-warning,#b58a1e)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-danger,#b5443b)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-tip,#2e8b6f)");
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-info,#3b6db5)");
  });
  it("no longer hardcodes the light callout surface hex directly", () => {
    expect(STRUCTURE_CSS).not.toContain("background:#f4f6f8");
  });
  it("base callout border keeps the original neutral grey fallback", () => {
    expect(STRUCTURE_CSS).toContain("var(--sd-callout-base,#5b6470)");
    expect(STRUCTURE_CSS).not.toContain("6px solid var(--sd-callout-note");
  });
});

describe("STRUCTURE_CSS area model", () => {
  it("anchors absolutely-positioned slots", () => {
    expect(STRUCTURE_CSS).toContain("position:relative");           // on .sd-slide
    expect(STRUCTURE_CSS).toContain(".sd-slide-pagination");
    expect(STRUCTURE_CSS).toContain(".sd-slide-header");
    expect(STRUCTURE_CSS).toContain(".sd-slide-footer");
  });
  it("fills + centers block media via the media cell (sd-has-media)", () => {
    expect(STRUCTURE_CSS).toContain("margin-inline:auto");
    expect(STRUCTURE_CSS).toContain(".sd-content.sd-has-media");
    // both syntaxes share one fill structure: markdown <p>-wrap and the
    // render-dom .sd-media-cell wrap for bare Obsidian ![[embeds]]
    expect(STRUCTURE_CSS).toContain(".sd-media-cell");
    expect(STRUCTURE_CSS).toContain("width:100%; height:100%; object-fit:contain;");
  });
  it("defines cover-image background + scrim", () => {
    expect(STRUCTURE_CSS).toContain(".sd-cover-media");
    expect(STRUCTURE_CSS).toContain("object-fit:cover");
    expect(STRUCTURE_CSS).toContain("var(--sd-scrim,");
  });
  it("keeps .sd-content fill rule verbatim (fit-critical)", () => {
    // width/height:100% keeps overflow measurable; transform-origin pins the inline
    // per-slide fit-scale (moved out of render-dom inline styles for the 0.3.1 lint pass).
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; transform-origin:top left; }");
  });
});

describe("design system tokens", () => {
  it("defines the modular type scale as tokens with defaults", () => {
    for (const t of [
      "var(--sd-size-h1,1.95em)", "var(--sd-size-h2,1.25em)",
      "var(--sd-lh-body,1.45)", "var(--sd-lh-display,1.08)", "var(--sd-lh-heading,1.2)",
    ]) expect(STRUCTURE_CSS).toContain(t);
  });
  it("derives all spacing from the space scale (owl rhythm)", () => {
    expect(STRUCTURE_CSS).toContain(".sd-region > * + *{ margin-top:var(--sd-space-s,.75em); }");
    expect(STRUCTURE_CSS).toContain(".sd-region > * + h2{ margin-top:var(--sd-space-xl,2.25em); }");
    expect(STRUCTURE_CSS).toContain(".sd-region > h1 + h2{ margin-top:var(--sd-space-s,.75em); }");
    // h2 gets proportional air below (~0.7× its size), same rule as h1
    expect(STRUCTURE_CSS).toContain(".sd-region > h2 + *{ margin-top:var(--sd-space-m,1em); }");
    // panels (code, callouts) are visually heavy boxes — they breathe on both sides
    expect(STRUCTURE_CSS).toContain(".sd-region > * + :where(pre,.sd-callout),\n.sd-region > :where(pre,.sd-callout) + *{ margin-top:var(--sd-space-m,1em); }");
    // display-sized headings need ~0.7× their own size as separation — the
    // heading must read as its own level, not as line 1 of the list below it
    expect(STRUCTURE_CSS).toContain(".sd-region > h1 + *{ margin-top:var(--sd-space-l,1.5em); }");
    // list items read as units: compact within (line-height), air between (gap)
    expect(STRUCTURE_CSS).toContain("li{ margin:0; line-height:var(--sd-lh-list,1.35); }");
    expect(STRUCTURE_CSS).toContain("li + li{ margin-top:var(--sd-space-xs,.5em); }");
    // nested lists: bound to their parent item, tighter than top-level items —
    // otherwise list levels blur into one undifferentiated column
    expect(STRUCTURE_CSS).toContain(".sd-slide li > ul,.sd-slide li > ol{ margin-top:var(--sd-space-2xs,.25em); }");
    expect(STRUCTURE_CSS).toContain(".sd-slide li li + li{ margin-top:var(--sd-space-2xs,.25em); }");
  });
  it("slots speak the deck's metadata voice (mono, tracked, eyebrow-sized)", () => {
    expect(STRUCTURE_CSS).toContain("font-size:var(--sd-slot-size,var(--sd-size-eyebrow,.68em))");
    expect(STRUCTURE_CSS).toContain("font-family:var(--sd-slot-font,var(--sd-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace))");
    expect(STRUCTURE_CSS).not.toContain("--sd-size-small"); // retired: slots were its only consumer
  });
  it("headings and blocks own no ad-hoc margins", () => {
    expect(STRUCTURE_CSS).not.toMatch(/margin:0 0 \.4em/);
    expect(STRUCTURE_CSS).not.toMatch(/margin:\.25em 0/);
  });
  it("exposes display treatment tokens instead of theme rules", () => {
    expect(STRUCTURE_CSS).toContain("font-style:var(--sd-display-style,normal)");
    expect(STRUCTURE_CSS).toContain("font-weight:var(--sd-display-weight,700)");
    expect(STRUCTURE_CSS).toContain("letter-spacing:var(--sd-display-tracking,normal)");
  });
  it("keeps the fit-critical content invariant", () => {
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; transform-origin:top left; }");
  });
  it("styles blockquote/hr/inline-code once, tokenized (themes supply values)", () => {
    expect(STRUCTURE_CSS).toContain(".sd-slide blockquote{");
    expect(STRUCTURE_CSS).toContain(".sd-slide hr{");
    expect(STRUCTURE_CSS).toContain(":not(pre) > code{");
    expect(STRUCTURE_CSS).toContain("var(--sd-mono");
    expect(STRUCTURE_CSS).toContain("li::marker{ color:var(--sd-accent); }");
  });
});
