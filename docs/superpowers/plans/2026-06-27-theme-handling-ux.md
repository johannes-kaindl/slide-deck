# Theme-Handling-UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den aktiven Theme-Zustand im Preview sichtbar + bedienbar machen (Live-Switch ephemer + Commit ins Frontmatter), und benannte User-Themes als `.css`-Dateien aus einem Vault-Ordner laden/exportieren — die Dropdown-Falle heilen.

**Architecture:** Eine Theme-**Registry** vereint compile-time Built-ins mit User-`.css`-Themes aus einem Ordner zu `ThemeEntry`-Objekten. Reine Logik (Merge, Resolution, Key-Ableitung, Hide-CSS) lebt im obsidian-/DOM-freien Core; alles I/O (Ordner-Scan, Frontmatter-Write, Reveal) + DOM (Toolbar-Dropdown, Settings) lebt in der Adapter-Schicht. Die Render-/iframe-/fit-Pipeline bleibt unangetastet — nur *welcher* CSS-String und *welche* `baseFontPx`/`mermaid` reinkommen, wandert von „nur Built-ins" zu „Registry-Lookup".

**Tech Stack:** TypeScript (strict, `noImplicitAny`) · esbuild · vitest (`environment: node`, kein DOM) · Obsidian Plugin API (`processFrontMatter`, `DataAdapter`, `FileSystemAdapter`) · markdown-it/KaTeX/highlight.js/Mermaid (unverändert).

## Global Constraints

- **Pure-Core-Invariante:** `src/core/**` importiert **nie** `obsidian` und nutzt **nie** `document.`/`window.`/`activeDocument`/`activeWindow`. Erzwungen von `scripts/check-core-purity.mjs` (1. Schritt von `npm test`).
- **Realm-Invariante:** `src/render-dom.ts` nutzt **keine** Obsidian-DOM-Augmentierung (`createDiv`/`createEl`/`createSpan`/`empty`/`addClass`/`removeClass`/`setText`/`setAttr`). Erzwungen von `scripts/check-render-realm.mjs` (2. Schritt).
- **Tests:** vitest läuft `environment: "node"` — **kein DOM**. Nur reine Logik wird unit-getestet; DOM/iframe/I/O via `scripts/bundle-smoke.mjs` (importiert **keine** `.css` direkt in vitest — `.css`-bindende Module werden über die Bundle-Smoke geprüft) + manuellem Pallas-Smoke. `npm run typecheck` separat (vitest ≠ tsc).
- **Full Gate:** `npm run lint && npm run build && npm test` muss am Ende grün sein. `npm test` = `check-core-purity` → `check-render-realm` → `bundle-smoke` → `vitest run`.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien stagen.** Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n:** alle nutzersichtbaren Strings via `t()` (`src/i18n.ts`), EN kanonisch + DE. Keine Literal-UI-Strings in `main.ts`/`preview-view.ts`/`settings.ts`.
- **`isDesktopOnly: true`** bleibt; „Open in Finder" nur bei `FileSystemAdapter`.
- **Ordner-Default:** `themesFolder = "Slide-Deck-Themes"` (kein Dot-Prefix), `hideThemesFolder = true`.

## Shared Interfaces (über alle Tasks konsistent)

```ts
// src/core/presets/index.ts  (Core, pure)
export type MermaidTheme = "default" | "dark" | "neutral" | "forest";
export interface ThemeEntry {
  key: string;
  source: "builtin" | "user";
  themeCss: string;          // builtin: presetTokensCss(preset); user: roher .css-Dateiinhalt
  hljs: string;              // aufgelöster highlight.js-CSS-String
  mermaid: MermaidTheme;
  baseFontPx: number;        // Lesbarkeits-Boden (minScale)
  overridesBuiltin?: boolean;
}
export type ThemeRegistry = Map<string, ThemeEntry>;
export function resolveTheme(reg: ThemeRegistry, key: string): ThemeEntry;       // ?? "default"
export function listThemes(reg: ThemeRegistry): ThemeEntry[];                    // Built-ins zuerst (PRESETS-Reihenfolge), dann User alpha
export function mergeThemes(builtins: ThemeEntry[], users: ThemeEntry[]): { map: ThemeRegistry; warnings: string[] };

// src/core/theme-key.ts  (Core, pure)
export function keyFromFilename(filename: string): string;       // strippt ".css" (case-insensitive), trim
export function parseBaseFontPx(css: string): number | undefined; // liest --sd-base: NNpx

// src/core/folder-hide.ts  (Core, pure)
export function normalizeFolder(raw: string): string;            // trim, trailing slashes weg
export function buildHideCss(folder: string, hide: boolean): string;

// src/deck-css.ts  (Adapter — importiert .css)
export function builtinThemeEntries(): ThemeEntry[];
export function userThemeEntry(key: string, fileCss: string): ThemeEntry;
export function deckCss(entry: ThemeEntry, customCss?: string): string;

// src/theme-source.ts  (Adapter)
export function scanThemeFiles(adapter: DataAdapter, folder: string): Promise<{ key: string; css: string }[]>;
export function writeThemeCss(adapter: DataAdapter, folder: string, key: string, css: string): Promise<string>;
export function revealFolder(app: App, folder: string): void;

// src/theme-registry.ts  (Adapter)
export class ThemeStore {
  constructor(app: App, getFolder: () => string);
  getMap(): ThemeRegistry;
  getThemes(): ThemeEntry[];
  resolve(key: string): ThemeEntry;
  refresh(): Promise<void>;
}

// src/frontmatter-writer.ts  (Adapter)
export function setNoteTheme(app: App, file: TFile, key: string): Promise<void>;

// src/adapter.ts  (Adapter) — LoadedDeck erweitert
export interface LoadedDeck { deck: SlideDeck; resolveEmbed: (ref: string) => string | null; frontmatterTheme?: string; }

// src/render-dom.ts  (Adapter)
export function buildIsolatedDeck(ownerDoc, deck, resolveEmbed, registry: ThemeRegistry, customCss?: string): Promise<{slidesHtml; css; warnings}>;
export function renderDeckToContainer(doc, container, deck, resolveEmbed, registry: ThemeRegistry): Promise<Warning[]>;

// src/core/constraints/engine.ts  (Core)
export function collectDeckWarnings(deck: SlideDeck, registry: ThemeRegistry): Warning[];
```

---

## Task 1: Theme types + resolveTheme + listThemes (Core, pure)

**Files:**
- Modify: `src/core/presets/index.ts`
- Test: `tests/core/presets.test.ts`

**Interfaces:**
- Produces: `MermaidTheme`, `ThemeEntry`, `ThemeRegistry`, `resolveTheme(reg, key)`, `listThemes(reg)`. (`mergeThemes` folgt in Task 2.)

- [ ] **Step 1: Write the failing tests** — an `tests/core/presets.test.ts` anhängen:

```ts
import { resolveTheme, listThemes, type ThemeEntry, type ThemeRegistry } from "../../src/core/presets";

function entry(key: string, source: "builtin" | "user"): ThemeEntry {
  return { key, source, themeCss: "", hljs: "", mermaid: "default", baseFontPx: 28 };
}
function reg(...e: ThemeEntry[]): ThemeRegistry { return new Map(e.map((x) => [x.key, x])); }

describe("resolveTheme", () => {
  it("returns the entry for a known key", () => {
    const r = reg(entry("default", "builtin"), entry("mine", "user"));
    expect(resolveTheme(r, "mine").key).toBe("mine");
  });
  it("falls back to default for an unknown key", () => {
    const r = reg(entry("default", "builtin"), entry("dark", "builtin"));
    expect(resolveTheme(r, "nope").key).toBe("default");
  });
});

describe("listThemes", () => {
  it("lists builtins first, then user themes alphabetically", () => {
    const r = reg(entry("default", "builtin"), entry("zeta", "user"), entry("alpha", "user"));
    expect(listThemes(r).map((e) => e.key)).toEqual(["default", "alpha", "zeta"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: FAIL — `resolveTheme`/`listThemes`/`ThemeEntry` not exported.

- [ ] **Step 3: Implement** — in `src/core/presets/index.ts` den `Preset.mermaid`-Typ auf `MermaidTheme` umstellen und die neuen Exporte ergänzen. Ändere die `Preset`-Interface-Zeile `mermaid: "default" | "dark" | "neutral" | "forest";` zu `mermaid: MermaidTheme;` und füge **oben** (vor `interface Preset`) ein:

```ts
export type MermaidTheme = "default" | "dark" | "neutral" | "forest";
```

Am **Ende** der Datei anfügen:

```ts
export interface ThemeEntry {
  key: string;
  source: "builtin" | "user";
  themeCss: string;
  hljs: string;
  mermaid: MermaidTheme;
  baseFontPx: number;
  overridesBuiltin?: boolean;
}
export type ThemeRegistry = Map<string, ThemeEntry>;

/** TOTAL — unknown key falls back to the always-present "default" builtin. */
export function resolveTheme(reg: ThemeRegistry, key: string): ThemeEntry {
  return reg.get(key) ?? reg.get("default")!;
}

