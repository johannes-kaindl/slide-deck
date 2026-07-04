# markdown-presentation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Obsidian-Plugin, das eine Markdown-Notiz (Folien getrennt durch `---`) als Präsentation rendert und als PDF + PNG-Bilderserie exportiert, mit Live-Vorschau und erzwungenen Lesbarkeits-/Accessibility-Constraints.

**Architecture:** Harte Naht zwischen einem **Pure Core** (`src/core/**`, zero obsidian-/Netz-Import, Node-testbar — der spätere `md2pdf`-Seed) und einer dünnen **Obsidian-Adapter-Schicht** (`src/*.ts`). Der Core parst das Deck, rendert Markdown→HTML (markdown-it + KaTeX + highlight.js + Callouts), emittiert Mermaid-Platzhalter und berechnet Fit/Constraint-Warnungen. Die DOM-Schicht misst, rendert Mermaid-SVG, zeigt die Vorschau und treibt den Export (`window.print()` für PDF, html2canvas für PNG).

**Tech Stack:** TypeScript (strict), esbuild (bundle → `main.js`), vitest (+ obsidian-Mock via `resolve.alias`), eslint (`typescript-eslint` recommendedTypeChecked + `eslint-plugin-obsidianmd`). Libs: `markdown-it`, `@vscode/markdown-it-katex` + `katex`, `highlight.js`, `mermaid`, `html2canvas`.

## Global Constraints

Jede Task erbt diese Constraints (Werte verbatim aus dem Spec `docs/superpowers/specs/2026-06-25-markdown-presentation-design.md`):

- **Pure Core rein:** `src/core/**` importiert **nie** `obsidian`, nutzt **nie** `fetch`/globales `document`/`window`. (PROF-OBS-03/04/12/13.) CI-grep-Gate gegen `from "obsidian"` in `src/core/`.
- **Feste Geometrie:** 16:9 = **1280×720** logische px (default), 4:3 = **960×720**. Identisch für Vorschau, PDF, Bilder.
- **Lesbarkeits-Boden:** default **24 px** Body @720p; via Frontmatter `minFontPx` überschreibbar. **Fit-or-warn**, nie unter den Boden schrumpfen.
- **Accessibility:** Kontrast WCAG-AA; **nie Bedeutung allein über Farbe** — Callouts tragen Icon + Form + Text redundant (rot-grün-sicher).
- **Folien-Split:** Zeile, die nur `---` enthält, beginnt neue Folie.
- **manifest:** `id: slide-deck` (kebab, ohne „obsidian", vor erstem Asset gegen `community-plugins.json` verifizieren — PROF-OBS-11), `name: "Slide Deck"`, `description` EN ≤160 Zeichen, `isDesktopOnly: true` (MVP), `author: "Johannes Kaindl"`, `authorUrl: https://jkaindl.de`.
- **DOM-Disziplin (Adapter):** kein `innerHTML`-Write außer bewusst isoliertem, selbst-erzeugtem Export-/Render-HTML; `activeDocument`/`activeWindow` statt globalem `document`/`window`; jedes injizierte DOM/`<style>`/Listener via Auto-Registrierung oder `afterprint`/`onClose`-Cleanup. (PROF-OBS-13.)
- **Lizenzen:** Code AGPL-3.0-or-later; Doku CC BY-SA 4.0 (`LICENSE-DOCS`).
- **Commits:** Conventional Commits; Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; nur berührte Dateien stagen (nie `git add -A`).
- **Tests:** vitest; kein `.only/.skip` im Commit.

## Shared Types (in Task 3/5/9/10 angelegt, hier zentral als Vertrag)

```ts
// src/core/slide-model.ts
export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; }
export interface Slide { index: number; markdown: string; speakerNotes?: string; startLine: number; }
export interface SlideDeck { directives: DeckDirectives; slides: Slide[]; }

// src/core/geometry.ts
export interface SlideGeometry { width: number; height: number; }

// src/core/constraints/engine.ts
export type WarningKind = "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }

// src/core/render/md2html.ts
export interface RenderInput { markdown: string; resolveEmbed: (ref: string) => string | null; }
export interface RenderedSlide { html: string; warnings: Omit<Warning, "slideIndex">[]; }

// src/core/layout/fit.ts
export interface Measured { contentWidth: number; contentHeight: number; }
export interface FitResult { scale: number; overflow: boolean; }
```

---

## Phase 0 — Scaffold & Toolchain

### Task 1: Scaffold aus Template + Dependencies + grüne Toolchain

**Files:**
- Create (kopiert aus `/Users/Shared/code/_docs/templates/obsidian-plugin/`): `package.json`, `manifest.json`, `versions.json`, `esbuild.config.mjs`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `eslint.config.mjs`, `eslint.portal.config.mjs`, `.gitignore`, `tests/__mocks__/obsidian.ts`, `scripts/version-bump.mjs`, `.github/workflows/release.yml`
- Create: `src/main.ts` (Minimal-Plugin), `styles.css` (leer), `src/core/.gitkeep`
- Create: `LICENSE` (AGPL-3.0-or-later Volltext), `LICENSE-DOCS` (CC BY-SA 4.0 Volltext)

**Interfaces:**
- Produces: lauffähige Toolchain (`npm run lint`, `npm test`, `npm run build` grün); `src/main.ts` exportiert `default class SlideDeckPlugin extends Plugin`.

- [ ] **Step 1: Template kopieren**

```bash
cp -R /Users/Shared/code/_docs/templates/obsidian-plugin/. /Users/Shared/code/obsidian-plugins/markdown-presentation/
# Vorhandenen Spec/Plan-Ordner nicht überschreiben (cp -R . merged additiv).
```

- [ ] **Step 2: manifest.json setzen**

```json
{
  "id": "slide-deck",
  "name": "Slide Deck",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Turn a Markdown note into a slide deck and export it to PDF or a PNG image series, with live readability checks.",
  "author": "Johannes Kaindl",
  "authorUrl": "https://jkaindl.de",
  "fundingUrl": "",
  "isDesktopOnly": true
}
```

`versions.json`: `{ "0.1.0": "1.5.0" }`. `package.json` → `"name": "slide-deck"`, `"description"` = manifest-description.

- [ ] **Step 3: Dependencies installieren**

```bash
cd /Users/Shared/code/obsidian-plugins/markdown-presentation
npm install
npm install markdown-it @vscode/markdown-it-katex katex highlight.js mermaid html2canvas
npm install -D @types/markdown-it
```

- [ ] **Step 4: Minimal-Plugin schreiben** — `src/main.ts`

```ts
import { Plugin } from "obsidian";

export default class SlideDeckPlugin extends Plugin {
  async onload(): Promise<void> {
    // Folgetasks registrieren Commands, Settings, View hier.
  }
}
```

- [ ] **Step 5: Toolchain grün verifizieren**

```bash
npm run lint && npm test && npm run build
```
Expected: eslint 0 Fehler; vitest „no test files" (ok); `main.js` entsteht. Bei `no-unsupported-api`-Hinweisen `minAppVersion` anpassen.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json manifest.json versions.json esbuild.config.mjs \
  tsconfig.json tsconfig.test.json vitest.config.ts eslint.config.mjs eslint.portal.config.mjs \
  .gitignore tests/__mocks__/obsidian.ts scripts/version-bump.mjs .github/workflows/release.yml \
  src/main.ts styles.css LICENSE LICENSE-DOCS
git commit -m "chore: scaffold slide-deck plugin from template"
```

---

## Phase 1 — Export-Spike (Risiko-Naht zuerst, gegen die echte App)

> Validiert den Export-Mechanismus **bevor** UI darum gebaut wird (LESSONS 2026-06-23: echter E2E-Smoke fängt, was Spec/Plan/Review verpassen). Wir nutzen letterheads bewährtes Muster: in-document injiziertes Print-Root + `@media print`, `window.print()` nach 150 ms, `afterprint`-Cleanup + 60s-Safety. KEINE Electron-APIs. Für PNG: html2canvas auf einem fest dimensionierten Off-Print-Container.

### Task 2: Export-Spike-Command (PDF + 1 PNG, feste Geometrie, manueller Smoke)

**Files:**
- Create: `src/spike-export.ts`
- Modify: `src/main.ts` (Command registrieren)

**Interfaces:**
- Consumes: nichts (hartkodierte 2 Demo-Folien).
- Produces: bewährtes Print-Root-Muster (`buildPrintRoot`, `printDeck`, `captureSlidePng`), das Task 17 produktiv übernimmt.

- [ ] **Step 1: Spike-Modul schreiben** — `src/spike-export.ts`

```ts
import { Notice, Platform } from "obsidian";
import html2canvas from "html2canvas";

const GEO = { width: 1280, height: 720 };

const DEMO_SLIDES = [
  `<h1>Slide one</h1><p style="font-size:28px">Readable body text — KaTeX: <span class="katex-test">E=mc²</span></p>`,
  `<h2>Slide two</h2><ul style="font-size:28px"><li>Bullet A</li><li>Bullet B</li></ul>`,
];

const PRINT_CSS = `
#sd-print-root{ display:none; }
@media print{
  @page{ size:${GEO.width}px ${GEO.height}px; margin:0; }
  html,body{ margin:0 !important; padding:0 !important; background:#fff !important; }
  body > *:not(#sd-print-root){ display:none !important; }
  #sd-print-root{ display:block !important; }
  .sd-slide{ width:${GEO.width}px; height:${GEO.height}px; box-sizing:border-box;
    padding:64px; overflow:hidden; break-after:page; background:#fff; color:#111; }
}
.sd-slide{ width:${GEO.width}px; height:${GEO.height}px; box-sizing:border-box;
  padding:64px; overflow:hidden; background:#fff; color:#111; }
`;

function buildPrintRoot(doc: Document, slidesHtml: string[]): { root: HTMLElement; style: HTMLStyleElement } {
  doc.getElementById("sd-print-root")?.remove();
  doc.getElementById("sd-print-style")?.remove();
  const style = doc.createElement("style");
  style.id = "sd-print-style";
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  const root = doc.createElement("div");
  root.id = "sd-print-root";
  for (const html of slidesHtml) {
    const slide = doc.createElement("div");
    slide.className = "sd-slide";
    slide.innerHTML = html; // bewusst: selbst-erzeugtes, isoliertes Export-HTML
    root.appendChild(slide);
  }
  doc.body.appendChild(root);
  return { root, style };
}

export function printDeck(doc: Document, win: Window, slidesHtml: string[]): void {
  const { root, style } = buildPrintRoot(doc, slidesHtml);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    root.remove();
    style.remove();
    win.removeEventListener("afterprint", cleanup);
  };
  win.addEventListener("afterprint", cleanup);
  win.setTimeout(() => { try { win.print(); } catch { new Notice("Print failed"); cleanup(); } }, 150);
  win.setTimeout(cleanup, 60000);
}

