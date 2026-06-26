# CSS-Layouting — Design Spec

- **Status:** Draft (zur User-Review)
- **Datum:** 2026-06-26
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `feat/css-layouting`
- **Baut auf:** MVP (auf `main`, Merge `455391f`) · [`2026-06-25-markdown-presentation-design.md`](2026-06-25-markdown-presentation-design.md)
- **Spec-Review:** adversarisch gegen den Code geprüft (15 bestätigte Funde eingearbeitet, siehe Anhang A)

---

## 1. Zusammenfassung

Das MVP rendert jede Folie mit **einem** hartkodierten `default`-CSS-Preset. Diese Iteration führt drei verzahnte Fähigkeiten als **ein** kohärentes Feature ein:

1. **Mehrere Themes** — wählbar via `theme:` im Deck-Frontmatter (existiert bereits als `DeckDirectives.theme`), voller visueller Stack (Folien-CSS + Code-Highlighting + Mermaid-Theme).
2. **Per-Folie-Layout-Direktiven** — `<!-- layout: X -->` (Marp-Stil), mit Regionen-Trenner `<!-- column -->` für mehrteilige Layouts.
3. **Echtes Preset-System** — ein **Design-Token-Modell** (CSS-Variablen) mit geteilter Struktur/Layout-CSS und kompakten Pro-Theme-Token-Blöcken, plus ein Custom-CSS-Snippet in den Settings.

Leitidee: Die fit-kritischen und geometrischen Invarianten leben an **genau einer** Stelle (geteiltes Struktur-CSS), die ein Theme oder Custom-CSS **strukturell nicht** brechen kann — Themes setzen nur Tokens. Das hält die `fit-or-warn`-Garantie und die feste Bühne unangetastet, während der Look frei variiert.

> Phase-2 (LLM-gestütztes Authoring) bleibt wie im MVP-Spec (§1 dort) bewusst geparkt; diese Iteration hält nur den Authoring-Contract dafür offen (§9).

## 2. Goals

1. Deck-Theme via `theme:` aus 4 eingebauten Presets wählen: `default` (hell) · `dark` · `serif` · `high-contrast`.
2. Per-Folie-Layouts: `title` · `two-column` · `image-focus` · `section` · `quote` (plus impliziter `default`-Single-Flow).
3. Custom-CSS-Snippet (Settings), global ans gewählte Theme angehängt.
4. Voller visueller Stack pro Theme: Folien-CSS, Code-Highlight-Stylesheet (hljs), Mermaid-Theme.
5. Theme- und Layout-Auswahl bleiben **total** (unbekannte/ungültige Werte → Fallback `default` + Warnung, **nie still scheitern**).
6. Pure-Core-Naht bleibt erhalten: alles Parsen/Preset-Auflösen/CSS-Assemblieren ist obsidian-/DOM-frei und Node-testbar.
7. `fit-or-warn`, feste Geometrie (1280×720 / 960×720) und der Lesbarkeits-Boden bleiben unverändert garantiert.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Keine** externen Theme-Dateien aus dem Vault — Custom-CSS-Snippet deckt Branding/Tweaks ab; volle Datei-Themes sind ein sauberer Folge-Schritt (der Seam bleibt offen).
- ❌ **Keine** Per-Folie-Theme-Überschreibung — Theme ist deck-weit; nur das Layout ist per Folie.
- ❌ **Kein** WYSIWYG-Layout-Editor — Autoring bleibt Markdown + HTML-Kommentar-Direktiven.
- ❌ **Keine** Per-Region-Fit-Skalierung — ein gemeinsamer Scale pro Folie (siehe §7.4).
- ❌ **Keine** Kontrast-Validierung von Themes/Custom-CSS (das `high-contrast`-Theme ist ein *visuell* kontraststarkes Preset, keine geprüfte WCAG-Garantie — Custom-CSS darf Tokens überschreiben, §7.2).
- ❌ **Keine** neuen Animationen/Übergänge — weiterhin Export-Tool, kein Live-Show-Tool.

## 4. Design-Entscheidungen (aus dem Brainstorming)

