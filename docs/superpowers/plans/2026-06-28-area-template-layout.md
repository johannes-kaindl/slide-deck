# Area-/Template-Layout-Modell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das flache Layout-Modell (alles in *einem* `.sd-content`) zu einem benannten Area-/Template-Modell ausbauen: 11 Templates + kombinierbare Modifier, Titel spannt in Mehrspaltern, Block-Media zentriert+bodybreit+contain, header/footer/pagination als schwebende Slots.

**Architecture:** Hybrid (C) — markdown-native Grid/Flex-Templates (Styling nach Element-Rolle) + minimale `render-dom`-Eingriffe (Spanning-Titel-Hoist, cover-image-Hintergrund-Layer, Slot-Elemente). **Ein** `transform:scale()` auf `.sd-content` bleibt (Fit-Invariante unangetastet). Pure Logik (Direktiven/Modifier/Inferenz/Frontmatter/CSS-Strings) in `src/core/**`; nur messung-/DOM-abhängige Teile in `render-dom.ts`.

**Tech Stack:** TypeScript (strict), esbuild, vitest (`environment: node`, kein DOM), Obsidian Plugin API, markdown-it, Mermaid, highlight.js. Spec: `docs/superpowers/specs/2026-06-28-area-template-layout-design.md`.

## Global Constraints

- **Pure-Core:** `src/core/**` importiert **nie** `obsidian`/DOM. Gate: `scripts/check-core-purity.mjs` (1. Schritt `npm test`).
- **Realm-Safety:** `src/render-dom.ts` nur native DOM (`createElement`/`classList`/`querySelector`/`insertBefore`/`style.setProperty`/`innerHTML`). Keine Obsidian-Augmentierungen (`createDiv`/`createEl`/`addClass`/`setText`/`setAttr`/`empty`). Gate: `scripts/check-render-realm.mjs` (2. Schritt `npm test`).
- **Fixed Geometry:** 1280×720 / 960×720, `.sd-slide` padding 64px, `overflow:hidden`. Bereiche leben in `.sd-content`; Slots im Rand.
- **Fit-or-warn (Single-Scale):** Messung `.sd-content` `scrollWidth/Height` vs `clientWidth/Height` → ein `transform:scale()`. Grid-Reihen content-basiert (`auto`), damit Overflow durchschlägt. Media via `object-fit:contain`; cover-Hintergrund (`object-fit:cover`) zählt nicht als Overflow.
- **Theme-unantastbar:** STRUCTURE_CSS + LAYOUTS_CSS referenzieren nur `var(--sd-*)`; `LAYOUTS_CSS` enthält **kein** `#` (Test erzwingt das). `--sd-base` bleibt einzig in `presetTokensCss`.
- **Keine Brüche:** bestehende `<!-- layout: X -->`-Decks + Theme-Keys bleiben gültig.
- **Commits:** Conventional Commits, deutsche Beschreibung ok, nur berührte Dateien stagen, Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Full-Gate vor Merge:** `npm run lint && npm run build && npm test && npx tsc --noEmit`.

---

### Task 1: Direktiven — Multi-Token-Layout + Modifier

**Files:**
- Modify: `src/core/directives.ts`
- Test: `tests/core/directives.test.ts`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `DirectiveResult` gewinnt `modifiers: string[]`. Erkannte Modifier-Tokens: `compact`, `code-heavy`. Grammatik `<!-- layout: <template> [modifier…] -->`.

- [ ] **Step 1: Failing tests**

In `tests/core/directives.test.ts`, am Ende des `describe("parseDirectives", …)`-Blocks ergänzen:

```typescript
  it("parses a structural template plus modifiers", () => {
    const r = parseDirectives("<!-- layout: two-column compact -->\n## A");
    expect(r.layout).toBe("two-column");
    expect(r.layoutExplicit).toBe(true);
    expect(r.modifiers).toEqual(["compact"]);
  });

  it("collects multiple modifiers, order preserved, no dupes", () => {
    const r = parseDirectives("<!-- layout: default code-heavy compact code-heavy -->\nx");
    expect(r.layout).toBe("default");
    expect(r.modifiers).toEqual(["code-heavy", "compact"]);
  });

  it("modifier-only directive: layout stays inferable, modifier still applies", () => {
    const r = parseDirectives("<!-- layout: compact -->\n# T\n\nbody");
    expect(r.layout).toBe("default");      // placeholder; slide-model will infer
    expect(r.layoutExplicit).toBe(false);
    expect(r.modifiers).toEqual(["compact"]);
  });

  it("no directive → empty modifiers", () => {
    expect(parseDirectives("# Hi").modifiers).toEqual([]);
  });

  it("warns on an extra unrecognized structural token but keeps the first", () => {
    const r = parseDirectives("<!-- layout: title bogus -->\n# T");
    expect(r.layout).toBe("title");
    expect(r.modifiers).toEqual([]);
    expect(r.warnings).toEqual([{ kind: "directive-malformed", message: expect.any(String) }]);
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/directives.test.ts`
Expected: FAIL (`modifiers` undefined / property missing).

