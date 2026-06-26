# CSS-Layouting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem einen hartkodierten `default`-Preset ein echtes Preset-System machen: 4 eingebaute Themes (Design-Token-Modell), 5 Per-Folie-Layouts via HTML-Kommentar-Direktiven, voller visueller Stack (Folien-CSS + hljs + Mermaid) + Custom-CSS-Snippet.

**Architecture:** Design-Tokens (CSS-Variablen) auf `.sd-slide` emittiert; geteiltes Struktur-/Layout-CSS referenziert nur `var(--sd-*)` und ist theme-unantastbar. Per-Folie-Direktiven (`<!-- layout: X -->`, `<!-- column -->`) werden im Pure-Core fence-aware geparst → `Slide.layout` + `Slide.regions`. `render-dom` rendert pro Region ein `.sd-region`-Div bei **einem** gemeinsamen Fit-Scale.

**Tech Stack:** TypeScript (strict), esbuild (`.css` text-loader), vitest + happy-dom, markdown-it, KaTeX, highlight.js, Mermaid, Obsidian Plugin API.

## Global Constraints

- **Core-Purität:** Dateien unter `src/core/**` dürfen **nie** `from "obsidian"`, `activeDocument`, `activeWindow`, `document.`, `window.` enthalten (`scripts/check-core-purity.mjs`, erster Schritt von `npm test`). Neue Core-Dateien: nur reine Strings/Logik.
- **`presetFor`/`layoutFor` total:** wirft nie, fällt auf `default` zurück.
- **`--sd-base` Single-Source:** genau **eine** `--sd-base`-Deklaration (in `presetTokensCss`, = `preset.baseFontPx`px); `structuralCss` deklariert es nicht; `render-dom` leitet `minScale` aus `preset.baseFontPx` ab.
- **deckCss in allen 3 Call-Sites identisch:** `preview-view.ts`, `render-dom.ts` Staging-`<style>`, `render-dom.ts` zurückgegebenes `css` — alle mit demselben `(presetId, customCss)`.
- **Fence-Awareness:** Slide-Splitter **und** `parseDirectives` ignorieren ```` ``` ````/`~~~`-Fences. (Eingerückte Code-Blocks sind bewusst **nicht** abgedeckt — Limitation dokumentieren.)
- **Klassennamen-Vertrag:** `.sd-slide`/`.sd-content`/`.sd-mermaid`/`.sd-embed`/`.sd-missing-embed`/`.sd-callout*` nur restylen, nicht umbenennen; neu: `.sd-region`, `.sd-layout-*`.
- **minAppVersion bleibt 1.8.7** — keine neue Obsidian-API.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt, **nur berührte Dateien stagen**, Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Gate pro Task:** `npm run lint && npm run build && npm test` muss grün bleiben (Reihenfolge der Tasks ist so gewählt, dass das gilt).
- **Branch:** `feat/css-layouting` (existiert; Spec liegt schon dort).

---

### Task 1: Layout-Metadaten + Layout-CSS

Reine Core-Datei: erwartete Regionenzahl je Layout (`layoutFor`, total) und das geteilte, theme-unabhängige Layout-CSS (`.sd-layout-*`, `.sd-region`).

**Files:**
- Create: `src/core/presets/layouts.css.ts`
- Test: `tests/core/layouts.test.ts`

**Interfaces:**
- Produces: `interface LayoutSpec { id: string; regions: number }`; `const LAYOUTS: Record<string, LayoutSpec>`; `function layoutFor(id: string): LayoutSpec`; `const LAYOUTS_CSS: string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/layouts.test.ts
import { describe, it, expect } from "vitest";
import { layoutFor, LAYOUTS, LAYOUTS_CSS } from "../../src/core/presets/layouts.css";

describe("layoutFor", () => {
  it("knows the five layouts plus default with correct region counts", () => {
    expect(layoutFor("default").regions).toBe(1);
    expect(layoutFor("title").regions).toBe(1);
    expect(layoutFor("section").regions).toBe(1);
    expect(layoutFor("quote").regions).toBe(1);
    expect(layoutFor("image-focus").regions).toBe(1);
    expect(layoutFor("two-column").regions).toBe(2);
  });
  it("is total — unknown id falls back to default", () => {
    expect(layoutFor("nope")).toEqual(LAYOUTS.default);
    expect(layoutFor("").id).toBe("default");
  });
});

