# Mobile-Support + Export-Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PNG-Export typografisch korrekt machen (Wortabstände) und das Plugin mobil-fähig (inkl. Mobile-PDF), durch Rasterizer-Swap auf `modern-screenshot` + eine `Platform`-Weiche im PDF-Export (letterhead-Muster).

**Architecture:** `buildIsolatedDeck` bleibt unverändert. PNG wechselt von html2canvas zu `modern-screenshot` (foreignObject → natives Text-Layout, mobil-fähig). PDF verzweigt auf `Platform.isDesktopApp`: Desktop druckt wie bisher den iframe; Mobile schreibt das self-contained `isolatedDeckHtml` in den Vault und übergibt es via `app.openWithDefaultApp` ans OS. `isDesktopOnly` wird `false`.

**Tech Stack:** TypeScript (strict) · esbuild · vitest (node, kein DOM) · Obsidian Plugin API (`Platform.isDesktopApp`, `app.openWithDefaultApp`, `DataAdapter`) · `modern-screenshot` (foreignObject-Rasterizer).

## Global Constraints

- **Pure-Core unangetastet:** `src/core/**` wird in dieser Iteration NICHT geändert. Purity- (`check-core-purity.mjs`) + Realm-Gate (`check-render-realm.mjs`) bleiben grün.
- **Tests:** vitest `environment: "node"` — kein DOM. Export/Print/Mobile sind NICHT unit-testbar → reine Logik (i18n, HTML-Assembler) wird unit-getestet; der Rest via Build/Bundle-Smoke + manuellem Desktop+iOS-Smoke.
- **Full Gate:** `npm run lint && npm run build && npm test` muss grün sein. `npm run build` = `tsc --noEmit && esbuild --production` (bündelt `export.ts` → beweist, dass `modern-screenshot` real auflöst). `npm test` = check-core-purity → check-render-realm → bundle-smoke → vitest.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien stagen.** Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n:** nutzersichtbare Strings via `t()` (EN kanonisch + DE, korrekte Umlaute).
- **Plattform:** `Platform.isDesktopApp` (offizielle API), kein `process`/Electron-Sniffing. minAppVersion bleibt `1.8.7`.
- **`print-color-adjust: exact`** in `PRINT_CSS` ist bereits vorhanden (Commit `f94e6e7`).

## Shared Interfaces

```ts
// src/iframe-host.ts (vorhanden, pure):
export function isolatedDeckHtml(opts: { css: string; bodyHtml: string; extraCss?: string }): string;

// src/chrome-css.ts (vorhanden):
export function PRINT_CSS(w: number, h: number): string;   // enthält @page + print-color-adjust: exact

// src/export.ts (diese Iteration):
//   exportImages: html2canvas → domToCanvas (modern-screenshot)
//   exportPdf: + exportFolder-Param (am Ende) + Platform-Weiche
async function exportDeckHtmlAndOpen(app: App, file: TFile | null, slidesHtml: string[], css: string, geo: { width: number; height: number }, exportFolder: string): Promise<void>;

// modern-screenshot:
import { domToCanvas } from "modern-screenshot";
//   domToCanvas(node: HTMLElement, opts?: { width; height; scale; backgroundColor }): Promise<HTMLCanvasElement>
```

---

## Task 1: PNG-Export auf modern-screenshot umstellen (Dependency-Swap)

**Files:**
- Modify: `package.json` (deps: + `modern-screenshot`, − `html2canvas`)
- Modify: `src/export.ts:2` (Import) und `src/export.ts:61` (Capture-Aufruf)

**Interfaces:**
- Produces: `exportImages` nutzt `domToCanvas` statt `html2canvas` (gleiche Signatur, gleicher `toDataURL`/`writeBinary`-Pfad).

> Kein Unit-Test (DOM-Capture). Gate: Install + tsc + lint + Build (echtes Bundle löst `modern-screenshot` auf) + npm test. Bildtreue → manueller Smoke (Task 5).

- [ ] **Step 1: Dependency installieren + html2canvas entfernen**

Run:
```bash
npm install modern-screenshot
npm uninstall html2canvas
```
Expected: `modern-screenshot` steht in `package.json` `dependencies`, `html2canvas` ist entfernt, `npm install` endet ohne Fehler.

- [ ] **Step 2: Import in `src/export.ts` tauschen**