export async function captureSlidePng(doc: Document, html: string): Promise<string> {
  const holder = doc.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-99999px";
  holder.style.top = "0";
  const slide = doc.createElement("div");
  slide.className = "sd-slide";
  slide.innerHTML = html;
  holder.appendChild(slide);
  doc.body.appendChild(holder);
  try {
    const canvas = await html2canvas(slide, { width: GEO.width, height: GEO.height, scale: 2, backgroundColor: "#fff" });
    return canvas.toDataURL("image/png");
  } finally {
    holder.remove();
  }
}

export async function runSpike(doc: Document, win: Window): Promise<void> {
  if (!Platform.isDesktopApp) { new Notice("Spike: desktop only"); return; }
  const png = await captureSlidePng(doc, DEMO_SLIDES[0]);
  // PNG-Validierung: ins Devtools-Log, manuell prüfen
  console.log("sd-spike png length", png.length, png.slice(0, 40));
  printDeck(doc, win, DEMO_SLIDES);
}
```

- [ ] **Step 2: Command registrieren** — in `src/main.ts` `onload`

```ts
import { runSpike } from "./spike-export";
// innerhalb onload():
this.addCommand({
  id: "spike-export",
  name: "Spike: export demo deck",
  callback: () => { void runSpike(activeDocument, activeWindow); },
});
```

- [ ] **Step 3: Build + manueller Smoke auf echter App**

```bash
OBSIDIAN_PLUGIN_DIR="<test-vault>/.obsidian/plugins/slide-deck" npm run deploy
```
Dann in Obsidian: Plugin aktivieren → Command „Spike: export demo deck".
**Verify (manuell, dokumentieren):**
1. Print-Dialog öffnet, „Als PDF sichern" erzeugt **2 Seiten 1280×720**, weißer Hintergrund, lesbarer Text — **kein** restliches Obsidian-UI sichtbar.
2. Devtools-Konsole: `sd-spike png length` > 0, beginnt mit `data:image/png`.
3. Nach Schließen des Dialogs: `#sd-print-root` ist aus dem DOM entfernt.

- [ ] **Step 4: Spike-Erkenntnisse notieren** — falls KaTeX/Fonts im Print fehlen oder html2canvas SVG/KaTeX nicht rastert → in `docs/superpowers/plans/` als Notiz festhalten (beeinflusst Task 5/17: ggf. KaTeX-CSS+Fonts inline, ggf. SVG-foreignObject statt html2canvas).

- [ ] **Step 5: Commit**

```bash
git add src/spike-export.ts src/main.ts
git commit -m "feat: export spike (window.print PDF + html2canvas PNG, fixed geometry)"
```

---

## Phase 2 — Pure Core (strikt TDD, Node-testbar)

### Task 3: Deck-Parser (`parseDeck`)

**Files:**
- Create: `src/core/slide-model.ts`, `src/core/geometry.ts`
- Test: `tests/core/slide-model.test.ts`

**Interfaces:**
- Produces: `parseDeck(source: string): SlideDeck`; Typen `SlideDeck`/`Slide`/`DeckDirectives`/`Aspect` (siehe Shared Types). `geometryFor(aspect: Aspect): SlideGeometry`.

- [ ] **Step 1: Failing test** — `tests/core/slide-model.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseDeck } from "../../src/core/slide-model";

describe("parseDeck", () => {
  it("splits on standalone --- lines and tracks start lines", () => {
    const src = "# A\n\ntext\n\n---\n\n# B\n";
    const deck = parseDeck(src);
    expect(deck.slides.map(s => s.index)).toEqual([0, 1]);
    expect(deck.slides[0].markdown.trim()).toBe("# A\n\ntext");
    expect(deck.slides[1].markdown.trim()).toBe("# B");
    expect(deck.slides[1].startLine).toBe(6); // 0-based line of "# B"
  });

  it("reads frontmatter directives with defaults", () => {
    const src = "---\ntheme: dark\naspect: 4:3\nminFontPx: 30\n---\n# Only\n";
    const deck = parseDeck(src);
    expect(deck.directives).toEqual({ theme: "dark", aspect: "4:3", minFontPx: 30 });
    expect(deck.slides).toHaveLength(1);
  });

  it("applies defaults when no frontmatter", () => {
    expect(parseDeck("# A").directives).toEqual({ theme: "default", aspect: "16:9", minFontPx: 24 });
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npx vitest run tests/core/slide-model.test.ts
```
Expected: FAIL „parseDeck is not a function".

- [ ] **Step 3: Implement** — `src/core/geometry.ts`

```ts
import type { Aspect } from "./slide-model";
export interface SlideGeometry { width: number; height: number; }
export function geometryFor(aspect: Aspect): SlideGeometry {
  return aspect === "4:3" ? { width: 960, height: 720 } : { width: 1280, height: 720 };
}
```

`src/core/slide-model.ts`:

```ts
export type Aspect = "16:9" | "4:3";
export interface DeckDirectives { theme: string; aspect: Aspect; minFontPx: number; }
export interface Slide { index: number; markdown: string; speakerNotes?: string; startLine: number; }
export interface SlideDeck { directives: DeckDirectives; slides: Slide[]; }

const DEFAULTS: DeckDirectives = { theme: "default", aspect: "16:9", minFontPx: 24 };

function parseFrontmatter(lines: string[]): { directives: DeckDirectives; bodyStart: number } {
  if (lines[0] !== "---") return { directives: { ...DEFAULTS }, bodyStart: 0 };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { directives: { ...DEFAULTS }, bodyStart: 0 };
  const d: DeckDirectives = { ...DEFAULTS };
  for (let i = 1; i < end; i++) {
    const m = /^(\w+):\s*(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "theme") d.theme = val;
    else if (key === "aspect" && (val === "16:9" || val === "4:3")) d.aspect = val;
    else if (key === "minFontPx") { const n = Number(val); if (Number.isFinite(n) && n > 0) d.minFontPx = n; }
  }
  return { directives: d, bodyStart: end + 1 };
}

export function parseDeck(source: string): SlideDeck {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const { directives, bodyStart } = parseFrontmatter(lines);
  const slides: Slide[] = [];
  let buf: string[] = [];
  let slideStart = bodyStart;
  const flush = (endLine: number) => {
    const md = buf.join("\n");
    if (md.trim().length > 0) slides.push({ index: slides.length, markdown: md, startLine: slideStart });
    void endLine;
  };
  for (let i = bodyStart; i < lines.length; i++) {
    if (lines[i].trim() === "---") { flush(i); buf = []; slideStart = i + 1; }
    else { if (buf.length === 0) slideStart = i; buf.push(lines[i]); }
  }
  flush(lines.length);
  return { directives, slides };
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/slide-model.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/slide-model.ts src/core/geometry.ts tests/core/slide-model.test.ts
git commit -m "feat(core): deck parser with --- split and frontmatter directives"
```