- [ ] **Step 3: Implement**

Replace `src/core/directives.ts` fully:

```typescript
// src/core/directives.ts
export interface DirectiveWarning { kind: string; message: string; }
export interface DirectiveResult { layout: string; layoutExplicit: boolean; modifiers: string[]; regions: string[]; warnings: DirectiveWarning[]; }

const FENCE_RE = /^\s*(```|~~~)/;
const LAYOUT_RE = /^<!--\s*layout\s*:\s*([A-Za-z][A-Za-z0-9 -]*?)\s*-->$/i;
const COLUMN_RE = /^<!--\s*column\s*-->$/i;
const LAYOUT_LIKE = /^<!--\s*layout\b/i;
const COLUMN_LIKE = /^<!--\s*column\b/i;
/** Catches any <!--word:--> comment that looks directive-like but wasn't recognized. */
const DIRECTIVE_LIKE = /^<!--\s*\w[\w-]*\s*:/i;

/** Recognized density modifiers (combine with any structural layout). */
const MODIFIERS = new Set(["compact", "code-heavy"]);

/** Parse per-slide directives. Fence-aware: directives inside ```/~~~ blocks are literal.
 *  Indented code blocks are intentionally NOT fence-protected (rare; documented limitation).
 *  CRLF line endings are normalized to LF internally before parsing. */
export function parseDirectives(slideMarkdown: string): DirectiveResult {
  const lines = slideMarkdown.replace(/\r\n/g, "\n").split("\n");
  const warnings: DirectiveWarning[] = [];
  let layout = "default";
  let layoutSet = false;
  let layoutDirectiveSeen = false;
  const modifiers: string[] = [];
  let inFence = false;
  let fenceMarker = "";
  const regions: string[][] = [[]];
  const push = (line: string) => regions[regions.length - 1].push(line);

  for (const line of lines) {
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const marker = fm[1];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ""; }
      push(line);
      continue;
    }
    if (inFence) { push(line); continue; }

    const trimmed = line.trim();
    if (COLUMN_RE.test(trimmed)) { regions.push([]); continue; }
    const lm = LAYOUT_RE.exec(trimmed);
    if (lm) {
      if (!layoutDirectiveSeen) {
        layoutDirectiveSeen = true;
        const tokens = lm[1].toLowerCase().split(/\s+/).filter(Boolean);
        const structural = tokens.filter((t) => !MODIFIERS.has(t));
        for (const t of tokens) if (MODIFIERS.has(t) && !modifiers.includes(t)) modifiers.push(t);
        if (structural.length >= 1) { layout = structural[0]; layoutSet = true; }
        if (structural.length > 1) {
          warnings.push({ kind: "directive-malformed", message: `Unrecognized extra layout token(s): ${structural.slice(1).join(" ")}` });
        }
      } else {
        warnings.push({ kind: "layout-multiple", message: "Multiple layout directives — using the first." });
      }
      continue;
    }
    if (LAYOUT_LIKE.test(trimmed) || COLUMN_LIKE.test(trimmed) || DIRECTIVE_LIKE.test(trimmed)) {
      warnings.push({ kind: "directive-malformed", message: `Unrecognized directive: ${trimmed}` });
      continue;
    }
    push(line);
  }

  const regionStrings = regions.map((r) => r.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""));
  return { layout, layoutExplicit: layoutSet, modifiers, regions: regionStrings, warnings };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/directives.test.ts`
Expected: PASS (all, incl. the existing cases — `modifiers` is additive).

- [ ] **Step 5: Commit**

```bash
git add src/core/directives.ts tests/core/directives.test.ts
git commit -m "feat(core): directives parse combinable modifiers (compact/code-heavy)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Inferenz — image-focus + Spaltenlayouts