| Frage | Entscheidung | Begründung |
|---|---|---|
| Scope | Alle drei Fähigkeiten in **einem** Spec | Kohärent; Token-Modell trägt alle drei. |
| Layout-Syntax | HTML-Kommentar-Direktiven (`<!-- layout: X -->`, `<!-- column -->`) | Marp-Konvention (nächster Verwandter); in Obsidians eigener Vorschau unsichtbar; keine Kollision mit `---` (fence-aware, §11.12); einfachster Parser. |
| Theme-Quelle | Eingebaut + Custom-CSS-Snippet | Tweak-Wert hoch, `presetFor` bleibt total, externe Dateien später. |
| Theme-Umfang | Voller Stack (Folien-CSS + hljs + Mermaid) | Helles Theme mit dunklem Code/Diagrammen sieht kaputt aus. |
| Layout-Set | `title`, `two-column`, `image-focus`, `section`, `quote` | Voller Bedarf laut User. |
| Theme-Set | `default`, `dark`, `serif`, `high-contrast` | Voller Bedarf laut User; `high-contrast` als kontraststarkes Preset. |
| CSS-Modell | Design-Tokens (CSS-Variablen) + geteilte Struktur/Layouts | Minimale Duplikation; fit-kritische Regeln theme-unantastbar. |

**Während des Spec-Reviews getroffene Defaults** (konsistent mit bestehendem Code; vom User im Review abnehmbar):
- Direktive darf **irgendwo** in der Folie stehen; **die erste `layout`-Direktive gewinnt**, weitere → Warnung (§8).
- Direktiven-Grammatik ist **tolerant** (Whitespace/Case), Wert wird klein­geschrieben (§5.1).
- Ein direktiv-ähnlicher, aber unparsebarer Kommentar → **Warnung** statt stiller Durchreichung (§8).
- Slide-Splitter **und** `parseDirectives` sind **fence-aware**; der bestehende `---`-in-Fence-Bug wird **jetzt** mitgefixt (§11.12).
- Layout-/Regionen-Warnungen verankern an `slide.startLine` (kein Per-Direktiven-Offset in dieser Iteration, §14).

## 5. Autoren-Modell (was der Nutzer schreibt)

**Deck-Theme** — Frontmatter (existiert):

```markdown
---
theme: dark
aspect: "16:9"
minFontPx: 24
---
```

**Per-Folie-Layout** — HTML-Kommentar (empfohlen als erste Zeile der Folie); **Regionen-Trenner** `<!-- column -->`:

```markdown
# Vorherige Folie

---

<!-- layout: two-column -->

## Links
- Punkt A
- Punkt B

<!-- column -->

## Rechts
![[diagramm.png]]

---

<!-- layout: title -->

# Haupttitel
## Untertitel
```

- Der **Slide-Trenner** bleibt die getrimmte `---`-Zeile. Die Direktive ist ein Kommentar *innerhalb* der Folie — kein neuer Trenner.
- Fehlt `<!-- layout -->`, gilt `default` (heutiges Single-Flow-Verhalten).

### 5.1 Direktiven-Grammatik (präzise)

`parseDirectives` (§6) erkennt Direktiven **tolerant**:

