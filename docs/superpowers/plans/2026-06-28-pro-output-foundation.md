# Pro-Output Foundation (A + B1 + B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift slide-output quality at the foundation level: auto-compose sparse slides (no more dead-space), tokenize callouts so themes own their colors, and let a theme pick its code/Mermaid scheme.

**Architecture:** Three independent, theme-independent foundation changes. (A) Layout inference + a measure-time vertical-compose step. (B1) Replace hardcoded callout colors in `STRUCTURE_CSS` with token-with-fallback. (B2) A pure `parseThemeMeta` reads `/* sd-hljs / sd-mermaid */` header directives so `userThemeEntry` stops hardcoding the light scheme. The big visual work (CHARACTER_CSS + theme family + export verification = B3/B4) is a **separate plan**.

**Tech Stack:** TypeScript (strict) · esbuild · vitest (`environment: node`, no DOM) · Obsidian Plugin API · highlight.js · Mermaid.

## Global Constraints

- **TS strict + `noImplicitAny`** — no `any` casts for new types.
- **Pure-Core invariant:** `src/core/**` must never import `obsidian` or touch DOM. `scripts/check-core-purity.mjs` runs as the first step of `npm test`.
- **Realm-Safety invariant:** `src/render-dom.ts` must not use Obsidian DOM augmentations (`createDiv`/`createEl`/`addClass`/`removeClass`/`setText`/`setAttr`/`empty`). Use native DOM only (`classList.add`). `scripts/check-render-realm.mjs` is the second step of `npm test`.
- **Tests:** vitest runs `environment: "node"` — no DOM, no happy-dom. vitest **cannot** import `.css` files (esbuild text-loader only) — so anything importing `src/deck-css.ts` cannot be unit-tested; it is covered by `scripts/bundle-smoke.mjs` (part of `npm test`) + manual Pallas smoke.
- **Commits:** Conventional Commits, German description allowed. **Stage only touched files.** Trailer on substantial AI contribution: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feat/pro-slide-output` (already created, spec committed at `268394d`).
- **Gate (run after every task):** `npm test` green (purity + realm + vitest + bundle-smoke). Full gate before merge: `npm run lint && npm run build && npm test` + `npx tsc --noEmit`.
- **Spec:** `docs/superpowers/specs/2026-06-28-pro-output-design.md` (§7 Phase A, §8 B1, §9 B2).

---

## File Structure

- `src/core/infer-layout.ts` **(new)** — pure `inferLayout(regions)` content-shape → layout id.
- `src/core/layout/compose.ts` **(new)** — pure `shouldCenterCompose(...)` + `COMPOSE_CENTER_THRESHOLD`.
- `src/core/directives.ts` **(modify)** — add `layoutExplicit` to `DirectiveResult`.
- `src/core/slide-model.ts` **(modify)** — apply `inferLayout` in `flush()` when layout not explicit.
- `src/core/presets/layouts.css.ts` **(modify)** — add `.sd-compose-center` rules.
- `src/render-dom.ts` **(modify)** — toggle `sd-compose-center` after measuring (Pass 2).
- `src/core/presets/structure.css.ts` **(modify)** — callout colors → `var(--sd-*, fallback)`.
- `src/core/theme-key.ts` **(modify)** — add pure `parseThemeMeta(css)`.
- `src/deck-css.ts` **(modify)** — `userThemeEntry` uses `parseThemeMeta`.
- Tests: `tests/core/infer-layout.test.ts` (new), `tests/core/compose.test.ts` (new), updates to `tests/core/slide-model.test.ts`, `tests/core/structure-css.test.ts`, `tests/core/layouts.test.ts`, `tests/core/theme-key.test.ts`.

---

## Task 1: `inferLayout` — content-shape → layout (pure core)

**Files:**
- Create: `src/core/infer-layout.ts`
- Test: `tests/core/infer-layout.test.ts`

**Interfaces:**
- Produces: `inferLayout(regions: string[]): string` — returns `"quote"` | `"section"` | `"default"`. Only meaningful for single-region slides; multi-region → `"default"`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/infer-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { inferLayout } from "../../src/core/infer-layout";

describe("inferLayout", () => {
  it("single blockquote → quote", () => {
    expect(inferLayout(["> a lone pull quote"])).toBe("quote");
    expect(inferLayout(["> line one\n> line two"])).toBe("quote");
  });
  it("single ATX heading → section", () => {
    expect(inferLayout(["# A"])).toBe("section");
    expect(inferLayout(["###### deep heading"])).toBe("section");
  });
  it("heading plus body → default", () => {
    expect(inferLayout(["# A\n\ntext"])).toBe("default");
  });
  it("multi-region (columns) → default", () => {
    expect(inferLayout(["## L", "## R"])).toBe("default");
  });
  it("empty or whitespace region → default", () => {
    expect(inferLayout([""])).toBe("default");
    expect(inferLayout(["   \n  "])).toBe("default");
  });
  it("mixed quote and text → default (not a pure pull-quote)", () => {
    expect(inferLayout(["> quote\n\nand a caption"])).toBe("default");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/infer-layout.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/infer-layout"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/infer-layout.ts`:

```ts
/** Infer a layout id from a single-region slide's content shape, used only when the
 *  author set NO explicit <!-- layout --> directive. Multi-region slides → "default". */
export function inferLayout(regions: string[]): string {
  if (regions.length !== 1) return "default";
  const lines = regions[0]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) return "default";
  if (lines.every((l) => l.startsWith(">"))) return "quote";
  if (lines.length === 1 && /^#{1,6}\s+\S/.test(lines[0])) return "section";
  return "default";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/infer-layout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/infer-layout.ts tests/core/infer-layout.test.ts
git commit -m "feat(core): inferLayout — single blockquote/heading → quote/section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire inference into the deck (`layoutExplicit` + `slide-model`)

**Files:**
- Modify: `src/core/directives.ts` (DirectiveResult + parseDirectives)
- Modify: `src/core/slide-model.ts:40-48` (`flush()`)
- Modify: `tests/core/slide-model.test.ts` (two assertions encode the OLD behavior)
- Test: extend `tests/core/slide-model.test.ts`

**Interfaces:**
- Consumes: `inferLayout(regions: string[]): string` (Task 1).
- Produces: `DirectiveResult` gains `layoutExplicit: boolean` (true when an explicit `<!-- layout -->` directive was parsed). `Slide.layout` now carries the inferred layout for directive-less slides.

> **Behavior change (intended, per spec §7 A1):** a slide that is *only* a heading (`# A`) now infers `section`; a slide that is *only* a blockquote infers `quote`. Two existing assertions encode the old `default` and must be updated.

- [ ] **Step 1: Update the existing assertions that encode old behavior**

In `tests/core/slide-model.test.ts`, change the test at lines ~54-59 (`"retains a directive-only slide (section divider)"`):

```ts
  it("retains a directive-only slide (section divider)", () => {
    const src = "# A\n\n---\n\n<!-- layout: section -->\n\n---\n\n# B\n";
    const deck = parseDeck(src);
    // "# A" and "# B" are lone headings → inferred "section"; middle is explicit section.
    expect(deck.slides.map((s) => s.layout)).toEqual(["section", "section", "section"]);
    expect(deck.slides[1].regions).toEqual([""]);
  });
```

And change the test at lines ~61-65 (`"defaults layout/regions for plain slides"`):

```ts
  it("infers section for a lone-heading slide; regions unchanged", () => {
    const deck = parseDeck("# A");
    expect(deck.slides[0].layout).toBe("section");
    expect(deck.slides[0].regions).toEqual(["# A"]);
  });
```

- [ ] **Step 2: Add a focused integration test**

Append to the `describe("parseDeck — directives & fences", ...)` block in `tests/core/slide-model.test.ts`:

```ts
  it("infers quote for a lone-blockquote slide", () => {
    const deck = parseDeck("> a single pull quote");
    expect(deck.slides[0].layout).toBe("quote");
  });
  it("an explicit layout directive overrides inference", () => {
    const deck = parseDeck("<!-- layout: default -->\n# A");
    expect(deck.slides[0].layout).toBe("default");
  });
  it("does not infer for multi-line content", () => {
    const deck = parseDeck("# A\n\n- one\n- two");
    expect(deck.slides[0].layout).toBe("default");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/slide-model.test.ts`