**Files:**
- Modify: `src/core/infer-layout.ts`
- Test: `tests/core/infer-layout.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `inferLayout(regions)` liefert zusätzlich `image-focus` (einzelner Media-Block), `two-column` (2 Regionen), `columns-3` (≥3 Regionen).

- [ ] **Step 1: Update the now-wrong existing test + add new**

In `tests/core/infer-layout.test.ts` die Zeile `it("multi-region (columns) → default", …)` **ersetzen** und neue Fälle ergänzen:

```typescript
  it("two regions → two-column", () => {
    expect(inferLayout(["## L", "## R"])).toBe("two-column");
  });
  it("three or more regions → columns-3", () => {
    expect(inferLayout(["a", "b", "c"])).toBe("columns-3");
    expect(inferLayout(["a", "b", "c", "d"])).toBe("columns-3");
  });
  it("single image embed → image-focus", () => {
    expect(inferLayout(["![[diagram.png]]"])).toBe("image-focus");
    expect(inferLayout(["![alt](pic.jpg)"])).toBe("image-focus");
  });
  it("single mermaid fence → image-focus", () => {
    expect(inferLayout(["```mermaid\ngraph TD; A-->B\n```"])).toBe("image-focus");
  });
  it("image plus caption text → default (not lone media)", () => {
    expect(inferLayout(["![[d.png]]\n\nA caption"])).toBe("default");
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/infer-layout.test.ts`
Expected: FAIL (multi-region still default; image cases default).

- [ ] **Step 3: Implement**

Replace `src/core/infer-layout.ts` fully:

```typescript
const IMG_EMBED_RE = /^!\[\[.+\]\]$/;            // ![[name]]
const IMG_MD_RE = /^!\[[^\]]*\]\([^)]+\)$/;       // ![alt](src)

/** Infer a layout id from a slide's content shape, used only when the author set NO
 *  explicit <!-- layout --> directive. */
