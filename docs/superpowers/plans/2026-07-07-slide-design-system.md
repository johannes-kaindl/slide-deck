# Slide-Design-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Professionelles Slide-Design-System — modulare Typo-Skala, Spacing-Tokens, Alignment-Axiome, vertikaler Rhythmus — plus die fünf Nordstern-Themes als Built-ins (Alias-Map für Alt-Keys) und LLM-Prompt-Härtung.

**Architecture:** Reiner CSS/Token-Umbau in `src/core/presets/{structure,layouts}.css.ts` + Preset-Tausch in `src/core/presets/` + Alias-Schicht in der Theme-Registry. render-dom / Fit-Engine / iframe-Pipeline bleiben unangetastet. Spec: `docs/superpowers/specs/2026-07-07-slide-design-system-design.md`.

**Tech Stack:** TypeScript strict · esbuild · vitest (node, kein DOM) · highlight.js-Styles als Text-Import · Headless Chrome (Visual-Harness).

## Global Constraints

- **Branch:** alle Tasks auf `feat/slide-design-system` (Task 1 legt ihn an). Release-Ziel 0.5.0 — **kein Release in diesem Plan** (erst nach Jays GUI-Smoke).
- **Core-Purity:** `src/core/**` importiert niemals `obsidian` (Gate `scripts/check-core-purity.mjs`, läuft in `npm test`).
- **Realm-Gate:** `src/render-dom.ts` wird in diesem Plan NICHT verändert.
- **Themes setzen nur Token-Werte, keine Regeln** — Ausnahme: `Preset.extraCss` für Atmosphäre/Callout-Hues (nie `font-size`/`font-family`/Margins).
- **Fixe Geometrie** (1280×720 / 960×720) und **fit-or-warn** unangetastet: `.sd-content{width:100%;height:100%;transform-origin:top left}` muss exakt erhalten bleiben (fit-kritisch).
- **Vitest läuft mit `environment: "node"`** — kein DOM. CSS wird als String getestet (`toContain`).
- **Commits:** Conventional Commits, deutsche Beschreibung ok, nur berührte Dateien stagen, Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Nach jedem Task:** `npm test && npm run typecheck` grün (263+ Tests; Task 4 ist der Breaking-Switch — dort werden bestehende Tests aktualisiert).
- **Quell-Themes (Port-Vorlagen, read-only!):** `/Users/Shared/10_ObsidianVaults/10_Pallas/Slide-Deck-Themes/{shiro,kuro,sumi,kairo,kurenai}.css`

---

### Task 1: Struktur-CSS — Typo-Rollen, Spacing-Skala, Rhythmus, tokenisierte Charakter-Defaults

**Files:**
- Modify: `src/core/presets/structure.css.ts` (kompletter Neuaufbau des CSS-Strings)
- Test: `tests/core/structure-css.test.ts` (neue describe-Blöcke ergänzen)

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `STRUCTURE_CSS` (unveränderter Export-Name) mit neuen Tokens, die Task 2/3 referenzieren: `--sd-size-h1/-h2/-display/-small/-eyebrow`, `--sd-lh-display/-heading/-body`, `--sd-space-2xs/-xs/-s/-m/-l/-xl/-2xl`, `--sd-pad`, `--sd-mono`, `--sd-muted`, `--sd-surface`, `--sd-callout-fg`, Treatment-Tokens `--sd-display-style/-weight/-tracking`.

- [ ] **Step 0: Branch anlegen**

```bash
git checkout -b feat/slide-design-system
```

- [ ] **Step 1: Failing Tests schreiben** — in `tests/core/structure-css.test.ts` ergänzen:

```ts
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
    expect(STRUCTURE_CSS).toContain(".sd-region > h1 + h2{ margin-top:var(--sd-space-xs,.5em); }");
    expect(STRUCTURE_CSS).toContain("li + li{ margin-top:var(--sd-space-2xs,.25em); }");
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
```

- [ ] **Step 2: Tests laufen lassen — müssen FAILen**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: FAIL (Tokens existieren noch nicht).

- [ ] **Step 3: `STRUCTURE_CSS` neu schreiben** — kompletter neuer Inhalt (Kommentar-Kopf der Datei bleibt sinngemäß, um die neuen Invarianten ergänzt):

```ts
export const STRUCTURE_CSS = `
.sd-slide{ width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:var(--sd-pad,64px); overflow:hidden; position:relative; background:var(--sd-bg); color:var(--sd-fg);
  font-size:var(--sd-base); line-height:var(--sd-lh-body,1.45); font-family:var(--sd-font); }

/* ── Type roles — modular scale, ratio 1.25 (see docs/themes/THEMING-GUIDE.md).
   Themes override token VALUES only; the display treatment (italic serif etc.)
   comes from --sd-display-* treatment tokens, never from theme h1/h2 rules. ── */
.sd-slide h1{ font-family:var(--sd-heading-font); font-size:var(--sd-size-h1,1.95em);
  line-height:var(--sd-lh-display,1.08); font-style:var(--sd-display-style,normal);
  font-weight:var(--sd-display-weight,700); letter-spacing:var(--sd-display-tracking,normal); }
.sd-slide h2{ font-family:var(--sd-heading-font); font-size:var(--sd-size-h2,1.25em);
  line-height:var(--sd-lh-heading,1.2); font-weight:600; }
.sd-slide a{ color:var(--sd-accent); text-decoration:underline; text-underline-offset:2px; }

/* ── Vertical rhythm: blocks own NO margins; space comes from adjacency (owl).
   More air before a new section, tight binding after a heading. ── */
.sd-slide h1,.sd-slide h2,.sd-slide p,.sd-slide ul,.sd-slide ol,.sd-slide pre,.sd-slide blockquote{ margin:0; }
.sd-region > * + *{ margin-top:var(--sd-space-s,.75em); }
.sd-region > * + h2{ margin-top:var(--sd-space-xl,2.25em); }
.sd-region > h1 + h2{ margin-top:var(--sd-space-xs,.5em); }
.sd-slide ul,.sd-slide ol{ padding-left:1.2em; }
.sd-slide li{ margin:0; }
.sd-slide li + li{ margin-top:var(--sd-space-2xs,.25em); }

/* Content fills the slide's padded area so overflow is measurable (scrollHeight > clientHeight).
   transform-origin pins the per-slide fit-scale (set inline in render-dom) to the top-left corner. */
.sd-content{ width:100%; height:100%; transform-origin:top left; }

/* ── Code ── */
.sd-slide pre.hljs{ font-size:.8em; padding:var(--sd-space-xs,.5em) var(--sd-space-s,.75em); border-radius:8px;
  background:var(--sd-code-bg); overflow:hidden;
  font-family:var(--sd-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace); }
.sd-slide :not(pre) > code{ font-family:var(--sd-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);
  font-size:.88em; background:var(--sd-code-bg); padding:.08em .34em; border-radius:4px; }

/* ── Character defaults, tokenized — a 7-token user theme looks finished out of the box. ── */
.sd-slide blockquote{ padding:var(--sd-space-2xs,.25em) 0 var(--sd-space-2xs,.25em) var(--sd-space-m,1em);
  border-left:3px solid var(--sd-accent); font-family:var(--sd-heading-font); font-style:italic;
  color:var(--sd-muted,inherit); }
.sd-slide hr{ border:none; height:2px; width:min(200px,30%);
  background:linear-gradient(to right,var(--sd-accent),transparent); }
.sd-slide li::marker{ color:var(--sd-accent); }

