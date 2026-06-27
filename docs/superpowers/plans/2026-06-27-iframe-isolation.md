# iframe-Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render slides inside isolated `sandbox="allow-same-origin"` iframes so the active Obsidian theme can no longer leak into preview, PNG, or PDF.

**Architecture:** One producer (`buildIsolatedDeck`) renders + measures the deck inside a single off-screen, theme-isolated staging iframe and serializes it once to `{ slidesHtml[], css, warnings }`. Three consumers (preview, PNG, PDF) each render that identical artifact inside their own isolated iframe. A new `src/iframe-host.ts` owns iframe creation + lifecycle; `src/chrome-css.ts` holds the preview/print CSS that used to live in the themed parent. `renderDeckToContainer` is made realm-safe (native DOM only) so it can run against an iframe `contentDocument`.

**Tech Stack:** TypeScript (strict, `noImplicitAny`) · esbuild · vitest (node-env, no DOM) · Obsidian Plugin API · markdown-it · KaTeX · highlight.js · Mermaid · html2canvas.

## Global Constraints

- **Pure-Core invariant:** `src/core/**` MUST NOT import `obsidian` or touch DOM/`document`/`window`. Enforced by `scripts/check-core-purity.mjs` (first step of `npm test`). This plan touches **no** `src/core/**` files.
- **Realm-safety:** iframe-bound code (`src/render-dom.ts`) MUST NOT call Obsidian DOM augmentations (`createDiv`/`createEl`/`createSpan`/`empty()`/`addClass`/`removeClass`/`setText`/`setAttr`) — they live on the parent realm's prototypes and throw on iframe-realm nodes. Use native DOM (`createElement`/`classList`/`replaceChildren`/`textContent`). Enforced by a new `scripts/check-render-realm.mjs` in `npm test`.
- **Test reality:** vitest runs `environment: "node"` with **no DOM** and no happy-dom. `.css` imports do NOT resolve under vitest (only under the esbuild text-loader). Therefore: pure string/logic → vitest unit test; anything importing `.css`/`mermaid` or needing a real `document`/iframe/layout → verified by `npm run build` (tsc) + `scripts/bundle-smoke.mjs` + **manual Pallas smoke**. Do not invent fake DOM unit tests for layout — measurement fidelity is explicitly manual-smoke.
- **Sandbox:** every deck iframe gets `sandbox="allow-same-origin"` (same-origin so the parent can read `contentDocument`; no `allow-scripts` so raw HTML from notes can't execute).
- **TS strict + `noImplicitAny`** — no `any` casts for new types.
- **Commits:** Conventional Commits, German description allowed, **stage only touched files**. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Geometry/fit unchanged:** do not modify `src/core/layout/fit.ts`, `src/core/geometry.ts`, or `src/core/constraints/**`. `computeFit` semantics stay bit-identical; only the measurement *document* changes.

---

### Task 1: Preview/print chrome as pure constants (`src/chrome-css.ts`)

Migrate the preview-only slide chrome and the print CSS out of the themed parent (`styles.css` / `export.ts:printRootCss`) into pure TS string constants that can be injected into an isolated iframe. Inside the iframe there are no Obsidian theme variables, so use hardcoded colors (the same values `styles.css` already lists as `var(..., fallback)`).

**Files:**
- Create: `src/chrome-css.ts`
- Test: `tests/chrome-css.test.ts`

**Interfaces:**
- Produces: `PREVIEW_CHROME_CSS: string` (deck-inner stacking + card + warn stripes for the preview iframe) · `PRINT_CSS(w: number, h: number): string` (`@page` size + per-slide page break + body reset for the print iframe).

- [ ] **Step 1: Write the failing test**

```ts
// tests/chrome-css.test.ts
import { describe, it, expect } from "vitest";
import { PREVIEW_CHROME_CSS, PRINT_CSS } from "../src/chrome-css";

describe("PREVIEW_CHROME_CSS", () => {
  it("stacks slides and carries hardcoded (theme-free) card + warn colors", () => {
    expect(PREVIEW_CHROME_CSS).toContain(".sd-deck-inner");
    expect(PREVIEW_CHROME_CSS).toContain("gap: 24px");
    expect(PREVIEW_CHROME_CSS).toContain("box-shadow"); // card
    expect(PREVIEW_CHROME_CSS).toContain("#e5534b");    // overflow stripe (red), no var()
    expect(PREVIEW_CHROME_CSS).toContain("#c98a00");    // soft-warn stripe (amber)
    expect(PREVIEW_CHROME_CSS).not.toContain("var(--"); // iframe has no Obsidian theme vars
  });
});

describe("PRINT_CSS", () => {
  it("sets the page to slide geometry and breaks one slide per page", () => {
    const css = PRINT_CSS(1280, 720);
    expect(css).toContain("@page");
    expect(css).toContain("size: 1280px 720px");
    expect(css).toContain("margin: 0");
    expect(css).toContain("break-after: page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chrome-css.test.ts`
Expected: FAIL — cannot find module `../src/chrome-css`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/chrome-css.ts
// Preview-only and print-only CSS, injected into the ISOLATED deck iframes (never the
// themed parent). Hardcoded colors mirror styles.css's var(..., fallback) values, because
// inside the iframe there are no Obsidian theme variables to resolve.

/** Stacking + card + overflow-stripe chrome for the live PREVIEW iframe only.
 *  Wraps slides as <div class="sd-deck-inner">…</div>. Warn classes ride inert in the
 *  serialized slidesHtml; without these rules (i.e. in export) they render nothing. */
export const PREVIEW_CHROME_CSS = `
body { margin: 0; }
.sd-deck-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  width: max-content;
}
.sd-deck-inner .sd-slide {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  border: 1px solid #ddd;
  border-radius: 8px;
  flex: none;
}
.sd-deck-inner .sd-slide-warn {
  box-shadow: inset 12px 0 0 0 #e5534b, 0 2px 12px rgba(0, 0, 0, 0.18);
}
.sd-deck-inner .sd-slide-warn-soft {
  box-shadow: inset 12px 0 0 0 #c98a00, 0 2px 12px rgba(0, 0, 0, 0.18);
}
`;

/** Print CSS for the PDF iframe. The iframe document contains ONLY slides, so no
 *  "hide everything else" hack is needed (unlike the old top-document printRootCss). */
export function PRINT_CSS(w: number, h: number): string {
  return (
    `@page { size: ${w}px ${h}px; margin: 0; }\n` +
    `html, body { margin: 0; padding: 0; background: #fff; }\n` +
    `.sd-slide { break-after: page; }\n` +
    `.sd-slide:last-child { break-after: auto; }`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chrome-css.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/chrome-css.ts tests/chrome-css.test.ts
git commit -m "feat(chrome): extract preview/print iframe CSS as theme-free constants

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure iframe-document assembler (`isolatedDeckHtml`)

Create `src/iframe-host.ts` with the pure function that builds the full self-contained HTML document for any deck iframe. Pure string templating — no DOM, no `.css` import — so it is vitest-importable.

**Files:**
- Create: `src/iframe-host.ts`
- Test: `tests/iframe-host.test.ts`

**Interfaces:**
- Produces: `isolatedDeckHtml(opts: { css: string; bodyHtml: string; extraCss?: string }): string` — returns `<!doctype html>…<style>${css}${extraCss}</style></head><body>${bodyHtml}</body></html>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/iframe-host.test.ts
import { describe, it, expect } from "vitest";
import { isolatedDeckHtml } from "../src/iframe-host";

describe("isolatedDeckHtml", () => {
  it("builds a doctype document with css in head and body html in body", () => {
    const html = isolatedDeckHtml({ css: ".sd-slide{color:red}", bodyHtml: "<div class='sd-slide'>x</div>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>.sd-slide{color:red}</style>");
    expect(html).toContain("<body><div class='sd-slide'>x</div></body>");
  });

  it("appends extraCss after the base css (so chrome/print overrides win)", () => {
    const html = isolatedDeckHtml({ css: "BASE", bodyHtml: "", extraCss: "EXTRA" });
    expect(html.indexOf("BASE")).toBeLessThan(html.indexOf("EXTRA"));
    expect(html).toContain("<style>BASEEXTRA</style>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/iframe-host.test.ts`
Expected: FAIL — cannot find module `../src/iframe-host`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/iframe-host.ts
// Owns the isolated deck iframe: the pure document assembler (isolatedDeckHtml) and the
// runtime lifecycle helper (createIsolatedDeckIframe, added in Task 3). No .css/mermaid
// imports at module scope, so the pure part stays vitest-importable.

/** Assemble the full self-contained HTML for a deck iframe. `extraCss` (preview chrome or
 *  print CSS) is concatenated AFTER `css` so it can override deck tokens. */
export function isolatedDeckHtml(opts: { css: string; bodyHtml: string; extraCss?: string }): string {
  const { css, bodyHtml, extraCss = "" } = opts;
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${css}${extraCss}</style></head>` +
    `<body>${bodyHtml}</body></html>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/iframe-host.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/iframe-host.ts tests/iframe-host.test.ts
git commit -m "feat(iframe-host): pure isolatedDeckHtml document assembler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: iframe lifecycle (`createIsolatedDeckIframe`)

Add the runtime helper that creates an isolated iframe, injects the document, and resolves only after `load` + `fonts.ready` (with a safety timeout). Designed around an injectable DOM seam so the **ordering** (load → fonts.ready → resolve; dispose removes the node) is unit-testable with a fake document — no real browser needed.

**Files:**
- Modify: `src/iframe-host.ts`
- Test: `tests/iframe-host.test.ts`

**Interfaces:**
- Consumes: `isolatedDeckHtml` (Task 2).
- Produces: `createIsolatedDeckIframe(ownerDoc: Document, opts: { css: string; bodyHtml: string; extraCss?: string; offscreen: boolean; width?: number; fontsTimeoutMs?: number }): Promise<IsolatedIframe>` where `IsolatedIframe = { iframe: HTMLIFrameElement; contentDoc: Document; dispose: () => void }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/iframe-host.test.ts  (append)
import { createIsolatedDeckIframe } from "../src/iframe-host";

// Minimal fake DOM seam: enough of Document/HTMLIFrameElement to drive the lifecycle.
function makeFakeOwnerDoc() {
  const removed: any[] = [];
  let fontsResolve!: () => void;
  const contentDoc: any = {
    open() {}, write() {}, close() {},
    fonts: { ready: new Promise<void>((r) => { fontsResolve = r; }) },
    body: {}, documentElement: { scrollHeight: 700 },
  };
  const listeners: Record<string, (() => void)[]> = {};
  const iframe: any = {
    style: {}, sandbox: { value: "", add(v: string) { this.value = v; } },
    setAttribute(_k: string, v: string) { this.sandbox.value = v; },
    addEventListener(t: string, cb: () => void) { (listeners[t] ??= []).push(cb); },
    removeEventListener() {},
    set srcdoc(_v: string) { queueMicrotask(() => (listeners["load"] ?? []).forEach((cb) => cb())); },
    contentDocument: contentDoc, contentWindow: {},
    remove() { removed.push(iframe); },
  };
  const ownerDoc: any = {
    createElement: (tag: string) => (tag === "iframe" ? iframe : { style: {} }),
    body: { appendChild() {} },
  };
  return { ownerDoc, iframe, contentDoc, removed, fireFonts: () => fontsResolve() };
}

describe("createIsolatedDeckIframe", () => {
  it("sets the sandbox, resolves after load + fonts.ready, and disposes", async () => {
    const f = makeFakeOwnerDoc();
    const p = createIsolatedDeckIframe(f.ownerDoc as any, { css: "X", bodyHtml: "Y", offscreen: true });
    // Not resolved until fonts.ready settles:
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    f.fireFonts();
    const handle = await p;
    expect(f.iframe.sandbox.value).toBe("allow-same-origin");
    expect(f.iframe.style.left).toBe("-99999px"); // offscreen
    expect(handle.contentDoc).toBe(f.contentDoc);
    handle.dispose();
    expect(f.removed).toContain(f.iframe);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/iframe-host.test.ts`
Expected: FAIL — `createIsolatedDeckIframe is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/iframe-host.ts  (append)
export interface IsolatedIframe {
  iframe: HTMLIFrameElement;
  contentDoc: Document;
  dispose: () => void;
}

/** Create an isolated, same-origin deck iframe and resolve once it is loaded AND fonts
 *  have decoded (KaTeX glyph metrics). `offscreen` parks it at left:-99999px (NOT
 *  display:none, which suppresses layout and breaks scrollWidth measurement). */
export async function createIsolatedDeckIframe(
  ownerDoc: Document,
  opts: { css: string; bodyHtml: string; extraCss?: string; offscreen: boolean; width?: number; fontsTimeoutMs?: number },
): Promise<IsolatedIframe> {
  const iframe = ownerDoc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.border = "0";
  if (opts.offscreen) {
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
  }
  if (opts.width !== undefined) iframe.style.width = `${opts.width}px`;

  const loaded = new Promise<void>((resolve) => {
    const onLoad = () => { iframe.removeEventListener("load", onLoad); resolve(); };
    iframe.addEventListener("load", onLoad);
  });
  ownerDoc.body.appendChild(iframe);
  iframe.srcdoc = isolatedDeckHtml(opts);
  await loaded;

  const contentDoc = iframe.contentDocument!;
  // Wait for fonts, but never hang on a stuck decode.
  const timeout = new Promise<void>((r) => setTimeout(r, opts.fontsTimeoutMs ?? 3000));
  await Promise.race([contentDoc.fonts.ready.then(() => undefined), timeout]);

  return { iframe, contentDoc, dispose: () => iframe.remove() };
}
```

> **Fallback (if `srcdoc` load timing proves flaky during the Task 9 smoke):** create the iframe with no `srcdoc`, await its initial `load`, then `contentDoc.open(); contentDoc.write(isolatedDeckHtml(opts)); contentDoc.close();` (synchronous same-origin write). The function signature stays identical — only the body changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/iframe-host.test.ts`
Expected: PASS (3 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add src/iframe-host.ts tests/iframe-host.test.ts
git commit -m "feat(iframe-host): createIsolatedDeckIframe lifecycle (load + fonts.ready + dispose)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Make `renderDeckToContainer` realm-safe + add the realm-scan gate

Replace the four Obsidian augmentations in `renderDeckToContainer` with native DOM, and restructure it into two passes (build all slides, then `await doc.fonts.ready`, then measure all) so measurement runs after content + fonts settle inside the iframe. Add a source-scan script that fails if any augmentation reappears, and wire it into `npm test`. The scan **is** the failing test for this task (the current file violates it).

**Files:**
- Modify: `src/render-dom.ts:27-65` (`renderDeckToContainer`)
- Create: `scripts/check-render-realm.mjs`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `geometryFor`, `presetFor`, `computeFit`, `collectWarnings`, `collectDeckWarnings`, `renderMarkdown` (unchanged).
- Produces: `renderDeckToContainer(doc: Document, container: HTMLElement, deck: SlideDeck, resolveEmbed: (r: string) => string | null): Promise<Warning[]>` — same signature; now realm-safe and two-pass.

- [ ] **Step 1: Write the failing test (the scan script)**

```js
// scripts/check-render-realm.mjs
// Guards the iframe-bound builder: renderDeckToContainer runs against an iframe
// contentDocument whose realm does NOT have Obsidian's prototype augmentations. Any of
// these calls would throw "X is not a function" at runtime (TS can't catch it — the global
// augmentation makes the methods appear present on every HTMLElement).
import { readFileSync } from "node:fs";
const FILE = "src/render-dom.ts";
const BAD = [/\.createDiv\(/, /\.createEl\(/, /\.createSpan\(/, /\.empty\(\)/, /\.addClass\(/, /\.removeClass\(/, /\.setText\(/, /\.setAttr\(/];
const src = readFileSync(FILE, "utf8");
const hits = BAD.filter((re) => re.test(src)).map((re) => re.source);
if (hits.length > 0) {
  console.error(`render realm violation in ${FILE}: ${hits.join(", ")}`);
  process.exit(1);
}
console.log("render realm OK");
```

- [ ] **Step 2: Run the scan to verify it fails on the current file**

Run: `node scripts/check-render-realm.mjs`
Expected: FAIL — `render realm violation in src/render-dom.ts: \.createDiv\(, \.empty\(\), \.addClass\(`

- [ ] **Step 3: Rewrite `renderDeckToContainer` to native DOM + two passes**

Replace lines 27-65 (the whole `renderDeckToContainer` function) with:

```ts
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
```

Note: the old `void doc;` line is gone — `doc` is now used (`doc.createElement`, `doc.fonts.ready`).

- [ ] **Step 4: Run the scan to verify it passes**

Run: `node scripts/check-render-realm.mjs`
Expected: `render realm OK`

- [ ] **Step 5: Wire the scan into `npm test`**

In `package.json`, change the `test` script from:

```json
"test": "node scripts/check-core-purity.mjs && node scripts/bundle-smoke.mjs && vitest run",
```

to:

```json
"test": "node scripts/check-core-purity.mjs && node scripts/check-render-realm.mjs && node scripts/bundle-smoke.mjs && vitest run",
```

- [ ] **Step 6: Verify typecheck + full test gate still pass**

Run: `npm run typecheck && npm test`
Expected: tsc clean; `core purity OK`, `render realm OK`, `bundle-smoke OK …`, vitest all green (existing + Tasks 1-3).

- [ ] **Step 7: Commit**

```bash
git add src/render-dom.ts scripts/check-render-realm.mjs package.json
git commit -m "refactor(render-dom): realm-safe native DOM + two-pass measure; add render-realm gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `buildIsolatedDeck` — measure inside the staging iframe

Replace `buildSelfContainedDeckHtml` with `buildIsolatedDeck`, which renders + measures inside a single off-screen isolated staging iframe (closing the measurement-side theme leak), then serializes. Update its two callers in `export.ts`. **Not unit-testable** (imports `.css` via `deck-css`, needs a real iframe) — verified by `npm run build` + the realm gate + Task 9 manual smoke.

**Files:**
- Modify: `src/render-dom.ts:67-88` (`buildSelfContainedDeckHtml` → `buildIsolatedDeck`)
- Modify: `src/export.ts:4` (import), `:23`, `:53` (call sites)

**Interfaces:**
- Consumes: `createIsolatedDeckIframe` (Task 3), `renderDeckToContainer` (Task 4), `deckCss`.
- Produces: `buildIsolatedDeck(ownerDoc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null, customCss?: string): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }>`.

- [ ] **Step 1: Replace the function**

Replace lines 67-88 (`buildSelfContainedDeckHtml`) with:

```ts
export async function buildIsolatedDeck(
  ownerDoc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null, customCss = "",
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const css = deckCss(deck.directives.theme, customCss);
  // Measure inside a theme-ISOLATED off-screen iframe: a parent staging div lives in the
  // themed document and would bake theme metrics — the exact leak this change removes.
  const host = await createIsolatedDeckIframe(ownerDoc, { css, bodyHtml: "", offscreen: true });
  try {
    const warnings = await renderDeckToContainer(host.contentDoc, host.contentDoc.body, deck, resolveEmbed);
    const slidesHtml = Array.from(host.contentDoc.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css, warnings };
  } finally {
    host.dispose();
  }
}
```

Add the import at the top of `src/render-dom.ts` (with the other local imports):

```ts
import { createIsolatedDeckIframe } from "./iframe-host";
```

- [ ] **Step 2: Update `export.ts` import + call sites**

In `src/export.ts`:
- Line 4: change `import { buildSelfContainedDeckHtml } from "./render-dom";` → `import { buildIsolatedDeck } from "./render-dom";`
- Line 23 (in `exportPdf`): change `const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed, customCss);` → `const { slidesHtml, css } = await buildIsolatedDeck(doc, loaded.deck, loaded.resolveEmbed, customCss);`
- Line 53 (in `exportImages`): same rename `buildSelfContainedDeckHtml` → `buildIsolatedDeck`.

(These call sites are rewired fully in Tasks 7-8; this step only keeps the build green.)

- [ ] **Step 3: Verify it compiles and the gate is green**

Run: `npm run typecheck && node scripts/check-render-realm.mjs && node scripts/bundle-smoke.mjs`
Expected: tsc clean (no remaining `buildSelfContainedDeckHtml` references); `render realm OK`; `bundle-smoke OK` (bundle-smoke does not call this function, so it is unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/render-dom.ts src/export.ts
git commit -m "feat(render-dom): buildIsolatedDeck measures inside an isolated staging iframe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wire the live preview to an isolated iframe

Replace the parent-DOM `deckInner` render with a persistent isolated preview iframe fed by `buildIsolatedDeck`. Move zoom onto the iframe element. Remove the migrated chrome rules from `styles.css` (they now live in `PREVIEW_CHROME_CSS` inside the iframe). **Verified by `npm run build` + Task 9 manual smoke (§8.1 zoom/scrollbar).**

**Files:**
- Modify: `src/preview-view.ts` (`onOpen`, `refresh`, `fitToWidth`, `onClose`, imports)
- Modify: `styles.css` (remove migrated rules)

**Interfaces:**
- Consumes: `buildIsolatedDeck`, `createIsolatedDeckIframe`, `isolatedDeckHtml`(indirect), `PREVIEW_CHROME_CSS`, `deckCss`(removed from this file), `geometryFor`.

- [ ] **Step 1: Update imports in `src/preview-view.ts`**

- Remove: `import { renderDeckToContainer } from "./render-dom";` and `import { deckCss } from "./deck-css";`
- Add:
```ts
import { buildIsolatedDeck } from "./render-dom";
import { createIsolatedDeckIframe, isolatedDeckHtml, type IsolatedIframe } from "./iframe-host";
import { PREVIEW_CHROME_CSS } from "./chrome-css";
```

- [ ] **Step 2: Swap the deck host + state fields**

In the class fields (lines 14-22), remove `private styleEl?` and `private deckInner!`; add:
```ts
  private deckHost!: HTMLElement;        // the in-pane container that holds the iframe
  private previewFrame?: IsolatedIframe; // current deck iframe (disposed on refresh/close)
```
Keep `deckEl`, `messageEl`, `resizeObs`, `geoWidth`, `currentFile`.

In `onOpen` (lines 29-40) replace the `styleEl`/`deckInner` setup:
```ts
  async onOpen(): Promise<void> {
    this.contentEl.addClass("sd-view");
    this.buildToolbar();
    this.warnEl = this.contentEl.createDiv({ cls: "sd-warnings" });
    this.deckEl = this.contentEl.createDiv({ cls: "sd-deck" });
    this.messageEl = this.deckEl.createDiv({ cls: "sd-message" });
    this.deckHost = this.deckEl.createDiv({ cls: "sd-deck-host" });
    this.resizeObs = new ResizeObserver(() => this.fitToWidth());
    this.resizeObs.observe(this.deckEl);
    await this.refresh();
  }
```

- [ ] **Step 3: Rewrite `refresh` to build + inject the iframe**

Replace the body of `refresh` (lines 61-87) with:
```ts
  async refresh(): Promise<void> {
    try {
      const active = this.app.workspace.getActiveFile();
      this.currentFile = active && active.extension === "md" ? active : null;
      this.fileLabel.setText(this.currentFile ? this.currentFile.basename : "");
      const loaded = await loadDeck(this.app, this.currentFile, { theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
      this.warnEl.empty();
      this.messageEl.empty();
      this.messageEl.removeClass("sd-error");
      this.disposeFrame();
      if (!loaded) { this.messageEl.setText(t("preview.hint")); return; }
      if (loaded.deck.slides.length === 0) { this.messageEl.setText(t("preview.empty")); return; }
      this.geoWidth = geometryFor(loaded.deck.directives.aspect).width;
      const { slidesHtml, css, warnings } = await buildIsolatedDeck(activeDoc(), loaded.deck, loaded.resolveEmbed, this.plugin.settings.customCss);
      const bodyHtml = `<div class="sd-deck-inner">${slidesHtml.join("")}</div>`;
      this.previewFrame = await createIsolatedDeckIframe(this.deckHost.ownerDocument, { css, extraCss: PREVIEW_CHROME_CSS, bodyHtml, offscreen: false, width: this.geoWidth });
      this.previewFrame.iframe.addClass("sd-deck-iframe");
      // Size the iframe to its content (parent .sd-deck scrolls; zoom scales the element).
      const ch = this.previewFrame.contentDoc.documentElement.scrollHeight;
      this.previewFrame.iframe.style.height = `${ch}px`;
      this.deckHost.appendChild(this.previewFrame.iframe);
      this.fitToWidth();
      for (const w of warnings) {
        const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
        if (w.sourceLine !== undefined) row.addEventListener("click", () => this.jumpTo(w.sourceLine!));
      }
    } catch (e) {
      this.disposeFrame();
      this.messageEl.empty();
      this.messageEl.addClass("sd-error");
      this.messageEl.setText(t("preview.error", String(e)));
    }
  }

  private disposeFrame(): void {
    this.previewFrame?.dispose();
    this.previewFrame = undefined;
  }
```

Note: `createIsolatedDeckIframe` appends the iframe to `ownerDoc.body` to load it; after `load` we re-parent it into `this.deckHost` via `appendChild` (re-parenting a same-origin iframe preserves its document in Chromium/Electron). If the Task 9 smoke shows the iframe document resets on re-parent, the fallback is to pass `deckHost` as the mount target into `createIsolatedDeckIframe` (add an optional `mount?: HTMLElement` param defaulting to `ownerDoc.body`).

- [ ] **Step 4: Retarget `fitToWidth` to the iframe element**

Replace `fitToWidth` (lines 91-99):
```ts
  private fitToWidth(): void {
    const frame = this.previewFrame?.iframe;
    if (!frame) return;
    const avail = this.deckEl.clientWidth - 16;
    if (avail <= 0) return;
    const factor = Math.min(1, avail / this.geoWidth);
    frame.style.setProperty("zoom", String(factor));
  }
```

- [ ] **Step 5: Update `onClose`**

Replace `onClose` (lines 115-121):
```ts
  async onClose(): Promise<void> {
    this.resizeObs?.disconnect();
    this.disposeFrame();
    this.warnEl?.empty();
    this.messageEl?.empty();
  }
```

- [ ] **Step 6: Trim `styles.css`**

Remove lines 95-112 (the `.sd-deck-inner .sd-slide` card + `.sd-slide-warn` + `.sd-slide-warn-soft` rules) and the `.sd-deck-inner` rule (lines 87-93) — these now live in `PREVIEW_CHROME_CSS` inside the iframe. Replace them with the iframe host rules:
```css
/* The deck renders inside an isolated iframe so the Obsidian theme can't leak in. */
.sd-deck-host {
  width: max-content;
}
.sd-deck-iframe {
  display: block;
  border: 0;
  transform-origin: top left;
}
```

- [ ] **Step 7: Verify build + lint**

Run: `npm run lint && npm run typecheck`
Expected: eslint clean (no unused `deckCss`/`renderDeckToContainer` imports left); tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/preview-view.ts styles.css
git commit -m "feat(preview): render the deck inside an isolated iframe; zoom the iframe element

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire PNG export to a capture iframe

Render the shared artifact inside an off-screen isolated iframe and run html2canvas against each `.sd-slide` in its `contentDocument`. PNG write path (`adapter.writeBinary` to `<exportFolder>/<base>/NN-<base>.png`) is unchanged. **Verified by `npm run build` + Task 9 manual smoke (§8.2 html2canvas honors baked transform).**

**Files:**
- Modify: `src/export.ts:47-80` (`exportImages`)

**Interfaces:**
- Consumes: `buildIsolatedDeck`, `createIsolatedDeckIframe`, `html2canvas`, `geometryFor`.

- [ ] **Step 1: Rewrite the capture staging in `exportImages`**

Replace lines 53-78 (from `const { slidesHtml, css } = …` through the `finally { holder.remove(); }`) with:

```ts
  const { slidesHtml, css } = await buildIsolatedDeck(doc, loaded.deck, loaded.resolveEmbed, customCss);
  const host = await createIsolatedDeckIframe(doc, { css, bodyHtml: slidesHtml.join(""), offscreen: true, width: geo.width });
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  const folder = `${root}/${base}`;
  if (!(await adapter.exists(root))) await adapter.mkdir(root);
  if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
  try {
    const slides = Array.from(host.contentDoc.querySelectorAll<HTMLElement>(".sd-slide"));
    for (let i = 0; i < slides.length; i++) {
      const canvas = await html2canvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${folder}/${String(i + 1).padStart(2, "0")}-${base}.png`;
      await adapter.writeBinary(path, bytes.buffer);
    }
    new Notice(t("export.done", slides.length));
  } finally { host.dispose(); }
```

(The old parent-document `holder`/`style` staging is gone — capture now happens inside the isolated iframe.)

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run typecheck`
Expected: clean. Confirm `win` is still referenced (`void win;` on line 48 stays) and no unused vars remain.

- [ ] **Step 3: Commit**

```bash
git add src/export.ts
git commit -m "feat(export): capture PNGs inside an isolated iframe (theme-clean html2canvas)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire PDF export to print an isolated iframe

Print the deck from an off-screen isolated iframe via `contentWindow.print()`, with `PRINT_CSS` (and `@page`) inside the iframe. Removes the top-document `sd-print-root` hack. **Verified by `npm run build` + Task 9 manual smoke (§8.3 print isolation).**

**Files:**
- Modify: `src/export.ts:9-45` (delete `printRootCss`, rewrite `exportPdf`), imports

**Interfaces:**
- Consumes: `buildIsolatedDeck`, `createIsolatedDeckIframe`, `PRINT_CSS`, `geometryFor`.

- [ ] **Step 1: Update imports**

In `src/export.ts`, add:
```ts
import { createIsolatedDeckIframe } from "./iframe-host";
import { PRINT_CSS } from "./chrome-css";
```

- [ ] **Step 2: Delete `printRootCss` and rewrite `exportPdf`**

Delete lines 9-16 (`printRootCss`). Replace `exportPdf` (lines 18-45) with:

```ts
export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, defaults?: Partial<DeckDirectives>, customCss = ""): Promise<void> {
 try {
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildIsolatedDeck(doc, loaded.deck, loaded.resolveEmbed, customCss);
  const host = await createIsolatedDeckIframe(doc, { css, extraCss: PRINT_CSS(geo.width, geo.height), bodyHtml: slidesHtml.join(""), offscreen: true, width: geo.width });
  let done = false;
  let safetyTimer: ReturnType<typeof win.setTimeout> | undefined;
  const cleanup = () => {
    if (done) return;
    done = true;
    if (safetyTimer !== undefined) win.clearTimeout(safetyTimer);
    win.removeEventListener("afterprint", cleanup);
    host.dispose();
  };
  win.addEventListener("afterprint", cleanup);
  win.setTimeout(() => { try { host.iframe.contentWindow?.print(); } catch { new Notice("Print failed"); cleanup(); } }, 200);
  safetyTimer = win.setTimeout(cleanup, 60000);
 } catch (e) { new Notice(t("notice.exportFailed", String(e))); }
}
```

Note: `afterprint` is listened for on the parent `win`. If the Task 9 smoke shows the parent never receives `afterprint` for an iframe print, the fallback is `host.iframe.contentWindow?.addEventListener("afterprint", cleanup)` plus the existing safety timer (which already covers cleanup either way).

- [ ] **Step 3: Verify build + lint + full gate**

Run: `npm run lint && npm run build && npm test`
Expected: eslint clean; tsc clean; `core purity OK`, `render realm OK`, `bundle-smoke OK …`, vitest all green.

- [ ] **Step 4: Commit**

```bash
git add src/export.ts
git commit -m "feat(export): print PDF from an isolated iframe; drop top-document print-root hack

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Full gate + manual Pallas smoke (acceptance / parked verifications)

Run the full automated gate, deploy to the Pallas vault, and tick the three parked empirical verifications under the real (Kuro) theme — this is the acceptance test the leak was originally observed through.

**Files:** none (verification + any fallback fixes surfaced here).

- [ ] **Step 1: Full automated gate**

Run: `npm run lint && npm run build && npm test`
Expected: all green (eslint, tsc, core-purity, render-realm, bundle-smoke, vitest).

- [ ] **Step 2: Deploy to Pallas**

Run: `npm run deploy` (requires `OBSIDIAN_PLUGIN_DIR`). Reload the plugin in Obsidian.

- [ ] **Step 3: §8.1 — Preview zoom/scrollbar under Kuro**

Open `slide-deck-demo.md` in the preview pane (Kuro v4 active). Verify: (a) **headings render in the theme sans, NOT JetBrains Mono** (the core fix); (b) the deck scales to pane width and the vertical scrollbar scrolls all slides; (c) overflow slides still show the red/amber stripe; (d) no ResizeObserver loop-limit console warnings. If (b)/(d) fail → apply the zoom fallback noted in Task 6 Step 3 (mount target) / consider `transform:scale` + explicit host height.

- [ ] **Step 4: §8.2 — PNG export isolation**

Export images. Verify: PNGs match the preview (headings sans, correct per-slide scale — the baked `transform:scale` is honored). If headings are monospace or scale is wrong → apply the html2canvas fallback (Task 7: parent holder with a theme-neutralizing reset, or `windowWidth/windowHeight` options).

- [ ] **Step 5: §8.3 — PDF export isolation**

Export PDF. Verify: one slide per page at exact geometry, theme-isolated (sans headings), clean cleanup (no leftover iframe in the DOM after printing). If `afterprint` never fires on the parent → apply the Task 8 fallback (`contentWindow` afterprint listener; the 60s safety timer already backstops cleanup).

- [ ] **Step 6: Commit any fallback fixes**

If Steps 3-5 required fallbacks, commit them:
```bash
git add -A
git commit -m "fix(iframe): apply <which> fallback after Pallas smoke

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
If no fallbacks were needed, skip this step.

---

### Task 10: Documentation (`AGENTS.md`) + spec status

Document the iframe seam, the realm rule + new gate, the corrected test reality, and the new files. Mark the spec as implemented.

**Files:**
- Modify: `AGENTS.md` (Architecture file map, Conventions, Gotchas)
- Modify: `docs/superpowers/specs/2026-06-27-iframe-isolation-design.md` (status line)

- [ ] **Step 1: Update `AGENTS.md`**

- In §Architecture, add to the adapter-layer file map: `iframe-host.ts` (isolated deck iframe: `isolatedDeckHtml` + `createIsolatedDeckIframe` lifecycle) and `chrome-css.ts` (`PREVIEW_CHROME_CSS` + `PRINT_CSS`, injected into the iframes). Update `render-dom.ts` to note `buildIsolatedDeck` measures inside a staging iframe and `renderDeckToContainer` is realm-safe (native DOM). Update `export.ts`/`preview-view.ts` notes (iframe-based).
- In §Conventions, add the **Realm-safety** rule (no Obsidian augmentations in `render-dom.ts`; enforced by `scripts/check-render-realm.mjs`, which `npm test` runs after core-purity). Correct the test note: vitest is **node-env, no DOM/happy-dom**; DOM/iframe/layout behavior is covered by bundle-smoke + manual Pallas smoke.
- In §Gotchas, add: **Realm isolation** — slides render in a `sandbox="allow-same-origin"` iframe; Obsidian's `createDiv`/`addClass`/etc. are parent-realm prototype patches and throw on iframe nodes, so the iframe path is native-DOM + string injection only. Measurement waits for `load` + `fonts.ready`.

- [ ] **Step 2: Mark the spec implemented**

In `docs/superpowers/specs/2026-06-27-iframe-isolation-design.md`, change the status line to: `- **Status:** Implemented (feat/iframe-isolation) — pending merge to main`.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-06-27-iframe-isolation-design.md
git commit -m "docs(agents): document iframe-isolation seam, realm rule, and test reality

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- §2.1 theme-isolated render → Tasks 5-8 (iframe everywhere). ✓
- §2.2 one shared build for all three consumers → Task 5 produces `{slidesHtml,css}`; Tasks 6-8 consume it. ✓
- §2.3 `sandbox="allow-same-origin"` → Task 3 (set on every iframe). ✓
- §2.4 fit/geometry bit-identical → Task 4 keeps `computeFit` call unchanged; no core edits. ✓
- §2.5 pure-core untouched → no `src/core/**` files in any task. ✓
- §2.6 realm-safe `renderDeckToContainer` → Task 4 + gate. ✓
- §5.1 `createIsolatedDeckIframe` → Task 3. ✓
- §5.2 `buildIsolatedDeck` → Task 5. ✓
- §5.3 four (→ six, incl. `addClass`) augmentations native → Task 4. ✓
- §5.4 preview iframe + zoom-on-element + chrome split → Task 6. ✓
- §5.5 PNG capture iframe → Task 7. ✓
- §5.6 PDF print iframe + drop printRootCss → Task 8. ✓
- §6 lifecycle (load + fonts.ready + teardown) → Task 3 (helper) + Task 4 (`doc.fonts.ready` before measure). ✓
- §7 error handling (fonts timeout, no-measure-before-ready) → Task 3 (`Promise.race` timeout); scrollWidth===0 yields scale 1 via existing `computeFit` (no divide-by-zero throw). ✓
- §8 parked verifications → Task 9 Steps 3-5 with documented fallbacks. ✓
- §9 testing strategy → pure units (Tasks 1-3), realm gate (Task 4), manual smoke (Task 9). ✓
- §10 affected files → all covered (chrome-css, iframe-host, render-dom, preview-view, export, styles.css, AGENTS.md). `deck-css.ts` is NOT modified (the spec's §10 row "PREVIEW_CHROME_CSS+PRINT_CSS exportieren" is realized in the new `chrome-css.ts` instead — cleaner, keeps deck-css's `.css` imports out of the vitest-importable path). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases". Fallbacks are concrete and named. ✓

**3. Type consistency:**
- `IsolatedIframe = { iframe, contentDoc, dispose }` defined Task 3, consumed Tasks 5-8 with those exact field names (`host.contentDoc`, `host.iframe`, `host.dispose()`, `this.previewFrame.iframe`). ✓
- `createIsolatedDeckIframe(ownerDoc, { css, bodyHtml, extraCss?, offscreen, width?, fontsTimeoutMs? })` — Task 3 signature; all call sites (Tasks 5/6/7/8) pass `{css, bodyHtml, offscreen, ...}` matching. ✓
- `buildIsolatedDeck(ownerDoc, deck, resolveEmbed, customCss?)` — Task 5; callers in 6/7/8 pass `(activeDoc()|doc, loaded.deck, loaded.resolveEmbed, customCss)`. ✓
- `PRINT_CSS(w, h)` Task 1 → called `PRINT_CSS(geo.width, geo.height)` Task 8. ✓ `PREVIEW_CHROME_CSS` const Task 1 → used Task 6. ✓
- `isolatedDeckHtml({css, bodyHtml, extraCss?})` Task 2 → used inside `createIsolatedDeckIframe` Task 3. ✓

No gaps found.