`src/export.ts` Zeile 2 ersetzen:
```ts
import { domToCanvas } from "modern-screenshot";
```
(ersetzt `import html2canvas from "html2canvas";`)

- [ ] **Step 3: Capture-Aufruf tauschen**

In `src/export.ts` (`exportImages`, aktuell Zeile 61) die Zeile
```ts
      const canvas = await html2canvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
```
ersetzen durch:
```ts
      const canvas = await domToCanvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
```
(Rest von `exportImages` — `toDataURL`/`atob`/`writeBinary`, mkdir, `host.dispose()` im finally — unverändert.)

- [ ] **Step 4: Gates**

Run: `npx tsc --noEmit` → 0 Fehler.
Run: `npm run lint` → clean.
Run: `npm run build` → erzeugt `main.js` (beweist: `modern-screenshot` löst im echten esbuild-Bundle auf — die ESM/CJS-Interop-Fehlerklasse, die vitest verstecken würde).
Run: `npm test` → core-purity + render-realm + bundle-smoke OK, 82 vitest grün.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/export.ts
git commit -m "feat(export): PNG via modern-screenshot (foreignObject) statt html2canvas

Fixt zusammenklebende Wortabstaende (html2canvas-Limitation) und ist reines
Web → mobil-faehig. Gleiche Signatur/Schreibpfad.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PDF Platform-Weiche (Desktop print / Mobile openWithDefaultApp)

**Files:**
- Modify: `src/i18n.ts` (neuer Key `notice.pdfOpened`, EN+DE)
- Test: `tests/i18n.test.ts` (Key resolved EN+DE)
- Test: `tests/iframe-host.test.ts` (Mobile-Artefakt: `isolatedDeckHtml`+`PRINT_CSS`)
- Modify: `src/export.ts` (Import `Platform`; Helper `exportDeckHtmlAndOpen`; `exportPdf` Signatur +`exportFolder`, Platform-Weiche)
- Modify: `src/main.ts` (Palette-`exportPdf`-Call: `exportFolder` mitgeben)
- Modify: `src/preview-view.ts` (Toolbar-`exportPdf`-Call: `exportFolder` mitgeben)

**Interfaces:**
- Consumes: `isolatedDeckHtml` (iframe-host), `PRINT_CSS` (chrome-css), `Platform.isDesktopApp`, `app.openWithDefaultApp`.
- Produces: `exportPdf(app, doc, win, file, registry, defaults?, customCss?, themeOverride?, exportFolder = "Slide-Deck-Export")`.

- [ ] **Step 1: i18n-Test schreiben (RED)**

In `tests/i18n.test.ts` an den bestehenden `describe("theme-handling strings"...)`-Block oder neu anhängen:
```ts
describe("export notices", () => {
  it("has EN + DE for notice.pdfOpened", () => {
    setLang("en"); expect(t("notice.pdfOpened", "x.html")).not.toBe("notice.pdfOpened");
    setLang("de"); expect(t("notice.pdfOpened", "x.html")).not.toBe("notice.pdfOpened");
    setLang("en");
  });
});
```
(Falls `setLang`/`t` oben in der Datei noch nicht importiert sind, sind sie es bereits — `tests/i18n.test.ts` importiert `t, setLang`.)

- [ ] **Step 2: RED verifizieren**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — `notice.pdfOpened` fällt auf den Key zurück.

- [ ] **Step 3: i18n-Key ergänzen**

In `src/i18n.ts` im EN-Block (nach `"notice.printFailed"`):
```ts
  "notice.pdfOpened": "Opened {0} — use your browser's Print → Save as PDF (or Share).",
```
Im DE-Block (nach `"notice.printFailed"`):
```ts
  "notice.pdfOpened": "{0} geöffnet — im Browser über Drucken → Als PDF sichern (oder Teilen).",
```

- [ ] **Step 4: i18n GREEN**

Run: `npx vitest run tests/i18n.test.ts` → PASS.

- [ ] **Step 5: Mobile-Artefakt-Test schreiben (RED)**

In `tests/iframe-host.test.ts` anhängen:
```ts
import { PRINT_CSS } from "../src/chrome-css";

describe("mobile PDF artifact", () => {
  it("isolatedDeckHtml + PRINT_CSS is a self-contained printable doc", () => {
    const html = isolatedDeckHtml({
      css: ".sd-slide{background:#000}",
      bodyHtml: '<div class="sd-slide">A</div>',
      extraCss: PRINT_CSS(1280, 720),
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("@page");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain('class="sd-slide"');
  });
});
```
(`isolatedDeckHtml` ist oben in `tests/iframe-host.test.ts` bereits importiert.)