describe("LAYOUTS_CSS", () => {
  it("defines region and layout selectors without theme colors", () => {
    expect(LAYOUTS_CSS).toContain(".sd-region");
    expect(LAYOUTS_CSS).toContain(".sd-layout-two-column");
    expect(LAYOUTS_CSS).toContain("grid-template-columns");
    expect(LAYOUTS_CSS).toContain(".sd-layout-title");
    // theme colors live in tokens, not here
    expect(LAYOUTS_CSS).not.toContain("#");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/layouts.test.ts`
Expected: FAIL (`Cannot find module '.../layouts.css'`).

- [ ] **Step 3: Write the implementation**

```ts
// src/core/presets/layouts.css.ts
export interface LayoutSpec { id: string; regions: number; }

export const LAYOUTS: Record<string, LayoutSpec> = {
  default: { id: "default", regions: 1 },
  title: { id: "title", regions: 1 },
  section: { id: "section", regions: 1 },
  quote: { id: "quote", regions: 1 },
  "image-focus": { id: "image-focus", regions: 1 },
  "two-column": { id: "two-column", regions: 2 },
};

/** TOTAL — unknown layout id falls back to default. */
export function layoutFor(id: string): LayoutSpec {
  return LAYOUTS[id] ?? LAYOUTS.default;
}

/** Shared, theme-independent layout CSS. References only tokens (no colors here). */
export const LAYOUTS_CSS = `
.sd-region{ min-width:0; min-height:0; }
.sd-layout-two-column .sd-content{ display:grid; grid-template-columns:1fr 1fr; gap:48px; align-content:start; }
.sd-layout-title .sd-content,
.sd-layout-section .sd-content,
.sd-layout-quote .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
.sd-layout-quote .sd-region{ font-size:1.4em; font-style:italic; max-width:80%; }
.sd-layout-section .sd-region{ font-size:1.2em; }
.sd-layout-image-focus .sd-content{ display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
.sd-layout-image-focus .sd-embed{ max-height:80%; }
`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/layouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/core/presets/layouts.css.ts tests/core/layouts.test.ts
git commit -m "feat(core): layout metadata + shared layout CSS (.sd-layout-*, .sd-region)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Preset-Registry + Tokens

`Preset`-Typ, 4 Token-Presets, totale `presetFor`, `presetTokensCss` (emittiert `.sd-slide{…}` mit `--sd-base` = `baseFontPx`), `assembleDeckCss`.

**Files:**
- Create: `src/core/presets/index.ts`, `src/core/presets/default.ts`, `src/core/presets/dark.ts`, `src/core/presets/serif.ts`, `src/core/presets/high-contrast.ts`
- Modify: `tests/core/presets.test.ts` (Rewrite — importiert künftig aus `../../src/core/presets`)

**Interfaces:**
- Consumes: nichts.
- Produces: `interface Preset { id: string; label: string; baseFontPx: number; tokens: Record<string,string>; hljs: string; mermaid: "default"|"dark"|"neutral"|"forest" }`; `const PRESETS: Record<string, Preset>`; `function presetFor(id: string): Preset`; `function presetTokensCss(preset: Preset): string`; `function assembleDeckCss(parts: string[]): string`.

- [ ] **Step 1: Write the failing test (rewrite presets.test.ts)**

```ts
// tests/core/presets.test.ts
import { describe, it, expect } from "vitest";
import { PRESETS, presetFor, presetTokensCss, assembleDeckCss } from "../../src/core/presets";

describe("presetFor", () => {
  it("ships the four built-in presets", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["dark", "default", "high-contrast", "serif"]);
  });
  it("is total — unknown id falls back to default", () => {
    expect(presetFor("nope").id).toBe("default");
  });
  it("every preset declares the required tokens", () => {
    for (const p of Object.values(PRESETS)) {
      for (const key of ["--sd-bg", "--sd-fg", "--sd-accent", "--sd-font", "--sd-code-bg"]) {
        expect(p.tokens[key], `${p.id} missing ${key}`).toBeDefined();
      }
      expect(p.baseFontPx).toBeGreaterThan(0);
    }
  });
});

describe("presetTokensCss", () => {
  it("emits a .sd-slide rule with --sd-base equal to baseFontPx, exactly once", () => {
    const css = presetTokensCss(presetFor("default"));
    expect(css).toContain(".sd-slide{");
    expect(css).toContain("--sd-base:28px");
    expect((css.match(/--sd-base:/g) ?? []).length).toBe(1);
    expect(css).toContain("--sd-bg:");
  });
});

describe("assembleDeckCss", () => {
  it("joins parts with newlines", () => {
    expect(assembleDeckCss(["a", "b"])).toBe("a\nb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: FAIL (`Cannot find module '.../core/presets'`).

- [ ] **Step 3: Write the four preset token files**

```ts
// src/core/presets/default.ts
import type { Preset } from "./index";
export const defaultPreset: Preset = {
  id: "default", label: "Default (light)", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#ffffff", "--sd-fg": "#16181d", "--sd-accent": "#3b6db5",
    "--sd-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-heading-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-code-bg": "#f4f6f8",
  },
  hljs: "github", mermaid: "default",
};
```

```ts
// src/core/presets/dark.ts
import type { Preset } from "./index";
export const darkPreset: Preset = {
  id: "dark", label: "Dark", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#1a1b26", "--sd-fg": "#c0caf5", "--sd-accent": "#7aa2f7",
    "--sd-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-heading-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-code-bg": "#16161e",
  },
  hljs: "github-dark", mermaid: "dark",
};
```

```ts
// src/core/presets/serif.ts
import type { Preset } from "./index";
export const serifPreset: Preset = {
  id: "serif", label: "Serif (academic)", baseFontPx: 28,
  tokens: {
    "--sd-bg": "#fbfaf7", "--sd-fg": "#1f1b16", "--sd-accent": "#7a5c1e",
    "--sd-font": "Georgia, 'Times New Roman', serif",
    "--sd-heading-font": "Georgia, 'Times New Roman', serif",
    "--sd-code-bg": "#f0ece4",
  },
  hljs: "github", mermaid: "neutral",
};
```

```ts
// src/core/presets/high-contrast.ts
import type { Preset } from "./index";
export const highContrastPreset: Preset = {
  id: "high-contrast", label: "High contrast", baseFontPx: 30,
  tokens: {
    "--sd-bg": "#ffffff", "--sd-fg": "#000000", "--sd-accent": "#0b3d91",
    "--sd-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-heading-font": "ui-sans-serif, system-ui, sans-serif",
    "--sd-code-bg": "#eeeeee",
  },
  hljs: "github", mermaid: "default",
};
```

- [ ] **Step 4: Write the registry (index.ts)**

```ts
// src/core/presets/index.ts
import { defaultPreset } from "./default";
import { darkPreset } from "./dark";
import { serifPreset } from "./serif";
import { highContrastPreset } from "./high-contrast";

export interface Preset {
  id: string;
  label: string;
  baseFontPx: number;
  tokens: Record<string, string>;
  hljs: string;
  mermaid: "default" | "dark" | "neutral" | "forest";
}

export const PRESETS: Record<string, Preset> = {
  default: defaultPreset,
  dark: darkPreset,
  serif: serifPreset,
  "high-contrast": highContrastPreset,
};

/** TOTAL — unknown id falls back to default. Never throws. */
export function presetFor(id: string): Preset {
  return PRESETS[id] ?? PRESETS.default;
}

/** Emit the preset's tokens as a .sd-slide rule. --sd-base is derived from baseFontPx
 *  here and NOWHERE else (single source for the legibility floor). */
export function presetTokensCss(preset: Preset): string {
  const decls = Object.entries(preset.tokens).map(([k, v]) => `${k}:${v};`).join(" ");
  return `.sd-slide{ ${decls} --sd-base:${preset.baseFontPx}px; }`;
}

export function assembleDeckCss(parts: string[]): string { return parts.join("\n"); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full gate + commit**

> Note: `tests/deck-css.test.ts` still imports from `core/presets/default.css` and will keep passing — `default.css.ts` is not removed until Task 8.

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/core/presets/index.ts src/core/presets/default.ts src/core/presets/dark.ts src/core/presets/serif.ts src/core/presets/high-contrast.ts tests/core/presets.test.ts
git commit -m "feat(core): preset registry with design tokens (4 themes) + presetTokensCss

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Strukturelles CSS (tokenisiert)

Das geteilte, theme-unabhängige Struktur-CSS — refactored aus dem alten `default.css.ts`-String: Tokens statt Hardcodes, **kein** `--sd-base`, `pre.hljs` nur Layout + `background:var(--sd-code-bg)` (keine `color`, kein `#0d1117`).

**Files:**
- Create: `src/core/presets/structure.css.ts`
- Test: `tests/core/structure-css.test.ts`

**Interfaces:**
- Produces: `const STRUCTURE_CSS: string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/structure-css.test.ts
import { describe, it, expect } from "vitest";
import { STRUCTURE_CSS } from "../../src/core/presets/structure.css";

describe("STRUCTURE_CSS", () => {
  it("references tokens and keeps fit-critical rules", () => {
    expect(STRUCTURE_CSS).toContain(".sd-content{ width:100%; height:100%; }");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/core/presets/structure.css.ts
/** Shared, theme-independent structural CSS. References only var(--sd-*) tokens.
 *  Holds the fit-critical invariants (fixed box, .sd-content fills the padded area).
 *  Declares NO --sd-base (single source is presetTokensCss). Code text colors are
 *  owned by the per-theme hljs stylesheet — only the wrapper background is tokenized. */
export const STRUCTURE_CSS = `
.sd-slide{ width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:64px; overflow:hidden; background:var(--sd-bg); color:var(--sd-fg); font-size:var(--sd-base);
  line-height:1.4; font-family:var(--sd-font); }
.sd-slide h1{ font-family:var(--sd-heading-font); font-size:2.2em; margin:0 0 .4em; }
.sd-slide h2{ font-family:var(--sd-heading-font); font-size:1.7em; margin:0 0 .4em; }
.sd-slide a{ color:var(--sd-accent); }
.sd-slide ul,.sd-slide ol{ margin:0; padding-left:1.2em; }
.sd-slide li{ margin:.25em 0; }
/* Content fills the slide's padded area so overflow is measurable (scrollHeight > clientHeight). */
.sd-content{ width:100%; height:100%; }
.sd-slide pre.hljs{ font-size:.8em; padding:.6em .8em; border-radius:8px; background:var(--sd-code-bg); overflow:hidden; }
.sd-embed{ max-width:100%; max-height:60%; object-fit:contain; }
.sd-mermaid svg{ max-width:100%; max-height:480px; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }
/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort */
.sd-callout{ border-left:6px solid #5b6470; background:#f4f6f8; padding:.5em .8em; border-radius:6px; margin:.4em 0; color:#16181d; }
.sd-callout-title{ display:flex; align-items:center; gap:.4em; font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:#3b6db5; } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:#b58a1e; } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:#b5443b; } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:#2e8b6f; } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:#3b6db5; } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }
`;
```

> Note: Callouts behalten bewusst feste Farben (eigene Akzentpalette, redundant mit Form+Label kodiert) — sie sind nicht an die Folien-Tokens gekoppelt. `color:#16181d` im Callout-Body hält den Text auch auf dunklen Themes lesbar (Callout-Hintergrund ist hell).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/structure-css.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/core/presets/structure.css.ts tests/core/structure-css.test.ts
git commit -m "feat(core): tokenized structural CSS (no --sd-base, code bg via token)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Direktiven-Parser (fence-aware)

Reiner Core-Parser: extrahiert `<!-- layout: X -->` (erste gewinnt, tolerant, lowercased), splittet an `<!-- column -->`, alles **außerhalb** von Code-Fences, entfernt erkannte Direktiv-Zeilen (ohne Leerzeilen einzufügen), warnt bei Mehrfach-/Malformed-Direktiven.

**Files:**
- Create: `src/core/directives.ts`
- Test: `tests/core/directives.test.ts`

**Interfaces:**
- Consumes: nichts (bewusst **kein** Import aus `engine`, um Task 4 entkoppelt + zyklenfrei zu halten).
- Produces: `interface DirectiveWarning { kind: string; message: string }`; `interface DirectiveResult { layout: string; regions: string[]; warnings: DirectiveWarning[] }`; `function parseDirectives(slideMarkdown: string): DirectiveResult`.

> Entkopplung: `DirectiveWarning.kind` ist bewusst `string` (kein Import aus `engine`). Task 6 mappt diese Strings auf `WarningKind` (`w.kind as WarningKind`). Die emittierten Werte sind exakt `"layout-multiple"` und `"directive-malformed"`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/directives.test.ts
import { describe, it, expect } from "vitest";
import { parseDirectives } from "../../src/core/directives";

describe("parseDirectives", () => {
  it("defaults to layout=default, one region, when no directives", () => {
    const r = parseDirectives("# Hello\n\ntext");
    expect(r.layout).toBe("default");
    expect(r.regions).toEqual(["# Hello\n\ntext"]);
    expect(r.warnings).toEqual([]);
  });

  it("extracts layout and lowercases the value", () => {
    const r = parseDirectives("<!-- layout: Two-Column -->\n\n## A");
    expect(r.layout).toBe("two-column");
    expect(r.regions).toEqual(["## A"]);
  });

  it("tolerates whitespace variants and uppercase keyword", () => {
    expect(parseDirectives("<!--layout:title-->\n# T").layout).toBe("title");
    expect(parseDirectives("<!--  LAYOUT :  section  -->\nx").layout).toBe("section");
  });

  it("splits regions at <!-- column --> and drops the markers", () => {
    const r = parseDirectives("<!-- layout: two-column -->\n## L\n\n<!-- column -->\n\n## R");
    expect(r.layout).toBe("two-column");
    expect(r.regions).toEqual(["## L", "## R"]);
  });

  it("first layout wins; extra layout directives warn", () => {
    const r = parseDirectives("<!-- layout: title -->\n<!-- layout: section -->\n# T");
    expect(r.layout).toBe("title");
    expect(r.warnings).toEqual([{ kind: "layout-multiple", message: expect.any(String) }]);
  });

  it("warns on a malformed directive-like comment and removes it (no leak)", () => {
    const r = parseDirectives("<!-- layuot: title -->\n# T");
    expect(r.layout).toBe("default");
    expect(r.regions).toEqual(["# T"]);
    expect(r.warnings).toEqual([{ kind: "directive-malformed", message: expect.any(String) }]);
  });

  it("ignores directives INSIDE a fenced code block (literal content)", () => {
    const src = "## A\n\n```\n<!-- column -->\n<!-- layout: title -->\n```\n";
    const r = parseDirectives(src);
    expect(r.layout).toBe("default");
    expect(r.regions).toHaveLength(1);
    expect(r.regions[0]).toContain("<!-- column -->");
    expect(r.regions[0]).toContain("<!-- layout: title -->");
  });

  it("a directive-only slide cleans to a single empty region", () => {
    const r = parseDirectives("<!-- layout: section -->");
    expect(r.layout).toBe("section");
    expect(r.regions).toEqual([""]);
  });

  it("dropping a directive does not insert a blank line", () => {
    const r = parseDirectives("# Title\n<!-- layout: title -->\nbody");
    expect(r.layout).toBe("title");
    expect(r.regions).toEqual(["# Title\nbody"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/directives.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/core/directives.ts
export interface DirectiveWarning { kind: string; message: string; }
export interface DirectiveResult { layout: string; regions: string[]; warnings: DirectiveWarning[]; }

const FENCE_RE = /^\s*(```|~~~)/;
const LAYOUT_RE = /^<!--\s*layout\s*:\s*([A-Za-z-]+)\s*-->$/i;
const COLUMN_RE = /^<!--\s*column\s*-->$/i;
const LAYOUT_LIKE = /^<!--\s*layout\b/i;
const COLUMN_LIKE = /^<!--\s*column\b/i;

/** Parse per-slide directives. Fence-aware: directives inside ```/~~~ blocks are literal.
 *  Indented code blocks are intentionally NOT fence-protected (rare; documented limitation). */
export function parseDirectives(slideMarkdown: string): DirectiveResult {
  const lines = slideMarkdown.split("\n");
  const warnings: DirectiveWarning[] = [];
  let layout = "default";
  let layoutSet = false;
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
      if (!layoutSet) { layout = lm[1].toLowerCase(); layoutSet = true; }
      else warnings.push({ kind: "layout-multiple", message: "Multiple layout directives — using the first." });
      continue;
    }
    if (LAYOUT_LIKE.test(trimmed) || COLUMN_LIKE.test(trimmed)) {
      warnings.push({ kind: "directive-malformed", message: `Unrecognized directive: ${trimmed}` });
      continue;
    }
    push(line);
  }

  // Trim each region's leading/trailing blank lines (left by author formatting around directives).
  const regionStrings = regions.map((r) => r.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""));
  return { layout, regions: regionStrings, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/directives.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/core/directives.ts tests/core/directives.test.ts
git commit -m "feat(core): fence-aware per-slide directive parser (layout + column regions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: slide-model verdrahten + fence-aware Splitter

`Slide` bekommt `layout`, `regions`, `directiveWarnings`. Der Splitter wird fence-aware (fixt den `---`-in-Fence-Bug). Leere-Folie-Prüfung läuft auf ROH-Text; danach `parseDirectives` pro erhaltener Folie.

**Files:**
- Modify: `src/core/slide-model.ts`
- Modify: `tests/core/slide-model.test.ts` (erweitern)

**Interfaces:**
- Consumes: `parseDirectives`, `DirectiveWarning` (Task 4).
- Produces: `interface Slide { index; markdown; speakerNotes?; startLine; layout: string; regions: string[]; directiveWarnings: DirectiveWarning[] }`.

- [ ] **Step 1: Write the failing tests (append to slide-model.test.ts)**

```ts
// append inside tests/core/slide-model.test.ts (add to existing imports: parseDeck already imported)
describe("parseDeck — directives & fences", () => {
  it("does NOT split on --- inside a fenced code block", () => {
    const src = "# A\n\n```yaml\nfoo: 1\n---\nbar: 2\n```\n";
    const deck = parseDeck(src);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].markdown).toContain("foo: 1");
    expect(deck.slides[0].markdown).toContain("bar: 2");
  });

  it("populates layout and regions per slide", () => {
    const src = "<!-- layout: two-column -->\n## L\n\n<!-- column -->\n\n## R\n";
    const deck = parseDeck(src);
    expect(deck.slides[0].layout).toBe("two-column");
    expect(deck.slides[0].regions).toEqual(["## L", "## R"]);
    expect(deck.slides[0].directiveWarnings).toEqual([]);
  });

  it("retains a directive-only slide (section divider)", () => {
    const src = "# A\n\n---\n\n<!-- layout: section -->\n\n---\n\n# B\n";
    const deck = parseDeck(src);
    expect(deck.slides.map((s) => s.layout)).toEqual(["default", "section", "default"]);
    expect(deck.slides[1].regions).toEqual([""]);
  });

  it("defaults layout/regions for plain slides", () => {
    const deck = parseDeck("# A");
    expect(deck.slides[0].layout).toBe("default");
    expect(deck.slides[0].regions).toEqual(["# A"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/slide-model.test.ts`
Expected: FAIL (`layout`/`regions` undefined; `---`-in-fence splits into 2).

- [ ] **Step 3: Modify slide-model.ts**

Replace the `Slide` interface and the `parseDeck` body with:

```ts
import { parseDirectives, type DirectiveWarning } from "./directives";

export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; }
export interface Slide {
  index: number; markdown: string; speakerNotes?: string; startLine: number;
  layout: string; regions: string[]; directiveWarnings: DirectiveWarning[];
}
export interface SlideDeck { directives: DeckDirectives; slides: Slide[]; }
```

Keep `DEFAULTS` and `parseFrontmatter` unchanged. Replace `parseDeck` with:

```ts
const FENCE_RE = /^\s*(```|~~~)/;

export function parseDeck(source: string, defaults?: Partial<DeckDirectives>): SlideDeck {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const base: DeckDirectives = { ...DEFAULTS, ...defaults };
  const { directives, bodyStart } = parseFrontmatter(lines, base);
  const slides: Slide[] = [];
  let buf: string[] = [];
  let slideStart: number | null = null;
  let inFence = false;
  let fenceMarker = "";
  const flush = () => {
    const md = buf.join("\n");
    if (md.trim().length > 0 && slideStart !== null) {
      const d = parseDirectives(md);
      slides.push({
        index: slides.length, markdown: d.regions.join("\n"), startLine: slideStart,
        layout: d.layout, regions: d.regions, directiveWarnings: d.warnings,
      });
    }
  };
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const fm = FENCE_RE.exec(line);
    if (fm) {
      const marker = fm[1];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ""; }
      if (slideStart === null && line.trim() !== "") slideStart = i;
      buf.push(line);
      continue;
    }
    if (!inFence && line.trim() === "---") { flush(); buf = []; slideStart = null; }
    else {
      if (slideStart === null && line.trim() !== "") slideStart = i;
      buf.push(line);
    }
  }
  flush();
  return { directives, slides };
}
```

> The empty-slide guard (`md.trim().length > 0`) runs on the RAW block, BEFORE `parseDirectives` — so a directive-only slide (raw non-empty) is kept. `markdown` is the cleaned regions joined (so the adapter's `![[…]]` prescan still works across regions).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/slide-model.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 5: Run full gate + commit**

> `render-dom.ts` still calls `renderMarkdown(slide.markdown)` and the old `collectWarnings(...)`; both still compile (Slide gained fields, didn't lose any). Gate green.

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/core/slide-model.ts tests/core/slide-model.test.ts
git commit -m "feat(core): fence-aware slide splitter + per-slide layout/regions (fix ---in-fence)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Engine-Warnungen + render-dom Call-Site

Neue `WarningKind`s; `collectWarnings` neue Signatur `(slide, renderWarnings, fit)` mit Direktiv-Warnungen, unbekanntes Layout, generischer Regionenzahl-Check. `render-dom`-Aufrufstelle minimal angepasst (noch Single-Region).

**Files:**
- Modify: `src/core/constraints/engine.ts`
- Modify: `src/render-dom.ts` (nur die `collectWarnings`-Aufrufstelle)
- Modify: `tests/core/constraints.test.ts` (collectWarnings-Teil neu)

**Interfaces:**
- Consumes: `Slide` (Task 5), `layoutFor`/`LAYOUTS` (Task 1), `RenderedSlide` (`md2html`), `FitResult`.
- Produces: `type WarningKind` (erweitert); `type SlideWarning = Omit<Warning,"slideIndex">`; `function collectWarnings(slide: Slide, renderWarnings: SlideWarning[], fit: FitResult): Warning[]`.

- [ ] **Step 1: Write the failing test (rewrite the collectWarnings describe-block)**

```ts
// tests/core/constraints.test.ts — replace the "collectWarnings" describe block; keep the
// "authoring contract" block as-is for now (extended in Task 10).
import { describe, it, expect } from "vitest";
import { collectWarnings } from "../../src/core/constraints/engine";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";
import type { Slide } from "../../src/core/slide-model";

const slide = (over: Partial<Slide>): Slide => ({
  index: 2, markdown: "", startLine: 40, layout: "default", regions: [""], directiveWarnings: [], ...over,
});

describe("collectWarnings", () => {
  it("tags slideIndex/sourceLine, includes render + overflow warnings", () => {
    const w = collectWarnings(slide({}), [{ kind: "missing-embed", message: "x" }], { scale: 0.5, overflow: true });
    expect(w).toContainEqual({ slideIndex: 2, kind: "missing-embed", message: "x", sourceLine: 40 });
    expect(w).toContainEqual({ slideIndex: 2, kind: "overflow", message: expect.any(String), sourceLine: 40 });
  });
  it("surfaces parse-time directive warnings", () => {
    const w = collectWarnings(slide({ directiveWarnings: [{ kind: "layout-multiple", message: "m" }] }), [], { scale: 1, overflow: false });
    expect(w).toContainEqual({ slideIndex: 2, kind: "layout-multiple", message: "m", sourceLine: 40 });
  });
  it("warns on unknown layout", () => {
    const w = collectWarnings(slide({ layout: "bogus" }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "layout-unknown")).toBe(true);
  });
  it("warns on region-count mismatch (column in a 1-region layout)", () => {
    const w = collectWarnings(slide({ layout: "title", regions: ["a", "b"] }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "region-count")).toBe(true);
  });
  it("no region warning when count matches", () => {
    const w = collectWarnings(slide({ layout: "two-column", regions: ["a", "b"] }), [], { scale: 1, overflow: false });
    expect(w.some((x) => x.kind === "region-count")).toBe(false);
  });
});

describe("authoring contract", () => {
  it("exposes geometry, floor and supported features", () => {
    const c = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });
    expect(c.geometry).toEqual({ width: 1280, height: 720 });
    expect(c.minFontPx).toBe(24);
    expect(c.slideSeparator).toBe("---");
    expect(contractToPrompt(c)).toContain("1280");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: FAIL (signature mismatch / new kinds).

- [ ] **Step 3: Rewrite engine.ts**

```ts
// src/core/constraints/engine.ts
import type { FitResult } from "../layout/fit";
import type { Slide } from "../slide-model";
import { LAYOUTS, layoutFor } from "../presets/layouts.css";

export type WarningKind =
  | "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast"
  | "layout-unknown" | "layout-multiple" | "directive-malformed" | "region-count";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }
export type SlideWarning = Omit<Warning, "slideIndex">;

export function collectWarnings(slide: Slide, renderWarnings: SlideWarning[], fit: FitResult): Warning[] {
  const out: Warning[] = [];
  const at = (kind: WarningKind, message: string) =>
    out.push({ slideIndex: slide.index, kind, message, sourceLine: slide.startLine });

  for (const w of slide.directiveWarnings) at(w.kind as WarningKind, w.message);
  for (const w of renderWarnings) out.push({ ...w, slideIndex: slide.index, sourceLine: slide.startLine });

  if (slide.layout !== "default" && !(slide.layout in LAYOUTS)) {
    at("layout-unknown", `Unknown layout "${slide.layout}" — using default.`);
  }
  const expected = layoutFor(slide.layout).regions;
  if (slide.regions.length !== expected) {
    at("region-count", `Layout ${slide.layout} expects ${expected} region(s), found ${slide.regions.length}.`);
  }
  if (fit.overflow) {
    at("overflow", "Content overflows at the legibility floor — condense this slide.");
  }
  return out;
}
```

- [ ] **Step 4: Update the render-dom call-site (minimal — still single-region)**

In `src/render-dom.ts`, the existing line:

```ts
    const slideWarnings = collectWarnings(slide.index, rendered, fit, slide.startLine);
```

becomes:

```ts
    const slideWarnings = collectWarnings(slide, rendered.warnings, fit);
```

(`rendered` is still `renderMarkdown({ markdown: slide.markdown, resolveEmbed })`. No other render-dom change in this task.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green (build proves render-dom compiles with the new signature).

```bash
git add src/core/constraints/engine.ts src/render-dom.ts tests/core/constraints.test.ts
git commit -m "feat(core): layout/region/directive warnings; slide-based collectWarnings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: render-dom — Regionen + Preset-Threading + Layout-Klasse

`render-dom` rendert pro Region ein `.sd-region`-Div (ein gemeinsamer Fit-Scale), setzt `sd-layout-${layout}`, löst das Preset für `baseFontPx` (minScale) und `mermaid`-Theme auf, merged Region-Warnungen.

**Files:**
- Modify: `src/render-dom.ts`

**Interfaces:**
- Consumes: `presetFor` (Task 2), `collectWarnings`/`SlideWarning` (Task 6), `renderMarkdown`, `computeFit`, `geometryFor`.
- Produces: unveränderte Signaturen `renderDeckToContainer(doc, container, deck, resolveEmbed)`, `buildSelfContainedDeckHtml(doc, deck, resolveEmbed)` (customCss-Param wird in Task 11 ergänzt — hier noch nicht).

> **Kein Unit-Test in dieser Task.** `renderDeckToContainer` ist DOM-gebunden (`container.empty/createDiv`, `inner.innerHTML`, `inner.scrollWidth/clientWidth`, `box.addClass`, `renderMermaidSlots`). Die vitest-Umgebung ist `node` (kein DOM) und der obsidian-Mock ist minimal — `render-dom` ist deshalb (wie im MVP) **nicht** unit-testbar. Verifikation hier: `tsc`/`build` grün + bestehende Tests grün; das DOM-Verhalten (Regionen, Layout-Klasse, Fit) deckt der **manuelle Smoke** (deferred) und — für den Pure-Pfad — der **Bundle-Smoke** (Task 12) ab. Die reine Entscheidungslogik (Layout-Klasse, Regionenzahl) ist bereits in Core getestet (Tasks 5/6).

- [ ] **Step 1: Rewrite the render loop in render-dom.ts**

Replace the module-level mermaid init and the body of `renderDeckToContainer` so it: resolves the preset, sets the mermaid theme, builds regions, merges warnings. New imports at top:

```ts
import { presetFor } from "./core/presets";
import { collectWarnings, type Warning, type SlideWarning } from "./core/constraints/engine";
```

(remove the old `collectWarnings` import line; keep the rest.)

Remove the module-level `mermaid.initialize({ startOnLoad: false, theme: "default" });` — initialization moves into the function (theme is per-deck).

New `renderDeckToContainer`:

```ts
export async function renderDeckToContainer(
  doc: Document, container: HTMLElement, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
): Promise<Warning[]> {
  const geo = geometryFor(deck.directives.aspect);
  const preset = presetFor(deck.directives.theme);
  const minScale = deck.directives.minFontPx / preset.baseFontPx;
  mermaid.initialize({ startOnLoad: false, theme: preset.mermaid });
  const warnings: Warning[] = [];
  void doc; // doc used by buildSelfContainedDeckHtml — kept for API symmetry
  container.empty();
  for (const slide of deck.slides) {
    const box = container.createDiv({ cls: `sd-slide sd-layout-${slide.layout}` });
    box.style.setProperty("--sd-w", `${geo.width}px`);
    box.style.setProperty("--sd-h", `${geo.height}px`);
    const inner = box.createDiv({ cls: "sd-content" });
    const renderWarnings: SlideWarning[] = [];
    for (const region of slide.regions) {
      const r = renderMarkdown({ markdown: region, resolveEmbed });
      const regionEl = inner.createDiv({ cls: "sd-region" });
      regionEl.innerHTML = r.html; // self-generated, controlled core HTML
      renderWarnings.push(...r.warnings);
    }
    await renderMermaidSlots(inner, slide.index, warnings);
    // Measure the whole padded content area (one shared scale for all regions).
    const fit = computeFit(
      { contentWidth: inner.scrollWidth, contentHeight: inner.scrollHeight },
      { width: inner.clientWidth, height: inner.clientHeight },
      minScale,
    );
    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${fit.scale})`;
    const slideWarnings = collectWarnings(slide, renderWarnings, fit);
    if (slideWarnings.some((w) => w.kind === "overflow" || w.kind === "belowFloor")) box.addClass("sd-slide-warn");
    warnings.push(...slideWarnings);
  }
  return warnings;
}
```

(`mermaid.render` id uniqueness via `mermaidSeq` is unchanged. `buildSelfContainedDeckHtml` stays as-is for now.)

- [ ] **Step 2: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green (`tsc` proves the new `presetFor`/`collectWarnings` usage + region loop compile; existing vitest suite unaffected — no test imports `render-dom`). DOM behavior is verified in the manual smoke.

```bash
git add src/render-dom.ts
git commit -m "feat(render): per-region rendering, layout class, preset-driven minScale + mermaid theme

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: deck-css umbauen + altes default.css.ts entfernen

`deckCss(presetId, customCss?)` baut: katex + per-Theme-hljs + structuralCss + layoutCss + presetTokensCss + customCss. Die `.css`-Imports (katex + 2 hljs-Sheets) leben hier (src/, esbuild-text-loader), **nicht** im Core.

**Files:**
- Modify: `src/deck-css.ts`
- Delete: `src/core/presets/default.css.ts`
- Modify: `tests/deck-css.test.ts` (Rewrite)

**Interfaces:**
- Consumes: `presetFor`, `presetTokensCss`, `assembleDeckCss` (Task 2), `STRUCTURE_CSS` (Task 3), `LAYOUTS_CSS` (Task 1).
- Produces: `function deckCss(presetId: string, customCss?: string): string`.

- [ ] **Step 1: Rewrite the test**

```ts
// tests/deck-css.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleDeckCss, presetFor, presetTokensCss } from "../src/core/presets";
import { STRUCTURE_CSS } from "../src/core/presets/structure.css";
import { LAYOUTS_CSS } from "../src/core/presets/layouts.css";

// Mirror deckCss assembly using filesystem-read CSS (vitest cannot import .css via the
// esbuild text-loader; the real deckCss() is exercised end-to-end in bundle-smoke).
describe("deck css assembly", () => {
  it("bundles katex, hljs, structure, layouts, tokens in order", () => {
    const katex = readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
    const hljs = readFileSync("node_modules/highlight.js/styles/github.css", "utf8");
    const css = assembleDeckCss([katex, hljs, STRUCTURE_CSS, LAYOUTS_CSS, presetTokensCss(presetFor("default")), ""]);
    expect(css).toContain(".katex");
    expect(css).toContain(".hljs");
    expect(css).toContain(".sd-content");
    expect(css).toContain(".sd-layout-two-column");
    expect(css).toContain("--sd-base:28px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/deck-css.test.ts`
Expected: FAIL (imports `core/presets/default.css` removed / new imports missing until Step 3).

- [ ] **Step 3: Rewrite deck-css.ts and delete default.css.ts**

```ts
// src/deck-css.ts
import katexCss from "katex/dist/katex.min.css";
import githubCss from "highlight.js/styles/github.css";
import githubDarkCss from "highlight.js/styles/github-dark.css";
import { presetFor, presetTokensCss, assembleDeckCss } from "./core/presets";
import { STRUCTURE_CSS } from "./core/presets/structure.css";
import { LAYOUTS_CSS } from "./core/presets/layouts.css";

const HLJS: Record<string, string> = { github: githubCss, "github-dark": githubDarkCss };

/** Full self-contained CSS for a rendered deck: math + per-theme code theme +
 *  structural CSS + layout CSS + preset tokens + optional user custom CSS (last). */
export function deckCss(presetId: string, customCss = ""): string {
  const preset = presetFor(presetId);
  const hljs = HLJS[preset.hljs] ?? HLJS["github-dark"];
  return assembleDeckCss([katexCss, hljs, STRUCTURE_CSS, LAYOUTS_CSS, presetTokensCss(preset), customCss]);
}
```

```bash
git rm src/core/presets/default.css.ts
```

> All `deckCss(theme)` callers still compile: `customCss` is optional, `presetId` is the same first arg. No consumer change needed in this task.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/deck-css.test.ts && npx tsc --noEmit`
Expected: PASS / no type errors (proves nothing else imported `default.css`).

- [ ] **Step 5: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/deck-css.ts tests/deck-css.test.ts
git commit -m "feat: deckCss(presetId, customCss) with per-theme hljs + token assembly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Settings — Theme-Dropdown + Custom-CSS + Migration

`defaultTheme` wird Dropdown über `PRESETS`-Labels; neues `customCss`-Feld; unbekannter persistierter `defaultTheme` wird beim Anzeigen auf `default` koerziert. Neue i18n-Strings.

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/i18n.ts`
- Modify: `tests/i18n.test.ts` (falls es Schlüssel-Vollständigkeit prüft — sonst neue Keys nur ergänzen)

**Interfaces:**
- Consumes: `PRESETS` (Task 2), `t` (i18n).
- Produces: `interface SlideDeckSettings { defaultTheme: string; minFontPx: number; imageScale: number; customCss: string }`; `DEFAULT_SETTINGS` mit `customCss: ""`.

- [ ] **Step 1: Add i18n strings**

In `src/i18n.ts`, add to **both** `EN` and `DE` dicts (EN values shown; DE in parentheses):

```ts
// EN
"settings.theme.name": "Default theme",          // (replace existing "Default preset")
"settings.customCss.name": "Custom CSS",
"settings.customCss.desc": "Appended to the selected theme. Target .sd-slide{ --sd-token:… } to override design tokens.",
// DE
"settings.theme.name": "Standard-Theme",
"settings.customCss.name": "Eigenes CSS",
"settings.customCss.desc": "Wird ans gewählte Theme angehängt. Adressiere .sd-slide{ --sd-token:… }, um Design-Tokens zu überschreiben.",
```

(Keep `settings.theme.desc` as-is.)

- [ ] **Step 2: Rewrite the theme Setting + add customCss in settings.ts**

```ts
// src/settings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { PRESETS } from "./core/presets";

export interface SlideDeckSettings { defaultTheme: string; minFontPx: number; imageScale: number; customCss: string; }
export const DEFAULT_SETTINGS: SlideDeckSettings = { defaultTheme: "default", minFontPx: 24, imageScale: 2, customCss: "" };

export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.heading")).setHeading();

    // Coerce an unknown persisted theme to "default" so the dropdown always has a valid value.
    if (!(this.plugin.settings.defaultTheme in PRESETS)) this.plugin.settings.defaultTheme = "default";

    new Setting(containerEl).setName(t("settings.theme.name")).setDesc(t("settings.theme.desc"))
      .addDropdown((c) => {
        for (const p of Object.values(PRESETS)) c.addOption(p.id, p.label);
        c.setValue(this.plugin.settings.defaultTheme)
          .onChange(async (v) => { this.plugin.settings.defaultTheme = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl).setName(t("settings.minFont.name")).setDesc(t("settings.minFont.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.minFontPx)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.minFontPx = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.imageScale.name")).setDesc(t("settings.imageScale.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.imageScale)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.imageScale = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.customCss.name")).setDesc(t("settings.customCss.desc"))
      .addTextArea((c) => c.setValue(this.plugin.settings.customCss).onChange(async (v) => { this.plugin.settings.customCss = v; await this.plugin.saveSettings(); }));
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/i18n.test.ts`
Expected: PASS (i18n.test only checks pickLang/interpolation/fallback — no key-parity or value assertions, so new/changed keys are safe).

> Note: `settings.ts` is imported by no test (only by `main.ts`, also untested), so the obsidian mock not having `addDropdown`/`addTextArea` does not affect the gate. If a settings/main test is ever added, extend `tests/__mocks__/obsidian.ts`'s `Setting` with chainable `addDropdown()`/`addTextArea()` stubs.

- [ ] **Step 4: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/settings.ts src/i18n.ts
git commit -m "feat(settings): theme dropdown + custom CSS field + unknown-theme migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Authoring-Contract — Layouts + Themes

`AuthoringContract` führt `layouts` + `themes` auf (spec-only Metadaten, kein Runtime-Consumer in dieser Iteration). Test in `constraints.test.ts`.

**Files:**
- Modify: `src/core/constraints/contract.ts`
- Modify: `tests/core/constraints.test.ts` (Contract-Block erweitern)

**Interfaces:**
- Consumes: `PRESETS` (Task 2), `LAYOUTS` (Task 1).
- Produces: `AuthoringContract` mit `layouts: string[]`, `themes: string[]`.

- [ ] **Step 1: Extend the contract test**

In `tests/core/constraints.test.ts`, extend the "authoring contract" block:

```ts
  it("lists available layouts and themes", () => {
    const c = getAuthoringContract({ theme: "default", aspect: "16:9", minFontPx: 24 });
    expect(c.themes).toContain("dark");
    expect(c.layouts).toContain("two-column");
    expect(contractToPrompt(c)).toContain("two-column");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: FAIL (`themes`/`layouts` undefined).

- [ ] **Step 3: Modify contract.ts**

```ts
// src/core/constraints/contract.ts
import type { DeckDirectives } from "../slide-model";
import { geometryFor, type SlideGeometry } from "../geometry";
import { PRESETS } from "../presets";
import { LAYOUTS } from "../presets/layouts.css";

export interface AuthoringContract {
  geometry: SlideGeometry;
  minFontPx: number;
  aspect: string;
  slideSeparator: "---";
  features: string[];
  unsupported: string[];
  layouts: string[];
  themes: string[];
}

export function getAuthoringContract(d: DeckDirectives): AuthoringContract {
  return {
    geometry: geometryFor(d.aspect),
    minFontPx: d.minFontPx,
    aspect: d.aspect,
    slideSeparator: "---",
    features: ["headings", "lists", "images (![[name]])", "inline & block math ($…$)", "fenced code", "callouts (> [!type])", "mermaid"],
    unsupported: ["dataview", "runtime queries", "transclusion of other notes"],
    layouts: Object.keys(LAYOUTS),
    themes: Object.keys(PRESETS),
  };
}

export function contractToPrompt(c: AuthoringContract): string {
  return [
    `Build a slide deck as Markdown. Separate slides with a line containing only "${c.slideSeparator}".`,
    `Each slide must fit a fixed ${c.geometry.width}x${c.geometry.height}px canvas with body text no smaller than ${c.minFontPx}px.`,
    `Keep slides sparse: few bullets, short lines. Every element must have a clear function.`,
    `Per-slide layout via "<!-- layout: NAME -->" (split columns with "<!-- column -->"). Available: ${c.layouts.join(", ")}.`,
    `Deck theme via frontmatter "theme:". Available: ${c.themes.join(", ")}.`,
    `Supported: ${c.features.join(", ")}.`,
    `Not supported (do not use): ${c.unsupported.join(", ")}.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/core/constraints/contract.ts tests/core/constraints.test.ts
git commit -m "feat(core): authoring contract advertises layouts + themes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Custom-CSS bis in den Export durchreichen

`buildSelfContainedDeckHtml` und `exportPdf`/`exportImages` bekommen einen `customCss`-Parameter; alle `deckCss`-Aufrufe übergeben ihn; Preview + Commands speisen `plugin.settings.customCss`.

**Files:**
- Modify: `src/render-dom.ts` (`buildSelfContainedDeckHtml`)
- Modify: `src/export.ts`
- Modify: `src/preview-view.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `deckCss(presetId, customCss)` (Task 8), `settings.customCss` (Task 9).
- Produces: `buildSelfContainedDeckHtml(doc, deck, resolveEmbed, customCss?)`; `exportPdf(app, doc, win, file, defaults?, customCss?)`; `exportImages(app, doc, win, file, defaults?, scale?, customCss?)`.

- [ ] **Step 1: Thread customCss through buildSelfContainedDeckHtml (render-dom.ts)**

```ts
export async function buildSelfContainedDeckHtml(
  doc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null, customCss = "",
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const staging = doc.createElement("div");
  staging.style.position = "fixed"; staging.style.left = "-99999px"; staging.style.top = "0";
  const style = doc.createElement("style");
  style.textContent = deckCss(deck.directives.theme, customCss);
  staging.appendChild(style);
  const host = doc.createElement("div");
  staging.appendChild(host);
  doc.body.appendChild(staging);
  try {
    const warnings = await renderDeckToContainer(doc, host, deck, resolveEmbed);
    const slidesHtml = Array.from(host.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css: deckCss(deck.directives.theme, customCss), warnings };
  } finally {
    staging.remove();
  }
}
```

- [ ] **Step 2: Add customCss to export.ts signatures**

`exportPdf`: change signature and the `buildSelfContainedDeckHtml` call:

```ts
export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, defaults?: Partial<DeckDirectives>, customCss = ""): Promise<void> {
  // …
  const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed, customCss);
  // … rest unchanged
}
```

`exportImages`: same:

```ts
export async function exportImages(app: App, doc: Document, win: Window, file: TFile | null, defaults?: Partial<DeckDirectives>, scale = 2, customCss = ""): Promise<void> {
  // …
  const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed, customCss);
  // … rest unchanged
}
```

- [ ] **Step 3: Feed customCss from preview-view.ts**

In `refresh()`, the deckCss line:

```ts
      this.styleEl!.textContent = deckCss(loaded.deck.directives.theme, this.plugin.settings.customCss);
```

In `buildToolbar()`, the export button handlers:

```ts
    mkBtn("file-text", t("toolbar.exportPdf"), () => void exportPdf(this.app, activeDoc(), activeWin(), this.currentFile, defaults(), this.plugin.settings.customCss));
    mkBtn("image", t("toolbar.exportImages"), () => void exportImages(this.app, activeDoc(), activeWin(), this.currentFile, defaults(), this.plugin.settings.imageScale, this.plugin.settings.customCss));
```

- [ ] **Step 4: Feed customCss from main.ts commands**

```ts
    this.addCommand({
      id: "export-pdf",
      name: t("cmd.exportPdf"),
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.customCss),
    });
    this.addCommand({
      id: "export-images",
      name: t("cmd.exportImages"),
      callback: () => void exportImages(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.imageScale, this.settings.customCss),
    });
```

- [ ] **Step 5: Run full gate + commit**

> No new unit test (DOM/Obsidian-bound wiring; covered by the manual smoke and the bundle-smoke's deckCss-with-customCss assembly in Task 12). `tsc` proves the threading compiles.

Run: `npm run lint && npm run build && npm test`
Expected: all green.

```bash
git add src/render-dom.ts src/export.ts src/preview-view.ts src/main.ts
git commit -m "feat: thread custom CSS from settings into preview + export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Bundle-Smoke erweitern + esbuild-CSS-Loader + Doku

Der Bundle-Smoke prüft den **in Node lauffähigen Pure-Pfad** durch den echten Bundle: `parseDeck`+`parseDirectives`, `deckCss`-Assembly über **jedes Theme** (inkl. Custom-CSS), `presetFor`/`layoutFor`-Totalität. Dafür braucht der Smoke-Build den `.css`-Text-Loader.

**Files:**
- Modify: `scripts/bundle-smoke.mjs` (esbuild `loader`)
- Modify: `scripts/bundle-smoke-entry.ts` (deckCss/parseDeck-Abdeckung)
- Modify: `AGENTS.md` (Doku)

- [ ] **Step 1: Add the .css text loader to the smoke build**

In `scripts/bundle-smoke.mjs`, the `esbuild.build({...})` options gain a loader (deck-css.ts imports `.css`):

```js
  await esbuild.build({
    entryPoints: ["scripts/bundle-smoke-entry.ts"],
    bundle: true,
    format: "cjs",
    target: "es2022",
    outfile: out,
    loader: { ".css": "text" },
    logLevel: "silent",
  });
```

- [ ] **Step 2: Extend the smoke entry**

Append to `scripts/bundle-smoke-entry.ts` (keep the existing renderMarkdown check):

```ts
import { parseDeck } from "../src/core/slide-model";
import { deckCss } from "../src/deck-css";
import { presetFor, PRESETS } from "../src/core/presets";
import { layoutFor } from "../src/core/presets/layouts.css";

// 1) Directive parsing through the real bundle
const deck = parseDeck("<!-- layout: two-column -->\n## L\n\n<!-- column -->\n\n## R\n");
if (deck.slides[0].layout !== "two-column" || deck.slides[0].regions.length !== 2) {
  console.error("bundle-smoke FAILED — directive parsing wrong:", JSON.stringify(deck.slides[0]));
  process.exit(3);
}

// 2) deckCss assembles for EVERY theme (+ custom CSS appended last), through the real .css text-loader
for (const id of Object.keys(PRESETS)) {
  const css = deckCss(id, ".sd-slide{ --sd-accent:#e63946 }");
  for (const needle of [".katex", ".hljs", ".sd-content", ".sd-layout-two-column", "--sd-base:", "#e63946"]) {
    if (!css.includes(needle)) {
      console.error(`bundle-smoke FAILED — theme "${id}" CSS missing: ${needle}`);
      process.exit(4);
    }
  }
}

// 3) presetFor/layoutFor totality
if (presetFor("nope").id !== "default" || layoutFor("nope").id !== "default") {
  console.error("bundle-smoke FAILED — presetFor/layoutFor not total");
  process.exit(5);
}

console.log("bundle-smoke OK — directives, every-theme deckCss, and totality work in the real bundle");
```

- [ ] **Step 3: Run the smoke directly**

Run: `node scripts/bundle-smoke.mjs`
Expected: prints both OK lines, exit 0.

- [ ] **Step 4: Update AGENTS.md**

In `AGENTS.md`, under the architecture file map, document the new preset system and directives. Add (under the `src/core/` section, after `presets/`):

```
  directives.ts     parseDirectives() — fence-aware Per-Folie-Direktiven (<!-- layout -->,
                    <!-- column -->) → { layout, regions, warnings }.
  presets/
    index.ts        Preset-Typ + PRESETS-Registry; presetFor() (total); presetTokensCss();
                    assembleDeckCss().
    default.ts · dark.ts · serif.ts · high-contrast.ts   je ein Preset (Token-Block + hljs/mermaid).
    structure.css.ts  geteiltes, theme-unabhängiges Struktur-CSS (var(--sd-*); kein --sd-base).
    layouts.css.ts    LAYOUTS/layoutFor() + geteiltes Layout-CSS (.sd-layout-*, .sd-region).
```

And update the `npm test` line note: it now also smoke-tests deckCss over every theme. Update the test-count mention if present (vitest count grew). Add a one-line gotcha: *„Themes setzen nur Tokens; Struktur/Layout-CSS ist theme-unantastbar (fit-kritisch). `--sd-base` lebt einzig in `presetTokensCss`."*

- [ ] **Step 5: Run full gate + commit**

Run: `npm run lint && npm run build && npm test`
Expected: all green (purity + extended bundle-smoke + all vitest).

```bash
git add scripts/bundle-smoke.mjs scripts/bundle-smoke-entry.ts AGENTS.md
git commit -m "test+docs: bundle-smoke over every theme + directives; document preset system

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Nach dem Plan (separat, deferred an User)

- **Manueller Smoke:** `npm run deploy` (Pallas), `slide-deck-demo.md` um die 5 Layouts × 4 Themes × Custom-CSS erweitern; Preview/PDF/PNG sichten — die volle DOM-/Fit-/Overflow-/Mermaid-Theme-/Regionen-Matrix lebt hier.
- **Branch-Abschluss:** `feat/css-layouting` → `main` (siehe `superpowers:finishing-a-development-branch`).
- **Bekannte Limitation (dokumentiert):** Fence-Awareness deckt ```` ``` ````/`~~~` ab, **nicht** eingerückte Code-Blocks. Per-Direktiven-`sourceLine` verankert an `slide.startLine`.