### Task 4: Markdown→HTML Basis (markdown-it + KaTeX + highlight.js)

**Files:**
- Create: `src/core/render/md2html.ts`
- Test: `tests/core/md2html.test.ts`

**Interfaces:**
- Consumes: `RenderInput`/`RenderedSlide` (Shared Types).
- Produces: `renderMarkdown(input: RenderInput): RenderedSlide`. `html` ist Inner-HTML des Folien-Inhalts. Mermaid + Embeds kommen in Task 5/6 dazu (hier nur durchgereicht).

- [ ] **Step 1: Failing test** — `tests/core/md2html.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";

const noEmbed = () => null;

describe("renderMarkdown", () => {
  it("renders headings and emphasis", () => {
    const { html } = renderMarkdown({ markdown: "# Title\n\n**bold**", resolveEmbed: noEmbed });
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders inline KaTeX", () => {
    const { html } = renderMarkdown({ markdown: "$E=mc^2$", resolveEmbed: noEmbed });
    expect(html).toContain("katex");
  });

  it("highlights fenced code", () => {
    const { html } = renderMarkdown({ markdown: "```js\nconst x=1\n```", resolveEmbed: noEmbed });
    expect(html).toContain("hljs");
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/md2html.test.ts`

- [ ] **Step 3: Implement** — `src/core/render/md2html.ts`

```ts
import MarkdownIt from "markdown-it";
import katex from "@vscode/markdown-it-katex";
import hljs from "highlight.js";
import type { Warning } from "../constraints/engine";

export interface RenderInput { markdown: string; resolveEmbed: (ref: string) => string | null; }
export interface RenderedSlide { html: string; warnings: Omit<Warning, "slideIndex">[]; }

function newMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    highlight: (str, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        try { return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`; }
        catch { /* fallthrough */ }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });
  md.use(katex);
  return md;
}

export function renderMarkdown(input: RenderInput): RenderedSlide {
  const md = newMd();
  const warnings: Omit<Warning, "slideIndex">[] = [];
  const html = md.render(input.markdown);
  return { html, warnings };
}
```

> Hinweis: `newMd()` pro Aufruf ist für die Vorschau (debounced) ausreichend; falls Profiling Bedarf zeigt, später eine gecachte Instanz (YAGNI bis dahin).

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/md2html.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/render/md2html.ts tests/core/md2html.test.ts
git commit -m "feat(core): markdown->html with KaTeX and code highlighting"
```

### Task 5: Bild-Embeds auflösen (`![[x]]` + `![](x)`)

**Files:**
- Modify: `src/core/render/md2html.ts`
- Test: `tests/core/embeds.test.ts`

**Interfaces:**
- Produces: `renderMarkdown` ersetzt `![[ref]]` über `resolveEmbed`; fehlende Embeds → `warnings` mit `kind:"missing-embed"`.

- [ ] **Step 1: Failing test** — `tests/core/embeds.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";

describe("embeds", () => {
  it("resolves ![[image]] to an <img> via resolveEmbed", () => {
    const { html, warnings } = renderMarkdown({
      markdown: "![[pic.png]]",
      resolveEmbed: (ref) => (ref === "pic.png" ? "data:image/png;base64,AAA" : null),
    });
    expect(html).toContain('<img');
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(warnings).toHaveLength(0);
  });

  it("warns on a missing embed and renders a placeholder", () => {
    const { html, warnings } = renderMarkdown({ markdown: "![[missing.png]]", resolveEmbed: () => null });
    expect(warnings).toEqual([{ kind: "missing-embed", message: expect.stringContaining("missing.png") }]);
    expect(html).toContain("sd-missing-embed");
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/embeds.test.ts`

- [ ] **Step 3: Implement** — in `src/core/render/md2html.ts`, vor `md.render` eine Vorverarbeitung der `![[…]]`-Syntax und ein collector:

```ts
// innerhalb renderMarkdown, ersetze den html-Aufbau:
const md = newMd();
const warnings: Omit<Warning, "slideIndex">[] = [];
const pre = input.markdown.replace(/!\[\[([^\]]+?)\]\]/g, (_m, ref: string) => {
  const src = input.resolveEmbed(ref.trim());
  if (src) return `<img class="sd-embed" alt="${md.utils.escapeHtml(ref.trim())}" src="${src}">`;
  warnings.push({ kind: "missing-embed", message: `Embed not found: ${ref.trim()}` });
  return `<span class="sd-missing-embed">⟪ ${md.utils.escapeHtml(ref.trim())} ⟫</span>`;
});
const md2 = new MarkdownIt({ html: true, highlight: (md as any).options.highlight });
md2.use(katex);
const html = md2.render(pre);
return { html, warnings };
```

> Da wir kontrollierten, escapeten HTML einfügen, läuft die zweite Instanz mit `html:true`. Standard-Markdown-Bilder `![](path)` reicht der Adapter bereits als auflösbaren Pfad ein (Task 12).

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/embeds.test.ts` und `npx vitest run tests/core/md2html.test.ts` (Regression).

- [ ] **Step 5: Commit**

```bash
git add src/core/render/md2html.ts tests/core/embeds.test.ts
git commit -m "feat(core): resolve image embeds with missing-embed warnings"
```

### Task 6: Callout-Plugin (accessible: Icon + Label + Text)

**Files:**
- Create: `src/core/render/callouts.ts`
- Modify: `src/core/render/md2html.ts` (Plugin einhängen)
- Test: `tests/core/callouts.test.ts`

**Interfaces:**
- Produces: `calloutPlugin(md: MarkdownIt): void`. Wandelt `> [!type] Titel` (Obsidian-Syntax) in `<div class="sd-callout sd-callout-<type>" role="note"><div class="sd-callout-title"><span class="sd-callout-icon" data-icon="<type>"></span><span>Titel</span></div><div class="sd-callout-body">…</div></div>`. Bedeutung redundant: CSS-Klasse (Farbe) **+** `data-icon` (Form) **+** sichtbares Label-Wort.

- [ ] **Step 1: Failing test** — `tests/core/callouts.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";
const noEmbed = () => null;