Expected: FAIL — the lone-heading/blockquote slides still report `default` (inference not wired yet); the explicit-override test currently passes.

- [ ] **Step 4: Add `layoutExplicit` to `parseDirectives`**

In `src/core/directives.ts`, change the interface (line 3) and the return (line 54):

```ts
export interface DirectiveResult { layout: string; layoutExplicit: boolean; regions: string[]; warnings: DirectiveWarning[]; }
```

```ts
  return { layout, layoutExplicit: layoutSet, regions: regionStrings, warnings };
```

- [ ] **Step 5: Apply inference in `slide-model.flush()`**

In `src/core/slide-model.ts`, add the import at the top (after line 1):

```ts
import { inferLayout } from "./infer-layout";
```

Replace the `slides.push({...})` call inside `flush` (lines ~44-47) with:

```ts
      const layout = d.layoutExplicit ? d.layout : inferLayout(d.regions);
      slides.push({
        index: slides.length, markdown: d.regions.join("\n"), startLine: slideStart,
        layout, regions: d.regions, directiveWarnings: d.warnings,
      });
```

- [ ] **Step 6: Run the full core suite to verify pass + no regressions**

Run: `npx vitest run tests/core/slide-model.test.ts tests/core/directives.test.ts`
Expected: PASS. (`directives.test.ts` is unaffected — it asserts `parseDirectives(...).layout`, which still returns the raw directive layout; inference lives in `slide-model`.)

- [ ] **Step 7: Commit**

```bash
git add src/core/directives.ts src/core/slide-model.ts tests/core/slide-model.test.ts
git commit -m "feat(core): apply inferLayout for directive-less slides

DirectiveResult.layoutExplicit lets slide-model infer quote/section for
lone blockquote/heading slides; explicit <!-- layout --> still wins.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `shouldCenterCompose` — vertical-compose decision (pure core)

**Files:**
- Create: `src/core/layout/compose.ts`
- Test: `tests/core/compose.test.ts`

**Interfaces:**
- Consumes: `FitResult` from `src/core/layout/fit.ts` (`{ scale: number; overflow: boolean }`).
- Produces: `COMPOSE_CENTER_THRESHOLD: number` (= `0.7`) and `shouldCenterCompose(contentHeight: number, clientHeight: number, fit: FitResult, threshold?: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldCenterCompose, COMPOSE_CENTER_THRESHOLD } from "../../src/core/layout/compose";