- **Layout:** `/<!--\s*layout\s*:\s*([A-Za-z-]+)\s*-->/` — Whitespace optional (`<!--layout:two-column-->` zählt), Keyword `layout` case-insensitive, der **Wert wird kleingeschrieben** (`Two-Column` → `two-column`).
- **Spalte:** `/<!--\s*column\s*-->/` — Keyword case-insensitive.
- **Eingabe-Vorbedingung:** `parseDeck` normalisiert CRLF→LF (slide-model.ts:25) **bevor** es `parseDirectives` ruft. `parseDirectives` setzt LF-normalisierte Eingabe voraus (im Doc-Kommentar festgehalten; Unit-Tests dürfen die Normalisierung nicht annehmen → eigener CRLF-Test).
- **Position:** Direktiven dürfen an beliebiger Stelle der Folie stehen. **Die erste `layout`-Direktive gewinnt**; jede weitere `layout`-Direktive erzeugt eine Warnung (§8).
- **Fence-Schutz:** Direktiven **innerhalb** eines Code-Fences (```` ``` ```` / `~~~`) oder eingerückten Code-Blocks sind **literaler Inhalt** — sie werden weder erkannt noch entfernt (§11.12). Das ist nötig, weil dieses Feature Autoren geradezu einlädt, die Direktiv-Syntax in Code-Blöcken zu *dokumentieren*.

### 5.2 Kommentar-Entfernung (semantik-erhaltend)

- **Nur erkannte** Direktiv-Kommentare (`layout`/`column`) werden aus dem Markdown entfernt — **inklusive ihrer umgebenden Leerzeile(n)/Zeilenumbrüche**, damit eine zuvor *tight* Liste nicht *loose* wird und Setext-Überschriften nicht brechen (markdown-it läuft mit `html:true`, also sind Whitespace-Semantiken scharf).
- Andere HTML-Kommentare (`<!-- … -->`) bleiben unverändert (bestehendes md2html-Verhalten).
- Ein Kommentar, der **wie** eine `layout`/`column`-Direktive aussieht, aber die Grammatik **nicht** erfüllt (Tippfehler im Wert, fehlender Doppelpunkt, falsches Keyword wie `layuot`), → **Folien-Warnung** „Direktive nicht erkannt: …" + Entfernung (kein stilles Durchreichen). Erfüllt Goal 5.

**Custom-CSS** — Textarea in den Plugin-Settings, global an alle Decks angehängt (überschreibt Tokens; Hinweis im Settings-UI: `.sd-slide{ --sd-token:… }` adressieren).

## 6. Datenmodell (Pure-Core)

```ts
// core/slide-model.ts — Slide bekommt zwei Felder (reale Reihenfolge: speakerNotes? vor startLine)
interface Slide {
  index: number;
  markdown: string;        // bereinigtes Folien-Markdown OHNE erkannte Direktiv-Kommentare (Join aller Regionen)
  speakerNotes?: string;
  startLine: number;
  layout: string;          // "default" | "title" | "two-column" | "image-focus" | "section" | "quote"
  regions: string[];       // Markdown je Region (Split an <!-- column -->); Länge 1 wenn kein Trenner
}

// core/presets/index.ts — neuer Typ + Registry
interface Preset {
  id: string;              // "default" | "dark" | "serif" | "high-contrast"
  label: string;           // Anzeigename fürs Settings-Dropdown
  baseFontPx: number;      // EINE Quelle für das --sd-base-Token UND den minScale-Divisor
  tokens: Record<string, string>;  // --sd-bg, --sd-fg, --sd-accent, --sd-font, --sd-heading-font, --sd-code-bg, …
  hljs: string;            // Key in die hljs-Theme-Map (z.B. "github", "github-dark")
  mermaid: "default" | "dark" | "neutral" | "forest";
}

const PRESETS: Record<string, Preset> = { default, dark, serif, "high-contrast": highContrast };
function presetFor(id: string): Preset;   // TOTAL — Fallback auf PRESETS.default, wirft nie

// core/presets/layouts.css.ts — Layout-Metadaten
interface LayoutSpec { id: string; regions: number; }   // erwartete Regionenzahl je Layout
// default/title/section/quote/image-focus = 1, two-column = 2
function layoutFor(id: string): LayoutSpec;  // TOTAL — Fallback auf default
```

**Parser-Helfer** (Pure-Core, neu `core/directives.ts`):

```ts
interface DirectiveResult {
  layout: string;          // erste erkannte Layout-Direktive, kleingeschrieben, sonst "default"
  regions: string[];       // an <!-- column --> gesplittete, bereinigte Region-Strings (fence-aware)
  warnings: DirectiveWarning[];  // unbekannt/mehrfach/malformed — von parseDeck in die Warning-Pipeline gehoben
}
function parseDirectives(slideMarkdown: string): DirectiveResult;
```

**Reihenfolge in `parseDeck` (load-bearing):**

1. Split in Folien-Blöcke **fence-aware** (`---` innerhalb eines Fences trennt nicht, §11.12).
2. Die **Leere-Folie-Unterdrückung läuft auf dem ROH-Block** (vor `parseDirectives`), wie heute (`md.trim().length > 0`). Eine Folie, die **nur** aus Direktiven besteht (z.B. `<!-- layout: section -->`), ist roh nicht leer → **bleibt erhalten**; sie rendert als leere-aber-gestylte `.sd-slide` mit ihrem Layout (z.B. Abschnitts-Trenner). `regions` ist dann `[""]`. Die Unterdrückung darf **nicht** auf die bereinigte Form verschoben werden.
3. Pro erhaltener Folie `parseDirectives` aufrufen → `layout`, `regions`, `warnings` füllen; `markdown` = Join der bereinigten Regionen.

Alles rein/synchron, kein DOM, kein I/O.

## 7. CSS-Komposition & Rendering

### 7.1 Token-Scoping (kritisch für Preview **und** Export)

Tokens werden als **`.sd-slide{ … }`-Regel im Deck-CSS-String** emittiert — **nicht** inline am Element und **nicht** auf `:root`:

- Nicht `:root`, sonst leakt das Theme in die ganze Obsidian-App (Preview).
- Nicht inline, weil im Export jede Folie als **einzelnes serialisiertes `.sd-slide`-outerHTML** in `slidesHtml` neben ein `<style>` re-injiziert wird; die Klassen-Regel `.sd-slide{…}` matcht dort erneut und versorgt das serialisierte Element mit Tokens. Nur die **Geometrie** (`--sd-w`/`--sd-h`) bleibt per-Folie **inline** (per-aspect, nicht per-theme).

```css
/* presetTokensCss(preset) — generiert */
.sd-slide{ --sd-bg:#1a1b26; --sd-fg:#c0caf5; --sd-accent:#7aa2f7;
           --sd-font:Inter, sans-serif; --sd-code-bg:#1a1b26; --sd-base:28px; /* = baseFontPx */ … }
```

### 7.2 Assembly-Reihenfolge

```ts
// deck-css.ts — neue Signatur
deckCss(presetId: string, customCss?: string): string =
  assembleDeckCss([
    katexCss,                    // unverändert
    hljsThemeCss(preset.hljs),   // NEU: hljs-Stylesheet je Theme (statt fix github-dark); besitzt die Code-TEXTFARBEN
    structuralCss,               // NEU: EINMAL — Fixbox, .sd-content:100%, Callouts, Embeds, pre.hljs-Layout; nutzt var(--sd-*)
    layoutCss,                   // NEU: EINMAL — .sd-layout-{title,two-column,image-focus,section,quote}, .sd-region
    presetTokensCss(preset),     // ".sd-slide{ --sd-bg:…; --sd-base:<baseFontPx>px; … }"
    customCss ?? "",             // ZULETZT → kann Tokens überschreiben
  ]);
```

- `structuralCss` und `layoutCss` sind **theme-unabhängig** und referenzieren nur `var(--sd-token, fallback)`. Die fit-kritischen Regeln (`.sd-slide{overflow:hidden;…}`, `.sd-content{width/height:100%}`) leben hier — un-überschreibbar durch Themes.
- **`structuralCss` deklariert `--sd-base` NICHT.** Die **einzige** `--sd-base`-Deklaration ist `presetTokensCss` (= `baseFontPx`px). (Heute steht `--sd-base:28px` im `.sd-slide`-Block von `default.css.ts:2` — beim Refactor muss das Token **dort raus** und in den Token-Block, sonst widerspricht ein stehengebliebenes Literal der Single-Source-Invariante §11.4.)
- **Code-Block-Farben:** Die heutige `.sd-slide pre.hljs`-Regel mischt Struktur **und** harten dunklen `background:#0d1117; color:#e6edf3` (`default.css.ts:11`). Beim Refactor:
  - Struktur-Props (`font-size`, `padding`, `border-radius`, `overflow:hidden`) → `structuralCss`.
  - **`color` entfällt** dort — die **Code-Textfarben besitzt allein das per-Theme hljs-Stylesheet** (`hljsThemeCss`). Würde der dunkle `color`/`background` im `structuralCss` stehen bleiben, hätte er höhere Spezifität (`.sd-slide pre.hljs` = (0,2,1)) als das helle hljs-Sheet (`.hljs` = (0,1,0)) und ein helles Theme bekäme dunkle Codeblöcke (genau der Bruch, den §4 verhindern will).
  - Der `pre`-Wrapper-`background` wird **tokenisiert**: `background:var(--sd-code-bg)`; `--sd-code-bg` je Theme gesetzt (hell → hell, dark → dunkel passend zu github-dark).

### 7.3 Layout-Klasse, Regionen-Rendering & Warning-Aggregation (`render-dom.ts`)

```
<div class="sd-slide sd-layout-two-column" style="--sd-w:1280px; --sd-h:720px">
  <div class="sd-content" style="transform-origin:top left; transform:scale(N)">
    <div class="sd-region"> …renderMarkdown(region[0])… </div>
    <div class="sd-region"> …renderMarkdown(region[1])… </div>
  </div>
</div>
```

- Outer-Div bekommt zusätzlich `sd-layout-${slide.layout}` (neben `sd-slide`, analog zu `sd-slide-warn`).
- `.sd-content` enthält **exakt ein `.sd-region`-Div pro geparster Region** — **kein Clampen/Mergen**. Bei einer Region (Standard) genau ein `.sd-region` (optisch unverändert zum MVP). Bei Über-/Unterzahl ordnet CSS-Grid deterministisch an (überzählige Regionen fließen in implizite Grid-Zeilen) — plus Warnung (§8).
- **Preset-Threading:** `renderDeckToContainer` löst `const preset = presetFor(deck.directives.theme)` auf und nutzt `preset.baseFontPx` (§7.4) und `preset.mermaid` (§7.5). `render-dom.ts` **importiert dafür `presetFor` aus `core/presets`** (erlaubter Adapter→Core-Import; §12).
- **Warning-Aggregation (load-bearing):** Bei mehreren Regionen liefert `renderMarkdown` **N `RenderedSlide`-Objekte** mit je eigenen `.warnings` (z.B. Missing-Embed pro Region). Vor `collectWarnings` werden die `.html`-Werte in die `.sd-region`-Divs gehängt und die **`.warnings`-Arrays flach zusammengeführt**. `collectWarnings` wird entweder auf ein gemergtes Warning-Array erweitert oder in `render-dom` wird vor dem Aufruf gemergt. Alle gemergten Region-Warnungen verankern an **`slide.startLine`** (genau wie engine.ts heute, da Regionen keine eigene Zeilenverfolgung haben). So geht keine Region-Warnung still verloren (Goal 5).

### 7.4 Fit & `--sd-base`-Fix

- Fit misst weiter **eine** `.sd-content`-Box (gegen `inner.clientWidth/clientHeight` nach Padding) → **ein** gemeinsamer Scale. Grid-Regionen tragen zur `scrollWidth/Height` bei; die Invariante „content füllt die gepaddete Box" bleibt. **Keine** Per-Region-Skalierung.
- `minScale = deck.directives.minFontPx / preset.baseFontPx` (statt Literal `28` in render-dom.ts:32). `baseFontPx` (aus dem aufgelösten Preset) speist **sowohl** das `--sd-base`-Token als auch den Lesbarkeits-Floor — die `--sd-base`↔`28`-Duplikation ist aufgelöst.

### 7.5 hljs + Mermaid (voller Stack)

- `hljsThemeCss(name)`: kleine Map gebündelter hljs-Stylesheets (mind. ein heller + ein dunkler), Theme wählt das passende. `default`/`serif`/`high-contrast` → hell (z.B. `github`), `dark` → `github-dark`. Diese Sheets **besitzen die Code-Textfarben** (§7.2).
- `render-dom.ts` ruft `mermaid.initialize({theme: preset.mermaid})` **vor** `renderMermaidSlots` (statt fixem `default` auf Modulebene). Der bestehende html2canvas-SVG-Fidelity-Vorbehalt bleibt unverändert (AGENTS.md §Gotchas).

## 8. Validierung & Fehlerbehandlung (fit-or-warn-Maschine)

Alles über `constraints/engine.ts` (`collectWarnings` → `Warning{slideIndex,kind,message,sourceLine?}`), Pure-Core. Warnungen aus `parseDirectives` werden von `parseDeck` in dieselbe Pipeline gehoben.

| Fall | Verhalten |
|---|---|
| Unbekanntes **Theme** (`theme: foo`) | `presetFor` → Fallback `default`, **Deck-Warnung**. |
| Unbekanntes **Layout** (`<!-- layout: foo -->`) | `layoutFor` → Fallback `default`, **Folien-Warnung** (`sourceLine = slide.startLine`). |
| **Malformed** Direktiv-Kommentar (Tippfehler/fehlender Doppelpunkt) | **Folien-Warnung** „Direktive nicht erkannt: …"; Kommentar wird entfernt (kein Leak). |
| **Mehrere `<!-- layout -->`** in einer Folie | erste gewinnt; **Folien-Warnung** „Mehrere Layout-Direktiven, erste verwendet". |
| **Regionenzahl ≠ Layout-Erwartung** (generisch: `layoutFor(layout).regions !== regions.length`) | **Folien-Warnung** „Layout `<id>` erwartet N Region(en), M gefunden" (deckt auch `<!-- column -->` in 1-Region-Layouts wie `title` ab). Folie wird **trotzdem** gerendert: exakt M `.sd-region`-Divs, kein Clampen/Mergen (§7.3); CSS-Grid platziert Überzählige in implizite Zeilen. |
| Overflow / Lesbarkeits-Floor (bestehend) | unverändert: Warnung `kind="overflow"` + roter Streifen (Preview). Der Floor-Unterschreitungs-Fall bleibt `kind="overflow"`; `belowFloor`/`low-contrast` aus `WarningKind` bleiben **reserviert/unbenutzt** (kein zweiter Floor-Kind einführen). |

Prinzip wie im MVP: **nie still scheitern, nie beschneiden** — warnen und rendern.

## 9. Settings & i18n

- `settings.ts`: `defaultTheme` wird von Freitext zu **Dropdown** über `Object.keys(PRESETS)` mit `preset.label`. **Migration:** ein persistierter, unbekannter `defaultTheme` wird beim Laden auf `default` koerziert (presetFor-Semantik), damit `DEFAULT_SETTINGS` gültig bleibt. Neu: `customCss` (Textarea + Hinweis). `minFontPx`/`imageScale` bleiben.
- `i18n.ts`: neue UI-Strings (Dropdown-Label, Custom-CSS-Label + Hinweis, neue Warnungs-Texte) — EN kanonisch + DE.
- **Authoring-Contract** (`contract.ts`): `AuthoringContract` bekommt `layouts`/`themes`-Felder, `contractToPrompt` listet sie auf; `contract.ts` importiert dafür die `PRESETS`/Layout-Registries (neue, weiterhin **core-reine** intra-core-Abhängigkeit). **Bewusst spec-only Metadaten** — es gibt in dieser Iteration **keinen Runtime-Consumer** (Phase-2-Tor); Absicherung nur per Unit-Test (§13).

## 10. Verdrahtung der Consumer

Beide CSS-Injektionspfade müssen **identisches** CSS tragen (Invariante §11.5). Die neue `deckCss(presetId, customCss?)`-Signatur betrifft **drei** Call-Sites, alle müssen `customCss` mitgeben:

- `preview-view.ts` — persistentes `<style>` = `deckCss(presetId, customCss)`; `presetId` aus Deck-Frontmatter, Fallback Settings-`defaultTheme`.
- `render-dom.ts` **Staging-`<style>`** (heute Zeile 70) — `deckCss(presetId, customCss)`.
- `render-dom.ts` **zurückgegebenes `css`** (heute Zeile 78) — `deckCss(presetId, customCss)`; geht weiter an PDF (`printRootCss`) und PNG (html2canvas-Holder) in `export.ts`.

Würde eine dieser Stellen `customCss` vergessen, würde die **Fit-Messung** (Staging) anders gestylt als der Export — Invariante gebrochen. `customCss` muss also vom Adapter (Settings) bis in `buildSelfContainedDeckHtml` durchgereicht werden.

## 11. Respektierte Invarianten

1. **Core-Purität** — `parseDeck`, `parseDirectives`, `presetFor`, `layoutFor`, `deckCss`, `assembleDeckCss` rein/synchron, kein DOM/I/O; `src/core/**` obsidian-frei (`check-core-purity.mjs`). Neue intra-core-Importe (`contract.ts`→presets, `render-dom` ist Adapter und darf core importieren) verletzen das nicht.
2. **`presetFor`/`layoutFor` total** — nie werfen; **syntaktische** Nicht-Erkennung einer Direktive führt **trotzdem** zu einer Warnung (§5.2/§8), nicht zu stiller Degradation.
3. **Fit gegen gepaddete `.sd-content`** — `.sd-content` füllt weiter die gepaddete Box; Grid-Layouts ändern das nicht.
4. **`--sd-base`↔Floor-Kopplung aufgelöst** — `baseFontPx` als **einzige** Quelle: `structuralCss` deklariert `--sd-base` nicht; `presetTokensCss` emittiert es; `render-dom` leitet `minScale` davon ab.
5. **deckCss in Preview UND Export-Staging identisch** — gemeinsame Funktion, **alle drei** Call-Sites (§10) tragen `customCss`; Staging-`<style>` bleibt Geschwister des Render-Hosts.
6. **Klassennamen-Vertrag** — `.sd-slide`/`.sd-content`/`.sd-mermaid`/`.sd-embed`/`.sd-callout*` werden restyled, **nicht** umbenannt; neu: `.sd-region`, `.sd-layout-*`.
7. **Self-contained Export-CSS** — Layout ist reine Klassen-CSS im Preset-String; Tokens via `.sd-slide{…}`-Selektor im injizierten `<style>` (nicht inline, nicht App-Styles).
8. **Feste Geometrie, eine Quelle** — `geometryFor(aspect)` unverändert; Layouts arbeiten **innerhalb** der Box, kein Upscaling.
9. **fit-or-warn-Semantik testgepinnt** — `needed>=1→{1,false}`, `needed>=minScale→{needed,false}`, `needed<minScale→{minScale,true}`; Floor-Bruch bleibt `kind="overflow"`.
10. **Mermaid-ID-Eindeutigkeit + Slot/Hydration** — `mermaidSeq`-Counter unverändert; `initialize` mit Theme läuft vor der Fit-Messung.
11. **Em-relative Fonts** — Headings/Code bleiben em-relativ zu `--sd-base`; keine px-Schriftgrößen.
12. **Fence-Awareness (NEU)** — Der Slide-Splitter **und** `parseDirectives` verfolgen ```` ``` ````/`~~~`-Fences (und eingerückte Code-Blocks): `---`, `<!-- column -->` und `<!-- layout: -->` **innerhalb** eines Fences sind literaler Inhalt, nie Trenner/Direktive. **Der bestehende `---`-in-Fence-Split-Bug** (slide-model.ts:37, fence-blind — ein bloßes `---` in einem YAML-Code-Block spaltet die Folie heute mitten im Fence) wird **in dieser Iteration mitgefixt** (slide-model.ts ist ohnehin geänderte Datei). Ein geteilter Fence-Scanner für Splitter und `parseDirectives`.

## 12. Datei-Landkarte

**Neu:**
- `src/core/directives.ts` — `parseDirectives()` (Layout-Extraktion + Regionen-Split + Kommentar-Entfernung, **fence-aware**, tolerante Grammatik, Warnungen)
- `src/core/presets/index.ts` — `Preset`-Typ, `PRESETS`-Registry, `presetFor()`
- `src/core/presets/default.ts`, `dark.ts`, `serif.ts`, `high-contrast.ts` — je ein `Preset` (Token-Block + `baseFontPx` + hljs/mermaid-Wahl)
- `src/core/presets/structure.css.ts` — geteiltes Struktur-CSS (Fixbox, `.sd-content`, Callouts, Embeds, `pre.hljs`-Layout **ohne** Code-Farbe; referenziert Tokens; **kein** `--sd-base`)
- `src/core/presets/layouts.css.ts` — geteiltes Layout-CSS (`.sd-layout-*`, `.sd-region`) + `layoutFor()`/`LayoutSpec`
- `src/core/presets/hljs-themes.ts` — Map `name → hljs-CSS-String`, `hljsThemeCss()`

**Geändert:**
- `src/core/slide-model.ts` — `Slide.layout` + `Slide.regions`; **fence-aware** Splitter (fixt `---`-in-Fence); ruft `parseDirectives` **nach** der Roh-Leere-Prüfung
- `src/core/constraints/engine.ts` — Warnungen: unbekanntes Layout, malformed, mehrere Layouts, generische Regionenzahl; Region-Warning-Merge-Eingang
- `src/core/constraints/contract.ts` — `AuthoringContract` um `layouts`/`themes`; `contractToPrompt` erweitert; importiert PRESETS/Layout-Registry
- `src/deck-css.ts` — `deckCss(presetId, customCss?)`, neue Assembly (hljsThemeCss + structuralCss + layoutCss + presetTokensCss + customCss)
- `src/render-dom.ts` — `sd-layout-*`-Klasse, Regionen-Rendering + Warning-Merge, **`presetFor`-Import** für `baseFontPx`/Mermaid, `minScale` via `baseFontPx`, beide internen `deckCss`-Calls mit `customCss`
- `src/preview-view.ts`, `src/export.ts` — neue `deckCss`-Signatur + `customCss` durchreichen
- `src/settings.ts` — Theme-Dropdown + `customCss`-Textarea + Migration unbekannter `defaultTheme`
- `src/i18n.ts` — neue Strings (EN/DE)
- `styles.css` — Settings-Chrome (Textarea) falls nötig
- `scripts/bundle-smoke-entry.ts` — erweitert um `deckCss`/`presetFor`/`layoutFor`/`parseDeck`+`parseDirectives` (siehe §13)
- `scripts/bundle-smoke.mjs` — esbuild-`build`-Optionen um `loader: { '.css': 'text' }` (deck-css.ts importiert `.css` per Text-Loader; sonst bricht der Smoke-Build an den CSS-Imports)
- `tests/core/constraints.test.ts` — Contract-Assertion (Layouts/Themes erscheinen)
- `AGENTS.md` — Doku (Preset-System, Layout-Direktiven, neue Dateien)

## 13. Teststrategie

**Pure-Core-Unit (vitest):**
- `directives.ts`:
  - `<!-- layout -->`-Extraktion + `<!-- column -->`-Split; Wert wird kleingeschrieben; tolerante Grammatik (`<!--layout:two-column-->`, `<!-- LAYOUT: … -->`).
  - Kommentar-Entfernung **loosent keine tight Liste** / bricht keine Setext-Überschrift.
  - **Fence-Schutz:** `<!-- column -->` / `<!-- layout: -->` in einem Code-Fence bleibt verbatim erhalten, eine Region, Layout = `default`.
  - **Malformed** Direktive (`<!-- layuot: title -->`, fehlender Doppelpunkt) → Warnung, kein Leak.
  - **Mehrere** `<!-- layout -->` → erste gewinnt + Warnung.
  - CRLF-Eingabe in `parseDirectives` (standalone) behandelt.
- `slide-model.ts`:
  - **`---` in einem YAML/Code-Fence spaltet NICHT** (Regressions-Test für den gefixten Bug).
  - Folie nur aus `<!-- layout: section -->` → **erhalten**, `layout=section`, `regions=[""]`.
- `presetFor`/`layoutFor`: Totalität + Fallback auf `default`.
- `deck-css.ts`: Assembly-Reihenfolge (custom zuletzt); Token-Block auf `.sd-slide`; **`--sd-base` erscheint genau einmal** und entspricht `baseFontPx`.
- `engine.ts`: unbekanntes Theme/Layout, malformed, mehrere Layouts und **generischer** Regionenzahl-Mismatch (inkl. `<!-- column -->` in `title`) erzeugen die erwarteten Warnungen; Region-Warnungen verankern an `startLine`.
- `constraints.test.ts`: `getAuthoringContract`/`contractToPrompt` führen Layouts + Themes.

**Core-Purity-Gate:** neue `core/`-Dateien obsidian-/DOM-frei (`check-core-purity.mjs`).

**Bundle-Smoke (`bundle-smoke.mjs`, in `npm test`):** exerziert den **in Node lauffähigen Pure-Pfad** durch den echten Bundle — `parseDeck`+`parseDirectives`, `deckCss`/`assembleDeckCss`-Assembly für **jedes Theme** (inkl. Custom-CSS-Reihenfolge), `presetFor`/`layoutFor`-Totalität — plus ESM/CJS-Interop (die Fehlerklasse, die beim MVP zuschlug). **Nicht** `renderDeckToContainer` (DOM-abhängig: `createDiv`, `scrollWidth`, `transform`, `mermaid.render` — läuft nicht in bare Node ohne DOM-Shim). Der Smoke-Build muss `loader: { '.css': 'text' }` setzen (§12).

**Manueller Smoke (deferred an User):** Deploy nach Pallas; Demo-Notiz um die **5 Layouts × 4 Themes × Custom-CSS** erweitern; Preview/PDF/PNG sichten — die volle DOM-/Fit-/Overflow-/Mermaid-Theme-/Regionen-Matrix lebt hier (nicht im Node-Smoke).

**Gate:** `npm run lint && npm run build && npm test` grün.

## 14. Offene/aufgeschobene Punkte

- Externe Theme-Dateien aus dem Vault (Folge-Iteration; Seam offen).
- Per-Folie-Theme-Override (bewusst out of scope).
- **Per-Direktiven-`sourceLine`**: Layout-/Regionen-Warnungen verankern in dieser Iteration an `slide.startLine` (nicht an der exakten Direktiven-Zeile). Präzises Plumbing (parseDirectives liefert Offset, engine addiert startLine) ist eine spätere Verfeinerung.
- `belowFloor`/`low-contrast` `WarningKind`s bleiben reserviert/unbenutzt (kein Kontrast-Check in dieser Iteration).
- Weitere hljs-Stylesheets / feineres Mermaid-Theming pro Preset (nur 1 hell + 1 dunkel zum Start, Bundle-Größe).

## Anhang A — Spec-Review (adversarisch, gegen Code verifiziert)

3 Review-Lenses (technischer Fakten-Check · Konsistenz/Vollständigkeit · Authoring-Edge-Cases), 27 Funde erhoben, 15 nach adversarischer Code-Verifikation bestätigt und oben eingearbeitet. Schwerpunkte: Direktiven-Grammatik/Position/Mehrfach/Fence-Awareness (§5/§11.12), leere-Folie-Ordering (§6), Preset-Threading in `render-dom` für `baseFontPx`+Mermaid (§7.3/§7.4), Warning-Aggregation über Regionen (§7.3), generische Regionenzahl-Prüfung (§8), `--sd-base` Single-Source-Mechanismus (§7.2/§11.4), hartkodierte Code-Block-Farbe tokenisieren (§7.2), `deckCss`-Call-Sites + Custom-CSS (§10), realistische Bundle-Smoke-Grenzen (§13), Contract als spec-only Metadaten (§9).