/* Block media: centered + contain. On a media-bearing single-region slide,
   render-dom marks .sd-content with .sd-has-media → the media cell fills the
   remaining vertical space via flex, so media sizing is independent of raster
   image decode timing and never relies on (unresolved) percentage heights. */
.sd-embed{ display:block; margin-inline:auto; max-width:100%; max-height:100%; object-fit:contain; }
.sd-mermaid{ text-align:center; }
.sd-mermaid svg{ display:block; margin-inline:auto; max-width:100%; max-height:100%; }
.sd-content.sd-has-media{ display:flex; flex-direction:column; }
.sd-content.sd-has-media > .sd-region{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
.sd-content.sd-has-media .sd-region > p:has(> img.sd-embed:only-child),
.sd-content.sd-has-media .sd-region > .sd-media-cell,
.sd-content.sd-has-media .sd-region > .sd-mermaid{ flex:1 1 0; min-height:0; margin:var(--sd-space-xs,.5em) 0; }
.sd-content.sd-has-media .sd-region > p > img.sd-embed:only-child,
.sd-content.sd-has-media .sd-region > .sd-media-cell > img.sd-embed,
.sd-content.sd-has-media .sd-region > .sd-mermaid > svg{ width:100%; height:100%; object-fit:contain; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }

/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort.
   Surface/Text sind tokenisiert; dunkle Themes setzen --sd-surface/--sd-callout-fg. */
.sd-callout{ border-left:3px solid var(--sd-callout-base,#5b6470); background:var(--sd-surface,#f4f6f8);
  padding:var(--sd-space-xs,.5em) var(--sd-space-s,.75em); border-radius:8px; color:var(--sd-callout-fg,#16181d); }
.sd-callout-title{ display:flex; align-items:center; gap:var(--sd-space-xs,.5em); font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:var(--sd-callout-note,#3b6db5); } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:var(--sd-callout-warning,#b58a1e); } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:var(--sd-callout-danger,#b5443b); } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:var(--sd-callout-tip,#2e8b6f); } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:var(--sd-callout-info,#3b6db5); } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }

/* Floating slots — live in the padding margin, outside the scaled .sd-content. */
.sd-slide-header,.sd-slide-footer,.sd-slide-pagination{ position:absolute; z-index:4;
  font-size:var(--sd-slot-size,var(--sd-size-small,.8em)); color:var(--sd-slot-fg,var(--sd-muted,#6b7280));
  letter-spacing:.04em; }
.sd-slide-header{ top:24px; right:32px; text-transform:uppercase; }
.sd-slide-footer{ bottom:24px; left:32px; }
.sd-slide-pagination{ bottom:24px; right:32px; }

/* cover-image: full-bleed background + readability scrim behind the content. */
.sd-cover-media{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.sd-cover-scrim{ position:absolute; inset:0; z-index:1;
  background:var(--sd-scrim,linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,.12) 60%,transparent)); }
.sd-layout-cover-image .sd-content{ position:relative; z-index:3; }
`;
```

Hinweis: Die alte Callout-Margin (`margin:.4em 0`) entfällt bewusst — Abstand kommt jetzt vom Owl-Rhythmus.

- [ ] **Step 4: Tests laufen lassen — müssen PASSen**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: PASS. Falls Alt-Assertions in dieser Datei jetzt brechen (z.B. auf `margin:0 0 .4em` oder `line-height:1.4`), diese Assertions auf die neuen Token-Äquivalente umschreiben — die *Intention* des Alt-Tests erhalten (z.B. „code bg ist tokenisiert" bleibt).

- [ ] **Step 5: Voller Gate + Commit**

Run: `npm test && npm run typecheck`
Expected: PASS (layouts/compose/constraints-Tests dürfen hier noch nicht brechen; falls doch, Assertions analog Step 4 aktualisieren, Verhalten nicht).

```bash
git add src/core/presets/structure.css.ts tests/core/structure-css.test.ts
git commit -m "feat(design): Typo-Rollen, Spacing-Skala und Owl-Rhythmus im Struktur-CSS

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Layout-CSS — Alignment-Axiome, Eyebrow-Kontext, Display-Rolle, Token-Gaps

**Files:**
- Modify: `src/core/presets/layouts.css.ts` (nur `LAYOUTS_CSS`-String; `LAYOUTS`/`layoutFor` unverändert)
- Test: `tests/core/layouts.test.ts` (describe-Block ergänzen)

**Interfaces:**
- Consumes: Tokens aus Task 1 (`--sd-size-display`, `--sd-size-eyebrow`, `--sd-eyebrow-*`, `--sd-space-*`).
- Produces: `LAYOUTS_CSS` mit Eyebrow-Kontextregeln, die Task 3-Presets via `--sd-eyebrow-font` etc. färben.

- [ ] **Step 1: Failing Tests schreiben** — in `tests/core/layouts.test.ts` ergänzen:

```ts
describe("alignment axioms & eyebrow context", () => {
  it("hero layouts center the block, never list lines (axiom 2)", () => {
    expect(LAYOUTS_CSS).toContain(
      ".sd-layout-title .sd-region :is(ul,ol),.sd-layout-section .sd-region :is(ul,ol),.sd-layout-quote .sd-region :is(ul,ol){\n  text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }"
    );
    expect(LAYOUTS_CSS).toContain("max-width:85%");
  });
  it("h1 on hero layouts uses the display role", () => {
    expect(LAYOUTS_CSS).toContain(".sd-layout-title h1,.sd-layout-section h1,.sd-layout-cover-image h1{ font-size:var(--sd-size-display,2.44em); }");
  });
  it("h2 on hero layouts becomes a small tracked eyebrow", () => {
    expect(LAYOUTS_CSS).toContain("font-size:var(--sd-size-eyebrow,.68em)");
    expect(LAYOUTS_CSS).toContain("letter-spacing:var(--sd-eyebrow-tracking,.14em)");
    expect(LAYOUTS_CSS).toContain("color:var(--sd-eyebrow-fg,var(--sd-accent))");
  });
  it("column gaps come from the space scale", () => {
    expect(LAYOUTS_CSS).toContain("gap:var(--sd-space-l,1.5em)");
    expect(LAYOUTS_CSS).toContain("gap:var(--sd-space-m,1em)");
  });
});
```

- [ ] **Step 2: Run — FAIL erwartet**

Run: `npx vitest run tests/core/layouts.test.ts` → FAIL.

- [ ] **Step 3: `LAYOUTS_CSS` neu schreiben:**

```ts
export const LAYOUTS_CSS = `
.sd-region{ min-width:0; min-height:0; }

/* multi-column: title spans all columns; gaps from the space scale */
.sd-layout-two-column .sd-content{ display:grid; grid-template-columns:1fr 1fr; gap:var(--sd-space-l,1.5em); align-content:start; }
.sd-layout-columns-3 .sd-content{ display:grid; grid-template-columns:repeat(3,1fr); gap:var(--sd-space-m,1em); align-content:start; }
.sd-layout-two-column .sd-region-title,
.sd-layout-columns-3 .sd-region-title{ grid-column:1/-1; }

/* ── Hero/divider templates. Axiom 2: center the BLOCK, never the line —
   headings/paragraphs may center; lists/code/callouts stay start-aligned and
   are centered as a block. Axiom 3: content layouts keep a left edge (no rules needed). ── */
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content,
.sd-layout-stat .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:flex-start; }
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content{ align-items:center; }
.sd-layout-title .sd-region,.sd-layout-section .sd-region,.sd-layout-quote .sd-region{ text-align:center; max-width:85%; }
.sd-layout-title .sd-region :is(ul,ol),.sd-layout-section .sd-region :is(ul,ol),.sd-layout-quote .sd-region :is(ul,ol){
  text-align:start; width:fit-content; margin-inline:auto; max-width:100%; }
.sd-layout-title .sd-region :is(pre,.sd-callout),.sd-layout-section .sd-region :is(pre,.sd-callout),.sd-layout-quote .sd-region :is(pre,.sd-callout){ text-align:start; }

/* display role on hero titles */
.sd-layout-title h1,.sd-layout-section h1,.sd-layout-cover-image h1{ font-size:var(--sd-size-display,2.44em); }

/* eyebrow: h2 in hero context is a small tracked kicker, not a heading */
.sd-layout-title h2,.sd-layout-section h2,.sd-layout-cover-image h2{
  font-family:var(--sd-eyebrow-font,var(--sd-font)); font-size:var(--sd-size-eyebrow,.68em);
  font-weight:600; font-style:normal; text-transform:uppercase;
  letter-spacing:var(--sd-eyebrow-tracking,.14em); color:var(--sd-eyebrow-fg,var(--sd-accent));
  line-height:var(--sd-lh-heading,1.2); }

/* quote keeps its serif voice on the scale */
.sd-layout-quote .sd-region{ font-size:var(--sd-size-h2,1.25em); font-style:italic; }

/* stat: oversized lead number */
.sd-layout-stat h1{ font-size:var(--sd-stat-size,4.5em); line-height:1; }

/* image-focus: media-dominant — the media fill is handled by .sd-has-media
   (structure.css); here we only center an optional title/caption. */
.sd-layout-image-focus .sd-content{ text-align:center; }

/* cover-image: title overlays the full-bleed background, anchored bottom-left */
.sd-layout-cover-image .sd-content{ display:flex; flex-direction:column; justify-content:flex-end; }
.sd-cover-empty .sd-content{ justify-content:center; align-items:center; text-align:center; }
.sd-cover-empty .sd-region{ text-align:center; max-width:85%; }

/* density modifiers (combine with any layout) */
.sd-mod-compact .sd-content{ font-size:var(--sd-compact-scale,0.82em); line-height:1.3; }
.sd-mod-compact h1{ font-size:1.5em; }
.sd-mod-compact h2{ font-size:1.1em; }
.sd-mod-compact .sd-region > * + *{ margin-top:var(--sd-space-xs,.5em); }
.sd-mod-compact li + li{ margin-top:0; }
.sd-mod-code-heavy pre.hljs{ font-size:1em; }

/* compose-center: vertically center sparse, non-overflowing content */
.sd-compose-center:not(.sd-layout-two-column):not(.sd-layout-columns-3) .sd-content{ display:flex; flex-direction:column; justify-content:center; }
.sd-compose-center.sd-layout-two-column .sd-content,
.sd-compose-center.sd-layout-columns-3 .sd-content{ align-content:center; }
`;
```

Beachte: Die alte Regel `.sd-layout-quote .sd-region{ … max-width:80% }` ist durch `max-width:85%` (einheitliche Lesebreite aller Hero-Regionen) ersetzt; `.sd-layout-section .sd-region{ font-size:1.2em }` und `.sd-layout-title h1{ font-size:3em }` entfallen (Display-Rolle übernimmt).

- [ ] **Step 4: Run — PASS erwartet**

Run: `npx vitest run tests/core/layouts.test.ts tests/core/compose.test.ts` → PASS (compose-Tests prüfen `sd-compose-center`-Regeln — unverändert erhalten). Brechende Alt-Assertions (z.B. auf `gap:48px` oder `font-size:3em`) auf die neuen Werte umschreiben.

- [ ] **Step 5: Voller Gate + Commit**

```bash
npm test && npm run typecheck
git add src/core/presets/layouts.css.ts tests/core/layouts.test.ts
git commit -m "feat(design): Alignment-Axiome, Eyebrow-Kontext und Display-Rolle im Layout-CSS

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Nordstern-Presets — fünf neue Preset-Dateien (noch ohne Registrierung)

**Files:**
- Create: `src/core/presets/shiro.ts`, `src/core/presets/kuro.ts`, `src/core/presets/sumi.ts`, `src/core/presets/kairo.ts`, `src/core/presets/kurenai.ts`
- Modify: `src/core/presets/index.ts` (NUR: `extraCss?: string` am `Preset`-Interface ergänzen — PRESETS-Map bleibt in diesem Task unverändert!)
- Test: Create `tests/core/nordstern-presets.test.ts`

**Interfaces:**
- Consumes: `Preset`-Typ aus `./index`.
- Produces: `shiroPreset`, `kuroPreset`, `sumiPreset`, `kairoPreset`, `kurenaiPreset` (je `Preset`), konsumiert von Task 4.

**Port-Rezept** (gilt für alle fünf; Quelle: die Vault-.css-Dateien unter `/Users/Shared/10_ObsidianVaults/10_Pallas/Slide-Deck-Themes/`):
- §1-Token-Werte → `tokens` (unten vollständig angegeben).
- **Entfällt ersatzlos** (übernimmt das neue Struktur-/Layout-CSS bzw. Treatment-Tokens): alle `h1`/`h2`-Regeln, `h2::before` (◉), `blockquote`, `hr`, `li::marker`, `:not(pre) > code`, `a`-Regeln, sämtliche `.hljs-*`-Token-Remaps (dunkle Presets nutzen echtes `github-dark`), `.sd-callout { background/color/border-radius }`-Repaints (Tokens `--sd-surface`/`--sd-callout-fg`).
- **In `extraCss`** (Character, token-inexpressibel): Atmosphäre-Block (der zweite `.sd-slide { position:relative; background-image: … }`-Block inkl. `box-shadow`), `h1 { text-shadow: … }` als eigene Regel NUR mit der text-shadow-Deklaration, `pre.hljs`-Border-Regeln, per-Typ-Callout-Hues (`.sd-callout-note { border-left-color/background }` + Title-Farben).

- [ ] **Step 1: Failing Test schreiben** — `tests/core/nordstern-presets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shiroPreset } from "../../src/core/presets/shiro";
import { kuroPreset } from "../../src/core/presets/kuro";
import { sumiPreset } from "../../src/core/presets/sumi";
import { kairoPreset } from "../../src/core/presets/kairo";
import { kurenaiPreset } from "../../src/core/presets/kurenai";

const all = [shiroPreset, kuroPreset, sumiPreset, kairoPreset, kurenaiPreset];

describe("nordstern presets", () => {
  it("carry complete token contracts + japanese labels", () => {
    for (const p of all) {
      for (const t of ["--sd-bg", "--sd-fg", "--sd-accent", "--sd-code-bg", "--sd-font", "--sd-heading-font",
        "--sd-mono", "--sd-muted", "--sd-surface", "--sd-callout-fg",
        "--sd-display-style", "--sd-display-weight", "--sd-display-tracking", "--sd-eyebrow-font"])
        expect(p.tokens[t], `${p.id} missing ${t}`).toBeTruthy();
      expect(p.label).toMatch(/·/);
    }
  });
  it("dark presets use a dark code + mermaid scheme", () => {
    for (const p of [kuroPreset, sumiPreset, kairoPreset, kurenaiPreset]) {
      expect(p.hljs).toBe("github-dark");
      expect(p.mermaid).toBe("dark");
    }
    expect(shiroPreset.hljs).toBe("github");
    expect(shiroPreset.mermaid).toBe("default");
  });
  it("sumi keeps its higher legibility floor", () => {
    expect(sumiPreset.baseFontPx).toBe(32);
    for (const p of [shiroPreset, kuroPreset, kairoPreset, kurenaiPreset]) expect(p.baseFontPx).toBe(28);
  });
  it("extraCss never overrides the type scale", () => {
    for (const p of all) {
      const extra = p.extraCss ?? "";
      expect(extra).not.toMatch(/font-size/);
      expect(extra).not.toMatch(/letter-spacing/);
      expect(extra).not.toMatch(/◉|\\25c9/); // kein ◉-Ornament mehr
    }
  });
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run tests/core/nordstern-presets.test.ts` — Module existieren nicht).

- [ ] **Step 3: `Preset`-Interface erweitern** — in `src/core/presets/index.ts` NUR:

```ts
export interface Preset {
  id: string;
  label: string;
  baseFontPx: number;
  tokens: Record<string, string>;
  /** Optional character/atmosphere CSS appended after the token block.
   *  MUST NOT set font-size/font-family/letter-spacing/margins — the scale is token-only. */
  extraCss?: string;
  hljs: string;
  mermaid: MermaidTheme;
}
```

- [ ] **Step 4: Die fünf Preset-Dateien schreiben.** Gemeinsame Token-Basis (in jeder Datei identisch, bewusst kopiert — Presets sind eigenständige Werke):

```ts
// gemeinsamer Block in jedem tokens-Objekt:
"--sd-font": '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
"--sd-heading-font": '"EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
"--sd-mono": '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
"--sd-display-style": "italic",
"--sd-display-weight": "500",
"--sd-display-tracking": "-0.02em",
"--sd-eyebrow-font": "var(--sd-mono)",
```

Theme-spezifische Werte:

| Preset | --sd-bg | --sd-fg | --sd-accent | --sd-code-bg | --sd-muted | --sd-surface | --sd-callout-fg |
|---|---|---|---|---|---|---|---|
| shiro | #f7f2e8 | #1f1a13 | #7d5e26 | #efe7d6 | #5f574a | #efe7d6 | #1f1a13 |
| kuro | #100e0c | #ece4d3 | #c79a4a | #1b1712 | #a99e89 | #17140f | #ece4d3 |
| sumi | #000000 | #f4efe2 | #d8b264 | #0d0c0a | #c2b694 | #0e0d0b | #f4efe2 |
| kairo | #0d0f10 | #e7eae6 | #4ac8d8 | #11181a | #8ea0a2 | #11181a | #e7eae6 |
| kurenai | #100e0c | #ece4d3 | #e8455c | #1b1411 | #a99e89 | #181210 | #ece4d3 |

Datei-Skelett (Beispiel `kuro.ts`; kuro hat KEIN `extraCss` — seine Vault-.css enthält keine Atmosphäre, und alles andere ist tokenisiert):

```ts
import type { Preset } from "./index";
export const kuroPreset: Preset = {
  id: "kuro", label: "Kuro · 黒 — the chamber", baseFontPx: 28,
  tokens: { /* gemeinsamer Block + kuro-Spalte aus der Tabelle */ },
  hljs: "github-dark", mermaid: "dark",
};
```

`extraCss` je Preset (Template-Literals):

- **shiro** — Atmosphäre-Block **verbatim** aus `Slide-Deck-Themes/shiro.css` kopieren (der `.sd-slide { position: relative; background-color … background-repeat: no-repeat; }`-Block mit dem Papier-Textur-data-URI; die lokale Variable `var(--shiro-glow)` durch den Literalwert `rgba(125, 94, 38, 0.05)` ersetzen) + danach:

```css
.sd-slide pre.hljs{ border:1px solid rgba(125,94,38,0.24); border-left:3px solid var(--sd-accent); }
.sd-slide .sd-callout{ border-left-color:var(--sd-accent); }
.sd-slide .sd-callout-note{ border-left-color:#5f8d96; }
.sd-slide .sd-callout-info{ border-left-color:#2f97a6; }
.sd-slide .sd-callout-tip{ border-left-color:#4a8c54; }
.sd-slide .sd-callout-warning{ border-left-color:#b07d1f; }
.sd-slide .sd-callout-danger{ border-left-color:#b54545; }
```

- **sumi** —

```css
.sd-slide pre.hljs{ border:1px solid rgba(216,178,100,0.3); border-left:3px solid var(--sd-accent); }
.sd-slide .sd-callout{ border-left-color:var(--sd-accent); }
.sd-slide .sd-callout-note{ border-left-color:#8fcfdb; } .sd-slide .sd-callout-note .sd-callout-title{ color:#8fcfdb; }
.sd-slide .sd-callout-info{ border-left-color:#6fd6e6; } .sd-slide .sd-callout-info .sd-callout-title{ color:#6fd6e6; }
.sd-slide .sd-callout-tip{ border-left-color:#9fd49a; } .sd-slide .sd-callout-tip .sd-callout-title{ color:#9fd49a; }
.sd-slide .sd-callout-warning{ border-left-color:#ffc25e; } .sd-slide .sd-callout-warning .sd-callout-title{ color:#ffc25e; }
.sd-slide .sd-callout-danger{ border-left-color:#f4566c; } .sd-slide .sd-callout-danger .sd-callout-title{ color:#f4566c; }
```

- **kairo** —

```css
.sd-slide{
  background-color: var(--sd-bg);
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E"),
    radial-gradient(125% 85% at 16% -8%, rgba(74,200,216,0.12) 0%, transparent 46%),
    repeating-linear-gradient(0deg, rgba(74,200,216,0.025) 0 1px, transparent 1px 4px);
  background-size: 150px 150px, cover, cover;
  background-position: 0 0, center, center;
  background-repeat: repeat, no-repeat, repeat;
  box-shadow: inset 0 0 240px 26px rgba(0,0,0,0.5);
}
.sd-slide h1{ text-shadow: 0 0 34px rgba(74,200,216,0.12); }
.sd-slide pre.hljs{ border:1px solid rgba(74,200,216,0.22); border-left:3px solid var(--sd-accent); }
.sd-slide .sd-callout{ border-left-color:var(--sd-accent); }
.sd-slide .sd-callout-note{ border-left-color:#7ab8c4; background:rgba(122,184,196,0.07); } .sd-slide .sd-callout-note .sd-callout-title{ color:#7ab8c4; }
.sd-slide .sd-callout-info{ border-left-color:#4ac8d8; background:rgba(74,200,216,0.08); } .sd-slide .sd-callout-info .sd-callout-title{ color:#4ac8d8; }
.sd-slide .sd-callout-tip{ border-left-color:#8bbf87; background:rgba(139,191,135,0.07); } .sd-slide .sd-callout-tip .sd-callout-title{ color:#8bbf87; }
.sd-slide .sd-callout-warning{ border-left-color:#ffb442; background:rgba(255,180,66,0.07); } .sd-slide .sd-callout-warning .sd-callout-title{ color:#ffb442; }
.sd-slide .sd-callout-danger{ border-left-color:#e8455c; background:rgba(212,32,58,0.08); } .sd-slide .sd-callout-danger .sd-callout-title{ color:#e8455c; }
```

- **kurenai** — wie kairo, aber mit dem kurenai-Atmosphäre-Block:

```css
.sd-slide{
  background-color: var(--sd-bg);
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E"),
    radial-gradient(125% 85% at 16% -8%, rgba(212,32,58,0.14) 0%, transparent 46%),
    radial-gradient(100% 70% at 85% 110%, rgba(212,32,58,0.06) 0%, transparent 55%);
  background-size: 150px 150px, cover, cover;
  background-position: 0 0, center, center;
  background-repeat: repeat, no-repeat, no-repeat;
  box-shadow: inset 0 0 240px 26px rgba(0,0,0,0.5);
}
.sd-slide h1{ text-shadow: 0 0 34px rgba(212,32,58,0.14); }
.sd-slide pre.hljs{ border:1px solid rgba(232,69,92,0.24); border-left:3px solid var(--sd-accent); }
.sd-slide .sd-callout{ border-left-color:var(--sd-accent); }
.sd-slide .sd-callout-note{ border-left-color:#7ab8c4; background:rgba(122,184,196,0.07); } .sd-slide .sd-callout-note .sd-callout-title{ color:#7ab8c4; }
.sd-slide .sd-callout-info{ border-left-color:#4ac8d8; background:rgba(74,200,216,0.07); } .sd-slide .sd-callout-info .sd-callout-title{ color:#4ac8d8; }
.sd-slide .sd-callout-tip{ border-left-color:#8bbf87; background:rgba(139,191,135,0.07); } .sd-slide .sd-callout-tip .sd-callout-title{ color:#8bbf87; }
.sd-slide .sd-callout-warning{ border-left-color:#ffb442; background:rgba(255,180,66,0.07); } .sd-slide .sd-callout-warning .sd-callout-title{ color:#ffb442; }
.sd-slide .sd-callout-danger{ border-left-color:#e8455c; background:rgba(212,32,58,0.1); } .sd-slide .sd-callout-danger .sd-callout-title{ color:#e8455c; }
```

Labels: `"Shiro · 白 — rice paper"`, `"Kuro · 黒 — the chamber"`, `"Sumi · 墨 — ink on void"`, `"Kairo · 回路 — the circuit"`, `"Kurenai · 紅 — danger signal"`.

- [ ] **Step 5: Run — PASS** (`npx vitest run tests/core/nordstern-presets.test.ts`), dann `npm test && npm run typecheck` (alte Suite bleibt grün — die neuen Dateien sind noch unreferenziert).

- [ ] **Step 6: Commit**

```bash
git add src/core/presets/shiro.ts src/core/presets/kuro.ts src/core/presets/sumi.ts src/core/presets/kairo.ts src/core/presets/kurenai.ts src/core/presets/index.ts tests/core/nordstern-presets.test.ts
git commit -m "feat(theme): Nordstern-Presets shiro/kuro/sumi/kairo/kurenai als Core-Module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Registry-Umschaltung — PRESETS-Swap, Alias-Map, shiro-Fallback

**Files:**
- Modify: `src/core/presets/index.ts` (PRESETS-Map, `THEME_ALIASES`, `presetFor`, `resolveTheme`)
- Modify: `src/core/constraints/engine.ts` (`collectDeckWarnings` alias-aware)
- Delete: `src/core/presets/default.ts`, `dark.ts`, `serif.ts`, `high-contrast.ts`
- Modify: `scripts/bundle-smoke-entry.ts` (Totalitäts-Assertion)
- Test: `tests/core/presets.test.ts`, `tests/core/contract.test.ts`, `tests/core/constraints.test.ts`

**Interfaces:**
- Consumes: die fünf Presets aus Task 3.
- Produces: `THEME_ALIASES: Record<string,string>` (exportiert); `presetFor(id)`/`resolveTheme(reg,key)` mit Alias-Auflösung und shiro-Fallback. Task 5/6 importieren `THEME_ALIASES` bzw. verlassen sich auf den Fallback.

- [ ] **Step 1: Failing Tests schreiben** — in `tests/core/presets.test.ts` den PRESETS-Block ERSETZEN und Alias-Tests ergänzen:

```ts
it("registers exactly the five nordstern presets", () => {
  expect(Object.keys(PRESETS).sort()).toEqual(["kairo", "kurenai", "kuro", "shiro", "sumi"]);
});
it("is total — unknown id falls back to shiro", () => {
  expect(presetFor("nope").id).toBe("shiro");
});
it("resolves legacy keys via aliases (silent)", () => {
  expect(presetFor("default").id).toBe("shiro");
  expect(presetFor("dark").id).toBe("kuro");
  expect(presetFor("serif").id).toBe("shiro");
  expect(presetFor("high-contrast").id).toBe("sumi");
});
describe("registry aliases", () => {
  it("resolveTheme follows aliases, exact user key wins over alias", () => {
    const r = reg(entry("shiro", "builtin"), entry("kuro", "builtin"), entry("dark", "user"));
    expect(resolveTheme(r, "default").key).toBe("shiro");
    expect(resolveTheme(r, "dark").key).toBe("dark"); // User-Theme "dark" schattet den Alias
    expect(resolveTheme(r, "nope").key).toBe("shiro");
  });
  it("aliases never appear in listThemes", () => {
    const r = reg(entry("shiro", "builtin"), entry("kuro", "builtin"));
    expect(listThemes(r).map((e) => e.key)).toEqual(["shiro", "kuro"]);
  });
});
```

Bestehende Tests in der Datei, die `entry("default","builtin")` als Fallback-Anker nutzen, auf `entry("shiro","builtin")` umschreiben. In `tests/core/contract.test.ts`: Assertion auf `contract.themes` (falls vorhanden) auf `["shiro","kuro","sumi","kairo","kurenai"]` anpassen. In `tests/core/constraints.test.ts` ergänzen:

```ts
it("does not warn for alias theme keys", () => {
  const regMap = new Map([["shiro", { key: "shiro", source: "builtin", themeCss: "", hljs: "", mermaid: "default", baseFontPx: 28 } as ThemeEntry]]);
  const deck = parseDeck("---\ntheme: default\n---\n# T");
  expect(collectDeckWarnings(deck, regMap).filter((w) => w.kind === "theme-unknown")).toEqual([]);
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run tests/core/presets.test.ts tests/core/constraints.test.ts`).

- [ ] **Step 3: Implementieren.** `src/core/presets/index.ts`:

```ts
import { shiroPreset } from "./shiro";
import { kuroPreset } from "./kuro";
import { sumiPreset } from "./sumi";
import { kairoPreset } from "./kairo";
import { kurenaiPreset } from "./kurenai";

export const PRESETS: Record<string, Preset> = {
  shiro: shiroPreset, kuro: kuroPreset, sumi: sumiPreset, kairo: kairoPreset, kurenai: kurenaiPreset,
};

/** Legacy 0.4.x keys resolve silently to their nordstern successor. */
export const THEME_ALIASES: Record<string, string> = {
  default: "shiro", dark: "kuro", serif: "shiro", "high-contrast": "sumi",
};

/** TOTAL — legacy keys alias, unknown ids fall back to shiro. Never throws. */
export function presetFor(id: string): Preset {
  return PRESETS[id] ?? PRESETS[THEME_ALIASES[id] ?? ""] ?? PRESETS.shiro;
}

/** TOTAL — exact key first (a user theme may shadow a legacy name), then alias, then shiro. */
export function resolveTheme(reg: ThemeRegistry, key: string): ThemeEntry {
  return reg.get(key) ?? reg.get(THEME_ALIASES[key] ?? "") ?? reg.get("shiro")!;
}
```

Die vier Alt-Preset-Dateien löschen (`git rm src/core/presets/default.ts src/core/presets/dark.ts src/core/presets/serif.ts src/core/presets/high-contrast.ts`). In `engine.ts`:

```ts
import { THEME_ALIASES, type ThemeRegistry } from "../presets";
// in collectDeckWarnings:
const t = deck.directives.theme;
if (!registry.has(t) && !registry.has(THEME_ALIASES[t] ?? "")) {
  out.push({ slideIndex: 0, kind: "theme-unknown", message: `Unknown theme "${t}" — using shiro.`, sourceLine: 0 });
}
```

In `scripts/bundle-smoke-entry.ts` Zeile ~67: `presetFor("nope").id !== "default"` → `!== "shiro"`.

- [ ] **Step 4: Run — PASS**, dann kompletter Gate: `npm test && npm run typecheck`. Jetzt brechende Tests systematisch aktualisieren (bekannt: `tests/settings.test.ts` folgt erst in Task 6 — falls er hier bricht, weil der Fake-Store `default/dark` listet, die Fake-Keys auf `shiro`/`kuro` umbenennen und Erwartungen mitziehen; `tests/deck-css.test.ts` `presetFor("default")` funktioniert via Alias weiter).

- [ ] **Step 5: Commit**

```bash
git add -A -- src/core/presets tests/core scripts/bundle-smoke-entry.ts src/core/constraints/engine.ts tests/settings.test.ts tests/deck-css.test.ts
git commit -m "feat(theme)!: Nordstern-Themes ersetzen die Built-ins — Alias-Map default/dark/serif/high-contrast, Fallback shiro

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: deck-css — extraCss anfügen, User-Themes erben von shiro

**Files:**
- Modify: `src/deck-css.ts`
- Test: `tests/deck-css.test.ts`

**Interfaces:**
- Consumes: `Preset.extraCss` (Task 3), `presetFor` mit shiro-Fallback (Task 4).
- Produces: `builtinThemeEntries()` liefert 5 Einträge, `themeCss = presetTokensCss(p) + extraCss`; `userThemeEntry()` erbt hljs/mermaid/baseFontPx von **shiro**.

- [ ] **Step 1: Failing Tests** — in `tests/deck-css.test.ts` ergänzen:

```ts
it("builtin entries append the preset's extraCss after the token block", () => {
  const kairo = builtinThemeEntries().find((e) => e.key === "kairo")!;
  expect(kairo.themeCss).toContain("--sd-accent:#4ac8d8");
  expect(kairo.themeCss).toContain("text-shadow");
  expect(kairo.themeCss.indexOf("--sd-accent")).toBeLessThan(kairo.themeCss.indexOf("text-shadow"));
});
it("user themes inherit code/mermaid scheme from shiro", () => {
  const u = userThemeEntry("mytheme", ".sd-slide{ --sd-bg:#123 }");
  expect(u.mermaid).toBe("default");
  expect(u.baseFontPx).toBe(28);
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run tests/deck-css.test.ts`).

- [ ] **Step 3: Implementieren** — in `src/deck-css.ts`:

```ts
export function builtinThemeEntries(): ThemeEntry[] {
  return Object.values(PRESETS).map((p) => ({
    key: p.id,
    label: p.label,
    source: "builtin" as const,
    themeCss: presetTokensCss(p) + (p.extraCss ? "\n" + p.extraCss : ""),
    hljs: HLJS[p.hljs] ?? HLJS["github-dark"],
    mermaid: p.mermaid,
    baseFontPx: p.baseFontPx,
  }));
}
```

In `userThemeEntry`: `const d = presetFor("shiro");` (Kommentar „falling back to the default builtin" → „falling back to the shiro builtin"). Der Doc-Kommentar über `builtinThemeEntries` („The four built-in themes") → „The five nordstern built-in themes".

- [ ] **Step 4: Run — PASS**, dann `npm test && npm run typecheck` (bundle-smoke iteriert jetzt über die 5 neuen Themes — muss grün sein).

- [ ] **Step 5: Commit**

```bash
git add src/deck-css.ts tests/deck-css.test.ts
git commit -m "feat(theme): extraCss-Schicht für Built-ins; User-Themes erben von shiro

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Settings — Default shiro, alias-bewusste Koerzierung

**Files:**
- Modify: `src/settings.ts` (`DEFAULT_SETTINGS.defaultTheme`, `getControlValue`-case `defaultTheme`)
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: `THEME_ALIASES` aus `./core/presets` (Task 4).
- Produces: nichts Neues für spätere Tasks.

- [ ] **Step 1: Failing Tests** — in `tests/settings.test.ts` (Fake-Store-Keys sind seit Task 4 `shiro`/`kuro`):

```ts
it("defaults to shiro and coerces legacy keys through the alias map", async () => {
  expect(DEFAULT_SETTINGS.defaultTheme).toBe("shiro");
  const settings: SlideDeckSettings = { ...DEFAULT_SETTINGS, defaultTheme: "dark" };
  const tab = await makeTab(settings); // bestehender Test-Helper der Datei
  expect(tab.getControlValue("defaultTheme")).toBe("kuro"); // Alias dark→kuro
});
```

Bestehende Assertion `getControlValue("defaultTheme")).toBe("default")` (unknown key "ghost") → `toBe("shiro")`.

- [ ] **Step 2: Run — FAIL** (`npx vitest run tests/settings.test.ts`).

- [ ] **Step 3: Implementieren** — `src/settings.ts`:

```ts
import { THEME_ALIASES } from "./core/presets"; // zu bestehenden Imports ergänzen
// DEFAULT_SETTINGS:
defaultTheme: "shiro",
// getControlValue, case "defaultTheme":
case "defaultTheme": {
  const map = this.plugin.themeStore.getMap();
  if (map.has(s.defaultTheme)) return s.defaultTheme;
  const alias = THEME_ALIASES[s.defaultTheme];
  return alias && map.has(alias) ? alias : "shiro";
}
```

- [ ] **Step 4: Run — PASS**, dann `npm test && npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts tests/settings.test.ts
git commit -m "feat(settings): shiro als Default-Theme, Alias-Koerzierung für Alt-Keys

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: LLM-Prompt-Härtung — Layout-Wahl-Regeln

**Files:**
- Modify: `src/core/llm/deck-prompt.ts` (`buildDeckPrompt`, Rules-Array)
- Test: `tests/core/deck-prompt.test.ts`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: nichts Neues.

- [ ] **Step 1: Failing Tests** — in `tests/core/deck-prompt.test.ts` ergänzen (bestehende Helper der Datei zum Bauen von `contract`/`opts` wiederverwenden):

```ts
it("hardens layout choice: hero layouts only for sparse content", () => {
  const [system] = buildDeckPrompt("body", { slideTarget: "auto", hint: "" }, contract);
  expect(system.content).toContain("ONLY for sparse content");
  expect(system.content).toContain("never lists or code blocks");
  expect(system.content).toContain("at most 5 bullets per region");
  expect(system.content).toContain("kicker");
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run tests/core/deck-prompt.test.ts`).

- [ ] **Step 3: Implementieren** — im `Rules:`-Array von `buildDeckPrompt` nach der Zeile „Use ONLY the exact layout names…" ergänzen:

```ts
"- Hero layouts (title, section, quote, cover-image) are ONLY for sparse content: at most ~3 short lines — never lists or code blocks on them.",
"- Put list-heavy content on default, two-column or columns-3 slides. At most 5 bullets per region; keep each bullet a short fragment (about 10 words or fewer).",
"- On a hero slide, an optional ## line next to the # title is a kicker (eyebrow): at most ~4 words.",
```

- [ ] **Step 4: Run — PASS**, dann `npm test && npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/deck-prompt.ts tests/core/deck-prompt.test.ts
git commit -m "feat(llm): Layout-Wahl-Regeln im Deck-Prompt — Hero-Layouts nur für sparsamen Content

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Doku — THEMING-GUIDE-Rewrite, example.css, README, CHANGELOG

**Files:**
- Modify: `docs/themes/THEMING-GUIDE.md` (Rewrite der Token-/Selektor-Abschnitte)
- Create: `docs/themes/example.css`
- Delete: `docs/themes/kuro.css`, `docs/themes/shiro.css`
- Modify: `docs/themes/demo-deck.md` (Frontmatter `theme:` auf einen Built-in-Key prüfen/setzen)
- Modify: `README.md` (Built-in-Theme-Liste), `CHANGELOG.md` (0.5.0-Unreleased-Eintrag)

**Interfaces:** keine Code-Interfaces; kein Test — Gate ist `npm run lint && npm run build`.

- [ ] **Step 1: `docs/themes/example.css` schreiben** — minimale 7-Token-Vorlage:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   EXAMPLE — slide-deck user theme template
   ───────────────────────────────────────────────────────────────────────────
   Copy this file into your themes folder (Settings → Slide deck → Themes
   folder), rename it, change the values. The file name without ".css" IS the
   frontmatter value:  theme: example
   The plugin styles structure, scale, spacing, blockquotes, code panels and
   callouts for you — §1 alone produces a finished look. §2 lists optional
   tokens for character. Full reference: THEMING-GUIDE.md.
   ═══════════════════════════════════════════════════════════════════════════ */
/* sd-label: Example · a friendly starting point */

/* ─── §1 · REQUIRED — the seven-token contract ─────────────────────────────── */
.sd-slide {
  --sd-bg: #ffffff;          /* slide background                         */
  --sd-code-bg: #f4f6f8;     /* code panel background                    */
  --sd-fg: #16181d;          /* body text                                */
  --sd-accent: #3b6db5;      /* links, rules, list markers, eyebrows     */
  --sd-font: ui-sans-serif, system-ui, sans-serif;          /* body      */
  --sd-heading-font: ui-sans-serif, system-ui, sans-serif;  /* headings  */
  --sd-base: 28px;           /* legibility floor for the fit engine      */
}

/* ─── §2 · OPTIONAL — character tokens (all have sensible defaults) ────────── */
.sd-slide {
  /* --sd-mono: ui-monospace, monospace;      inline/block code face          */
  /* --sd-muted: #6b7280;                     secondary text, slots, quotes   */
  /* --sd-surface: #f4f6f8;                   callout panel                   */
  /* --sd-callout-fg: #16181d;                callout text                    */
  /* --sd-display-style: italic;              hero titles italic              */
  /* --sd-display-weight: 500;                hero title weight               */
  /* --sd-display-tracking: -0.02em;          hero title letter-spacing       */
  /* --sd-eyebrow-font: var(--sd-mono);       kicker face                     */
  /* --sd-eyebrow-fg: var(--sd-accent);       kicker color                    */
  /* --sd-eyebrow-tracking: .14em;            kicker letter-spacing           */
  /* --sd-size-display: 2.44em;               type scale overrides…           */
  /* --sd-space-m: 1em;                       …and spacing scale overrides    */
}
```

- [ ] **Step 2: THEMING-GUIDE.md umschreiben.** Struktur der neuen Fassung (bestehende Datei lesen, Abschnitte ersetzen; Tonfall/Format der Datei beibehalten):
  1. *How theming works* — CSS-Reihenfolge unverändert dokumentieren, NEU: „the structure now ships a full design system: modular type scale (ratio 1.25), spacing scale, vertical rhythm, tokenized blockquote/hr/code/callouts — a 7-token theme looks finished."
  2. *§1 The seven-token contract* — unverändert (Werte-Tabelle).
  3. *§2 Character tokens* — NEUE Tabelle: alle `--sd-size-*`, `--sd-lh-*`, `--sd-space-*`, `--sd-pad`, `--sd-mono`, `--sd-muted`, `--sd-surface`, `--sd-callout-fg`, `--sd-display-*`, `--sd-eyebrow-*`, `--sd-slot-*`, `--sd-scrim`, `--sd-stat-size`, `--sd-compact-scale` mit Default + einer Zeile Zweck.
  4. *What you should NOT style anymore* — h1/h2-font-size-Regeln, Listen-Ausrichtung, Margins (Rhythmus kommt vom System); Hinweis: rule-level Overrides bleiben möglich (CSS-Order), sind aber unsupported.
  5. *Built-ins* — die 5 Nordstern-Themes + Alias-Tabelle (`default→shiro, dark→kuro, serif→shiro, high-contrast→sumi`).
  6. *LLM rules* — Abschnitt auf neue Token-Liste aktualisieren.
- [ ] **Step 3: `git rm docs/themes/kuro.css docs/themes/shiro.css`** (jetzt Built-ins; Kopien = Drift-Quellen). In `docs/themes/demo-deck.md` das Frontmatter auf `theme: kuro` prüfen/belassen (Key existiert weiter als Built-in).
- [ ] **Step 4: README.md** — Theme-Abschnitt: Built-in-Liste durch die 5 Nordstern-Themes (mit Labels) ersetzen; Satz zu Alt-Keys/Aliasen ergänzen. **CHANGELOG.md** — `## [Unreleased]`-Eintrag:

```markdown
## [Unreleased]
### Changed (BREAKING)
- Design system: modular type scale (ratio 1.25), spacing tokens, vertical rhythm, alignment axioms (lists never line-centered; hero layouts center blocks). Existing decks render differently (better).
- Built-in themes replaced: shiro 白 (new default, light), kuro 黒, sumi 墨, kairo 回路, kurenai 紅. Legacy keys (default, dark, serif, high-contrast) resolve silently via aliases.
- Dark built-ins now use a real dark highlight.js scheme and mermaid "dark" (fixes light mermaid on dark themes).
- User themes inherit code/mermaid scheme from shiro; new optional character tokens (see THEMING-GUIDE).
- LLM deck prompts: hero layouts restricted to sparse content, bullet budgets, kicker convention.
```

- [ ] **Step 5: Gate + Commit**

```bash
npm run lint && npm run build && npm test
git add docs/themes README.md CHANGELOG.md
git commit -m "docs(theme): THEMING-GUIDE auf Rollen-/Token-Modell, example.css statt Nordstern-Kopien, CHANGELOG 0.5.0

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Visual-Smoke-Harness — Headless Chrome über das echte CSS

**Files:**
- Create: `scripts/visual-smoke-entry.ts`, `scripts/visual-smoke.mjs`
- Modify: `package.json` (Script `visual-smoke`), `.gitignore` (`_visual/`)

**Interfaces:**
- Consumes: `parseDeck`, `renderDeckToContainer(doc, container, deck, resolveEmbed, registry)`, `mergeThemes`, `builtinThemeEntries`, `deckCss`, `resolveTheme`.
- Produces: `npm run visual-smoke [-- <deck.md> [theme…]]` → `_visual/<theme>.png` (ein hohes PNG, Folien gestapelt).

- [ ] **Step 1: Entry schreiben** — `scripts/visual-smoke-entry.ts`:

```ts
// Browser-IIFE: von scripts/visual-smoke.mjs gebündelt und in eine Headless-Chrome-Seite
// injiziert. Rendert ein Deck durch die ECHTE Pipeline (parseDeck → renderDeckToContainer
// inkl. Fit-Messung, compose-center, Titel-Hoist) mit dem echten deckCss.
import { parseDeck } from "../src/core/slide-model";
import { mergeThemes, resolveTheme } from "../src/core/presets";
import { builtinThemeEntries, deckCss } from "../src/deck-css";
import { renderDeckToContainer } from "../src/render-dom";

declare global { interface Window { __DECK_MD__: string; __THEME__: string; __DONE__?: boolean } }

(async () => {
  const deck = parseDeck(window.__DECK_MD__);
  deck.directives.theme = window.__THEME__;
  const { map } = mergeThemes(builtinThemeEntries(), []);
  const entry = resolveTheme(map, deck.directives.theme);
  const style = document.createElement("style");
  style.textContent = deckCss(entry);
  document.head.appendChild(style);
  document.body.style.margin = "0";
  const container = document.createElement("div");
  document.body.appendChild(container);
  await renderDeckToContainer(document, container, deck, () => null, map);
  window.__DONE__ = true;
})();
```

- [ ] **Step 2: Runner schreiben** — `scripts/visual-smoke.mjs`:

```js
// Visual smoke: rendert ein Deck pro Theme in Headless Chrome und schreibt ein
// gestapeltes PNG nach _visual/. Usage:
//   node scripts/visual-smoke.mjs [deck.md] [theme ...]      (Default: demo-deck, alle Built-ins)
// Chrome-Pfad überschreibbar via $CHROME_BIN.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ALL_THEMES = ["shiro", "kuro", "sumi", "kairo", "kurenai"];
const [deckArg, ...themeArgs] = process.argv.slice(2);
const deckPath = deckArg ?? "docs/themes/demo-deck.md";
const themes = themeArgs.length ? themeArgs : ALL_THEMES;
const md = readFileSync(deckPath, "utf8");
// Folienzahl: Separator-Zeilen minus die zwei Frontmatter-Fences.
const seps = (md.match(/^---\s*$/gm) ?? []).length;
const slideCount = Math.max(1, seps - (md.trimStart().startsWith("---") ? 2 : 0) + 1);

const dir = mkdtempSync(join(tmpdir(), "sd-visual-"));
try {
  const entryOut = join(dir, "entry.js");
  await esbuild.build({
    entryPoints: ["scripts/visual-smoke-entry.ts"],
    bundle: true, format: "iife", target: "es2022", outfile: entryOut,
    loader: { ".css": "text" }, logLevel: "silent",
  });
  const js = readFileSync(entryOut, "utf8");
  mkdirSync("_visual", { recursive: true });
  for (const theme of themes) {
    const html = `<!doctype html><meta charset="utf-8"><body></body><script>window.__DECK_MD__=${JSON.stringify(md)};window.__THEME__=${JSON.stringify(theme)};</script><script>${js}</script>`;
    const htmlPath = join(dir, `${theme}.html`);
    writeFileSync(htmlPath, html);
    const out = resolve("_visual", `${theme}.png`);
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      `--window-size=1280,${720 * slideCount}`,
      "--virtual-time-budget=10000",
      `--screenshot=${out}`,
      `file://${resolve(htmlPath)}`,
    ], { stdio: "pipe" });
    console.log(`visual-smoke: ${theme} → _visual/${theme}.png`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

- [ ] **Step 3: `package.json`-Script + .gitignore** — `"visual-smoke": "node scripts/visual-smoke.mjs"` unter `scripts`; Zeile `_visual/` in `.gitignore`.

- [ ] **Step 4: Ausführen + sichten**

Run: `npm run visual-smoke`
Expected: 5 PNGs in `_visual/`. Die PNGs mit dem Read-Tool SICHTEN und gegen die Axiome prüfen: keine schwebenden Bullets, Eyebrow klein/gesperrt, ruhige Skala, gleichmäßiger Rhythmus. Zusätzlich das reale Referenz-Deck rendern:
`npm run visual-smoke -- "/Users/Shared/10_ObsidianVaults/10_Pallas/00_Inbox/CrewAI Quickstart — Deck.md" sumi`
und mit den Vorher-PNGs (`10_Pallas/Slide-Deck-Export/CrewAI Quickstart — Deck/`) vergleichen. Gefundene CSS-Fehler jetzt fixen (in structure/layouts), Tests nachziehen.

- [ ] **Step 5: Commit**

```bash
git add scripts/visual-smoke-entry.ts scripts/visual-smoke.mjs package.json .gitignore
git commit -m "test(visual): Headless-Chrome-Visual-Smoke über die echte Render-Pipeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Full Gate, Deploy & Pallas-Migration (Merge-Gate: Jays Smoke)

**Files:**
- keine Code-Änderungen (nur bei Findings aus dem Smoke)

- [ ] **Step 1: Voller Gate**

Run: `npm run lint && npm run build && npm test && npm run typecheck`
Expected: alles grün.

- [ ] **Step 2: Deploy nach Pallas**

Run: `npm run deploy` (braucht `$OBSIDIAN_PLUGIN_DIR`).

- [ ] **Step 3: Vault-Theme-Migration** — die fünf Nordstern-.css würden die Built-ins überschatten:

```bash
cd "/Users/Shared/10_ObsidianVaults/10_Pallas/Slide-Deck-Themes"
mkdir -p _backup && mv shiro.css kuro.css sumi.css kairo.css kurenai.css _backup/
```

- [ ] **Step 4: Smoke-Checkliste für Jay** (im Chat übergeben):
  1. Obsidian neu laden; Settings → Slide deck: Default-Theme zeigt „Shiro · 白 — rice paper"; Referenzliste zeigt die 5 Nordstern-Keys.
  2. `CrewAI Quickstart — Deck` (theme: sumi) öffnen → Preview: keine schwebenden Bullets (Folien 2/5/6), Eyebrow klein, Rhythmus ruhig. PNG-Export → mit `…— BASELINE`-Serien vergleichen.
  3. Ein Deck **neu generieren** (LLM) → prüft die Prompt-Härtung (keine Listen auf Hero-Folien).
  4. `demo-deck.md` mit kuro → Mermaid rendert DUNKEL (0.2.0-Altlast geschlossen), Code-Block liest sich (github-dark).
  5. Ein Alt-Deck mit `theme: dark` → rendert kommentarlos als kuro (Alias).
- [ ] **Step 5: Nach grünem Smoke** — `superpowers:finishing-a-development-branch` (Merge nach `main`, Release 0.5.0 auf Jays Zuruf). NICHT Teil dieses Plans.

---

## Self-Review-Protokoll (ausgefüllt beim Schreiben)

- **Spec-Coverage:** §3 Typo→Task 1+2 · §4 Spacing/Axiome→Task 1+2 · §5 Built-ins/Aliase/Registry→Task 3+4+5+6 · §6 Prompt→Task 7 · §7 Fehlerpfade→Task 4 (engine) · §8 Tests→alle Tasks + Task 9 · §9 Doku/Release→Task 8+10.
- **Platzhalter:** keine „TBD"; der shiro-Atmosphäre-Block ist eine präzise Verbatim-Kopieranweisung mit Quellpfad (bewusst: 4KB base64 nicht transkribieren).
- **Typ-Konsistenz:** `THEME_ALIASES`/`presetFor`/`resolveTheme`-Signaturen in Task 4 definiert und in Task 5/6 identisch konsumiert; Preset-Namen `shiroPreset` etc. konsistent Task 3→4.