describe("shouldCenterCompose", () => {
  it("centers a sparse, non-overflowing slide (low fill ratio)", () => {
    // 200px content in a 600px box at scale 1 → ratio .33 < .7
    expect(shouldCenterCompose(200, 600, { scale: 1, overflow: false })).toBe(true);
  });
  it("does NOT center a well-filled slide", () => {
    expect(shouldCenterCompose(560, 600, { scale: 1, overflow: false })).toBe(false);
  });
  it("never centers an overflowing slide", () => {
    expect(shouldCenterCompose(100, 600, { scale: 0.5, overflow: true })).toBe(false);
  });
  it("uses post-scale height for the ratio", () => {
    // 1000px content scaled to .5 → 500px effective; 500/600 = .83 ≥ .7 → no center
    expect(shouldCenterCompose(1000, 600, { scale: 0.5, overflow: false })).toBe(false);
  });
  it("guards against a zero/empty box", () => {
    expect(shouldCenterCompose(0, 0, { scale: 1, overflow: false })).toBe(false);
  });
  it("exposes a tunable default threshold", () => {
    expect(COMPOSE_CENTER_THRESHOLD).toBe(0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/compose.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/layout/compose"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/layout/compose.ts`:

```ts
import type { FitResult } from "./fit";

/** Below this vertical fill ratio, a non-overflowing slide is vertically centered
 *  ("fit-or-warn-or-fill"). Tunable; calibrated by manual smoke. */
export const COMPOSE_CENTER_THRESHOLD = 0.7;

/** Decide whether to vertically center a slide's content. Pure: takes measured heights
 *  + the computed fit. Centering is applied by toggling `.sd-compose-center` in render-dom. */
export function shouldCenterCompose(
  contentHeight: number,
  clientHeight: number,
  fit: FitResult,
  threshold = COMPOSE_CENTER_THRESHOLD,
): boolean {
  if (fit.overflow) return false;
  if (clientHeight <= 0) return false;
  return (contentHeight * fit.scale) / clientHeight < threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/compose.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/layout/compose.ts tests/core/compose.test.ts
git commit -m "feat(core): shouldCenterCompose — vertical-fill decision for sparse slides

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Compose CSS + render-dom wiring

**Files:**
- Modify: `src/core/presets/layouts.css.ts` (add `.sd-compose-center` rules)
- Modify: `src/render-dom.ts:67-80` (Pass 2 loop)
- Test: extend `tests/core/layouts.test.ts` (CSS assertion); render-dom wiring is **smoke-only** (DOM measurement — vitest is node-only).

**Interfaces:**
- Consumes: `shouldCenterCompose`, `COMPOSE_CENTER_THRESHOLD` (Task 3).
- Produces: a `.sd-compose-center` box class that vertically centers `.sd-content` (flex for single-column, grid `align-content` for two-column).

- [ ] **Step 1: Write the failing CSS test**

Append to `tests/core/layouts.test.ts` (inside the existing `describe` for `LAYOUTS_CSS`; if none exists, add one mirroring `structure-css.test.ts`):

```ts
import { LAYOUTS_CSS } from "../../src/core/presets/layouts.css";

describe("LAYOUTS_CSS compose-center", () => {
  it("centers single-column composed content with flex", () => {
    expect(LAYOUTS_CSS).toContain(".sd-compose-center:not(.sd-layout-two-column) .sd-content");
    expect(LAYOUTS_CSS).toContain("justify-content:center");
  });
  it("centers two-column composed content via grid align-content", () => {
    expect(LAYOUTS_CSS).toContain(".sd-compose-center.sd-layout-two-column .sd-content");
    expect(LAYOUTS_CSS).toContain("align-content:center");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/layouts.test.ts`
Expected: FAIL — `LAYOUTS_CSS` does not yet contain the compose rules.

- [ ] **Step 3: Add the compose CSS**

In `src/core/presets/layouts.css.ts`, append these rules inside the `LAYOUTS_CSS` template string (before the closing backtick):

```ts
.sd-compose-center:not(.sd-layout-two-column) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column .sd-content{ align-content:center; }
```

(Single-column keeps default `align-items:stretch` → content stays full-width/left-aligned, only the column is vertically centered. Two-column keeps its grid and centers it vertically.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/layouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the toggle into render-dom (Pass 2)**

In `src/render-dom.ts`, add the import (after line 3):

```ts
import { shouldCenterCompose } from "./core/layout/compose";
```

Replace the Pass 2 loop body (lines ~68-80) so the measured heights are captured once and the class is toggled after the fit is known:

```ts
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
    const composable = slide.layout === "default" || slide.layout === "two-column";
    if (composable && shouldCenterCompose(contentHeight, clientHeight, fit)) {
      box.classList.add("sd-compose-center");
    }
    const slideWarnings = collectWarnings(slide, renderWarnings, fit);
    if (slideWarnings.some((w) => w.kind === "overflow" || w.kind === "belowFloor")) box.classList.add("sd-slide-warn");
    else if (slideWarnings.length > 0) box.classList.add("sd-slide-warn-soft");
    warnings.push(...slideWarnings);
  }
```

- [ ] **Step 6: Verify gates + build (realm-safety + types)**

Run: `npm test`
Expected: PASS — purity check, **realm check** (only `classList.add` used — no Obsidian augmentation), vitest, bundle-smoke all green.

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Manual smoke (DOM behavior — not unit-testable)**

Run: `npm run deploy` (requires `$OBSIDIAN_PLUGIN_DIR`). In Pallas, open a deck with (a) a one-line slide, (b) a dense slide, (c) an unbalanced two-column slide.
Expected: (a) the sparse slide is **vertically centered** (no large empty lower band); (b) the dense slide is unchanged (top-aligned); (c) the two-column slide's content is vertically centered, reducing the ragged hole. Note any threshold mis-tuning for a follow-up (`COMPOSE_CENTER_THRESHOLD`).

- [ ] **Step 8: Commit**

```bash
git add src/core/presets/layouts.css.ts src/render-dom.ts tests/core/layouts.test.ts
git commit -m "feat(layout): vertically compose sparse slides (fit-or-warn-or-fill)

render-dom toggles .sd-compose-center after measuring; sparse default/two-column
slides center vertically instead of top-anchoring. Realm-safe (native classList).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Tokenize callout colors (B1)

**Files:**
- Modify: `src/core/presets/structure.css.ts:22-29` (callout block)
- Test: extend `tests/core/structure-css.test.ts`

**Interfaces:**
- Produces: callouts read `var(--sd-surface, #f4f6f8)`, `var(--sd-callout-fg, #16181d)`, and `var(--sd-callout-{note,info,tip,warning,danger}, <old hex>)`. **Behavior-neutral** for themes that set none of these (fallbacks = today's values). New optional tokens for the Profi-Familie (Plan 2): `--sd-surface`, `--sd-muted`, `--sd-border`, `--sd-callout-*`.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/structure-css.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: FAIL — current CSS still hardcodes `background:#f4f6f8` and the border hexes.

- [ ] **Step 3: Tokenize the callout block**

In `src/core/presets/structure.css.ts`, replace the callout block (lines 22-29) with:

```ts
.sd-callout{ border-left:6px solid var(--sd-callout-note,#3b6db5); background:var(--sd-surface,#f4f6f8); padding:.5em .8em; border-radius:6px; margin:.4em 0; color:var(--sd-callout-fg,#16181d); }
.sd-callout-title{ display:flex; align-items:center; gap:.4em; font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:var(--sd-callout-note,#3b6db5); } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:var(--sd-callout-warning,#b58a1e); } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:var(--sd-callout-danger,#b5443b); } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:var(--sd-callout-tip,#2e8b6f); } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:var(--sd-callout-info,#3b6db5); } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }
```

(The base `.sd-callout` border-left color is `--sd-callout-note` as the neutral default, then each variant overrides it — same structure as before, now token-driven.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: PASS. The pre-existing assertions (`var(--sd-bg)`, callout `::before` shapes, no `--sd-base:`) still hold.

- [ ] **Step 5: Verify the assembly smoke still renders**

Run: `npm test`
Expected: PASS (bundle-smoke renders every built-in deckCss without error; fallbacks keep output identical to before).

- [ ] **Step 6: Commit**

```bash
git add src/core/presets/structure.css.ts tests/core/structure-css.test.ts
git commit -m "feat(theme): tokenize callout colors with current fallbacks (B1)

Callout surface/text/signal colors now derive from --sd-surface / --sd-callout-*
with today's hex as fallback — behavior-neutral for existing themes, lets a
dark theme own its callouts without overrides.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `parseThemeMeta` — read hljs/Mermaid header directives (pure core)

**Files:**
- Modify: `src/core/theme-key.ts` (add `parseThemeMeta`)
- Test: extend `tests/core/theme-key.test.ts`

**Interfaces:**
- Consumes: `MermaidTheme` type from `src/core/presets` (`"default" | "dark" | "neutral" | "forest"`) — **type-only import** (no runtime/obsidian dependency).
- Produces: `parseThemeMeta(css: string): { hljs?: string; mermaid?: MermaidTheme }`. `hljs` is the raw directive value (validated against the `HLJS` map later, in the adapter). `mermaid` is validated against the union here; unknown values are dropped.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/theme-key.test.ts`:

```ts
import { parseThemeMeta } from "../../src/core/theme-key";

describe("parseThemeMeta", () => {
  it("reads sd-hljs and sd-mermaid header directives", () => {
    const css = "/* sd-hljs: github-dark */\n/* sd-mermaid: dark */\n.sd-slide{ --sd-bg:#000 }";
    expect(parseThemeMeta(css)).toEqual({ hljs: "github-dark", mermaid: "dark" });
  });
  it("tolerates whitespace and case on the mermaid value", () => {
    expect(parseThemeMeta("/*  sd-mermaid : Forest */").mermaid).toBe("forest");
  });
  it("drops an unknown mermaid value but keeps a valid hljs", () => {
    const r = parseThemeMeta("/* sd-hljs: github */\n/* sd-mermaid: bogus */");
    expect(r).toEqual({ hljs: "github" });
  });
  it("returns an empty object when no directives present", () => {
    expect(parseThemeMeta(".sd-slide{ --sd-bg:#000 }")).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/theme-key.test.ts`
Expected: FAIL — `parseThemeMeta` is not exported.

- [ ] **Step 3: Implement `parseThemeMeta`**

In `src/core/theme-key.ts`, add at the top:

```ts
import type { MermaidTheme } from "./presets";

const HLJS_META_RE = /\/\*\s*sd-hljs\s*:\s*([A-Za-z0-9-]+)\s*\*\//i;
const MERMAID_META_RE = /\/\*\s*sd-mermaid\s*:\s*([A-Za-z]+)\s*\*\//i;
const MERMAID_VALUES = ["default", "dark", "neutral", "forest"];

/** Read optional `/* sd-hljs: X *\/` and `/* sd-mermaid: Y *\/` header directives from a
 *  theme's CSS (analogous to parseBaseFontPx). hljs is returned raw (validated against the
 *  HLJS map by the adapter); mermaid is validated against the MermaidTheme union here. */
export function parseThemeMeta(css: string): { hljs?: string; mermaid?: MermaidTheme } {
  const out: { hljs?: string; mermaid?: MermaidTheme } = {};
  const h = HLJS_META_RE.exec(css);
  if (h) out.hljs = h[1];
  const m = MERMAID_META_RE.exec(css);
  if (m) {
    const v = m[1].toLowerCase();
    if (MERMAID_VALUES.includes(v)) out.mermaid = v as MermaidTheme;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/theme-key.test.ts`
Expected: PASS (existing `keyFromFilename`/`parseBaseFontPx` tests + the 4 new ones).

- [ ] **Step 5: Verify core purity still holds**

Run: `npm test`
Expected: PASS — `check-core-purity.mjs` green (the new import is `import type` from a core sibling; no `obsidian`).

- [ ] **Step 6: Commit**

```bash
git add src/core/theme-key.ts tests/core/theme-key.test.ts
git commit -m "feat(core): parseThemeMeta — read /* sd-hljs / sd-mermaid */ directives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: User themes pick their code/Mermaid scheme (B2 wiring)

**Files:**
- Modify: `src/deck-css.ts:25-35` (`userThemeEntry`)
- Verification: `scripts/bundle-smoke.mjs` (via `npm test`) + manual Pallas smoke. **Not unit-testable** — `src/deck-css.ts` imports `.css` via the esbuild text-loader, which vitest cannot resolve.

**Interfaces:**
- Consumes: `parseThemeMeta` (Task 6); the existing `HLJS` map (`{ github, "github-dark" }`) and `MermaidTheme`.
- Produces: a user `.css` theme that declares `/* sd-hljs: github-dark */` and/or `/* sd-mermaid: dark */` now renders with that code/Mermaid scheme instead of always inheriting the light `default` builtin.

- [ ] **Step 1: Wire `parseThemeMeta` into `userThemeEntry`**

In `src/deck-css.ts`, add to the imports (line 5):

```ts
import { parseBaseFontPx, parseThemeMeta } from "./core/theme-key";
```

Replace `userThemeEntry` (lines 25-35) with:

```ts
/** A user .css theme as a registry entry. Code/Mermaid scheme come from the file's optional
 *  `/* sd-hljs / sd-mermaid *\/` directives (falling back to the default builtin); baseFontPx
 *  from the file's --sd-base if present, else the default builtin's. */
export function userThemeEntry(key: string, fileCss: string): ThemeEntry {
  const d = presetFor("default");
  const meta = parseThemeMeta(fileCss);
  return {
    key,
    source: "user" as const,
    themeCss: fileCss,
    hljs: HLJS[meta.hljs ?? ""] ?? HLJS[d.hljs] ?? HLJS["github-dark"],
    mermaid: meta.mermaid ?? d.mermaid,
    baseFontPx: parseBaseFontPx(fileCss) ?? d.baseFontPx,
  };
}
```

- [ ] **Step 2: Verify build + types + gates**

Run: `npm run build`
Expected: esbuild bundles `main.js` without error.

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm test`
Expected: PASS — bundle-smoke still renders every theme; purity/realm green.

- [ ] **Step 3: Manual smoke — dark Mermaid + dark code on a user theme**

Create (or reuse) a user `.css` theme in the configured themes folder whose first lines are:

```css
/* sd-hljs: github-dark */
/* sd-mermaid: dark */
.sd-slide{ --sd-bg:#100e0c; --sd-fg:#ece4d3; --sd-accent:#c79a4a; --sd-code-bg:#1b1712; }
```

Run: `npm run deploy`, then in Pallas select this theme on a deck containing a Mermaid diagram and a fenced code block.
Expected: **Mermaid renders dark** (previously light) and code uses the github-dark palette — both legible on the dark slide.

- [ ] **Step 4: Commit**

```bash
git add src/deck-css.ts
git commit -m "feat(theme): user themes select hljs/Mermaid via header directives (B2)

userThemeEntry reads parseThemeMeta → a dark theme can declare github-dark +
dark Mermaid instead of inheriting the light default. Fixes Mermaid-on-dark.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Gate (before merge / handoff to Plan 2)

- [ ] **Run the full gate:**

Run: `npm run lint && npm run build && npm test && npx tsc --noEmit`
Expected: all green (lint, esbuild build, purity + realm + vitest + bundle-smoke, type-check).

- [ ] **Manual end-to-end smoke** of the demo deck across `default`/`dark` + one user theme: sparse slides compose, callouts render, a dark user theme shows dark Mermaid/code. Capture before/after notes for the cockpit.

---

## Self-Review (coverage check against spec)

- **Spec §7 A1 (inferLayout):** Tasks 1–2. ✓ (single blockquote→quote, single heading→section, explicit override wins; two existing assertions updated as the intended behavior change.)
- **Spec §7 A2 (vertical compose):** Tasks 3–4. ✓ (`shouldCenterCompose` pure + threshold; render-dom toggles `.sd-compose-center`; applies to default/two-column; realm-safe.)
- **Spec §7 A3 (column discipline):** Task 4 partial. ✓ (two-column vertical centering via grid `align-content`; cross-column rebalancing is an explicit Non-Goal.)
- **Spec §8 B1 (callout tokens):** Task 5. ✓ (token-with-fallback, behavior-neutral; new `--sd-surface/-muted/-border/-callout-*` available for Plan 2.)
- **Spec §9 B2 (hljs/Mermaid per theme):** Tasks 6–7. ✓ (`parseThemeMeta` pure + `userThemeEntry` wiring; fixes Mermaid-on-dark.)
- **Spec §13 invariants:** every code task ends on `npm test` (purity + realm) + `tsc`; render-dom uses only `classList.add`; fit measurement unchanged (compose toggled after measure, no re-measure). ✓
- **Out of scope (correct):** CHARACTER_CSS, theme-family upgrade, export-fidelity verification (B3/B4) → **Plan 2**; user-facing knobs → Spec C; LLM → Spec D.

**Type consistency:** `inferLayout(regions: string[])→string`, `DirectiveResult.layoutExplicit: boolean`, `shouldCenterCompose(contentHeight, clientHeight, fit, threshold?)→boolean`, `COMPOSE_CENTER_THRESHOLD=0.7`, `parseThemeMeta(css)→{hljs?: string; mermaid?: MermaidTheme}` — names/signatures consistent across tasks and matched to the real symbols in `directives.ts`, `slide-model.ts`, `fit.ts`, `theme-key.ts`, `deck-css.ts`.