- [ ] **Step 6: RED verifizieren**

Run: `npx vitest run tests/iframe-host.test.ts`
Expected: PASS sofort — `isolatedDeckHtml`+`PRINT_CSS` existieren bereits und erfüllen die Zusicherung. (Dieser Test ist ein Regressionsanker für das Mobile-Artefakt; kein neuer Produktionscode nötig. Falls er fehlschlägt, stimmt etwas an `PRINT_CSS`/`isolatedDeckHtml` nicht — vor dem Weitermachen klären.)

- [ ] **Step 7: `export.ts` — Imports + Helper + Weiche**

In `src/export.ts` die erste Import-Zeile ersetzen:
```ts
import { Notice, Platform, type App, type TFile } from "obsidian";
```
Und den `isolatedDeckHtml`-Import ergänzen (zur bestehenden iframe-host-Importzeile):
```ts
import { createIsolatedDeckIframe, isolatedDeckHtml } from "./iframe-host";
```

Direkt nach `withTheme(...)` den Helper einfügen:
```ts
/** Mobile PDF path (letterhead pattern): window.print() is a no-op in the Obsidian
 *  mobile WebView, so write the self-contained deck HTML into the vault and hand it
 *  to the OS via openWithDefaultApp — the user prints/shares it to PDF from there. */
async function exportDeckHtmlAndOpen(app: App, file: TFile | null, slidesHtml: string[], css: string, geo: { width: number; height: number }, exportFolder: string): Promise<void> {
  const adapter = app.vault.adapter;
  const base = file?.basename ?? "deck";
  const root = exportFolder.replace(/\/+$/, "") || "Slide-Deck-Export";
  if (!(await adapter.exists(root))) await adapter.mkdir(root);
  const path = `${root}/${base}.html`;
  await adapter.write(path, isolatedDeckHtml({ css, bodyHtml: slidesHtml.join(""), extraCss: PRINT_CSS(geo.width, geo.height) }));
  const open = (app as unknown as { openWithDefaultApp?: (p: string) => Promise<void> }).openWithDefaultApp;
  if (typeof open === "function") { try { await open.call(app, path); } catch { /* fall through to the path notice */ } }
  new Notice(t("notice.pdfOpened", path));
}
```

`exportPdf` Signatur erweitern (neuer letzter Param) und die Weiche einbauen. Die Signaturzeile:
```ts
export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, customCss = "", themeOverride?: string, exportFolder = "Slide-Deck-Export"): Promise<void> {
```
Direkt nach `const { slidesHtml, css } = await buildIsolatedDeck(...)` (aktuell Zeile 23) die Weiche einsetzen — der bestehende Desktop-Block (createIsolatedDeckIframe … safetyTimer) wandert in den `if`-Zweig:
```ts
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, customCss);
  if (!Platform.isDesktopApp) { await exportDeckHtmlAndOpen(app, file, slidesHtml, css, geo, exportFolder); return; }
  // Desktop: print the isolated iframe directly.
  const host = await createIsolatedDeckIframe(doc, { css, extraCss: PRINT_CSS(geo.width, geo.height), bodyHtml: slidesHtml.join(""), width: geo.width, sandbox: "allow-same-origin allow-modals" });
  // … (unveränderter frameWin/cleanup/afterprint/safetyTimer-Block) …
```
(Der gesamte bestehende Block ab `const frameWin = host.iframe.contentWindow;` bis `safetyTimer = win.setTimeout(cleanup, 60000);` bleibt wörtlich erhalten, nur jetzt nach dem frühen Mobile-`return`.)

- [ ] **Step 8: Aufrufer mitziehen**

`src/main.ts` — der `export-pdf`-Command-Callback ruft `exportPdf(...)`; den Aufruf um `exportFolder` ergänzen. Aktuell:
```ts
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.customCss),
```
ersetzen durch (themeOverride bleibt für die Palette ungesetzt → `undefined`):
```ts
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.customCss, undefined, this.settings.exportFolder),
```