export function inferLayout(regions: string[]): string {
  if (regions.length === 2) return "two-column";
  if (regions.length >= 3) return "columns-3";
  // regions.length === 1 (or 0) below
  if (regions.length !== 1) return "default";
  const body = regions[0].trim();
  if (body === "") return "default";
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  // lone media block → image-focus
  if (lines.length === 1 && (IMG_EMBED_RE.test(lines[0]) || IMG_MD_RE.test(lines[0]))) return "image-focus";
  if (/^```mermaid\b/i.test(lines[0]) && lines[lines.length - 1] === "```") {
    // whole region is a single mermaid fence (no trailing prose)
    const inner = lines.slice(1, -1);
    if (inner.length > 0) return "image-focus";
  }
  if (lines.every((l) => l.startsWith(">"))) return "quote";
  if (lines.length === 1 && /^#{1,6}\s+\S/.test(lines[0])) return "section";
  return "default";
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/infer-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/infer-layout.ts tests/core/infer-layout.test.ts
git commit -m "feat(core): infer image-focus + column layouts from content shape

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: slide-model — Modifier-Verdrahtung + Frontmatter-Slots

**Files:**
- Modify: `src/core/slide-model.ts`
- Test: `tests/core/slide-model.test.ts`

**Interfaces:**
- Consumes: `DirectiveResult.modifiers` (Task 1).
- Produces: `Slide` gewinnt `modifiers: string[]`; `DeckDirectives` gewinnt `header?: string; footer?: string; paginate?: boolean`.

- [ ] **Step 1: Failing tests**

In `tests/core/slide-model.test.ts` neuen Block am Ende ergänzen:

```typescript
describe("parseDeck — modifiers & slots", () => {
  it("carries per-slide modifiers onto the Slide", () => {
    const deck = parseDeck("<!-- layout: two-column compact -->\n## L\n<!-- column -->\n## R");
    expect(deck.slides[0].layout).toBe("two-column");
    expect(deck.slides[0].modifiers).toEqual(["compact"]);
  });

  it("defaults modifiers to an empty array", () => {
    expect(parseDeck("# A").slides[0].modifiers).toEqual([]);
  });

  it("reads header/footer/paginate from frontmatter (quotes stripped)", () => {
    const src = '---\nheader: "ACME"\nfooter: \'Q3 Review\'\npaginate: true\n---\n# A\n';
    const d = parseDeck(src).directives;
    expect(d.header).toBe("ACME");
    expect(d.footer).toBe("Q3 Review");
    expect(d.paginate).toBe(true);
  });

  it("omits slot keys when absent (directives stay minimal)", () => {
    expect(parseDeck("# A").directives).toEqual({ theme: "default", aspect: "16:9", minFontPx: 24 });
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/slide-model.test.ts`
Expected: FAIL (`modifiers` missing; header/footer/paginate undefined).

- [ ] **Step 3: Implement**

In `src/core/slide-model.ts`:

3a. Extend the interfaces:

```typescript
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; header?: string; footer?: string; paginate?: boolean; }
export interface Slide {
  index: number; markdown: string; speakerNotes?: string; startLine: number;
  layout: string; modifiers: string[]; regions: string[]; directiveWarnings: DirectiveWarning[];
}
```

3b. In `parseFrontmatter`, after the `minFontPx` branch (inside the for-loop), add:

```typescript
    else if (key === "header") d.header = val.replace(/^["']|["']$/g, "");
    else if (key === "footer") d.footer = val.replace(/^["']|["']$/g, "");
    else if (key === "paginate") d.paginate = /^(true|yes|on)$/i.test(val);
```

3c. In `flush()`, extend the parse + the pushed slide:

```typescript
      const d = parseDirectives(md);
      const layout = d.layoutExplicit ? d.layout : inferLayout(d.regions);
      slides.push({
        index: slides.length, markdown: d.regions.join("\n"), startLine: slideStart,
        layout, modifiers: d.modifiers, regions: d.regions, directiveWarnings: d.warnings,
      });
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/slide-model.test.ts`
Expected: PASS (existing `toEqual` directives tests stay green — optional slot keys absent when unset).

- [ ] **Step 5: Commit**

```bash
git add src/core/slide-model.ts tests/core/slide-model.test.ts
git commit -m "feat(core): slide modifiers + deck header/footer/paginate frontmatter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Layout-Registry + Warning-Kind

**Files:**
- Modify: `src/core/presets/layouts.css.ts` (nur die `LAYOUTS`-Registry)
- Modify: `src/core/constraints/engine.ts` (WarningKind)
- Test: `tests/core/layouts.test.ts`, `tests/core/constraints.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `LAYOUTS` enthält `columns-3` (regions:3), `stat` (1), `cover-image` (1); `layoutFor` unverändert (total). `WarningKind` gewinnt `"cover-no-image"`.

- [ ] **Step 1: Failing tests**

In `tests/core/layouts.test.ts`, im `describe("layoutFor", …)` ergänzen:

```typescript
  it("knows the new templates with region counts", () => {
    expect(layoutFor("columns-3").regions).toBe(3);
    expect(layoutFor("stat").regions).toBe(1);
    expect(layoutFor("cover-image").regions).toBe(1);
  });
```

In `tests/core/constraints.test.ts` einen Test ergänzen, der bestätigt, dass eine durchgereichte `cover-no-image`-Render-Warnung erhalten bleibt (Stil an den vorhandenen `collectWarnings`-Tests orientieren):

```typescript
  it("passes through a cover-no-image render warning", () => {
    const slide = { index: 0, startLine: 0, layout: "cover-image", modifiers: [], regions: [""], directiveWarnings: [], markdown: "" };
    const out = collectWarnings(slide as any, [{ kind: "cover-no-image", message: "cover-image without an image" }], { scale: 1, overflow: false });
    expect(out.some((w) => w.kind === "cover-no-image")).toBe(true);
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/layouts.test.ts tests/core/constraints.test.ts`
Expected: FAIL (columns-3/stat/cover-image fall back to default → regions 1≠3; `cover-no-image` not assignable to WarningKind → tsc/type error at build, runtime test passes-through string but type fails in Step later — for the unit run it will pass-through; the binding gate is Step 4 typecheck).

- [ ] **Step 3: Implement**

3a. In `src/core/presets/layouts.css.ts`, extend the `LAYOUTS` record:

```typescript
export const LAYOUTS: Record<string, LayoutSpec> = {
  default: { id: "default", regions: 1 },
  title: { id: "title", regions: 1 },
  section: { id: "section", regions: 1 },
  quote: { id: "quote", regions: 1 },
  "image-focus": { id: "image-focus", regions: 1 },
  "two-column": { id: "two-column", regions: 2 },
  "columns-3": { id: "columns-3", regions: 3 },
  stat: { id: "stat", regions: 1 },
  "cover-image": { id: "cover-image", regions: 1 },
};
```

3b. In `src/core/constraints/engine.ts`, extend the `WarningKind` union:

```typescript
export type WarningKind =
  | "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast"
  | "layout-unknown" | "layout-multiple" | "directive-malformed" | "region-count"
  | "theme-unknown" | "cover-no-image";
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/layouts.test.ts tests/core/constraints.test.ts && npx tsc --noEmit`
Expected: PASS + clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/core/presets/layouts.css.ts src/core/constraints/engine.ts tests/core/layouts.test.ts tests/core/constraints.test.ts
git commit -m "feat(core): register columns-3/stat/cover-image layouts + cover-no-image warning

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: LAYOUTS_CSS — Template-Grids, Spanning, Modifier, Compose

**Files:**
- Modify: `src/core/presets/layouts.css.ts` (nur `LAYOUTS_CSS`)
- Test: `tests/core/layouts.test.ts`

**Interfaces:**
- Consumes: Klassen, die render-dom setzt: `.sd-layout-<id>`, `.sd-region`, `.sd-region-title`, `.sd-mod-compact`, `.sd-mod-code-heavy`, `.sd-compose-center`.
- Produces: nur CSS-String. **Kein `#` erlaubt** (Token-only).

- [ ] **Step 1: Update + add tests**

In `tests/core/layouts.test.ts` den `describe("LAYOUTS_CSS compose-center", …)`-Block anpassen (die `:not`-Assertion ändert sich) und einen Template-Block ergänzen:

```typescript
describe("LAYOUTS_CSS compose-center", () => {
  it("centers single-column composed content with flex (excluding grids)", () => {
    expect(LAYOUTS_CSS).toContain(".sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3) .sd-content");
    expect(LAYOUTS_CSS).toContain("justify-content:center");
  });
  it("centers grid composed content via align-content", () => {
    expect(LAYOUTS_CSS).toContain(".sd-layout-columns-3 .sd-content");
    expect(LAYOUTS_CSS).toContain("align-content:center");
  });
});

describe("LAYOUTS_CSS templates & modifiers", () => {
  it("spans titles across columns and defines new templates", () => {
    expect(LAYOUTS_CSS).toContain(".sd-region-title");
    expect(LAYOUTS_CSS).toContain("grid-column:1/-1");
    expect(LAYOUTS_CSS).toContain(".sd-layout-columns-3 .sd-content");
    expect(LAYOUTS_CSS).toContain(".sd-layout-stat");
    expect(LAYOUTS_CSS).toContain(".sd-layout-cover-image .sd-content");
  });
  it("defines combinable modifiers", () => {
    expect(LAYOUTS_CSS).toContain(".sd-mod-compact");
    expect(LAYOUTS_CSS).toContain(".sd-mod-code-heavy");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/layouts.test.ts`
Expected: FAIL (new selectors absent; old `:not(...two-column) .sd-content` assertion changed).

- [ ] **Step 3: Implement**

Replace the `LAYOUTS_CSS` template literal in `src/core/presets/layouts.css.ts` with:

```typescript
/** Shared, theme-independent layout CSS. References only tokens (no colors here). */
export const LAYOUTS_CSS = `
.sd-region{ min-width:0; min-height:0; }

/* multi-column: title spans all columns */
.sd-layout-two-column .sd-content{ display:grid; grid-template-columns:1fr 1fr; gap:48px; align-content:start; }
.sd-layout-columns-3 .sd-content{ display:grid; grid-template-columns:repeat(3,1fr); gap:36px; align-content:start; }
.sd-layout-two-column .sd-region-title,
.sd-layout-columns-3 .sd-region-title{ grid-column:1/-1; }

/* centered hero/divider templates */
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content,
.sd-layout-stat .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:flex-start; }
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content{ align-items:center; text-align:center; }
.sd-layout-quote .sd-region{ font-size:1.4em; font-style:italic; max-width:80%; }
.sd-layout-section .sd-region{ font-size:1.2em; }
.sd-layout-title h1{ font-size:3em; }

/* stat: oversized lead number */
.sd-layout-stat h1{ font-size:var(--sd-stat-size,4.5em); line-height:1; margin:0; }

/* image-focus: media dominates, centered */
.sd-layout-image-focus .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
.sd-layout-image-focus .sd-embed{ max-height:var(--sd-media-max-h-focus,80%); }

/* cover-image: title overlays the full-bleed background, anchored bottom-left */
.sd-layout-cover-image .sd-content{ display:flex; flex-direction:column; justify-content:flex-end; }

/* density modifiers (combine with any layout) */
.sd-mod-compact .sd-content{ font-size:var(--sd-compact-scale,0.88em); line-height:1.3; }
.sd-mod-compact li{ margin:.12em 0; }
.sd-mod-code-heavy pre.hljs{ font-size:1em; }

/* compose-center: vertically center sparse, non-overflowing content */
.sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column .sd-content,
.sd-compose-center.sd-layout-columns-3 .sd-content{ align-content:center; }
`;
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/layouts.test.ts`
Expected: PASS, incl. the existing `not.toContain("#")` rule (no hex above).

- [ ] **Step 5: Commit**

```bash
git add src/core/presets/layouts.css.ts tests/core/layouts.test.ts
git commit -m "feat(core): template grids, spanning title, modifiers, compose for grids

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: STRUCTURE_CSS — Media zentriert, Slots, cover, Tokens

**Files:**
- Modify: `src/core/presets/structure.css.ts`
- Test: `tests/core/structure-css.test.ts`

**Interfaces:**
- Consumes: Klassen aus render-dom: `.sd-slide-header/-footer/-pagination`, `.sd-cover-media`, `.sd-cover-scrim`.
- Produces: nur CSS-String. Hex erlaubt (Fallbacks). `.sd-content{ width:100%; height:100%; }` muss **wortgleich** erhalten bleiben.

- [ ] **Step 1: Failing tests**

In `tests/core/structure-css.test.ts` ergänzen:

```typescript
describe("STRUCTURE_CSS area model", () => {
  it("anchors absolutely-positioned slots", () => {
    expect(STRUCTURE_CSS).toContain("position:relative");           // on .sd-slide
    expect(STRUCTURE_CSS).toContain(".sd-slide-pagination");
    expect(STRUCTURE_CSS).toContain(".sd-slide-header");
    expect(STRUCTURE_CSS).toContain(".sd-slide-footer");
  });
  it("centers block media (no longer left-inline)", () => {
    expect(STRUCTURE_CSS).toContain("margin-inline:auto");
    expect(STRUCTURE_CSS).toContain("var(--sd-media-max-h,60%)");
  });
  it("defines cover-image background + scrim", () => {
    expect(STRUCTURE_CSS).toContain(".sd-cover-media");
    expect(STRUCTURE_CSS).toContain("object-fit:cover");
    expect(STRUCTURE_CSS).toContain("var(--sd-scrim,");
  });
  it("keeps .sd-content fill rule verbatim (fit-critical)", () => {
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; }");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: FAIL (new selectors absent).

- [ ] **Step 3: Implement**

In `src/core/presets/structure.css.ts`:

3a. Add `position:relative` to the `.sd-slide` rule (so slots/cover anchor to it). Change the first declaration block:

```typescript
.sd-slide{ width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:64px; overflow:hidden; position:relative; background:var(--sd-bg); color:var(--sd-fg); font-size:var(--sd-base);
  line-height:1.4; font-family:var(--sd-font); }
```

3b. Replace the media rules (`.sd-embed` + `.sd-mermaid svg`) with centered versions, and append slot + cover rules just before the closing backtick:

```typescript
/* Block media: centered, body-width, contain (no left-inline flow). */
.sd-embed{ display:block; margin-inline:auto; max-width:100%; max-height:var(--sd-media-max-h,60%); object-fit:contain; }
.sd-mermaid{ text-align:center; }
.sd-mermaid svg{ display:inline-block; max-width:100%; max-height:var(--sd-media-max-h-mermaid,480px); }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }
/* Floating slots — live in the 64px margin, outside the scaled .sd-content. */
.sd-slide-header,.sd-slide-footer,.sd-slide-pagination{ position:absolute; z-index:4;
  font-size:var(--sd-slot-size,0.6em); color:var(--sd-slot-fg,var(--sd-muted,#6b7280)); letter-spacing:.04em; }
.sd-slide-header{ top:24px; right:32px; text-transform:uppercase; }
.sd-slide-footer{ bottom:24px; left:32px; }
.sd-slide-pagination{ bottom:24px; right:32px; }
/* cover-image: full-bleed background + readability scrim behind the content. */
.sd-cover-media{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.sd-cover-scrim{ position:absolute; inset:0; z-index:1;
  background:var(--sd-scrim,linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,.12) 60%,transparent)); }
.sd-layout-cover-image .sd-content{ position:relative; z-index:3; }
```

> Keep the existing `.sd-callout*` rules and the `.sd-content{ width:100%; height:100%; }` line unchanged. The `.sd-embed` and `.sd-mermaid svg` lines are the only media lines — replace them in place.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: PASS (existing callout/fit asserts stay green).

- [ ] **Step 5: Commit**

```bash
git add src/core/presets/structure.css.ts tests/core/structure-css.test.ts
git commit -m "feat(core): center block media + slot/cover structural CSS + tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: render-dom — Modifier-Klassen, Slots, Spanning-Hoist, cover-Layer, Compose-Gating

**Files:**
- Modify: `src/render-dom.ts`
- Verify: `npm run build`, `npx tsc --noEmit`, `npm test` (bundle-smoke), manueller Smoke (Task 9)

**Interfaces:**
- Consumes: `slide.modifiers` (Task 3), `deck.directives.header/footer/paginate` (Task 3), Klassen aus Task 5/6, `WarningKind "cover-no-image"` (Task 4).
- Produces: DOM-Struktur aus Spec §5.2.

> **Hinweis:** `render-dom.ts` läuft nur im (iframe-)DOM und ist im Node-vitest **nicht** unit-testbar (Repo-Konvention). Verifikation = `tsc` + `build` + `bundle-smoke` + manueller Pallas-Smoke (Task 9). Jeder Schritt bleibt klein und realm-sicher (nur native DOM).

- [ ] **Step 1: Modifier-Klassen + Slots in Pass 1**

In `src/render-dom.ts`, Pass 1, die Box-Erzeugung + Slots ersetzen. Die `box.className`-Zeile und nach `box.appendChild(inner)` ergänzen:

```typescript
    const box = doc.createElement("div");
    const modClasses = slide.modifiers.map((m) => `sd-mod-${m}`).join(" ");
    box.className = `sd-slide sd-layout-${slide.layout}${modClasses ? " " + modClasses : ""}`;
    box.style.setProperty("--sd-w", `${geo.width}px`);
    box.style.setProperty("--sd-h", `${geo.height}px`);
    const inner = doc.createElement("div");
    inner.className = "sd-content";
    box.appendChild(inner);
```

Und eine Helfer-Funktion oben im Modul (vor `renderDeckToContainer`), die Slots anhängt:

```typescript
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
```

- [ ] **Step 2: Spanning-Titel-Hoist + cover-Layer nach dem Region-Bau (Pass 1)**

Direkt **nach** der `for (const region of slide.regions) { … }`-Schleife und **vor** `await renderMermaidSlots(...)` einfügen:

```typescript
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
```

- [ ] **Step 3: Compose-Gating um columns-3 erweitern (Pass 2)**

In Pass 2 die `composable`-Zeile ersetzen:

```typescript
    const composable = slide.layout === "default" || slide.layout === "two-column" || slide.layout === "columns-3";
```

- [ ] **Step 4: Verify compile + gates**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: tsc clean; esbuild bundle ok; alle vitest grün; `check-core-purity` + `check-render-realm` + bundle-smoke grün (render-dom nutzt nur native DOM: `createElement`/`querySelector`/`insertBefore`/`remove`/`textContent`/`getAttribute`/`appendChild`/`classList`).

- [ ] **Step 5: Commit**

```bash
git add src/render-dom.ts
git commit -m "feat(render): area model — modifiers, slots, spanning-title hoist, cover layer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Authoring-Contract — Modifier + Slots im Prompt

**Files:**
- Modify: `src/core/constraints/contract.ts`
- Test: `tests/core/constraints.test.ts`

**Interfaces:**
- Consumes: `LAYOUTS` (auto-aktualisiert via `Object.keys`).
- Produces: `contractToPrompt` erwähnt Modifier + header/footer/paginate.

- [ ] **Step 1: Failing test**

In `tests/core/constraints.test.ts` ergänzen (Import `getAuthoringContract, contractToPrompt` ggf. ergänzen):

```typescript
  it("prompt mentions modifiers and slots", () => {
    const p = contractToPrompt(getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 }));
    expect(p).toContain("compact");
    expect(p).toContain("paginate");
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: FAIL (prompt lacks "compact"/"paginate").

- [ ] **Step 3: Implement**

In `src/core/constraints/contract.ts`, in `contractToPrompt`, die Layout-Zeile erweitern und eine Slot-Zeile ergänzen:

```typescript
    `Per-slide layout via "<!-- layout: NAME [modifier] -->" (split columns with "<!-- column -->"). Available: ${c.layouts.join(", ")}. Modifiers: compact, code-heavy.`,
    `Optional deck slots via frontmatter: header:, footer:, paginate: true.`,
```

(Die übrigen Zeilen unverändert lassen.)

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/constraints/contract.ts tests/core/constraints.test.ts
git commit -m "feat(core): authoring prompt documents modifiers + slots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Full-Gate + Pallas-Smoke-Deck (Akzeptanz)

**Files:**
- Create/Modify (Pallas-Vault, nicht im Repo): `slide-deck-tests/area-model-smoke.md`
- Verify: Full-Gate + manueller GUI-Smoke

**Interfaces:**
- Consumes: alle vorherigen Tasks.
- Produces: bestätigte Akzeptanzkriterien (Spec §12).

- [ ] **Step 1: Full-Gate**

Run: `npm run lint && npm run build && npm test && npx tsc --noEmit`
Expected: alles grün. Bei rot → `superpowers:systematic-debugging`, nicht raten.

- [ ] **Step 2: Smoke-Deck schreiben**

Im Pallas-Vault `slide-deck-tests/area-model-smoke.md` anlegen, das **jedes** Akzeptanzkriterium abdeckt — eine Folie pro Template + Modifier + Slots + cover-image. Frontmatter mit `header:`, `footer:`, `paginate: true`, `theme:` (auf `Slide-Deck-Themes/test-dark.css` prüfen). Mindestens:
- `default` mit Block-Mermaid (→ zentriert+bodybreit) **[Kern-Fix]**
- `default` mit Block-Bild
- `two-column` mit führendem `# Titel` (→ spannt) **und** ein bestehender 2-Spalter ohne Titel (→ unverändert)
- `columns-3`
- `title`, `section` (lone heading, auto), `quote` (lone `>`, auto)
- `image-focus` (lone Bild, auto)
- `stat`
- `cover-image` (mit Bild) **und** `cover-image` ohne Bild (→ soft-Warnung)
- `<!-- layout: two-column compact -->` (→ dichter)
- eine inferierte Spalten-Folie (`<!-- column -->` ohne `layout`)

- [ ] **Step 3: Deploy + manueller Smoke**

Run: `npm run deploy` (setzt `$OBSIDIAN_PLUGIN_DIR` voraus).
Dann in Obsidian die Preview öffnen und gegen Spec §12 prüfen: Media zentriert (nicht links), Titel spannt, Slots in den Ecken, Pagination `n / N`, Modifier dichter, cover-image randlos+lesbar, Inferenz greift, bestehende Decks ≥ gleich. Befunde notieren; Fixes als eigene `fix:`-Commits (Smoke-Fixes fängt kein Review — nur der GUI-Smoke).

- [ ] **Step 4: Abschluss**

`superpowers:requesting-code-review` (Whole-Branch) → danach `superpowers:finishing-a-development-branch` (Merge/PR-Entscheidung an den User). Push/Merge nur auf Freigabe (Repo-Regel).

---

## Self-Review (gegen den Spec)

**Spec-Coverage:** Goal 1 (Media) → T6+T7; Goal 2 (Katalog) → T4+T5; Goal 3 (Spanning) → T5(CSS)+T7(Hoist); Goal 4 (Slots) → T3(Frontmatter)+T6(CSS)+T7(DOM); Goal 5 (Modifier) → T1+T3+T5+T7; Goal 6 (Inferenz/kein Bruch) → T2; Goal 7 (Invarianten) → Constraints + T9-Gate. Slots/cover/Spanning/Modifier/Inferenz/Tokens alle einem Task zugeordnet. ✔

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Schritt enthält vollständigen Code. ✔

**Typ-Konsistenz:** `DirectiveResult.modifiers` (T1) → `Slide.modifiers` (T3) → `slide.modifiers` in render-dom (T7); `DeckDirectives.header/footer/paginate` (T3) → `appendSlots` (T7); `WarningKind "cover-no-image"` (T4) → push in render-dom (T7); Klassen `.sd-region-title`/`.sd-mod-*`/`.sd-cover-media`/`.sd-cover-scrim`/`.sd-slide-*` konsistent zwischen T5/T6 (CSS) und T7 (DOM). ✔