/** Built-ins first (in PRESETS order), then user themes alphabetically. */
export function listThemes(reg: ThemeRegistry): ThemeEntry[] {
  const all = [...reg.values()];
  const order = Object.keys(PRESETS);
  const builtins = all.filter((e) => e.source === "builtin").sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const users = all.filter((e) => e.source === "user").sort((a, b) => a.key.localeCompare(b.key));
  return [...builtins, ...users];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/presets/index.ts tests/core/presets.test.ts
git commit -m "feat(core): ThemeEntry/ThemeRegistry types + resolveTheme/listThemes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: mergeThemes (Core, pure — Kollisionsregeln)

**Files:**
- Modify: `src/core/presets/index.ts`
- Test: `tests/core/presets.test.ts`

**Interfaces:**
- Consumes: `ThemeEntry`, `ThemeRegistry` (Task 1).
- Produces: `mergeThemes(builtins, users): { map, warnings }` — User mit Built-in-Key überschreibt (`overridesBuiltin: true`); zwei User mit gleichem Key → erster gewinnt + Warnung.

- [ ] **Step 1: Write the failing tests** — an `tests/core/presets.test.ts` anhängen:

```ts
import { mergeThemes } from "../../src/core/presets";

describe("mergeThemes", () => {
  it("keeps all builtins when there are no user themes", () => {
    const { map, warnings } = mergeThemes([entry("default", "builtin"), entry("dark", "builtin")], []);
    expect([...map.keys()].sort()).toEqual(["dark", "default"]);
    expect(warnings).toEqual([]);
  });
  it("user theme overrides a builtin of the same key (overridesBuiltin)", () => {
    const u = { ...entry("dark", "user"), themeCss: ".sd-slide{--sd-bg:#000}" };
    const { map } = mergeThemes([entry("default", "builtin"), entry("dark", "builtin")], [u]);
    expect(map.get("dark")!.source).toBe("user");
    expect(map.get("dark")!.overridesBuiltin).toBe(true);
    expect(map.get("dark")!.themeCss).toContain("#000");
  });
  it("first user wins on user/user key collision and warns", () => {
    const a = { ...entry("mine", "user"), themeCss: "A" };
    const b = { ...entry("mine", "user"), themeCss: "B" };
    const { map, warnings } = mergeThemes([entry("default", "builtin")], [a, b]);
    expect(map.get("mine")!.themeCss).toBe("A");
    expect(warnings.some((w) => w.includes("mine"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: FAIL — `mergeThemes` not exported.

- [ ] **Step 3: Implement** — am Ende von `src/core/presets/index.ts` anfügen:

```ts
/** Merge built-in entries with user entries. A user key matching a builtin overrides it
 *  (overridesBuiltin); two user entries with the same key → first wins + a warning. */
export function mergeThemes(builtins: ThemeEntry[], users: ThemeEntry[]): { map: ThemeRegistry; warnings: string[] } {
  const map: ThemeRegistry = new Map();
  const warnings: string[] = [];
  for (const b of builtins) map.set(b.key, b);
  for (const u of users) {
    const existing = map.get(u.key);
    if (existing && existing.source === "user") { warnings.push(`Duplicate theme "${u.key}" ignored.`); continue; }
    map.set(u.key, { ...u, overridesBuiltin: existing?.source === "builtin" });
  }
  return { map, warnings };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/presets/index.ts tests/core/presets.test.ts
git commit -m "feat(core): mergeThemes with builtin-override + dup-key warning

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: keyFromFilename + parseBaseFontPx (Core, pure)

**Files:**
- Create: `src/core/theme-key.ts`
- Test: `tests/core/theme-key.test.ts`

**Interfaces:**
- Produces: `keyFromFilename(filename)`, `parseBaseFontPx(css)`.

- [ ] **Step 1: Write the failing test** — `tests/core/theme-key.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { keyFromFilename, parseBaseFontPx } from "../../src/core/theme-key";

describe("keyFromFilename", () => {
  it("strips the .css extension verbatim", () => {
    expect(keyFromFilename("My Theme.css")).toBe("My Theme");
  });
  it("is case-insensitive on the extension and trims", () => {
    expect(keyFromFilename("  ocean.CSS  ")).toBe("ocean");
  });
  it("leaves a name without extension untouched", () => {
    expect(keyFromFilename("plain")).toBe("plain");
  });
});

describe("parseBaseFontPx", () => {
  it("reads --sd-base from a token block", () => {
    expect(parseBaseFontPx(".sd-slide{ --sd-base:32px; --sd-bg:#000 }")).toBe(32);
  });
  it("returns undefined when absent or non-positive", () => {
    expect(parseBaseFontPx(".sd-slide{ --sd-bg:#000 }")).toBeUndefined();
    expect(parseBaseFontPx("--sd-base:0px")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/theme-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/core/theme-key.ts`:

```ts
/** Theme key = the .css file's name without its extension, verbatim (frontmatter "theme:" value). */
export function keyFromFilename(filename: string): string {
  return filename.trim().replace(/\.css$/i, "");
}

/** Read the --sd-base legibility-floor token (in px) from a theme's CSS, if it declares one. */
export function parseBaseFontPx(css: string): number | undefined {
  const m = /--sd-base\s*:\s*([\d.]+)px/.exec(css);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/theme-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/theme-key.ts tests/core/theme-key.test.ts
git commit -m "feat(core): keyFromFilename + parseBaseFontPx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: folder-hide CSS (Core, pure — vault-rag-Muster)

**Files:**
- Create: `src/core/folder-hide.ts`
- Test: `tests/core/folder-hide.test.ts`

**Interfaces:**
- Produces: `normalizeFolder(raw)`, `buildHideCss(folder, hide)`.

- [ ] **Step 1: Write the failing test** — `tests/core/folder-hide.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeFolder, buildHideCss } from "../../src/core/folder-hide";

describe("normalizeFolder", () => {
  it("trims and removes trailing slashes", () => {
    expect(normalizeFolder("  Themes/ ")).toBe("Themes");
  });
});

describe("buildHideCss", () => {
  it("is empty when hide is off or the path is blank", () => {
    expect(buildHideCss("Themes", false)).toBe("");
    expect(buildHideCss("", true)).toBe("");
  });
  it("hides the folder title and its children, escaping the path", () => {
    const css = buildHideCss("Slide-Deck-Themes", true);
    expect(css).toContain('.nav-folder-title[data-path="Slide-Deck-Themes"]');
    expect(css).toContain("+ .nav-folder-children");
    expect(css).toContain("display: none");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/folder-hide.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/core/folder-hide.ts`:

```ts
/** Trim + drop trailing slashes — canonical form for comparison and data-path. */
export function normalizeFolder(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/** CSS that hides a folder from Obsidian's file explorer (vault-rag pattern). `data-path` is
 *  internal Obsidian markup (no API) — if it breaks, the folder merely reappears cosmetically
 *  (no data loss). No `:has()` (mobile), `display:none` (explorer virtualisation), value escaped. */
export function buildHideCss(folder: string, hide: boolean): string {
  const p = normalizeFolder(folder);
  if (!hide || p === "") return "";
  const sel = `.nav-folder-title[data-path=${JSON.stringify(p)}]`;
  return `${sel},\n${sel} + .nav-folder-children { display: none; }`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/folder-hide.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/folder-hide.ts tests/core/folder-hide.test.ts
git commit -m "feat(core): buildHideCss to hide the themes folder (vault-rag pattern)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: deckCss(entry) + builtin/user entry builders (Adapter)

**Files:**
- Modify: `src/deck-css.ts`
- Test: `tests/deck-css.test.ts`

**Interfaces:**
- Consumes: `ThemeEntry`, `presetTokensCss`, `PRESETS`, `presetFor` (Task 1 + existing); `parseBaseFontPx` (Task 3).
- Produces: `builtinThemeEntries()`, `userThemeEntry(key, fileCss)`, `deckCss(entry, customCss)`.

> `deck-css.ts` importiert `.css` → in vitest **nicht** direkt importierbar. Der Test spiegelt die Assembly mit fs-gelesenem CSS (wie heute); die echte `deckCss` läuft in der Bundle-Smoke (Task 8).

- [ ] **Step 1: Update the test** — `tests/deck-css.test.ts` ersetzen durch:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleDeckCss, presetFor, presetTokensCss, type ThemeEntry } from "../src/core/presets";
import { STRUCTURE_CSS } from "../src/core/presets/structure.css";
import { LAYOUTS_CSS } from "../src/core/presets/layouts.css";

// Mirror deckCss(entry) assembly using filesystem-read CSS (vitest cannot import .css via the
// esbuild text-loader; the real deckCss() is exercised end-to-end in bundle-smoke).
describe("deck css assembly (entry-based)", () => {
  const katex = readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
  const hljs = readFileSync("node_modules/highlight.js/styles/github.css", "utf8");

  function mirror(entry: ThemeEntry, customCss = ""): string {
    return assembleDeckCss([katex, entry.hljs, STRUCTURE_CSS, LAYOUTS_CSS, entry.themeCss, customCss]);
  }

  it("bundles katex, hljs, structure, layouts, theme tokens in order for a builtin", () => {
    const p = presetFor("default");
    const entry: ThemeEntry = { key: "default", source: "builtin", themeCss: presetTokensCss(p), hljs, mermaid: p.mermaid, baseFontPx: p.baseFontPx };
    const css = mirror(entry, ".sd-slide{ --sd-accent:#e63946 }");
    expect(css).toContain(".katex");
    expect(css).toContain(".hljs");
    expect(css).toContain(".sd-content");
    expect(css).toContain(".sd-layout-two-column");
    expect(css).toContain("--sd-base:28px");
    expect(css).toContain("#e63946");
  });

  it("uses the raw file css for a user theme entry", () => {
    const entry: ThemeEntry = { key: "ocean", source: "user", themeCss: ".sd-slide{ --sd-bg:#012 }", hljs, mermaid: "default", baseFontPx: 30 };
    const css = mirror(entry);
    expect(css).toContain("--sd-bg:#012");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/deck-css.test.ts`
Expected: FAIL — `ThemeEntry` import path / shape (until Task 1 landed it compiles; if Task 1 is done, this passes the import but the production `deck-css.ts` still exports the old `deckCss(presetId, customCss)` — that's fine, the test mirrors assembly and does not import `deck-css.ts`). If it passes already, proceed to Step 3 to update production code so later tasks compile.

- [ ] **Step 3: Implement** — `src/deck-css.ts` komplett ersetzen:

```ts
import katexCss from "katex/dist/katex.min.css";
import githubCss from "highlight.js/styles/github.css";
import githubDarkCss from "highlight.js/styles/github-dark.css";
import { PRESETS, presetFor, presetTokensCss, assembleDeckCss, type ThemeEntry } from "./core/presets";
import { parseBaseFontPx } from "./core/theme-key";
import { STRUCTURE_CSS } from "./core/presets/structure.css";
import { LAYOUTS_CSS } from "./core/presets/layouts.css";

const HLJS: Record<string, string> = { github: githubCss, "github-dark": githubDarkCss };

/** The four built-in themes as registry entries (token block + their hljs + mermaid). */
export function builtinThemeEntries(): ThemeEntry[] {
  return Object.values(PRESETS).map((p) => ({
    key: p.id,
    source: "builtin" as const,
    themeCss: presetTokensCss(p),
    hljs: HLJS[p.hljs] ?? HLJS["github-dark"],
    mermaid: p.mermaid,
    baseFontPx: p.baseFontPx,
  }));
}

/** A user .css theme as a registry entry. Inherits the default builtin's code/mermaid theme;
 *  baseFontPx comes from the file's --sd-base if present, else the default builtin's. */
export function userThemeEntry(key: string, fileCss: string): ThemeEntry {
  const d = presetFor("default");
  return {
    key,
    source: "user" as const,
    themeCss: fileCss,
    hljs: HLJS[d.hljs] ?? HLJS["github-dark"],
    mermaid: d.mermaid,
    baseFontPx: parseBaseFontPx(fileCss) ?? d.baseFontPx,
  };
}

/** Full self-contained CSS for a rendered deck: math + per-theme code theme + structural CSS
 *  + layout CSS + the theme's token/user CSS + optional global custom CSS (last, overrides all). */
export function deckCss(entry: ThemeEntry, customCss = ""): string {
  return assembleDeckCss([katexCss, entry.hljs, STRUCTURE_CSS, LAYOUTS_CSS, entry.themeCss, customCss]);
}
```

- [ ] **Step 4: Run to verify** — vitest unverändert grün, typecheck wird nach den Consumer-Tasks grün:

Run: `npx vitest run tests/deck-css.test.ts`
Expected: PASS. (Ein `npm run typecheck` schlägt hier noch fehl, weil `render-dom.ts`/`export.ts` die alte `deckCss`-Signatur nutzen — wird in Task 7/13 behoben. Nicht committen, bevor Step 5.)

- [ ] **Step 5: Commit**

```bash
git add src/deck-css.ts tests/deck-css.test.ts
git commit -m "feat: deckCss(entry) + builtin/user theme entry builders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: collectDeckWarnings über die Registry (Core)

**Files:**
- Modify: `src/core/constraints/engine.ts`
- Test: `tests/core/constraints.test.ts`

**Interfaces:**
- Consumes: `ThemeRegistry` (Task 1).
- Produces: `collectDeckWarnings(deck, registry)` — `theme-unknown` nur wenn `deck.directives.theme` **nicht** in der Registry ist.

- [ ] **Step 1: Write the failing test** — an `tests/core/constraints.test.ts` anhängen (Imports oben in der Datei ergänzen falls nötig):

```ts
import { collectDeckWarnings } from "../../src/core/constraints/engine";
import { type ThemeEntry, type ThemeRegistry } from "../../src/core/presets";
import { parseDeck } from "../../src/core/slide-model";

function themeReg(...keys: string[]): ThemeRegistry {
  const m: ThemeRegistry = new Map();
  for (const k of keys) {
    const e: ThemeEntry = { key: k, source: k === "default" ? "builtin" : "user", themeCss: "", hljs: "", mermaid: "default", baseFontPx: 28 };
    m.set(k, e);
  }
  return m;
}

describe("collectDeckWarnings (registry-aware)", () => {
  it("does not warn for a builtin theme in the registry", () => {
    const deck = parseDeck("---\ntheme: default\n---\n# A\n");
    expect(collectDeckWarnings(deck, themeReg("default", "dark"))).toEqual([]);
  });
  it("does not warn for a user theme present in the registry", () => {
    const deck = parseDeck("---\ntheme: ocean\n---\n# A\n");
    expect(collectDeckWarnings(deck, themeReg("default", "ocean"))).toEqual([]);
  });
  it("warns theme-unknown for a key absent from the registry", () => {
    const deck = parseDeck("---\ntheme: ghost\n---\n# A\n");
    const w = collectDeckWarnings(deck, themeReg("default"));
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe("theme-unknown");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: FAIL — `collectDeckWarnings` expects 1 arg (registry param missing).

- [ ] **Step 3: Implement** — in `src/core/constraints/engine.ts`: den Import `import { PRESETS } from "../presets";` ersetzen durch `import type { ThemeRegistry } from "../presets";` und `collectDeckWarnings` ersetzen:

```ts
export function collectDeckWarnings(deck: SlideDeck, registry: ThemeRegistry): Warning[] {
  const out: Warning[] = [];
  if (!registry.has(deck.directives.theme)) {
    out.push({ slideIndex: 0, kind: "theme-unknown", message: `Unknown theme "${deck.directives.theme}" — using default.`, sourceLine: 0 });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/constraints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/constraints/engine.ts tests/core/constraints.test.ts
git commit -m "feat(core): collectDeckWarnings checks against the theme registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: render-dom registry-basiert (Adapter, realm-sicher)

**Files:**
- Modify: `src/render-dom.ts`

**Interfaces:**
- Consumes: `ThemeRegistry`, `resolveTheme` (Task 1); `deckCss` (Task 5); `collectDeckWarnings(deck, registry)` (Task 6).
- Produces: `buildIsolatedDeck(ownerDoc, deck, resolveEmbed, registry, customCss?)`, `renderDeckToContainer(doc, container, deck, resolveEmbed, registry)`.

> Kein Unit-Test (DOM/iframe). Gate: `npm run typecheck` + `check-render-realm` + Bundle-Smoke (Task 8) + manueller Smoke (Task 20). **Realm-Regel:** weiterhin nur native DOM.

- [ ] **Step 1: Implement** — in `src/render-dom.ts`:

Import-Zeile `import { presetFor } from "./core/presets";` ersetzen durch:
```ts
import { resolveTheme, type ThemeRegistry } from "./core/presets";
```

In `renderDeckToContainer` die Signatur + die ersten Zeilen ändern:
```ts
export async function renderDeckToContainer(
  doc: Document, container: HTMLElement, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
  registry: ThemeRegistry,
): Promise<Warning[]> {
  const geo = geometryFor(deck.directives.aspect);
  const entry = resolveTheme(registry, deck.directives.theme);
  const minScale = deck.directives.minFontPx / entry.baseFontPx;
  mermaid.initialize({ startOnLoad: false, theme: entry.mermaid });
  const warnings: Warning[] = [];
  warnings.push(...collectDeckWarnings(deck, registry));
  container.replaceChildren();
```
(Rest der Funktion unverändert.)

In `buildIsolatedDeck` die Signatur + die ersten zwei Zeilen + den `renderDeckToContainer`-Aufruf ändern:
```ts
export async function buildIsolatedDeck(
  ownerDoc: Document, deck: SlideDeck, resolveEmbed: (r: string) => string | null,
  registry: ThemeRegistry, customCss = "",
): Promise<{ slidesHtml: string[]; css: string; warnings: Warning[] }> {
  const css = deckCss(resolveTheme(registry, deck.directives.theme), customCss);
  const host = await createIsolatedDeckIframe(ownerDoc, { css, bodyHtml: "" });
  try {
    const warnings = await renderDeckToContainer(host.contentDoc, host.contentDoc.body, deck, resolveEmbed, registry);
    const slidesHtml = Array.from(host.contentDoc.querySelectorAll<HTMLElement>(".sd-slide")).map((el) => el.outerHTML);
    return { slidesHtml, css, warnings };
  } finally {
    host.dispose();
  }
}
```

- [ ] **Step 2: Run the realm gate**

Run: `node scripts/check-render-realm.mjs`
Expected: `render realm OK`.

- [ ] **Step 3: Commit** (typecheck folgt nach Task 13; render-dom isoliert committen)

```bash
git add src/render-dom.ts
git commit -m "refactor(render): resolve theme via registry (baseFontPx + mermaid + css)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Bundle-Smoke auf entry-basierte deckCss + User-Theme

**Files:**
- Modify: `scripts/bundle-smoke-entry.ts`

**Interfaces:**
- Consumes: `builtinThemeEntries`, `userThemeEntry`, `deckCss` (Task 5).

- [ ] **Step 1: Implement** — in `scripts/bundle-smoke-entry.ts` Block (2) ersetzen. Die Import-Zeile `import { deckCss } from "./deck-css";` (Pfad ist relativ zum Repo-Root in dieser Datei: `../src/deck-css`) und die Schleife anpassen. Konkret die Zeilen `import { deckCss } from "../src/deck-css";` / `import { presetFor, PRESETS } from "../src/core/presets";` ersetzen durch:

```ts
import { deckCss, builtinThemeEntries, userThemeEntry } from "../src/deck-css";
import { presetFor } from "../src/core/presets";
```

und Block (2) (`// 2) deckCss assembles for EVERY theme …`) ersetzen durch:

```ts
// 2) deckCss assembles for every builtin theme (+ custom CSS appended last), through the real .css text-loader
for (const entry of builtinThemeEntries()) {
  const css = deckCss(entry, ".sd-slide{ --sd-accent:#e63946 }");
  for (const needle of [".katex", ".hljs", ".sd-content", ".sd-layout-two-column", "--sd-base:", "#e63946"]) {
    if (!css.includes(needle)) {
      console.error(`bundle-smoke FAILED — theme "${entry.key}" CSS missing: ${needle}`);
      process.exit(4);
    }
  }
}

// 2b) a user .css theme injects its raw tokens
const userCss = deckCss(userThemeEntry("ocean", ".sd-slide{ --sd-bg:#012738 }"));
if (!userCss.includes("--sd-bg:#012738") || !userCss.includes(".katex")) {
  console.error("bundle-smoke FAILED — user theme CSS not assembled");
  process.exit(4);
}
```

Block (3) bleibt, nutzt aber `presetFor` weiterhin (Totalität) — unverändert lassen.

- [ ] **Step 2: Run the bundle smoke**

Run: `node scripts/bundle-smoke.mjs`
Expected: endet mit `bundle-smoke OK — directives, every-theme deckCss, and totality work in the real bundle`.

- [ ] **Step 3: Commit**

```bash
git add scripts/bundle-smoke-entry.ts
git commit -m "test: bundle-smoke covers entry-based deckCss + a user theme

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: theme-source — Ordner-I/O (Adapter)

**Files:**
- Create: `src/theme-source.ts`

**Interfaces:**
- Consumes: `keyFromFilename` (Task 3); Obsidian `DataAdapter`, `App`, `FileSystemAdapter`, `Notice`.
- Produces: `scanThemeFiles(adapter, folder)`, `writeThemeCss(adapter, folder, key, css)`, `revealFolder(app, folder)`.

> Kein Unit-Test (Obsidian-I/O). Gate: typecheck + manueller Smoke (Task 20).

- [ ] **Step 1: Implement** — `src/theme-source.ts`:

```ts
import { App, FileSystemAdapter, Notice, type DataAdapter } from "obsidian";
import { keyFromFilename } from "./core/theme-key";
import { normalizeFolder } from "./core/folder-hide";

/** List *.css in the themes folder; each becomes { key, css }. Unreadable files are skipped. */
export async function scanThemeFiles(adapter: DataAdapter, folder: string): Promise<{ key: string; css: string }[]> {
  const dir = normalizeFolder(folder);
  if (!dir || !(await adapter.exists(dir))) return [];
  const listing = await adapter.list(dir);
  const out: { key: string; css: string }[] = [];
  for (const path of listing.files) {
    if (!path.toLowerCase().endsWith(".css")) continue;
    try {
      const css = await adapter.read(path);
      const base = path.split("/").pop() ?? path;
      out.push({ key: keyFromFilename(base), css });
    } catch { /* unreadable -> skip */ }
  }
  return out;
}

/** Write a theme's CSS into the folder as <key>.css (or <key>-copy.css… to avoid clobbering).
 *  Returns the path written. Creates the folder on demand. */
export async function writeThemeCss(adapter: DataAdapter, folder: string, key: string, css: string): Promise<string> {
  const dir = normalizeFolder(folder);
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
  const pathFor = (name: string) => (dir ? `${dir}/${name}` : name);
  let path = pathFor(`${key}.css`);
  let n = 1;
  while (await adapter.exists(path)) { path = pathFor(`${key}-copy${n > 1 ? n : ""}.css`); n++; }
  const header = `/* slide-deck theme: ${key} — edit the --sd-* tokens below.\n   The frontmatter "theme:" value is this file's name without ".css". */\n`;
  await adapter.write(path, header + css);
  return path;
}

/** Open the themes folder in the system file manager (desktop only). Falls back to a Notice. */
export function revealFolder(app: App, folder: string): void {
  const adapter = app.vault.adapter;
  const dir = normalizeFolder(folder);
  if (!(adapter instanceof FileSystemAdapter)) { new Notice(dir); return; }
  const full = `${adapter.getBasePath()}/${dir}`;
  try {
    // Desktop-only plugin; electron is marked external by esbuild. Dynamic require keeps it lazy.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { shell } = require("electron");
    void shell.openPath(full);
  } catch {
    new Notice(full);
  }
}
```

- [ ] **Step 2: Run typecheck (scoped)** — sicherstellen, dass die Datei für sich kompiliert:

Run: `npx tsc --noEmit`
Expected: keine Fehler **in `src/theme-source.ts`** (andere Dateien können wg. noch ausstehender Signatur-Migration meckern — diese werden in Task 11–17 behoben).

- [ ] **Step 3: Commit**

```bash
git add src/theme-source.ts
git commit -m "feat: theme-source folder I/O (scan/write/reveal)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: frontmatter-writer — setNoteTheme (Adapter)

**Files:**
- Create: `src/frontmatter-writer.ts`

**Interfaces:**
- Produces: `setNoteTheme(app, file, key)` via `app.fileManager.processFrontMatter`.

- [ ] **Step 1: Implement** — `src/frontmatter-writer.ts`:

```ts
import { type App, type TFile } from "obsidian";

/** Surgically set the note's "theme:" frontmatter key (creates the YAML block if absent). */
export async function setNoteTheme(app: App, file: TFile, key: string): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => { fm.theme = key; });
}
```

- [ ] **Step 2: Run typecheck (scoped)**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `src/frontmatter-writer.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/frontmatter-writer.ts
git commit -m "feat: setNoteTheme via processFrontMatter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: ThemeStore — Registry-Holder (Adapter)

**Files:**
- Create: `src/theme-registry.ts`

**Interfaces:**
- Consumes: `mergeThemes`, `listThemes`, `resolveTheme`, `ThemeEntry`, `ThemeRegistry` (Task 1/2); `builtinThemeEntries`, `userThemeEntry` (Task 5); `scanThemeFiles` (Task 9).
- Produces: `class ThemeStore` (`getMap`/`getThemes`/`resolve`/`refresh`).

- [ ] **Step 1: Implement** — `src/theme-registry.ts`:

```ts
import { type App } from "obsidian";
import { mergeThemes, listThemes, resolveTheme, type ThemeEntry, type ThemeRegistry } from "./core/presets";
import { builtinThemeEntries, userThemeEntry } from "./deck-css";
import { scanThemeFiles } from "./theme-source";

/** Owns the merged theme registry (builtins + user .css). refresh() re-scans the folder. */
export class ThemeStore {
  private map: ThemeRegistry = mergeThemes(builtinThemeEntries(), []).map;
  constructor(private app: App, private getFolder: () => string) {}

  getMap(): ThemeRegistry { return this.map; }
  getThemes(): ThemeEntry[] { return listThemes(this.map); }
  resolve(key: string): ThemeEntry { return resolveTheme(this.map, key); }

  async refresh(): Promise<void> {
    const files = await scanThemeFiles(this.app.vault.adapter, this.getFolder());
    const users = files.map((f) => userThemeEntry(f.key, f.css));
    const { map, warnings } = mergeThemes(builtinThemeEntries(), users);
    this.map = map;
    for (const w of warnings) console.warn(`[slide-deck] ${w}`);
  }
}
```

- [ ] **Step 2: Run typecheck (scoped)**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `src/theme-registry.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/theme-registry.ts
git commit -m "feat: ThemeStore merges builtins + user .css themes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: loadDeck meldet frontmatterTheme (Adapter)

**Files:**
- Modify: `src/adapter.ts`

**Interfaces:**
- Produces: `LoadedDeck.frontmatterTheme?: string` — der eigene `theme:`-Key der Notiz (oder undefined), aus `metadataCache`.

- [ ] **Step 1: Implement** — in `src/adapter.ts`:

Das `LoadedDeck`-Interface ersetzen:
```ts
export interface LoadedDeck {
  deck: SlideDeck;
  resolveEmbed: (ref: string) => string | null;
  frontmatterTheme?: string; // the note's OWN theme: key (undefined if it has none) — drives the preview source label
}
```

In `loadDeck` direkt vor `return { deck, resolveEmbed: ... }` einfügen und das Return erweitern:
```ts
  const fmTheme = app.metadataCache.getFileCache(file)?.frontmatter?.theme;
  const frontmatterTheme = typeof fmTheme === "string" ? fmTheme : undefined;
  return { deck, resolveEmbed: (ref) => cache.get(ref) ?? null, frontmatterTheme };
```

- [ ] **Step 2: Run typecheck (scoped)**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in `src/adapter.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/adapter.ts
git commit -m "feat: loadDeck reports the note's own frontmatter theme

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: export.ts — Registry + themeOverride (Adapter)

**Files:**
- Modify: `src/export.ts`

**Interfaces:**
- Consumes: `ThemeRegistry` (Task 1); `buildIsolatedDeck(..., registry, customCss)` (Task 7).
- Produces: `exportPdf(app, doc, win, file, registry, defaults?, customCss?, themeOverride?)`, `exportImages(app, doc, win, file, registry, defaults?, scale?, customCss?, exportFolder?, themeOverride?)`.

> Kein Unit-Test (DOM/Canvas/Print). Gate: typecheck + manueller Smoke (Task 20).

- [ ] **Step 1: Implement** — in `src/export.ts`:

Imports ergänzen:
```ts
import type { DeckDirectives, SlideDeck } from "./core/slide-model";
import type { ThemeRegistry } from "./core/presets";
```
(die bestehende `import type { DeckDirectives } …`-Zeile durch obige erste Zeile ersetzen.)

Eine kleine Helper-Funktion oben in der Datei (nach den Imports) hinzufügen:
```ts
/** Apply an explicit theme override (the toolbar's ephemeral try-on) onto a loaded deck. */
function withTheme(deck: SlideDeck, themeOverride?: string): SlideDeck {
  return themeOverride ? { ...deck, directives: { ...deck.directives, theme: themeOverride } } : deck;
}
```

`exportPdf` Signatur + die `buildIsolatedDeck`-Zeile ändern:
```ts
export async function exportPdf(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, customCss = "", themeOverride?: string): Promise<void> {
 try {
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, customCss);
```
(Rest von `exportPdf` unverändert.)

`exportImages` Signatur + Lade-/Build-Zeilen ändern:
```ts
export async function exportImages(app: App, doc: Document, win: Window, file: TFile | null, registry: ThemeRegistry, defaults?: Partial<DeckDirectives>, scale = 2, customCss = "", exportFolder = "Slide-Deck-Export", themeOverride?: string): Promise<void> {
  void win;
 try {
  const loaded = await loadDeck(app, file, defaults);
  if (!loaded || loaded.deck.slides.length === 0) { new Notice(t("notice.noActiveNote")); return; }
  const deck = withTheme(loaded.deck, themeOverride);
  const geo = geometryFor(deck.directives.aspect);
  const { slidesHtml, css } = await buildIsolatedDeck(doc, deck, loaded.resolveEmbed, registry, customCss);
```
(Rest unverändert — `base`/`root`/`folder` nutzen `file?.basename` wie gehabt.)

- [ ] **Step 2: Run typecheck (scoped)**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `src/export.ts` (Aufrufer `main.ts`/`preview-view.ts` werden in Task 16/17 angepasst).

- [ ] **Step 3: Commit**

```bash
git add src/export.ts
git commit -m "feat(export): take the theme registry + an optional theme override

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: i18n — neue Strings (EN + DE)

**Files:**
- Modify: `src/i18n.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Produces: neue `t()`-Keys: `toolbar.theme`, `toolbar.setTheme`, `source.frontmatter`, `source.default`, `source.unsaved`, `notice.themeSet`, `notice.themeExported`, `settings.themesFolder.name/desc`, `settings.openFolder.name/desc/button`, `settings.exportTheme.name/desc/button`, `settings.availableThemes.name/desc`, `settings.builtinTag`, `settings.userTag`, `settings.hideFolder.name/desc`, geänderte `settings.theme.desc`.

- [ ] **Step 1: Write the failing test** — an `tests/i18n.test.ts` anhängen:

```ts
import { t, setLang } from "../src/i18n";

describe("theme-handling strings", () => {
  it("has EN + DE for the new keys", () => {
    const keys = ["toolbar.theme", "toolbar.setTheme", "source.frontmatter", "source.default", "source.unsaved",
      "settings.themesFolder.name", "settings.openFolder.button", "settings.exportTheme.button",
      "settings.availableThemes.name", "settings.hideFolder.name"];
    setLang("en");
    for (const k of keys) expect(t(k), `EN ${k}`).not.toBe(k);
    setLang("de");
    for (const k of keys) expect(t(k), `DE ${k}`).not.toBe(k);
    setLang("en");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — keys fall back to themselves.

- [ ] **Step 3: Implement** — in `src/i18n.ts`: die Zeile `"settings.theme.desc": "Preset used when a note has no theme directive",` (EN) ersetzen durch die geschärfte Variante und alle neuen EN-Keys vor `"toolbar.refresh"` einfügen:

```ts
  "settings.theme.desc": "Applies only to notes WITHOUT a theme: frontmatter key",
  "toolbar.theme": "Theme",
  "toolbar.setTheme": "Set",
  "source.frontmatter": "from frontmatter",
  "source.default": "from default",
  "source.unsaved": "unsaved",
  "notice.themeSet": "Set theme “{0}” for this note",
  "notice.themeExported": "Exported theme to {0}",
  "settings.themesFolder.name": "Themes folder",
  "settings.themesFolder.desc": "Vault folder scanned for .css theme files (each file = one theme)",
  "settings.openFolder.name": "Open themes folder",
  "settings.openFolder.desc": "Reveal the folder in your system file manager, then drop .css files in",
  "settings.openFolder.button": "Open in Finder",
  "settings.exportTheme.name": "Export a theme as .css",
  "settings.exportTheme.desc": "Write a theme's tokens into the folder as an editable starting point",
  "settings.exportTheme.button": "Export",
  "settings.availableThemes.name": "Available themes",
  "settings.availableThemes.desc": "Valid theme: frontmatter values. For your own themes this is the .css filename without the extension.",
  "settings.builtinTag": "built-in",
  "settings.userTag": "from folder",
  "settings.hideFolder.name": "Hide themes folder in file explorer",
  "settings.hideFolder.desc": "Keeps the folder out of the way; it still exists and syncs",
```

Dieselben Keys in den DE-Block vor `"toolbar.refresh"` einfügen, und die DE-Zeile `"settings.theme.desc": "Preset, wenn eine Notiz keine theme-Direktive hat",` ersetzen:

```ts
  "settings.theme.desc": "Greift nur für Notizen OHNE theme:-Frontmatter-Key",
  "toolbar.theme": "Theme",
  "toolbar.setTheme": "Setzen",
  "source.frontmatter": "aus Frontmatter",
  "source.default": "aus Standard",
  "source.unsaved": "ungespeichert",
  "notice.themeSet": "Theme „{0}“ für diese Notiz gesetzt",
  "notice.themeExported": "Theme nach {0} exportiert",
  "settings.themesFolder.name": "Themes-Ordner",
  "settings.themesFolder.desc": "Vault-Ordner, der nach .css-Theme-Dateien durchsucht wird (jede Datei = ein Theme)",
  "settings.openFolder.name": "Themes-Ordner öffnen",
  "settings.openFolder.desc": "Öffnet den Ordner im System-Dateimanager; dort .css-Dateien reinlegen",
  "settings.openFolder.button": "Im Finder öffnen",
  "settings.exportTheme.name": "Theme als .css exportieren",
  "settings.exportTheme.desc": "Schreibt die Tokens eines Themes als anpassbaren Startpunkt in den Ordner",
  "settings.exportTheme.button": "Exportieren",
  "settings.availableThemes.name": "Verfügbare Themes",
  "settings.availableThemes.desc": "Gültige theme:-Frontmatter-Werte. Für eigene Themes ist das der .css-Dateiname ohne Endung.",
  "settings.builtinTag": "Built-in",
  "settings.userTag": "aus Ordner",
  "settings.hideFolder.name": "Themes-Ordner im Datei-Explorer ausblenden",
  "settings.hideFolder.desc": "Hält den Ordner aus dem Weg; er existiert weiter und wird synchronisiert",
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts tests/i18n.test.ts
git commit -m "feat(i18n): strings for theme switcher, source label, themes folder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: settings.ts — Ordner, Hide, Referenzliste, Open, Export, Registry-Dropdown

**Files:**
- Modify: `src/settings.ts`

**Interfaces:**
- Consumes: `ThemeStore` via `plugin.themeStore`; `revealFolder`, `writeThemeCss` (Task 9); `t()` keys (Task 14); plugin-Hooks `refreshThemes()` + `applyFolderHide()` (Task 16).
- Produces: `SlideDeckSettings` erweitert um `themesFolder`, `hideThemesFolder`.

> Kein Unit-Test (DOM). Gate: typecheck + manueller Smoke (Task 20).

- [ ] **Step 1: Implement** — `src/settings.ts` komplett ersetzen:

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type SlideDeckPlugin from "./main";
import { t } from "./i18n";
import { revealFolder, writeThemeCss } from "./theme-source";

export interface SlideDeckSettings {
  defaultTheme: string;
  minFontPx: number;
  imageScale: number;
  customCss: string;
  exportFolder: string;
  themesFolder: string;
  hideThemesFolder: boolean;
}
export const DEFAULT_SETTINGS: SlideDeckSettings = {
  defaultTheme: "default", minFontPx: 24, imageScale: 2, customCss: "",
  exportFolder: "Slide-Deck-Export", themesFolder: "Slide-Deck-Themes", hideThemesFolder: true,
};

export class SlideDeckSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SlideDeckPlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.heading")).setHeading();

    const themes = this.plugin.themeStore.getThemes();
    // Coerce an unknown persisted default to "default" so the dropdown always has a valid value.
    if (!this.plugin.themeStore.getMap().has(this.plugin.settings.defaultTheme)) this.plugin.settings.defaultTheme = "default";

    new Setting(containerEl).setName(t("settings.theme.name")).setDesc(t("settings.theme.desc"))
      .addDropdown((c) => {
        for (const e of themes) c.addOption(e.key, e.key);
        c.setValue(this.plugin.settings.defaultTheme)
          .onChange(async (v) => { this.plugin.settings.defaultTheme = v; await this.plugin.saveSettings(); });
      });

    // Available themes reference — the live list of valid frontmatter theme: values.
    const ref = new Setting(containerEl).setName(t("settings.availableThemes.name")).setDesc(t("settings.availableThemes.desc"));
    const chips = ref.controlEl.createDiv({ cls: "sd-theme-chips" });
    for (const e of themes) {
      const tag = e.source === "user" ? t("settings.userTag") : t("settings.builtinTag");
      const label = /\s/.test(e.key) ? `"${e.key}"` : e.key;
      const chip = chips.createSpan({ cls: "sd-theme-chip", text: `${label} (${tag})` });
      chip.addEventListener("click", () => void navigator.clipboard?.writeText(e.key));
    }

    new Setting(containerEl).setName(t("settings.minFont.name")).setDesc(t("settings.minFont.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.minFontPx)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.minFontPx = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.imageScale.name")).setDesc(t("settings.imageScale.desc"))
      .addText((c) => c.setValue(String(this.plugin.settings.imageScale)).onChange(async (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { this.plugin.settings.imageScale = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl).setName(t("settings.exportFolder.name")).setDesc(t("settings.exportFolder.desc"))
      .addText((c) => c.setValue(this.plugin.settings.exportFolder).onChange(async (v) => { this.plugin.settings.exportFolder = v.trim() || "Slide-Deck-Export"; await this.plugin.saveSettings(); }));

    // Themes folder path
    new Setting(containerEl).setName(t("settings.themesFolder.name")).setDesc(t("settings.themesFolder.desc"))
      .addText((c) => c.setValue(this.plugin.settings.themesFolder).onChange(async (v) => {
        this.plugin.settings.themesFolder = v.trim() || "Slide-Deck-Themes";
        await this.plugin.saveSettings();
        await this.plugin.refreshThemes();
        this.plugin.applyFolderHide();
      }));

    // Open in Finder
    new Setting(containerEl).setName(t("settings.openFolder.name")).setDesc(t("settings.openFolder.desc"))
      .addButton((b) => b.setButtonText(t("settings.openFolder.button")).onClick(() => revealFolder(this.app, this.plugin.settings.themesFolder)));

    // Export a theme as .css
    let exportPick = themes[0]?.key ?? "default";
    new Setting(containerEl).setName(t("settings.exportTheme.name")).setDesc(t("settings.exportTheme.desc"))
      .addDropdown((c) => { for (const e of themes) c.addOption(e.key, e.key); c.setValue(exportPick).onChange((v) => { exportPick = v; }); })
      .addButton((b) => b.setButtonText(t("settings.exportTheme.button")).onClick(async () => {
        const entry = this.plugin.themeStore.resolve(exportPick);
        const path = await writeThemeCss(this.app.vault.adapter, this.plugin.settings.themesFolder, entry.key, entry.themeCss);
        const { Notice } = await import("obsidian");
        new Notice(t("notice.themeExported", path));
        await this.plugin.refreshThemes();
        this.display();
      }));

    // Hide themes folder
    new Setting(containerEl).setName(t("settings.hideFolder.name")).setDesc(t("settings.hideFolder.desc"))
      .addToggle((c) => c.setValue(this.plugin.settings.hideThemesFolder).onChange(async (v) => {
        this.plugin.settings.hideThemesFolder = v; await this.plugin.saveSettings(); this.plugin.applyFolderHide();
      }));

    new Setting(containerEl).setName(t("settings.customCss.name")).setDesc(t("settings.customCss.desc"))
      .addTextArea((c) => c.setValue(this.plugin.settings.customCss).onChange(async (v) => { this.plugin.settings.customCss = v; await this.plugin.saveSettings(); }));
  }
}
```

> Hinweis: `import { Notice } from "obsidian"` ist oben schon nicht enthalten — der Export-Handler nutzt `await import("obsidian")`. Alternativ `Notice` zur statischen Import-Zeile hinzufügen (`import { App, Notice, PluginSettingTab, Setting } from "obsidian";`) und direkt verwenden. Wähle die statische Variante, sie ist lint-sauberer:
> Ersetze die erste Zeile durch `import { App, Notice, PluginSettingTab, Setting } from "obsidian";` und im Export-Handler `const { Notice } = await import("obsidian");` entfernen.

- [ ] **Step 2: Run typecheck (scoped)**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `src/settings.ts` (verbleibende Fehler erwartet in `main.ts`/`preview-view.ts` bis Task 16/17).

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "feat(settings): themes folder, hide toggle, reference list, open/export, registry dropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: main.ts — ThemeStore verdrahten, Folder-Hide, Events, Palette-Export

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `ThemeStore` (Task 11); `buildHideCss` (Task 4); `exportPdf/exportImages(..., registry, ...)` (Task 13); `SlideDeckView.refresh` (Task 17).
- Produces: `plugin.themeStore`, `plugin.refreshThemes()`, `plugin.applyFolderHide()`.

> Kein Unit-Test. Gate: typecheck + Full Gate + manueller Smoke.

- [ ] **Step 1: Implement** — `src/main.ts` komplett ersetzen:

```ts
import { Plugin, getLanguage, TFile } from "obsidian";
import { exportPdf, exportImages } from "./export";
import { SlideDeckView, VIEW_TYPE } from "./preview-view";
import { t, pickLang, setLang } from "./i18n";
import { DEFAULT_SETTINGS, SlideDeckSettings, SlideDeckSettingTab } from "./settings";
import { ThemeStore } from "./theme-registry";
import { buildHideCss, normalizeFolder } from "./core/folder-hide";

export default class SlideDeckPlugin extends Plugin {
  declare public settings: SlideDeckSettings;
  public themeStore!: ThemeStore;
  private hideSheet: CSSStyleSheet | null = null;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<SlideDeckSettings>);

    this.themeStore = new ThemeStore(this.app, () => this.settings.themesFolder);
    await this.themeStore.refresh();
    this.applyFolderHide();

    this.addSettingTab(new SlideDeckSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new SlideDeckView(leaf, this));

    this.addCommand({ id: "open-preview", name: t("cmd.openPreview"), callback: () => void this.activatePreview() });
    this.addCommand({
      id: "export-pdf", name: t("cmd.exportPdf"),
      callback: () => void exportPdf(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.customCss),
    });
    this.addCommand({
      id: "export-images", name: t("cmd.exportImages"),
      callback: () => void exportImages(this.app, activeDocument, activeWindow, this.app.workspace.getActiveFile(), this.themeStore.getMap(), { theme: this.settings.defaultTheme, minFontPx: this.settings.minFontPx }, this.settings.imageScale, this.settings.customCss, this.settings.exportFolder),
    });

    // Refresh the registry when a .css under the themes folder is added/removed/renamed.
    const underThemes = (path: string) => normalizeFolder(path).startsWith(normalizeFolder(this.settings.themesFolder) + "/") && path.toLowerCase().endsWith(".css");
    const onVault = (f: { path: string } | null) => { if (f && underThemes(f.path)) void this.refreshThemes(); };
    this.registerEvent(this.app.vault.on("create", (f) => onVault(f as TFile)));
    this.registerEvent(this.app.vault.on("delete", (f) => onVault(f as TFile)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { onVault(f as TFile); if (underThemes(oldPath)) void this.refreshThemes(); }));
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Re-scan the themes folder, then refresh any open preview so the dropdown reflects it. */
  async refreshThemes(): Promise<void> {
    await this.themeStore.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof SlideDeckView) void leaf.view.refresh();
    }
  }

  /** Apply (or clear) the explorer-hide stylesheet for the themes folder. */
  applyFolderHide(): void {
    if (!this.hideSheet) { this.hideSheet = new CSSStyleSheet(); document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.hideSheet]; }
    this.hideSheet.replaceSync(buildHideCss(this.settings.themesFolder, this.settings.hideThemesFolder));
  }

  onunload(): void {
    if (this.hideSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== this.hideSheet);
  }

  private async activatePreview(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    void workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 2: Run typecheck (scoped)**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `src/main.ts` (verbleibend: `preview-view.ts` bis Task 17).

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire ThemeStore, folder-hide stylesheet, themes-folder watch, registry exports

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: preview-view.ts — Theme-Dropdown, Quell-Label, Setzen, ephemerer Switch

**Files:**
- Modify: `src/preview-view.ts`

**Interfaces:**
- Consumes: `plugin.themeStore`; `setNoteTheme` (Task 10); `buildIsolatedDeck(..., registry, customCss)` (Task 7); `exportPdf/exportImages(..., registry, defaults, customCss, themeOverride)` (Task 13); `loaded.frontmatterTheme` (Task 12); `t()` keys (Task 14).
- Produces: `SlideDeckView.refresh()` (öffentlich, von `main.refreshThemes` aufgerufen).

> Kein Unit-Test (DOM). Gate: typecheck + Full Gate + manueller Smoke (Task 20).

- [ ] **Step 1: Implement** — `src/preview-view.ts` komplett ersetzen:

```ts
import { ItemView, WorkspaceLeaf, MarkdownView, setIcon, type TFile } from "obsidian";
import { loadDeck } from "./adapter";
import { buildIsolatedDeck } from "./render-dom";
import { createIsolatedDeckIframe, type IsolatedIframe } from "./iframe-host";
import { PREVIEW_CHROME_CSS } from "./chrome-css";
import { exportPdf, exportImages } from "./export";
import { setNoteTheme } from "./frontmatter-writer";
import { activeDoc, activeWin } from "./dom-safe";
import { geometryFor } from "./core/geometry";
import { t } from "./i18n";
import type { SlideDeck } from "./core/slide-model";
import type SlideDeckPlugin from "./main";

export const VIEW_TYPE = "slide-deck-preview";

export class SlideDeckView extends ItemView {
  private warnEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private deckHost!: HTMLElement;
  private messageEl!: HTMLElement;
  private fileLabel!: HTMLElement;
  private themeSelect!: HTMLSelectElement;
  private sourceLabel!: HTMLElement;
  private setBtn!: HTMLButtonElement;
  private previewFrame?: IsolatedIframe;
  private resizeObs?: ResizeObserver;
  private currentFile: TFile | null = null;
  private currentDeck: SlideDeck | null = null;
  private persistedTheme?: string;   // the note's own frontmatter theme (undefined = none)
  private ephemeralTheme?: string;   // live try-on; never written to disk
  private geoWidth = 1280;

  constructor(leaf: WorkspaceLeaf, private plugin: SlideDeckPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Slide deck"; }
  getIcon(): string { return "presentation"; }

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

  private get effectiveTheme(): string { return this.ephemeralTheme ?? this.persistedTheme ?? this.plugin.settings.defaultTheme; }
  private get dirty(): boolean { return this.ephemeralTheme !== undefined && this.ephemeralTheme !== this.persistedTheme; }

  private buildToolbar(): void {
    const bar = this.contentEl.createDiv({ cls: "sd-toolbar" });
    const mkBtn = (icon: string, label: string, onClick: () => void): HTMLButtonElement => {
      const b = bar.createEl("button", { cls: "sd-toolbar-btn" });
      setIcon(b.createSpan({ cls: "sd-toolbar-icon" }), icon);
      b.createSpan({ text: label });
      b.addEventListener("click", onClick);
      return b;
    };
    mkBtn("refresh-cw", t("toolbar.refresh"), () => void this.refresh());

    // Theme switcher (ephemeral try-on)
    bar.createSpan({ cls: "sd-toolbar-themelabel", text: t("toolbar.theme") });
    this.themeSelect = bar.createEl("select", { cls: "sd-toolbar-theme" });
    this.themeSelect.addEventListener("change", () => { this.ephemeralTheme = this.themeSelect.value; void this.rerenderTheme(); });
    this.sourceLabel = bar.createSpan({ cls: "sd-toolbar-source" });
    this.setBtn = bar.createEl("button", { cls: "sd-toolbar-btn sd-toolbar-set", text: t("toolbar.setTheme") });
    this.setBtn.addEventListener("click", () => void this.commitTheme());

    const defaults = () => ({ theme: this.effectiveTheme, minFontPx: this.plugin.settings.minFontPx });
    mkBtn("file-text", t("toolbar.exportPdf"), () => void exportPdf(this.app, activeDoc(), activeWin(), this.currentFile, this.plugin.themeStore.getMap(), defaults(), this.plugin.settings.customCss, this.effectiveTheme));
    mkBtn("image", t("toolbar.exportImages"), () => void exportImages(this.app, activeDoc(), activeWin(), this.currentFile, this.plugin.themeStore.getMap(), defaults(), this.plugin.settings.imageScale, this.plugin.settings.customCss, this.plugin.settings.exportFolder, this.effectiveTheme));
    this.fileLabel = bar.createSpan({ cls: "sd-toolbar-file" });
  }

  /** Rebuild the theme dropdown options from the registry and select the effective theme. */
  private syncThemeControls(): void {
    this.themeSelect.empty();
    for (const e of this.plugin.themeStore.getThemes()) this.themeSelect.createEl("option", { value: e.key, text: e.key });
    this.themeSelect.value = this.effectiveTheme;
    this.sourceLabel.setText(this.dirty ? `● ${t("source.unsaved")}` : (this.persistedTheme ? t("source.frontmatter") : t("source.default")));
    this.sourceLabel.toggleClass("sd-source-dirty", this.dirty);
    this.setBtn.toggle(this.dirty && !!this.currentFile);
  }

  async refresh(): Promise<void> {
    try {
      const active = this.app.workspace.getActiveFile();
      this.currentFile = active && active.extension === "md" ? active : null;
      this.fileLabel.setText(this.currentFile ? this.currentFile.basename : "");
      this.ephemeralTheme = undefined; // a fresh load drops any try-on
      const loaded = await loadDeck(this.app, this.currentFile, { theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
      this.warnEl.empty();
      this.messageEl.empty();
      this.messageEl.removeClass("sd-error");
      this.disposeFrame();
      if (!loaded) { this.currentDeck = null; this.persistedTheme = undefined; this.syncThemeControls(); this.messageEl.setText(t("preview.hint")); return; }
      if (loaded.deck.slides.length === 0) { this.currentDeck = null; this.persistedTheme = loaded.frontmatterTheme; this.syncThemeControls(); this.messageEl.setText(t("preview.empty")); return; }
      this.currentDeck = loaded.deck;
      this.persistedTheme = loaded.frontmatterTheme;
      this.geoWidth = geometryFor(loaded.deck.directives.aspect).width;
      await this.renderCurrent();
    } catch (e) {
      this.disposeFrame();
      this.messageEl.empty();
      this.messageEl.addClass("sd-error");
      this.messageEl.setText(t("preview.error", String(e)));
    }
  }

  /** Re-render only because the theme try-on changed — reuse the loaded deck. */
  private async rerenderTheme(): Promise<void> {
    if (!this.currentDeck) { this.syncThemeControls(); return; }
    await this.renderCurrent();
  }

  /** Render currentDeck with the effective theme into a fresh iframe + sync toolbar state. */
  private async renderCurrent(): Promise<void> {
    if (!this.currentDeck) return;
    const deck: SlideDeck = { ...this.currentDeck, directives: { ...this.currentDeck.directives, theme: this.effectiveTheme } };
    const loaded = await loadDeck(this.app, this.currentFile, { theme: this.plugin.settings.defaultTheme, minFontPx: this.plugin.settings.minFontPx });
    const resolveEmbed = loaded?.resolveEmbed ?? (() => null);
    this.warnEl.empty();
    this.disposeFrame();
    const { slidesHtml, css, warnings } = await buildIsolatedDeck(activeDoc(), deck, resolveEmbed, this.plugin.themeStore.getMap(), this.plugin.settings.customCss);
    const bodyHtml = `<div class="sd-deck-inner">${slidesHtml.join("")}</div>`;
    this.previewFrame = await createIsolatedDeckIframe(this.deckHost.ownerDocument, { css, extraCss: PREVIEW_CHROME_CSS, bodyHtml, width: this.geoWidth, mount: this.deckHost });
    this.previewFrame.iframe.addClass("sd-deck-iframe");
    const ch = this.previewFrame.contentDoc.documentElement.scrollHeight;
    this.previewFrame.iframe.style.height = `${ch}px`;
    this.fitToWidth();
    this.previewFrame.reveal();
    for (const w of warnings) {
      const row = this.warnEl.createDiv({ cls: `sd-warn sd-warn-${w.kind}`, text: `#${w.slideIndex + 1} — ${w.message}` });
      if (w.sourceLine !== undefined) row.addEventListener("click", () => this.jumpTo(w.sourceLine!));
    }
    this.syncThemeControls();
  }

  /** Write the effective theme into the note's frontmatter (explicit commit). */
  private async commitTheme(): Promise<void> {
    if (!this.currentFile) return;
    const key = this.effectiveTheme;
    await setNoteTheme(this.app, this.currentFile, key);
    this.persistedTheme = key;       // optimistic — metadataCache updates async
    this.ephemeralTheme = undefined;
    const { Notice } = await import("obsidian");
    new Notice(t("notice.themeSet", key));
    this.syncThemeControls();
  }

  private disposeFrame(): void { this.previewFrame?.dispose(); this.previewFrame = undefined; }

  private fitToWidth(): void {
    const frame = this.previewFrame?.iframe;
    if (!frame) return;
    const avail = this.deckEl.clientWidth - 16;
    if (avail <= 0) return;
    frame.style.setProperty("zoom", String(Math.min(1, avail / this.geoWidth)));
  }

  private jumpTo(line: number): void {
    if (!this.currentFile) return;
    const path = this.currentFile.path;
    const leaf = this.app.workspace.getLeavesOfType("markdown").find((l) => l.view instanceof MarkdownView && l.view.file?.path === path);
    if (leaf && leaf.view instanceof MarkdownView) {
      void this.app.workspace.revealLeaf(leaf);
      leaf.view.editor.setCursor({ line, ch: 0 });
      leaf.view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    } else {
      void this.app.workspace.openLinkText(path, "", false);
    }
  }

  async onClose(): Promise<void> {
    this.resizeObs?.disconnect();
    this.disposeFrame();
    this.warnEl?.empty();
    this.messageEl?.empty();
  }
}
```

> **Hinweis zur DRY/Effizienz:** `renderCurrent` lädt das Deck erneut, nur um `resolveEmbed` zu bekommen (Embeds-Closure). Das ist bewusst einfach gehalten; ein Reviewer darf vorschlagen, `resolveEmbed` aus `refresh` zwischenzuspeichern (Feld `private resolveEmbed: (r:string)=>string|null`), damit das Theme-Umschalten die Datei nicht erneut liest. Falls umgesetzt: in `refresh` `this.resolveEmbed = loaded.resolveEmbed;` setzen und in `renderCurrent` `this.resolveEmbed` nutzen statt erneutem `loadDeck`. (Optional — Korrektheit ist mit dem Reload ebenfalls gegeben.)

> **`Notice`-Import:** wie in Settings — entweder `await import("obsidian")` (wie oben) oder `Notice` zur statischen Import-Zeile hinzufügen. Statische Variante bevorzugt: `import { ItemView, WorkspaceLeaf, MarkdownView, Notice, setIcon, type TFile } from "obsidian";` und `const { Notice } = await import("obsidian");` entfernen.

- [ ] **Step 2: Run typecheck (full now)**

Run: `npx tsc --noEmit`
Expected: PASS — alle Signaturen passen jetzt zusammen.

- [ ] **Step 3: Commit**

```bash
git add src/preview-view.ts
git commit -m "feat(preview): live theme dropdown, source label, commit-to-frontmatter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: styles.css — Toolbar-Dropdown/Label/Setzen + Settings-Chips

**Files:**
- Modify: `styles.css`

> Kein Unit-Test. Gate: visueller Smoke (Task 20).

- [ ] **Step 1: Implement** — am Ende von `styles.css` anfügen:

```css
/* Theme switcher in the preview toolbar */
.sd-toolbar-themelabel { font-size: 12px; color: var(--text-muted); margin-left: 4px; }
.sd-toolbar-theme { max-width: 160px; }
.sd-toolbar-source { font-size: 12px; color: var(--text-muted); }
.sd-toolbar-source.sd-source-dirty { color: var(--text-warning, #c98a00); }
.sd-toolbar-set { display: none; }
.sd-toolbar-set:not([style*="display: none"]) { display: inline-flex; }

/* Available-themes reference chips in settings */
.sd-theme-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.sd-theme-chip {
  font-family: var(--font-monospace); font-size: 12px;
  padding: 2px 8px; border-radius: 6px;
  background: var(--background-modifier-border); cursor: pointer;
}
.sd-theme-chip:hover { background: var(--background-modifier-hover); }
```

> `.toggle()` (Obsidian) setzt `display:none`/`""` inline; die `:not([style*=...])`-Regel ist nur Absicherung. Primär steuert Obsidians `toggle()` die Sichtbarkeit von `#sd-toolbar-set`.

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: toolbar theme switcher + settings theme chips

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Doku — AGENTS.md, README, CHANGELOG

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md` (+ `README.de.md` falls vorhanden)
- Modify: `CHANGELOG.md`

> Kein Test. In den Task gefaltet, weil die Doku zum Feature-Deliverable gehört.

- [ ] **Step 1: AGENTS.md** — in §Architecture die neuen Dateien eintragen (`theme-registry.ts`, `theme-source.ts`, `frontmatter-writer.ts`, `core/theme-key.ts`, `core/folder-hide.ts`) und in §Gotchas einen Punkt ergänzen:

```markdown
- **Theme-Registry:** Themes sind `ThemeEntry { key, source, themeCss, hljs, mermaid, baseFontPx }`.
  `ThemeStore` (`theme-registry.ts`) merged Built-ins (`builtinThemeEntries`) mit User-`.css` aus
  `settings.themesFolder` (`scanThemeFiles`). Frontmatter `theme:` = SoT der Notiz (Settings-`defaultTheme`
  nur für Notizen ohne `theme:`). Das Preview-Dropdown schaltet ephemer; `✓ Setzen` schreibt via
  `setNoteTheme` (`processFrontMatter`). User-Themes erben Code-/Mermaid-Theme des `default`-Built-ins.
- **Themes-Ordner ausblenden:** `buildHideCss` (vault-rag-Muster) via `document.adoptedStyleSheets`
  in `main.applyFolderHide()`. `data-path` ist internes Obsidian-Markup — bricht es, taucht der Ordner
  nur kosmetisch wieder auf.
```

- [ ] **Step 2: README + CHANGELOG** — User-Themes, Live-Theme-Switch, Import/Export (Open-in-Finder + Export) und die Settings↔Frontmatter-Klärung beschreiben. CHANGELOG-Eintrag unter einer neuen Version (`Unreleased` oder die nächste Minor):

```markdown
### Added
- Live theme switcher in the preview toolbar (ephemeral try-on) with a “Set” button that writes
  theme: into the note's frontmatter.
- A visible source label showing whether the active theme comes from the note's frontmatter or the
  default setting — curing the “theme dropdown does nothing” confusion.
- Named user themes: drop .css files into the configurable themes folder (Open-in-Finder button);
  export any theme as an editable .css starting point; optionally hide the folder in the file explorer.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md README.md CHANGELOG.md
git commit -m "docs: theme registry, live switch, user themes import/export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Full Gate + manueller Pallas-Smoke

**Files:** keine (Verifikation).

- [ ] **Step 1: Full Gate**

Run: `npm run lint && npm run build && npm test`
Expected: lint clean; build erzeugt `main.js`; `npm test` → `core purity OK` → `render realm OK` → `bundle-smoke OK …` → alle vitest grün.

- [ ] **Step 2: Deploy nach Pallas**

Run: `npm run deploy` (setzt `$OBSIDIAN_PLUGIN_DIR` voraus)
Expected: `main.js`/`manifest.json`/`styles.css` kopiert.

- [ ] **Step 3: Manuelle Smoke-Checkliste** (in Obsidian/Pallas; jeder Punkt = Akzeptanzkriterium der Spec):

- [ ] Notiz mit `theme: default`, Settings-Default `dark` → Preview zeigt **default** + Label **„aus Frontmatter"** (Falle sichtbar geheilt).
- [ ] Notiz **ohne** `theme:` → Label **„aus Standard"**; Theme = Settings-Default.
- [ ] Toolbar-Dropdown auf `serif` → Folien rendern sofort serif; Label **„● ungespeichert"**; **Setzen** erscheint.
- [ ] **Setzen** klicken → Notiz-Frontmatter hat jetzt `theme: serif` (nur dieser Key, Rest unverändert); Label zurück auf **„aus Frontmatter"**; Setzen verschwindet.
- [ ] Eine `.css` mit `.sd-slide{ --sd-base:30px; --sd-bg:#012738; --sd-fg:#e6f1ff }` in den Themes-Ordner legen → erscheint im Dropdown + in der Settings-Referenzliste (Key = Dateiname ohne `.css`).
- [ ] **„Im Finder öffnen"** öffnet den Themes-Ordner.
- [ ] **„Theme als .css exportieren"** (z.B. `dark`) → `dark.css` (oder `dark-copy.css`) liegt im Ordner und ist editierbar.
- [ ] Hide-Toggle an → Themes-Ordner verschwindet aus dem Datei-Explorer; aus → wieder da.
- [ ] PNG **und** PDF aus der Toolbar mit aktiver Anprobe (`serif`, ungespeichert) → Export sieht serif aus (Toolbar-Export ehrt die Anprobe).
- [ ] Command-Palette „Export to PDF" ohne offenes Preview → nutzt das Frontmatter-/Default-Theme.

- [ ] **Step 4: Branch-Abschluss** — siehe `superpowers:finishing-a-development-branch` (Merge nach `main` / PR). Vor Merge: `.superpowers/sdd/progress.md` + Cockpit aktualisieren.

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- Goal 1 (Falle geheilt, Quell-Label) → Task 12 (frontmatterTheme), 17 (sourceLabel). ✓
- Goal 2 (Live-Switch ephemer) → Task 17 (ephemeralTheme, rerenderTheme). ✓
- Goal 3 (Commit via processFrontMatter) → Task 10, 17 (commitTheme). ✓
- Goal 4 (benannte User-Themes) → Task 9 (scan), 11 (ThemeStore), 5 (userThemeEntry). ✓
- Goal 5 (Import/Export + Hide) → Task 9 (write/reveal), 15 (UI), 4/16 (hide). ✓
- Goal 6 (1:1-Key, Referenzliste) → Task 3 (keyFromFilename), 15 (chips). ✓
- Goal 7 (Pure-Core) → Tasks 1–4/6 in `src/core/**`; Gates in Task 7/20. ✓
- Goal 8 (Render-Pipeline unverändert) → Task 7 (nur Theme-Quelle wandert; fit/Geometrie unberührt). ✓
- §6 Datenfluss (effectiveDeck, source-Unterscheidung) → Task 17 (`renderCurrent` baut effectiveDeck; persisted via frontmatterTheme). ✓
- §7 Fehler (unlesbar skip, Kollision, kein File → Setzen disabled, Ordner fehlt) → Task 9 (skip/exists), 2 (Kollision), 17 (`setBtn.toggle(... && currentFile)`). ✓
- §9 Tests (theme-key, folder-hide, presets, constraints, deck-css, bundle-smoke) → Tasks 1–6, 8. ✓

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Step zeigt vollständigen Code. ✓
**Typ-Konsistenz:** `ThemeEntry`/`ThemeRegistry`/`resolveTheme`/`listThemes`/`mergeThemes` (Task 1/2) konsistent in deck-css (5), engine (6), render-dom (7), theme-registry (11), export (13). `buildIsolatedDeck(..., registry, customCss)` einheitlich in 7/13/17. `themeOverride` als letzter Param in export (13) und Aufruf in 17. `frontmatterTheme` (12) → `persistedTheme` (17). ✓

**Offene Plan-Punkte (bewusst, mit Default):**
- Reveal-in-Finder: Electron-`shell.openPath` + `FileSystemAdapter`-Guard + Notice-Fallback (Task 9). Falls in der Ziel-Obsidian-Version `app.showInFolder` stabil ist, darf der Implementierer das vorziehen.
- `renderCurrent` Re-Load von `resolveEmbed`: optionaler Cache-Vorschlag dokumentiert (Task 17 Hinweis) — Korrektheit ohne Cache gegeben.