`src/preview-view.ts` — der Toolbar-PDF-Button ruft `exportPdf(...)`; `exportFolder` als letzten Arg ergänzen. Aktuell:
```ts
    mkBtn(expRow, "file-text", t("toolbar.exportPdf"), () => void exportPdf(this.app, activeDoc(), activeWin(), this.currentFile, this.plugin.themeStore.getMap(), defaults(), this.plugin.settings.customCss, this.effectiveTheme));
```
ersetzen durch:
```ts
    mkBtn(expRow, "file-text", t("toolbar.exportPdf"), () => void exportPdf(this.app, activeDoc(), activeWin(), this.currentFile, this.plugin.themeStore.getMap(), defaults(), this.plugin.settings.customCss, this.effectiveTheme, this.plugin.settings.exportFolder));
```

- [ ] **Step 9: Gates**

Run: `npx tsc --noEmit` → 0 Fehler.
Run: `npm run lint` → clean.
Run: `npm run build` → OK.
Run: `npm test` → alle grün (jetzt 84 vitest: +1 i18n, +1 mobile-artifact).

- [ ] **Step 10: Commit**

```bash
git add src/i18n.ts src/export.ts src/main.ts src/preview-view.ts tests/i18n.test.ts tests/iframe-host.test.ts
git commit -m "feat(export): PDF Platform-Weiche — Mobile via openWithDefaultApp

Desktop druckt weiter den isolierten iframe; Mobile schreibt das self-contained
isolatedDeckHtml (mit PRINT_CSS) in den Export-Ordner und uebergibt es via
app.openWithDefaultApp ans OS (letterhead-Muster). exportPdf bekommt exportFolder;
Aufrufer in main.ts/preview-view.ts mitgezogen. i18n notice.pdfOpened (EN/DE).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Plugin mobil freischalten (`isDesktopOnly: false`)

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Manifest umstellen**

In `manifest.json` die Zeile `"isDesktopOnly": true` ändern zu:
```json
  "isDesktopOnly": false
```

- [ ] **Step 2: Gates**

Run: `npm run build` → OK (`main.js`).
Run: `npm test` → grün (manifest betrifft die Tests nicht).

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: isDesktopOnly:false — Plugin auf Mobile freigeben

Verbleibende Desktop-APIs sind geguardet: PDF via Platform-Weiche,
Reveal-in-Finder via FileSystemAdapter-Check (Notice-Fallback). PNG/Preview/
Theme/Settings sind reines Web.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Doku (AGENTS.md, README, CHANGELOG)

**Files:**
- Modify: `AGENTS.md`, `README.md`, `README.de.md`, `CHANGELOG.md`

> Kein Test. Gate: `npm test` grün (Doku ändert nichts am Code).

- [ ] **Step 1: AGENTS.md**

- In §Architecture den `export.ts`-Eintrag aktualisieren: PNG via `modern-screenshot` (foreignObject); PDF `Platform`-Weiche (Desktop `contentWindow.print()` / Mobile `isolatedDeckHtml`→`openWithDefaultApp`).
- In §Gotchas ergänzen:
```markdown
- **Export-Pfade plattformabhängig:** PNG nutzt `modern-screenshot` (foreignObject →
  natives Text-Layout; html2canvas wurde wegen zusammenklebender Wortabstände
  ersetzt). PDF verzweigt auf `Platform.isDesktopApp`: Desktop druckt den isolierten
  iframe (`contentWindow.print()`), Mobile schreibt `isolatedDeckHtml` in den
  Export-Ordner und ruft `app.openWithDefaultApp` (window.print ist im Mobile-WebView
  ein No-op — letterhead-Muster). `print-color-adjust: exact` in `PRINT_CSS` erzwingt
  den Theme-Hintergrund im Druck.
```
- In §Abweichungen den `isDesktopOnly`-Eintrag aktualisieren: jetzt `false` (Mobile-fähig nach Platform-Guards); den alten „isDesktopOnly: true"-Begründungstext entsprechend ersetzen.

- [ ] **Step 2: README.md + README.de.md**

In der Feature-/Export-Sektion ergänzen: Mobile-Support (iOS/iPadOS); PNG-Export typografisch korrekt; PDF-Export auf Mobile via System-Print/Share (openWithDefaultApp). DE als saubere Übersetzung (Umlaute korrekt).

- [ ] **Step 3: CHANGELOG.md**

Unter `## [Unreleased]` → `### Changed` / `### Fixed`:
```markdown
### Fixed
- PNG export no longer collapses inter-word spaces (switched the rasterizer from
  html2canvas to modern-screenshot).
- PDF export now prints the theme background (print-color-adjust: exact) — dark
  themes no longer print on white.

### Added
- Mobile support (isDesktopOnly: false). On mobile, PDF export writes a
  self-contained HTML and opens it via the OS (print/share to PDF).
```