describe("callouts", () => {
  it("renders a [!warning] callout with icon, type class and label", () => {
    const { html } = renderMarkdown({ markdown: "> [!warning] Heads up\n> be careful", resolveEmbed: noEmbed });
    expect(html).toContain('sd-callout-warning');
    expect(html).toContain('data-icon="warning"');
    expect(html).toContain("Heads up");
    expect(html).toContain("be careful");
  });

  it("falls back to the type as label when no title given", () => {
    const { html } = renderMarkdown({ markdown: "> [!note]\n> body", resolveEmbed: noEmbed });
    expect(html).toContain("Note");
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/callouts.test.ts`

- [ ] **Step 3: Implement** — `src/core/render/callouts.ts`

```ts
import type MarkdownIt from "markdown-it";

const RE = /^\[!(\w+)\]([+-]?)\s*(.*)$/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function calloutPlugin(md: MarkdownIt): void {
  md.core.ruler.after("block", "sd_callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      // erstes inline-Token im blockquote suchen
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "inline") j++;
      if (j >= tokens.length) continue;
      const m = RE.exec(tokens[j].content);
      if (!m) continue;
      const [, typeRaw, , title] = m;
      const type = typeRaw.toLowerCase();
      const label = title.trim() || cap(type);
      // blockquote_open -> callout-Wrapper umfunktionieren
      tokens[i].type = "html_block";
      tokens[i].content =
        `<div class="sd-callout sd-callout-${type}" role="note">` +
        `<div class="sd-callout-title"><span class="sd-callout-icon" data-icon="${type}"></span>` +
        `<span class="sd-callout-label">${md.utils.escapeHtml(label)}</span></div>` +
        `<div class="sd-callout-body">`;
      tokens[i].tag = "";
      // erste Inline-Zeile (die [!type]-Titelzeile) leeren
      tokens[j].children = [];
      tokens[j].content = "";
      // passendes blockquote_close finden und schließen
      let depth = 0;
      for (let k = i + 1; k < tokens.length; k++) {
        if (tokens[k].type === "blockquote_open") depth++;
        else if (tokens[k].type === "blockquote_close") {
          if (depth === 0) { tokens[k].type = "html_block"; tokens[k].content = `</div></div>`; tokens[k].tag = ""; break; }
          depth--;
        }
      }
    }
    return true;
  });
}
```

In `md2html.ts` beide MarkdownIt-Instanzen `.use(calloutPlugin)` einhängen (nach `katex`). Icons werden in der DOM-Schicht via `data-icon` durch `setIcon` belegt (Task 14); im Export-HTML genügt die Form über CSS-`::before` je `sd-callout-<type>` (Task 13-CSS).

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/callouts.test.ts` (+ Regression md2html/embeds).

- [ ] **Step 5: Commit**

```bash
git add src/core/render/callouts.ts src/core/render/md2html.ts tests/core/callouts.test.ts
git commit -m "feat(core): accessible callout rendering (icon+shape+label, not color-only)"
```

### Task 7: Mermaid-Platzhalter im Core (pure), SVG-Rendering separat

**Files:**
- Modify: `src/core/render/md2html.ts` (fence-Override für `mermaid`)
- Test: `tests/core/mermaid-slot.test.ts`

**Interfaces:**
- Produces: `mermaid`-Codeblöcke werden zu `<div class="sd-mermaid" data-src="<base64>"></div>` (kein SVG im Core — pure/Node-rein). Die DOM-Schicht (Task 15/16/17) ersetzt Slots durch SVG.

- [ ] **Step 1: Failing test** — `tests/core/mermaid-slot.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/core/render/md2html";
const noEmbed = () => null;

describe("mermaid slot", () => {
  it("emits a placeholder div with base64 source, no <svg> in core", () => {
    const src = "graph TD; A-->B";
    const { html } = renderMarkdown({ markdown: "```mermaid\n" + src + "\n```", resolveEmbed: noEmbed });
    expect(html).toContain('class="sd-mermaid"');
    expect(html).not.toContain("<svg");
    const b64 = Buffer.from(src).toString("base64");
    expect(html).toContain(`data-src="${b64}"`);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/mermaid-slot.test.ts`

- [ ] **Step 3: Implement** — in `newMd()` (und der zweiten Instanz) eine fence-Regel ergänzen:

```ts
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === "mermaid") {
    const b64 = Buffer.from(token.content, "utf8").toString("base64");
    return `<div class="sd-mermaid" data-src="${b64}"></div>`;
  }
  return defaultFence(tokens, idx, opts, env, self);
};
```

> `Buffer` ist im esbuild-cjs-Bundle/Electron verfügbar. Falls eine spätere Web-Portierung (md2pdf außerhalb Electron) ansteht, auf `btoa`/`TextEncoder` umstellen — bis dahin YAGNI.

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/mermaid-slot.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/render/md2html.ts tests/core/mermaid-slot.test.ts
git commit -m "feat(core): emit mermaid placeholders (svg rendering stays in DOM layer)"
```

### Task 8: Fit-Entscheidung (`computeFit`)

**Files:**
- Create: `src/core/layout/fit.ts`
- Test: `tests/core/fit.test.ts`

**Interfaces:**
- Consumes: `Measured`, `SlideGeometry`.
- Produces: `computeFit(measured: Measured, geo: SlideGeometry, minScale: number): FitResult`. `minScale` = `minFontPx / baseFontPx` (Adapter liefert ihn). Skaliert herunter bis `minScale`; passt es dann immer noch nicht → `overflow:true`, `scale` bleibt `minScale`. (Die DOM-Messung liefert `Measured`; die *Entscheidung* ist pure + getestet.)

- [ ] **Step 1: Failing test** — `tests/core/fit.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { computeFit } from "../../src/core/layout/fit";

const GEO = { width: 1280, height: 720 };

describe("computeFit", () => {
  it("scale 1 when content fits", () => {
    expect(computeFit({ contentWidth: 1000, contentHeight: 600 }, GEO, 0.5)).toEqual({ scale: 1, overflow: false });
  });
  it("scales down to fit, no overflow", () => {
    // content 1.2x too tall -> needs scale ~0.833, above floor 0.5
    const r = computeFit({ contentWidth: 1280, contentHeight: 864 }, GEO, 0.5);
    expect(r.overflow).toBe(false);
    expect(r.scale).toBeCloseTo(720 / 864, 3);
  });
  it("clamps at minScale and flags overflow", () => {
    const r = computeFit({ contentWidth: 1280, contentHeight: 2000 }, GEO, 0.7);
    expect(r).toEqual({ scale: 0.7, overflow: true });
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/fit.test.ts`

- [ ] **Step 3: Implement** — `src/core/layout/fit.ts`

```ts
import type { SlideGeometry } from "../geometry";
export interface Measured { contentWidth: number; contentHeight: number; }
export interface FitResult { scale: number; overflow: boolean; }

export function computeFit(measured: Measured, geo: SlideGeometry, minScale: number): FitResult {
  const needed = Math.min(geo.width / measured.contentWidth, geo.height / measured.contentHeight);
  if (needed >= 1) return { scale: 1, overflow: false };
  if (needed >= minScale) return { scale: needed, overflow: false };
  return { scale: minScale, overflow: true };
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/fit.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/layout/fit.ts tests/core/fit.test.ts
git commit -m "feat(core): fit-or-warn decision (scale down to legibility floor, then flag)"
```

### Task 9: Constraint-Engine (Warnungen aggregieren) + Authoring-Contract

**Files:**
- Create: `src/core/constraints/engine.ts`, `src/core/constraints/contract.ts`
- Test: `tests/core/constraints.test.ts`

**Interfaces:**
- Produces:
  - `engine.ts`: Typen `Warning`/`WarningKind`; `collectWarnings(slideIndex, render: RenderedSlide, fit: FitResult, startLine: number): Warning[]` (mappt render-warnings + overflow → `Warning[]` mit `slideIndex`/`sourceLine`).
  - `contract.ts`: `getAuthoringContract(directives: DeckDirectives): AuthoringContract` + `contractToPrompt(c: AuthoringContract): string` — die maschinenlesbare Regelquelle (Geometrie, Boden, unterstützte Syntax). Single source für Export-Gate, Live-Warnings, Doku, LLM (Phase 2).

- [ ] **Step 1: Failing test** — `tests/core/constraints.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { collectWarnings } from "../../src/core/constraints/engine";
import { getAuthoringContract, contractToPrompt } from "../../src/core/constraints/contract";

describe("collectWarnings", () => {
  it("tags slideIndex and overflow", () => {
    const w = collectWarnings(2, { html: "", warnings: [{ kind: "missing-embed", message: "x" }] },
      { scale: 0.5, overflow: true }, 40);
    expect(w).toEqual([
      { slideIndex: 2, kind: "missing-embed", message: "x", sourceLine: 40 },
      { slideIndex: 2, kind: "overflow", message: expect.any(String), sourceLine: 40 },
    ]);
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

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/constraints.test.ts`

- [ ] **Step 3: Implement** — `src/core/constraints/engine.ts`

```ts
import type { RenderedSlide } from "../render/md2html";
import type { FitResult } from "../layout/fit";

export type WarningKind = "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }

export function collectWarnings(slideIndex: number, render: RenderedSlide, fit: FitResult, startLine: number): Warning[] {
  const out: Warning[] = render.warnings.map((w) => ({ ...w, slideIndex, sourceLine: startLine }));
  if (fit.overflow) {
    out.push({ slideIndex, kind: "overflow", message: "Content overflows at the legibility floor — condense this slide.", sourceLine: startLine });
  }
  return out;
}
```

`src/core/constraints/contract.ts`:

```ts
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
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/constraints.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/constraints/ tests/core/constraints.test.ts
git commit -m "feat(core): constraint engine + machine-readable authoring contract"
```

### Task 10: CI-Gate — Core bleibt obsidian-/DOM-frei

**Files:**
- Create: `scripts/check-core-purity.mjs`
- Modify: `package.json` (`"test"`-Skript um Gate erweitern)

- [ ] **Step 1: Gate-Skript** — `scripts/check-core-purity.mjs`

```js
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const BAD = [/from ["']obsidian["']/, /\bactiveDocument\b/, /\bactiveWindow\b/, /\bdocument\./, /\bwindow\./];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) {
      const src = readFileSync(p, "utf8");
      for (const re of BAD) if (re.test(src)) { console.error(`Core purity violation in ${p}: ${re}`); process.exit(1); }
    }
  }
}
walk("src/core");
console.log("core purity OK");
```

- [ ] **Step 2: package.json** — `"test": "node scripts/check-core-purity.mjs && vitest run"`

- [ ] **Step 3: Verify** — `npm test` (Gate „core purity OK" + Tests grün).

- [ ] **Step 4: Commit**

```bash
git add scripts/check-core-purity.mjs package.json
git commit -m "test: gate core/ against obsidian and DOM globals"
```

---

## Phase 3 — Obsidian-Adapter & UI

### Task 11: Kanonische `i18n.ts` + `dom-safe.ts` (kit-ready)

**Files:**
- Create: `src/i18n.ts`, `src/dom-safe.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Produces: `pickLang/setLang/getLang/t(key,...args)` (Signatur kanonisch, PROF-OBS-07). `activeDoc(): Document`, `activeWin(): Window` (PROF-OBS-13). Diese zwei Dateien sind die kit-ready Kopien (§15 Spec).

- [ ] **Step 1: Failing test** — `tests/i18n.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { pickLang, setLang, t } from "../src/i18n";

describe("i18n", () => {
  beforeEach(() => setLang("en"));
  it("pickLang maps locale prefix", () => { expect(pickLang("de-DE")).toBe("de"); expect(pickLang("fr")).toBe("en"); });
  it("interpolates positional args", () => { expect(t("export.done", 3)).toContain("3"); });
  it("falls back en -> key", () => { expect(t("does.not.exist")).toBe("does.not.exist"); });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/i18n.test.ts`

- [ ] **Step 3: Implement** — `src/i18n.ts` (kanonische Struktur aus `image-to-markdown/src/i18n.ts`, eigene Keys):

```ts
export type Lang = "en" | "de";
let currentLang: Lang = "en";
export function pickLang(raw?: string | null): Lang { return raw && raw.toLowerCase().startsWith("de") ? "de" : "en"; }
export function setLang(lang: Lang): void { currentLang = lang; }
export function getLang(): Lang { return currentLang; }
type Dict = Record<string, string>;

const EN: Dict = {
  "cmd.openPreview": "Open presentation preview",
  "cmd.exportPdf": "Export presentation to PDF",
  "cmd.exportImages": "Export presentation to image series",
  "notice.noActiveNote": "No active note.",
  "notice.exporting": "Exporting…",
  "export.done": "Exported {0} slides",
  "warn.overflow": "Slide {0}: content overflows — condense it",
  "warn.missingEmbed": "Slide {0}: embed not found",
  "preview.empty": "No slides. Separate slides with a line containing only ---",
  "settings.heading": "Slide deck",
  "settings.theme.name": "Default preset",
  "settings.theme.desc": "Preset used when a note has no theme directive",
  "settings.minFont.name": "Minimum body font size (px)",
  "settings.minFont.desc": "Legibility floor; slides that need smaller text are flagged",
  "settings.imageScale.name": "Image export scale",
  "settings.imageScale.desc": "Pixel multiplier for PNG export (2 = crisp)",
};
const DE: Dict = {
  "cmd.openPreview": "Präsentations-Vorschau öffnen",
  "cmd.exportPdf": "Präsentation als PDF exportieren",
  "cmd.exportImages": "Präsentation als Bilderserie exportieren",
  "notice.noActiveNote": "Keine aktive Notiz.",
  "notice.exporting": "Exportiere…",
  "export.done": "{0} Folien exportiert",
  "warn.overflow": "Folie {0}: Inhalt läuft über — verdichten",
  "warn.missingEmbed": "Folie {0}: Embed nicht gefunden",
  "preview.empty": "Keine Folien. Folien mit einer Zeile aus nur --- trennen",
  "settings.heading": "Slide deck",
  "settings.theme.name": "Standard-Preset",
  "settings.theme.desc": "Preset, wenn eine Notiz keine theme-Direktive hat",
  "settings.minFont.name": "Mindest-Schriftgröße Body (px)",
  "settings.minFont.desc": "Lesbarkeits-Boden; Folien mit kleinerem Text werden markiert",
  "settings.imageScale.name": "Bild-Export-Skalierung",
  "settings.imageScale.desc": "Pixel-Multiplikator für PNG-Export (2 = scharf)",
};
const STRINGS: Record<Lang, Dict> = { en: EN, de: DE };
export function t(key: string, ...args: (string | number)[]): string {
  const raw = STRINGS[currentLang][key] ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\d+)\}/g, (_m, i) => { const v = args[Number(i)]; return v === undefined ? `{${i}}` : String(v); });
}
```

`src/dom-safe.ts`:

```ts
export function activeDoc(): Document { return activeDocument; }
export function activeWin(): Window { return activeWindow; }
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/i18n.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts src/dom-safe.ts tests/i18n.test.ts
git commit -m "feat: canonical i18n + popout-safe dom helpers (kit-ready)"
```

### Task 12: Adapter — aktive Notiz lesen, Embeds auflösen

**Files:**
- Create: `src/adapter.ts`
- Test: `tests/adapter.test.ts`

**Interfaces:**
- Consumes: `parseDeck`, obsidian `App`.
- Produces: `loadActiveDeck(app: App): { deck: SlideDeck; resolveEmbed: (ref: string) => string | null } | null`. `resolveEmbed` nutzt `metadataCache.getFirstLinkpathDest` + synchron vorab geladene Data-URLs. **Designentscheidung:** Embeds werden vor dem Render asynchron zu Data-URLs vorgeladen (`preloadEmbeds`), damit `resolveEmbed` synchron bleibt (Core-Vertrag).

- [ ] **Step 1: Failing test** — `tests/adapter.test.ts` (mit erweitertem obsidian-Mock; `binaryToDataUrl` pure testen)

```ts
import { describe, it, expect } from "vitest";
import { binaryToDataUrl } from "../src/adapter";

describe("binaryToDataUrl", () => {
  it("builds a data url from bytes + extension", () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(binaryToDataUrl(bytes, "png")).toMatch(/^data:image\/png;base64,/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/adapter.test.ts`

- [ ] **Step 3: Implement** — `src/adapter.ts`

```ts
import { type App, TFile } from "obsidian";
import { parseDeck, type SlideDeck } from "./core/slide-model";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export function binaryToDataUrl(buf: ArrayBuffer, ext: string): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const mime = MIME[ext.toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${btoa(bin)}`;
}

export async function loadActiveDeck(app: App): Promise<{ deck: SlideDeck; resolveEmbed: (ref: string) => string | null } | null> {
  const file = app.workspace.getActiveFile();
  if (!file) return null;
  const source = await app.vault.read(file);
  const deck = parseDeck(source);
  // Embeds vorab zu Data-URLs (synchroner resolveEmbed-Vertrag fürs Core)
  const cache = new Map<string, string>();
  const refs = new Set<string>();
  for (const s of deck.slides) for (const m of s.markdown.matchAll(/!\[\[([^\]]+?)\]\]/g)) refs.add(m[1].trim());
  for (const ref of refs) {
    const dest = app.metadataCache.getFirstLinkpathDest(ref, file.path);
    if (dest instanceof TFile && dest.extension in MIME) {
      try { cache.set(ref, binaryToDataUrl(await app.vault.readBinary(dest), dest.extension)); } catch { /* missing -> warning later */ }
    }
  }
  return { deck, resolveEmbed: (ref) => cache.get(ref) ?? null };
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/adapter.test.ts`. Falls `btoa` im Node-Test fehlt: vitest nutzt Node ≥18 → `btoa` global vorhanden; sonst Test auf `binaryToDataUrl` mit `globalThis.btoa`-Guard.

- [ ] **Step 5: Commit**

```bash
git add src/adapter.ts tests/adapter.test.ts
git commit -m "feat: adapter loads active note as deck with preloaded embed data-urls"
```

### Task 13: Default-Preset + Basis-Styles (inkl. accessible Callout-CSS)

**Files:**
- Create: `src/core/presets/default.css.ts` (Preset als exportierter CSS-String, damit self-contained Export ihn inlinen kann)
- Modify: `styles.css` (Preview-Chrome; importiert dieselben Preset-Tokens)
- Test: `tests/core/presets.test.ts`

**Interfaces:**
- Produces: `PRESETS: Record<string, string>` und `presetCss(name: string): string` (Fallback `default`). Preset enthält: Folien-Box (feste Geometrie via Variablen), Typo-Hierarchie, großzügiger Weißraum, KaTeX-CSS-Hook, hljs-Theme, **Callout-Styles mit `::before`-Form je Typ** (Farbe + Form, nicht nur Farbe), WCAG-AA-Kontraste.

- [ ] **Step 1: Failing test** — `tests/core/presets.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { presetCss } from "../../src/core/presets/default.css";

describe("presetCss", () => {
  it("returns default for unknown names and includes callout shapes", () => {
    const css = presetCss("nope");
    expect(css).toContain(".sd-slide");
    expect(css).toContain(".sd-callout-warning");
    expect(css).toContain("::before"); // Form-Redundanz, nicht nur Farbe
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/core/presets.test.ts`

- [ ] **Step 3: Implement** — `src/core/presets/default.css.ts`

```ts
const DEFAULT = `
.sd-slide{ --sd-base: 28px; width:var(--sd-w,1280px); height:var(--sd-h,720px); box-sizing:border-box;
  padding:64px; overflow:hidden; background:#ffffff; color:#16181d; font-size:var(--sd-base);
  line-height:1.4; font-family: ui-sans-serif, system-ui, sans-serif; }
.sd-slide h1{ font-size:2.2em; margin:0 0 .4em; }
.sd-slide h2{ font-size:1.7em; margin:0 0 .4em; }
.sd-slide ul,.sd-slide ol{ margin:0; padding-left:1.2em; }
.sd-slide li{ margin:.25em 0; }
.sd-slide pre.hljs{ font-size:.8em; padding:.6em .8em; border-radius:8px; background:#0d1117; color:#e6edf3; overflow:hidden; }
.sd-embed{ max-width:100%; max-height:60%; object-fit:contain; }
.sd-mermaid svg{ max-width:100%; max-height:60%; }
.sd-missing-embed{ color:#8a4b00; border:2px dashed #8a4b00; padding:0 .3em; border-radius:4px; }
/* Callouts: Bedeutung redundant — Rahmenfarbe + Form (::before) + Label-Wort */
.sd-callout{ border-left:6px solid #5b6470; background:#f4f6f8; padding:.5em .8em; border-radius:6px; margin:.4em 0; }
.sd-callout-title{ display:flex; align-items:center; gap:.4em; font-weight:600; }
.sd-callout-icon::before{ font-size:1em; }
.sd-callout-note{ border-left-color:#3b6db5; } .sd-callout-note .sd-callout-icon::before{ content:"ℹ"; }
.sd-callout-warning{ border-left-color:#b58a1e; } .sd-callout-warning .sd-callout-icon::before{ content:"▲"; }
.sd-callout-danger{ border-left-color:#b5443b; } .sd-callout-danger .sd-callout-icon::before{ content:"✕"; }
.sd-callout-tip{ border-left-color:#2e8b6f; } .sd-callout-tip .sd-callout-icon::before{ content:"★"; }
.sd-callout-info{ border-left-color:#3b6db5; } .sd-callout-info .sd-callout-icon::before{ content:"ℹ"; }
`;
export const PRESETS: Record<string, string> = { default: DEFAULT };
export function presetCss(name: string): string { return PRESETS[name] ?? PRESETS.default; }
```

> KaTeX-CSS wird zusätzlich gebündelt (Import `katex/dist/katex.min.css` in `main.ts` via esbuild-css-Loader **oder** als String inline). Im Spike (Task 2) geklärt, welcher Weg im Export trägt; default: KaTeX-CSS-String in den Export-`<style>` voranstellen.

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/core/presets.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/presets/default.css.ts styles.css tests/core/presets.test.ts
git commit -m "feat(core): default preset with accessible callout shapes (icon+color+label)"
```

### Task 14: Deck-Renderer (DOM) — HTML bauen, Mermaid-SVG, messen, fit

**Files:**
- Create: `src/render-dom.ts`
- Test: manueller Smoke (DOM/async) + Wiederverwendung der getesteten Core-Logik

**Interfaces:**
- Consumes: `renderMarkdown`, `computeFit`, `collectWarnings`, `presetCss`, `geometryFor`, mermaid.
- Produces: `renderDeckToContainer(doc, container, deck, resolveEmbed): Promise<Warning[]>` — erzeugt pro Folie eine `.sd-slide`-Box (feste Geometrie), ersetzt `.sd-mermaid`-Slots durch SVG (`mermaid.render`), belegt `data-icon` via `setIcon`, **misst** den Inhalt, ruft `computeFit`, wendet `transform:scale` an, sammelt `Warning[]`. `buildSelfContainedDeckHtml(deck, resolveEmbed): Promise<{ html: string; css: string; count: number; warnings: Warning[] }>` für den Export (Task 16).

- [ ] **Step 1: Modul schreiben** — `src/render-dom.ts`

```ts
import mermaid from "mermaid";
import { setIcon } from "obsidian";
import { renderMarkdown } from "./core/render/md2html";
import { computeFit } from "./core/layout/fit";
import { collectWarnings, type Warning } from "./core/constraints/engine";
import { presetCss } from "./core/presets/default.css";
import { geometryFor } from "./core/geometry";
import type { SlideDeck } from "./core/slide-model";

mermaid.initialize({ startOnLoad: false, theme: "default" });

const ICON: Record<string, string> = { note: "info", info: "info", warning: "alert-triangle", danger: "x-circle", tip: "lightbulb" };

async function renderMermaidSlots(doc: Document, scope: HTMLElement, slideIndex: number, warnings: Warning[]): Promise<void> {
  const slots = Array.from(scope.querySelectorAll<HTMLElement>(".sd-mermaid"));
  for (let i = 0; i < slots.length; i++) {
    const src = atob(slots[i].dataset.src ?? "");
    try {
      const { svg } = await mermaid.render(`sd-mm-${slideIndex}-${i}-${src.length}`, src);
      slots[i].innerHTML = svg;
    } catch {
      slots[i].textContent = "⚠ mermaid error";
      warnings.push({ slideIndex, kind: "mermaid-error", message: "Mermaid diagram failed to parse" });
    }
  }
}

function decorateIcons(scope: HTMLElement): void {
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>(".sd-callout-icon"))) {
    const type = el.parentElement?.parentElement?.className.match(/sd-callout-(\w+)/)?.[1] ?? "note";
    setIcon(el, ICON[type] ?? "info");
  }
}

export async function renderDeckToContainer(
  doc: Document, container: HTMLElement, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
): Promise<Warning[]> {
  const geo = geometryFor(deck.directives.aspect);
  const minScale = deck.directives.minFontPx / 28; // 28 = --sd-base
  const warnings: Warning[] = [];
  container.empty();
  for (const slide of deck.slides) {
    const box = container.createDiv({ cls: "sd-slide" });
    box.style.setProperty("--sd-w", `${geo.width}px`);
    box.style.setProperty("--sd-h", `${geo.height}px`);
    const rendered = renderMarkdown({ markdown: slide.markdown, resolveEmbed });
    const inner = box.createDiv({ cls: "sd-content" });
    inner.innerHTML = rendered.html; // selbst-erzeugtes, kontrolliertes HTML
    await renderMermaidSlots(doc, inner, slide.index, warnings);
    decorateIcons(inner);
    const fit = computeFit({ contentWidth: inner.scrollWidth, contentHeight: inner.scrollHeight }, geo, minScale);
    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${fit.scale})`;
    warnings.push(...collectWarnings(slide.index, rendered, fit, slide.startLine));
  }
  return warnings;
}
```

> Hinweis: `setIcon`/`createDiv`/`empty` sind Obsidian-DOM-Helfer; `innerHTML` hier nur auf selbst-erzeugtem Render-HTML (kontrolliert) — der CI-grep (Task 10) deckt nur `src/core` ab, dies ist Adapter.

- [ ] **Step 2: `buildSelfContainedDeckHtml` ergänzen** (für Export) — gleiches Modul:

```ts
export async function buildSelfContainedDeckHtml(
  doc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const staging = doc.createElement("div");
  staging.style.position = "fixed"; staging.style.left = "-99999px"; staging.style.top = "0";
  doc.body.appendChild(staging);
  try {
    const warnings = await renderDeckToContainer(doc, staging, deck, resolveEmbed);
    const slidesHtml = Array.from(staging.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css: presetCss(deck.directives.theme), warnings };
  } finally {
    staging.remove();
  }
}
```

- [ ] **Step 3: Build prüfen** — `npm run build` (Typecheck grün; mermaid/html2canvas gebündelt).

- [ ] **Step 4: Commit**

```bash
git add src/render-dom.ts
git commit -m "feat: DOM deck renderer (mermaid svg, icon decoration, measure + fit)"
```

### Task 15: Preview-View (Live, debounced, Warnings)

**Files:**
- Create: `src/preview-view.ts`
- Modify: `src/main.ts` (View + Command registrieren)
- Test: manueller Smoke

**Interfaces:**
- Consumes: `renderDeckToContainer`, `loadActiveDeck`, `t`, `activeDoc`.
- Produces: `class SlideDeckView extends ItemView` (`VIEW_TYPE = "slide-deck-preview"`). Header: Warnungs-Liste (klickbar → `sourceLine`). Body: skalierte Folien. Debounced Re-Render (300 ms) auf `editor-change`/`active-leaf-change`; Mermaid-Cache (Hash → SVG) gegen Drosselung.

- [ ] **Step 1: View schreiben** — `src/preview-view.ts`

```ts
import { ItemView, WorkspaceLeaf, MarkdownView, debounce } from "obsidian";
import { loadActiveDeck } from "./adapter";
import { renderDeckToContainer } from "./render-dom";
import { activeDoc } from "./dom-safe";
import { t } from "./i18n";

export const VIEW_TYPE = "slide-deck-preview";

export class SlideDeckView extends ItemView {
  private warnEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private rerender = debounce(() => void this.refresh(), 300, true);

  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Slide deck"; }
  getIcon(): string { return "presentation"; }

  async onOpen(): Promise<void> {
    this.warnEl = this.contentEl.createDiv({ cls: "sd-warnings" });
    this.deckEl = this.contentEl.createDiv({ cls: "sd-deck" });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.rerender()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.rerender()));
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const loaded = await loadActiveDeck(this.app);
    this.warnEl.empty();
    this.deckEl.empty();
    if (!loaded || loaded.deck.slides.length === 0) { this.deckEl.createDiv({ text: t("preview.empty") }); return; }
    const warnings = await renderDeckToContainer(activeDoc(), this.deckEl, loaded.deck, loaded.resolveEmbed);
    for (const w of warnings) {
      const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
      if (w.sourceLine !== undefined) row.onClickEvent(() => this.jumpTo(w.sourceLine!));
    }
  }

  private jumpTo(line: number): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    view?.editor.setCursor({ line, ch: 0 });
  }

  async onClose(): Promise<void> { this.deckEl?.empty(); }
}
```

- [ ] **Step 2: main.ts** — View registrieren + Command:

```ts
import { SlideDeckView, VIEW_TYPE } from "./preview-view";
// onload():
this.registerView(VIEW_TYPE, (leaf) => new SlideDeckView(leaf));
this.addCommand({ id: "open-preview", name: t("cmd.openPreview"), callback: () => void this.activatePreview() });
```

```ts
// Methode in der Plugin-Klasse:
private async activatePreview(): Promise<void> {
  const { workspace } = this.app;
  const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
  const leaf = existing ?? workspace.getRightLeaf(false)!;
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  workspace.revealLeaf(leaf);
}
```

> `revealLeaf` setzt `minAppVersion` ≥ 1.7.2 (PROF-OBS-10). `versions.json` + `manifest.minAppVersion` entsprechend prüfen/anheben.

- [ ] **Step 3: Smoke** — `npm run deploy`, Notiz mit 3 `---`-getrennten Folien (inkl. Callout, `mermaid`, `$x^2$`, überlange Folie). **Verify:** Folien skaliert sichtbar; überlange Folie zeigt `overflow`-Warnung; Klick auf Warnung springt zur Zeile; Tippen aktualisiert (debounced).

- [ ] **Step 4: Commit**

```bash
git add src/preview-view.ts src/main.ts manifest.json versions.json
git commit -m "feat: live preview pane with fit warnings and source jump"
```

### Task 16: Export-Befehle (PDF + Bilderserie)

**Files:**
- Create: `src/export.ts`
- Modify: `src/main.ts` (zwei Commands), `src/spike-export.ts` → produktive Teile übernehmen, Spike-Command entfernen
- Test: manueller Smoke (Spike hat Mechanismus bewiesen)

**Interfaces:**
- Consumes: `buildSelfContainedDeckHtml`, `loadActiveDeck`, `printDeck`/`captureSlidePng`-Muster (aus Spike), `activeDoc/activeWin`.
- Produces: `exportPdf(app, doc, win): Promise<void>`, `exportImages(app, doc, win): Promise<void>` (PNG je Folie via `app.vault.adapter.write` in einen wählbaren Ordner / `.slide-export/`).

- [ ] **Step 1: export.ts schreiben** — wiederverwendet das im Spike validierte Print-/Capture-Muster, jetzt mit echtem Deck + Preset-CSS:

```ts
import { Notice, type App } from "obsidian";
import html2canvas from "html2canvas";
import { loadActiveDeck } from "./adapter";
import { buildSelfContainedDeckHtml } from "./render-dom";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";

function printRootCss(w: number, h: number, preset: string): string {
  return `${preset}\n#sd-print-root{display:none;}\n@media print{@page{size:${w}px ${h}px;margin:0;}` +
    `html,body{margin:0!important;padding:0!important;background:#fff!important;}` +
    `body>*:not(#sd-print-root){display:none!important;}#sd-print-root{display:block!important;}` +
    `.sd-slide{break-after:page;}}`;
}

export async function exportPdf(app: App, doc: Document, win: Window): Promise<void> {
  const loaded = await loadActiveDeck(app);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed);
  doc.getElementById("sd-print-root")?.remove();
  doc.getElementById("sd-print-style")?.remove();
  const style = doc.createElement("style"); style.id = "sd-print-style";
  style.textContent = printRootCss(geo.width, geo.height, css); doc.head.appendChild(style);
  const root = doc.createElement("div"); root.id = "sd-print-root";
  root.innerHTML = slidesHtml.join(""); doc.body.appendChild(root);
  let done = false;
  const cleanup = () => { if (done) return; done = true; root.remove(); style.remove(); win.removeEventListener("afterprint", cleanup); };
  win.addEventListener("afterprint", cleanup);
  win.setTimeout(() => { try { win.print(); } catch { new Notice("Print failed"); cleanup(); } }, 200);
  win.setTimeout(cleanup, 60000);
}

export async function exportImages(app: App, doc: Document, win: Window): Promise<void> {
  const loaded = await loadActiveDeck(app);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const geo = geometryFor(loaded.deck.directives.aspect);
  const { slidesHtml, css } = await buildSelfContainedDeckHtml(doc, loaded.deck, loaded.resolveEmbed);
  const holder = doc.createElement("div");
  holder.style.position = "fixed"; holder.style.left = "-99999px"; holder.style.top = "0";
  const style = doc.createElement("style"); style.textContent = css; holder.appendChild(style);
  doc.body.appendChild(holder);
  const dir = ".slide-export";
  const adapter = app.vault.adapter;
  try {
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    const base = app.workspace.getActiveFile()?.basename ?? "deck";
    for (let i = 0; i < slidesHtml.length; i++) {
      holder.insertAdjacentHTML("beforeend", slidesHtml[i]);
      const el = holder.lastElementChild as HTMLElement;
      const canvas = await html2canvas(el, { width: geo.width, height: geo.height, scale: 2, backgroundColor: "#fff" });
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      await adapter.writeBinary(`${dir}/${base}-${String(i + 1).padStart(2, "0")}.png`, Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
      el.remove();
    }
    new Notice(t("export.done", slidesHtml.length));
  } finally { holder.remove(); }
}
```

- [ ] **Step 2: main.ts** — Commands; Spike entfernen:

```ts
import { exportPdf, exportImages } from "./export";
// onload():
this.addCommand({ id: "export-pdf", name: t("cmd.exportPdf"), callback: () => void exportPdf(this.app, activeDocument, activeWindow) });
this.addCommand({ id: "export-images", name: t("cmd.exportImages"), callback: () => void exportImages(this.app, activeDocument, activeWindow) });
```
`src/spike-export.ts` löschen, Spike-Command aus `onload` entfernen.

- [ ] **Step 3: Smoke** — `npm run deploy`. **Verify:** Export-PDF → N Seiten in korrekter Geometrie, Callouts/Code/KaTeX/Mermaid sichtbar. Export-Bilderserie → `.slide-export/<note>-01.png …` in korrekter Auflösung. (Falls KaTeX/Mermaid in html2canvas fehlen → Spike-Notiz Task 2/Step 4: ggf. `foreignObject`-SVG-Pfad statt html2canvas, oder Fonts vorab laden.)

- [ ] **Step 4: Commit**

```bash
git rm src/spike-export.ts
git add src/export.ts src/main.ts
git commit -m "feat: export deck to PDF (print) and PNG series (html2canvas)"
```

### Task 17: Settings-Tab

**Files:**
- Create: `src/settings.ts`
- Modify: `src/main.ts` (Settings laden/speichern, Tab registrieren, `setLang` beim onload)

**Interfaces:**
- Produces: `interface SlideDeckSettings { defaultTheme: string; minFontPx: number; imageScale: number }`, `DEFAULT_SETTINGS`, `class SlideDeckSettingTab extends PluginSettingTab`. Vanilla Setting-API, sentence-case, gruppiert, kein CSS auf `.setting-item` (PROF-OBS-06).

- [ ] **Step 1: settings.ts** schreiben

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";

export interface SlideDeckSettings { defaultTheme: string; minFontPx: number; imageScale: number; }
export const DEFAULT_SETTINGS: SlideDeckSettings = { defaultTheme: "default", minFontPx: 24, imageScale: 2 };

export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.heading")).setHeading();
    new Setting(containerEl).setName(t("settings.theme.name")).setDesc(t("settings.theme.desc"))
      .addText((c) => c.setValue(this.plugin.settings.defaultTheme).onChange(async (v) => { this.plugin.settings.defaultTheme = v.trim() || "default"; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(t("settings.minFont.name")).setDesc(t("settings.minFont.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.minFontPx)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.minFontPx = n; await this.plugin.saveSettings(); } }));
    new Setting(containerEl).setName(t("settings.imageScale.name")).setDesc(t("settings.imageScale.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.imageScale)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.imageScale = n; await this.plugin.saveSettings(); } }));
  }
}
```

- [ ] **Step 2: main.ts** — Settings-Lifecycle + Sprache:

```ts
import { getLanguage } from "obsidian";
import { DEFAULT_SETTINGS, SlideDeckSettings, SlideDeckSettingTab } from "./settings";
import { pickLang, setLang } from "./i18n";
// Klassenfeld: settings!: SlideDeckSettings;
// onload() ZUERST:
setLang(pickLang(getLanguage()));
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
this.addSettingTab(new SlideDeckSettingTab(this.app, this));
// Methode:
// async saveSettings(){ await this.saveData(this.settings); }
```

> `defaultTheme`/`minFontPx` aus Settings greifen, wenn die Notiz **keine** entsprechende Frontmatter-Direktive hat — `parseDeck` mit Settings-Defaults speisen (kleine Erweiterung: `parseDeck(source, settingsDefaults?)`; Test in Task 3 erweitern, falls umgesetzt).

- [ ] **Step 3: Smoke + lint** — `npm run lint && npm run build && npm run deploy`; Settings-Tab erscheint, Werte persistieren.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts src/main.ts
git commit -m "feat: settings tab (default preset, legibility floor, image scale)"
```

---

## Phase 4 — Doku & Release

### Task 18: README (+de), CHANGELOG, AGENTS.md, SECURITY, Release-Check

**Files:**
- Create: `README.md`, `README.de.md`, `CHANGELOG.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/images/.gitkeep`

**Interfaces:** keine — Doku/Meta (CORE-META-01/05/06, PROF-OBS-05/14).

- [ ] **Step 1: README.md** nach Plugin-Vorlage (`_docs/templates/obsidian-plugin/README-START.md`): Titel · 1-Satz · Badges · Hero-Platzhalter · Features (mit Screenshot-Slots) · Requirements (Obsidian-Version, Desktop) · Install (Community/Manual/BRAT/Source) · Configuration-Tabelle · „How it works" (Folien-Split, Fit-or-warn, Export). **Absolute Links** (raw.githubusercontent.com für Bilder), **keine** „coming soon"-Platzhalter (PROF-OBS-14). `README.de.md` analog mit Sprach-Toggle-Zeile.

- [ ] **Step 2: AGENTS.md** mit Skelett (Project character · Architecture principles [Pure-Core-Naht!] · Commands · Conventions · Gotchas · Memory · Abweichungen von der Leitkonvention). Architektur/`src`-Layout hierher, nicht in README.

- [ ] **Step 3: CHANGELOG.md** (keep-a-changelog) mit `0.1.0` unreleased-Eintrag; `SECURITY.md`, `CONTRIBUTING.md` aus image-to-markdown adaptieren.

- [ ] **Step 4: Release-Readiness prüfen** — `release.yml` vorhanden, `versions.json`/`manifest.version`/`package.version` synchron, `npm run lint && npm test && npm run build` grün. **Noch nicht taggen** (id-Uniqueness + Spike-Erkenntnisse abschließen).

- [ ] **Step 5: Commit**

```bash
git add README.md README.de.md CHANGELOG.md AGENTS.md SECURITY.md CONTRIBUTING.md docs/images/.gitkeep
git commit -m "docs: README (+de), AGENTS, CHANGELOG, SECURITY for release readiness"
```

---

## Self-Review (gegen den Spec)

**1. Spec-Coverage:**
- §4 Prinzipien → feste Geometrie (T3/geometry), Fit-or-warn (T8/T14), Accessibility-Callouts (T6/T13). ✅
- §6 Folien-Modell `---` + Frontmatter → T3. ✅
- §7 Rendering (markdown-it/KaTeX/highlight/Callouts/Mermaid) → T4/T6/T7. ✅
- §8 Constraint-Engine + Contract → T9. ✅
- §9 Live-Preview + Warnings → T15. ✅
- §10 Export PDF + Bilder → T2 (Spike) + T16. ✅
- §11 Speaker-Notes-Seam → `Slide.speakerNotes` in T3-Typ vorhanden (Parsing/Use bewusst geparkt). ✅ (Feld da, kein Bau — entspricht Spec.)
- §14 Konventionen → T1 (Toolchain), T10 (Core-Gate), T11 (i18n/dom-safe), T17 (Settings), T18 (Doku/Release). ✅
- §12 Phase-2-LLM → **bewusst nicht** im Plan (separater Plan, §15/§19 Spec). ✅
- §18 offene Entscheidungen → id-Verify (T18), Highlight-Lib (T4: highlight.js gewählt), Bild-Export capturePage-vs-html2canvas (T2-Spike + T16). ✅

**2. Placeholder-Scan:** Keine „TBD/TODO/handle edge cases"-Steps; jeder Code-Step hat realen Code. Manuelle Smoke-Steps haben konkrete Verify-Kriterien. ✅

**3. Typ-Konsistenz:** `Warning`/`RenderedSlide`/`FitResult`/`SlideDeck`/`DeckDirectives` durchgängig identisch benannt (Shared Types ↔ T3/T4/T8/T9/T14/T16). `resolveEmbed: (ref:string)=>string|null` überall gleich. `geometryFor`/`computeFit`/`renderMarkdown`/`collectWarnings`/`buildSelfContainedDeckHtml` konsistent referenziert. ✅

**Offene, bewusst im Plan markierte Risiken** (kein Blocker): KaTeX/Mermaid-Fidelity in html2canvas (T2-Spike entscheidet T16-Pfad); `revealLeaf`/`getLanguage` treiben `minAppVersion` (T15/T17 → versions.json).