- [ ] **Step 4: Gate + Commit**

Run: `npm test` → grün.
```bash
git add AGENTS.md README.md README.de.md CHANGELOG.md
git commit -m "docs: modern-screenshot export, mobile PDF (openWithDefaultApp), isDesktopOnly:false

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full Gate + manueller Smoke (Desktop + iOS)

**Files:** keine (Verifikation).

- [ ] **Step 1: Full Gate**

Run: `npm run lint && npm run build && npm test`
Expected: lint clean; build erzeugt `main.js`; `core purity OK` → `render realm OK` → `bundle-smoke OK` → vitest grün (84).

- [ ] **Step 2: Deploy nach Pallas (Desktop)**

Run: `npm run deploy` (oder `cp main.js manifest.json styles.css "$OBSIDIAN_PLUGIN_DIR"/`).

- [ ] **Step 3: Manueller Smoke — Desktop** (kuro/shiro-Demo-Deck):
- [ ] PNG-Export: Fließtext mit **korrekten Wortabständen** (kein Zusammenkleben), Fonts/KaTeX/Mermaid/Embeds erfasst, gebackener Scale korrekt.
- [ ] PDF-Export (kuro): **dunkler Hintergrund** wird gedruckt (nicht weiß), theme-isoliert, 1 Folie/Seite.
- [ ] Preview + Live-Theme-Switch unverändert funktional.

- [ ] **Step 4: Manueller Smoke — iOS/iPadOS** (Plugin via Sync/Install auf Mobile):
- [ ] Plugin lädt (kein Crash beim onload; `isDesktopOnly:false` greift).
- [ ] Preview rendert; Theme-Dropdown + Setzen funktionieren.
- [ ] PDF-Export: schreibt `<exportFolder>/<note>.html`, öffnet es via OS (Safari) → druck-/teilbar zu PDF; Notice zeigt den Pfad.
- [ ] PNG-Export: erzeugt PNGs im Export-Ordner (modern-screenshot läuft mobil).
- [ ] „Open in Finder" zeigt auf Mobile den Notice-Fallback (kein Crash).

- [ ] **Step 5: Branch-Abschluss** — `superpowers:finishing-a-development-branch` (Merge nach `main`). Vor Merge: `.superpowers/sdd/progress.md` + Cockpit aktualisieren.

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- Goal 1 (PNG-Treue) → Task 1 (modern-screenshot). ✓
- Goal 2 (mobile-fähig) → Task 3 (isDesktopOnly:false) + die Platform-Guards aus Task 2. ✓
- Goal 3 (PDF auf Mobile) → Task 2 (Platform-Weiche + exportDeckHtmlAndOpen). ✓
- Goal 4 (Desktop unverändert) → Task 2 (Desktop-Zweig wörtlich erhalten). ✓
- Goal 5 (graceful degradation) → Task 2/3 (Platform-Weiche; Reveal-Guard unverändert, in Spec §5.4). ✓
- Goal 6 (Pure-Core) → keine `src/core/**`-Änderung; Gates in Task 1/5. ✓
- (B)-Fix (print-color-adjust) → bereits `f94e6e7`; Regressionsanker in Task 2 Step 5. ✓

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Step zeigt vollständigen Code. ✓
**Typ-Konsistenz:** `exportPdf(..., exportFolder = "Slide-Deck-Export")` neuer letzter Param — Aufrufer in main.ts (`undefined, this.settings.exportFolder`) + preview-view.ts (`this.effectiveTheme, this.plugin.settings.exportFolder`) konsistent (themeOverride bleibt an Position 8). `domToCanvas`-Optionen = bisherige html2canvas-Optionen. `exportDeckHtmlAndOpen`-Signatur konsistent zwischen Definition (Task 2 Step 7) und Aufruf (Weiche). ✓

**Offen (bewusst, §11 der Spec):** modern-screenshot-Aufrufkontext (Knoten aus contentDoc) + Mobile-PDF-Datei-Aufbewahrung + `openWithDefaultApp`-Typisierung — alle mit dokumentiertem Default/Fallback; empirisch im Smoke (Task 5) bestätigt.
