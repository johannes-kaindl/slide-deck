# Pro-Output: Layout-Komposition + Theming-Fundament — Design Spec

- **Status:** Draft (design) — pending User-Review
- **Datum:** 2026-06-28
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `main` (Spec) → `feat/pro-slide-output` (Implementierung, anzulegen)
- **Baut auf:** Theme-Handling-UX (`main`, Merge `222cc7a`) · CSS-Layouting (`main`, Merge `db56a71`) · Mobile-Export-Fidelity (`main`, `7703111`)
- **Grounding:** Parallel-Analyse von `design/` (Design-System „Order from Traces") vs. den exportierten Demo-Slides in `Slide-Deck-Export/` + Code-Scan des aktuellen Override-Surfaces. Anhang A.

---

## 1. Zusammenfassung

Die vom Plugin erzeugten Slides erreichen noch nicht die Qualität der Design-System-Referenz. Die Ursachenanalyse (Anhang A) zeigt: **der größte Qualitätsverlust ist theme-unabhängig** und liegt **nicht** an fehlenden CSS-Override-Optionen.

Drei geerdete Befunde steuern dieses Design:

1. **Dead-Space ist der #1-Gap (theme-unabhängig).** Eine Folie mit wenig Inhalt klebt oben und lässt 60–80 % der 16:9-Fläche leer; Zwei-Spalten-Layouts hinterlassen ein „ragged hole". Das betrifft **jedes** Theme und schlägt jeden Farb-/Gradient-Tweak. → **Phase A: Smart-Komposition.**

2. **Der Override-Surface ist bereits großzügig — aber das Profi-Markup fehlt im Fundament.** Ein User-`.css`-Theme wird verbatim injiziert und kann jeden emittierten Selektor (`h2::before`, `hr`, `blockquote`, Callouts, `.hljs-*`) und sogar `background-image`-Verläufe setzen. Drei konkrete Dinge sind aber im Fundament hart/fehlend verdrahtet: **Callouts sind hart hell**, das **hljs/Mermaid-Schema ist auf hell festgenagelt**, und die **Profi-Editorial-Polish (Eyebrow, Akzent-Linie, 3px-Leiste)** existiert nur, wenn jedes Theme sie einzeln nachbaut. → **Phase B: Fundament + neutrale Profi-Familie.**

3. **Keine `.sd-card` nötig.** Die DS-Referenz nutzt **kein** Content-Card-Element (die „Karte" im Vorschaubild war die Galerie-Rahmung). Der Profi-Look entsteht durch **links-bündige editorial Komposition + dezente Atmosphäre**, nicht durch neues Wrapper-Markup. Das Plugin emittiert bereits fast genau das nötige Markup (`.sd-slide > .sd-content > .sd-region` + Markdown + `.sd-callout`).

> **Produktthese (Norden):** „Nur Inhalt rein → professionellste Slides raus." Der Autor soll sich **null** Gedanken über Optik machen. Daraus folgt: Polish gehört ins **Fundament** (für alle Themes), nicht in Knöpfe.

Diese Iteration berührt `src/core/**` (neue pure Module: Auto-Layout-Inferenz, Theme-Meta-Parser, `CHARACTER_CSS`) **und** die Adapter-Schicht (render-dom Kompositions-Pass, deck-css-Assembly). Purity- + Realm-Gates bleiben grün.

## 2. Goals

1. **Komposition:** Unterfüllte Folien werden vertikal komponiert statt oben anzukleben; alleinstehende Blockquote/Heading bekommen automatisch ein passendes Treatment. Akzeptanz: das Demo-Deck zeigt auf *jedem* Theme keine Folie mehr mit großem leerem Unterraum bei dünnem Inhalt.
2. **Smart-Auto + Override:** Die Komposition geschieht automatisch ohne Autoren-Eingriff; bestehende `<!-- layout: … -->`-Direktiven überschreiben weiterhin. Bestehende Decks dürfen sich verbessern, brechen aber nicht.
3. **Callouts kontextrichtig:** Callouts leiten ihre Farben aus Tokens ab (nicht hart hell); Dark-Themes zeigen Dark-Callouts ohne Übermalen. Akzeptanz: ein Dark-Theme rendert Callouts dunkel ohne `.sd-callout`-Overrides im Theme-CSS.
4. **hljs + Mermaid pro Theme wählbar:** Ein Theme deklariert sein Code- und Mermaid-Schema. Akzeptanz: **Mermaid auf einem Dark-Theme rendert dunkel** (heute hell — offener Cockpit-Punkt); Code bleibt auf Dark lesbar.
5. **Neutrale Profi-Familie als Default:** Die 4 Built-ins (`default`/`dark`/`serif`/`high-contrast`) werden **in-place** auf Profi-Qualität gehoben (Keys stabil → keine Frontmatter-Brüche). Akzeptanz: `theme: default` rendert editorial (Eyebrow, Akzent-Linie, Typo-Hierarchie), nicht „ungestylter zentrierter Text".
6. **Export-Treue:** Atmosphäre-CSS (Verläufe/Grain/Vignette) der Profi-Themes übersteht PNG (`modern-screenshot`) **und** PDF. Akzeptanz: ein atmosphärisches Theme exportiert sichtbar identisch zur Preview (oder die nicht-tragenden Effekte sind dokumentiert preview-only).
7. **Invarianten gewahrt:** Pure-Core-Naht, Realm-Safety, Fixed-Geometry/Fit-Messung intakt; Gates grün; 84+ vitest grün.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Kein `.sd-card`/Panel-Primitiv** — die DS-Referenz nutzt keins; das vorhandene Markup genügt.
- ❌ **Keine User-Knöpfe** (4-Farben-Hex in Settings/Frontmatter, Gradient-UI) — das ist **Spec C** (Komfort-Schicht), baut auf diesem Fundament auf.
- ❌ **Kein LLM markdown→deck** — **Spec D** (Phase 2, `../vault-rag`-Seed), eigener Zyklus.
- ❌ **Keine** der 8 aspirationalen DS-Slide-Templates (Metric/Agenda/Closing/Threads/…) — Backlog.
- ❌ **Kein** Auto-Rebalancing von Inhalten *über* Spalten hinweg (Items zwischen Spalten verschieben) — der Spalten-Split bleibt autorengesteuert (`<!-- column -->`); wir heilen nur die vertikale Komposition + gemeinsame Oberkante.
- ❌ **Kein** Verbatim-Port von „Order from Traces" als Default — die persönliche Identität bleibt deine ladbare User-Referenz (Entscheidung: de-personalisierte neutrale Familie).
- ❌ **Keine** neuen Theme-Keys/Deprecation — In-place-Upgrade der bestehenden 4.

## 4. Entschiedene Richtungsfragen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Scope erstes Spec | **A + B-Kern zusammen** | A ist Voraussetzung dafür, dass die Profi-Themes überhaupt gut aussehen. |
| Identität der Default-Themes | **De-personalisierte Profi-Familie** | OSS-Community-Plugin; DS bleibt private Referenz/User-Theme. |
| Komposition | **Smart-Auto + Override** | Produktthese „nur Inhalt rein"; Direktiven bleiben Eskalations-Ausweg. |
| Bestehende Themes | **In-place auf Profi-Qualität heben** (Keys stabil) | Jedes bestehende Deck wird automatisch besser; keine Brüche. |
| Eyebrow | **`h2::before`-Konvention, token-gesteuert** — kein neues Markup | DS macht es genau so; hält B schlank. |
| hljs/Mermaid-Wahl | **Header-Direktive im `.css`**, von Core geparst (analog `parseBaseFontPx`) | Außerhalb des Cascades, trivial zu parsen, kein neuer Token-Slot. |
| Editorial-Polish | **Geteilte `CHARACTER_CSS`** (theme-unabhängig, token-getrieben) | Polish im Fundament → alle Themes (inkl. User) erben ihn; Built-ins werden primär Token-Sets (setzt Spec C sauber auf). |

## 5. Gap-Modell (geerdet)

```
PROFI-REFERENZ (design/)                      AKTUELLER OUTPUT (Slide-Deck-Export/)
─────────────────────────────                 ───────────────────────────────────────
editorial, links-bündig, vertikal komponiert  sparse Folien kleben oben (60–80% leer)   → A
Eyebrow ◉ (mono, accent, getrackt)            nur in kuro/shiro (h2-hijack); default: 0  → B3/CHARACTER
Akzent-Linie (gradient <hr>)                  unstyled <hr>                              → B3/CHARACTER
3px Akzent-Leiste (callout/code/quote)        nur in DS-Themes                           → B3/CHARACTER
Callouts kontextfarbig (Signal-Map)           hart hell (#f4f6f8) im STRUCTURE_CSS       → B1
Code lesbar auf Dark (hljs-Remap)             hljs auf hell festgenagelt                 → B2
Mermaid dem Theme angepasst                   Mermaid erbt 'default' (hell)              → B2
dezente Atmosphäre (Veil/Grain/Vignette)      flach (oder im Export ungetestet)          → B3/B4
```

## 6. Architektur — wo jede Änderung landet

```
CSS-Assembly (deck-css.ts → deckCss)         CASCADE-Reihenfolge (später gewinnt):
  katex · hljs · STRUCTURE · LAYOUTS ·          katex
  [+ CHARACTER] · themeCss · customCss          → hljs                (B2: pro Theme wählbar)
                                                → STRUCTURE_CSS       (B1: Callout-Tokens + Fallbacks)
                                                → LAYOUTS_CSS
                                                → CHARACTER_CSS  ★NEU (B3: Eyebrow/Rule/Leiste, token-getrieben)
                                                → themeCss            (Built-ins: Tokens; User: verbatim)
                                                → customCss

Render-Pipeline (render-dom.ts)              Pure-Core (src/core/**)
  Pass 1  build DOM                            slide-model · directives  → auto-layout-inferenz ★NEU (A1)
  Pass 2  measure + computeFit (scale↓)        theme-key                 → parseThemeMeta ★NEU (B2)
  Pass 3  COMPOSE ★NEU (A2: vertikal zentr.)   presets/character.css.ts  → CHARACTER_CSS ★NEU (B3)
                                               presets/structure.css.ts  → Callout-Tokens (B1)
```

**Naht-Disziplin:** Klassifikation/Inferenz (A1), Meta-Parsing (B2), `CHARACTER_CSS`/Token-Defaults (B1/B3) sind **pure Core** (Node-testbar, kein DOM/obsidian). Nur der **Mess-abhängige** Kompositions-Schritt (A2) lebt in `render-dom.ts` (Adapter) und bleibt realm-sicher (native DOM).

## 7. Phase A — Smart-Komposition

### A1 · Auto-Layout-Inferenz (Core, pure)
Wenn eine Folie **keine** explizite `<!-- layout: … -->`-Direktive trägt, leitet der Core ein Layout aus der **Inhaltsform** ab und nutzt damit das **bestehende** Layout-System (kein neues CSS):

| Inhaltsform der Folie | Inferiertes Layout | Effekt (bestehendes CSS) |
|---|---|---|
| genau eine `blockquote`, sonst nichts Substanzielles | `quote` | zentriert, italic, `max-width:80%` |
| genau eine Überschrift (h1–h6), sonst nichts | `section` | zentriert, größer |
| alles andere | `default` | normaler Fluss (→ A2 entscheidet vertikal) |

- Implementiert als pure Funktion `inferLayout(slide): string | undefined` (gibt `undefined` zurück, wenn eine explizite Direktive vorliegt → diese gewinnt).
- Eingebunden dort, wo `slide.layout` gesetzt wird (slide-model/directives), **vor** render-dom. Explizite Direktive > Inferenz > `default`.
- Klassifikation gegen die geparsten Regionen/Markdown-Struktur, **nicht** gegen DOM → voll unit-testbar.

### A2 · Vertikale Komposition (Adapter, render-dom Pass 3, mess-abhängig)
Nach der Messung (Pass 2 unverändert) entscheidet ein **Kompositions-Pass** pro `default`-Layout-Folie über die vertikale Platzierung:

```
fillRatio = (contentHeight * fit.scale) / clientHeight
if (!fit.overflow && fillRatio < COMPOSE_CENTER_THRESHOLD)   // sparse
    box.classList.add("sd-compose-center")                   // → justify-content:center
```

- `sd-compose-center` (in `CHARACTER_CSS` oder `LAYOUTS_CSS`) setzt auf `.sd-content` `display:flex; flex-direction:column; justify-content:center` — **dasselbe erprobte Muster** wie `title/section/quote` (koexistiert nachweislich mit der `scrollHeight`-Messung).
- **Kein Re-Measure nötig:** Zentrieren ändert die Inhaltshöhe nicht → `fit.scale` bleibt gültig. Toggle nach der Messung ist sicher.
- Greift auch auf **unterfüllte `two-column`**-Folien (reduziert das ragged hole), ohne Items umzuschichten.
- `COMPOSE_CENTER_THRESHOLD` = Konstante (Start ~`0.7`), dokumentiert + test-fixierbar.
- **Dichte Folien (fillRatio ≥ Schwelle) bleiben oben-bündig** — konsistente Eye-Line, kein „Floaten" beim Durchblättern.

### A3 · Spalten-Disziplin
- `two-column` behält `align-content:start` (gemeinsame Oberkante) — der bestehende ragged-hole-Fall wird durch A2 (vertikale Zentrierung der unterfüllten Spalten-Content-Box) entschärft.
- Echtes Mass-Rebalancing über Spalten = **Non-Goal** (Anhang: Backlog).

## 8. Phase B1 — Callouts & semantische Tokens entkoppeln

`STRUCTURE_CSS` verdrahtet Callouts hart hell (`background:#f4f6f8; color:#16181d; border-left-color:#…`). Ersetzt durch **Token-mit-Fallback** (Fallback = heutiger Wert → **verhaltensneutral** für Themes, die nichts setzen):

```css
.sd-callout{ background:var(--sd-surface,#f4f6f8); color:var(--sd-callout-fg,#16181d);
             border-left-color:var(--sd-callout-note,#3b6db5); }
.sd-callout-danger{ border-left-color:var(--sd-callout-danger,#b5443b); }
/* … note/info/tip/warning analog … */
```

Neue **semantische Tokens** (optional; nur die Profi-Themes setzen sie):
- `--sd-surface` (Panel/Callout-Grund), `--sd-muted` (Sekundärtext), `--sd-border` (Hairline)
- `--sd-callout-{note,info,tip,warning,danger}` (Signal-Farben)

`STRUCTURE_CSS` referenziert weiterhin **nur** `var(--sd-*)` → Pure-Core-Invariante bleibt. Resultat: ein Dark-Theme braucht **keine** `.sd-callout`-Overrides mehr.

## 9. Phase B2 — hljs + Mermaid pro Theme

**Heute:** `userThemeEntry` (deck-css.ts) hardcodet das Default-`hljs` (`HLJS["github"]`) und Default-`mermaid`. Die `HLJS`-Map enthält bereits `github` **und** `github-dark`; `MermaidTheme` kennt `default|dark|neutral|forest`.

**Neu:** Theme deklariert sein Schema per **Header-Direktive** im `.css`, geparst durch eine pure `parseThemeMeta(css)` (analog `parseBaseFontPx`):

```css
/* sd-hljs: github-dark */
/* sd-mermaid: dark */
.sd-slide{ --sd-bg:#100e0c; /* … */ }
```

- `parseThemeMeta(css) → { hljs?: string; mermaid?: MermaidTheme }` (Core, regex, tolerant; unbekannte Werte ignoriert).
- `userThemeEntry` nutzt das Ergebnis: `HLJS[meta.hljs] ?? default`, `meta.mermaid ?? default`.
- Built-in-Presets setzen `hljs`/`mermaid` weiterhin direkt über `Preset` (Phase B3 wählt pro Theme das passende).
- **Fix:** Mermaid auf Dark-Themes rendert dunkel; Code bleibt lesbar. (Bei Bedarf später weitere hljs-Schemata in die `HLJS`-Map — nicht zwingend für dieses Spec.)

## 10. Phase B3 — `CHARACTER_CSS` + neutrale Profi-Familie

### `CHARACTER_CSS` (neues pures Modul, theme-unabhängig, token-getrieben)
Die wiederkehrende Editorial-Polish wandert aus „jedes Theme baut sie selbst" in eine **geteilte Schicht** zwischen `LAYOUTS_CSS` und `themeCss`:

- **Eyebrow:** `h2` mono/uppercase/accent + `::before: var(--sd-eyebrow-glyph,"◉ ")`, Tracking `var(--sd-eyebrow-tracking,0.2em)`.
- **Akzent-Linie:** `hr` als Gradient-Sweep (`linear-gradient(to right,var(--sd-accent),transparent)`), Breite token-bar.
- **3px-Leiste:** `blockquote`/`pre.hljs`/`.sd-callout` `border-left:var(--sd-rule-width,3px) solid var(--sd-accent)`.
- **Marker/Links:** `li::marker{color:var(--sd-accent)}`, Link-Underline mit Offset.
- **Display-H1:** Serif-italic-Hook über Token (`--sd-h1-style`, default `normal`; Profi-Themes setzen `italic`).

**Opt-out via Token:** `high-contrast` setzt z.B. `--sd-eyebrow-glyph:none`, `--sd-h1-style:normal` → minimal/utilitaristisch.

**Cascade-Sicherheit:** `CHARACTER_CSS` steht **vor** `themeCss` → bestehende User-Themes (kuro/shiro), die `h2`/`hr` selbst definieren, **überschreiben** den Default-Charakter → kein Look-Bruch. Built-in-Presets (nur Tokens) **erben** ihn.

### In-place-Upgrade der 4 Built-ins (`Preset`-Objekte)
Jeder Preset wird primär ein **Token-Set** (4 Kern-Farben + neue semantische Tokens + Charakter-Tokens + optionale Atmosphäre via `--sd-bg`-Hintergrund-Stack) + `hljs`/`mermaid`-Wahl:

| Key | Neue Identität (neutral) | hljs / mermaid | Atmosphäre |
|---|---|---|---|
| `default` | helle, ruhige Editorial-Familie (Serif-Display, Sans-Body, Mono-Eyebrow) | github / default | dezenter Veil (optional) |
| `dark` | dunkles Pendant, akzent-neutral | github-dark / dark | Veil + optional Vignette |
| `serif` | print/„document"-Register, Serif durchgängig | github / neutral | keine |
| `high-contrast` | a11y, maximale Lesbarkeit, **Deko aus** | github / default | keine |

- Optional **1 neues neutrales Akzent-Theme** (z.B. ein kühles), wenn Phase B3 Luft hat.
- Fonts: **System-Stacks benennen** (Privacy-Default, kein Request); data-URI-`@font-face` als dokumentierter Offline-Goldstandard (kein Google Fonts) — wie im THEMING-GUIDE festgelegt.

## 11. Phase B4 — Export-Treue der Atmosphäre

- Verifizieren, dass `CHARACTER_CSS` + Atmosphäre-Stack (CSS-`radial`/`linear-gradient`, `box-shadow` inset/Vignette, feTurbulence-SVG-Grain als data-URI, ggf. base64-Hintergrund) in **PNG** (`modern-screenshot domToCanvas`, foreignObject) **und** **PDF** (`contentWindow.print()` / Mobile-HTML) erhalten bleiben.
- Smoke-Matrix: je 1 helles + 1 dunkles Profi-Theme × {Preview, PNG, PDF} × {Desktop, iOS}.
- **Degradation dokumentieren:** Übersteht ein Effekt das Rastern nicht, wird er entweder durch eine export-taugliche Alternative ersetzt **oder** explizit als preview-only markiert (`print-color-adjust: exact` ist bereits gesetzt).

## 12. Daten-/Render-Fluss (Delta)

```
parseDeck → slides[]                                   (unverändert)
  └─ A1: inferLayout(slide) füllt slide.layout, falls keine Direktive   ★
deckCss(entry, customCss):                             (deck-css.ts)
  assembleDeckCss([katex, entry.hljs★, STRUCTURE★, LAYOUTS, CHARACTER★, entry.themeCss, customCss])
buildIsolatedDeck → renderDeckToContainer:             (render-dom.ts)
  Pass 1 build · Pass 2 measure+computeFit
  └─ Pass 3: A2-Komposition (sd-compose-center für sparse default/two-column)   ★
ThemeStore.refresh → userThemeEntry(key, css):         (theme-registry/deck-css)
  └─ B2: parseThemeMeta(css) → hljs/mermaid statt Default-Erbung   ★
```

## 13. Fehlerbehandlung & Invarianten

- **Pure-Core (PROF-OBS-03):** `inferLayout`, `parseThemeMeta`, `CHARACTER_CSS`, Callout-Tokens sind in `src/core/**`, referenzieren kein `obsidian`/DOM. `check-core-purity.mjs` bleibt grün.
- **Realm-Safety:** Pass 3 nutzt nur native DOM (`classList.add`) auf bereits erzeugten Knoten → `check-render-realm.mjs` bleibt grün.
- **Fit-Invariante:** Pass 2 (Messung gegen `inner.client/scrollHeight`, `computeFit`, `transform:scale`) bleibt **unverändert**; A2 toggelt nur Ausrichtung nach der Messung (kein Re-Measure, keine Höhenänderung).
- **Fit-or-warn bleibt:** Overflow-Folien werden weiterhin gewarnt + bei `minScale` gefloort; A2 greift nur im **Nicht-Overflow**-Fall. Die Philosophie wird zu „fit-or-warn-or-**fill**" erweitert, nicht ersetzt.
- **Rückwärtskompatibilität:** Token-Fallbacks (B1) + Cascade-Ordnung (B3) garantieren, dass bestehende Decks/User-Themes sich höchstens verbessern, nicht brechen. Frontmatter-Keys stabil (B3).

## 14. Testing

- **Unit (vitest, node):** `inferLayout` (Inhaltsform → Layout, inkl. „explizite Direktive gewinnt"); `parseThemeMeta` (Direktiven-Parsing, tolerant gegen Müll/unbekannte Werte); Callout-Token-Fallback (Snapshot von `STRUCTURE_CSS`/`deckCss`); `deckCss`-Assembly enthält `CHARACTER_CSS` an korrekter Cascade-Position.
- **Bundle-Smoke (`bundle-smoke.mjs`):** `deckCss` für jedes Built-in rendert ohne Fehler (every-theme deckCss-Smoke bleibt).
- **Komposition (A2):** kann nicht rein unit-getestet werden (DOM-Messung) → **manueller Pallas-Smoke**: Demo-Deck mit (a) sparse Single-Line-Folie, (b) dichter Folie, (c) unbalancierter Zwei-Spalten-Folie über alle Profi-Themes; PNG/PDF/Preview vergleichen.
- **Export (B4):** Smoke-Matrix aus §11.
- **Gate:** `npm run lint && npm run build && npm test` grün; `npx tsc --noEmit` separat.

## 15. Offene Punkte / Risiken

- **`COMPOSE_CENTER_THRESHOLD`-Tuning** (0.7?) — per Smoke kalibrieren; eventuell pro Layout differenzieren.
- **feTurbulence-SVG-Grain im Export** — Risiko, dass foreignObject-Rasterung das SVG-data-URI-Grain nicht zieht (B4 verifiziert; Fallback: preview-only).
- **`CHARACTER_CSS` zu meinungsstark?** — Mitigation: alles token-gated (`--sd-eyebrow-glyph:none` etc.), `high-contrast` als Beweis, dass Opt-out sauber geht.
- **Scope-Größe:** A + B1–B4 ist umfangreich → der Implementierungsplan sequenziert in Checkpoints (A → B1+B2 → B3 → B4), jeder mit grünem Gate + Smoke, damit Teil-Merges möglich sind.

---

## Anhang A — Grounding (Analyse-Befunde)

**Quelle:** Parallel-Analyse (4 Agenten) über `design/_ds/order-from-traces-design-system-…/`, `design/themes/{kuro,shiro,kurenai,kairo,sumi}.css`, die Exporte in `Slide-Deck-Export/`, sowie Code-Scan. Verifiziert gegen `src/core/presets/{structure.css,layouts.css,index}.ts`, `src/core/theme-key.ts`, `src/render-dom.ts`, `src/deck-css.ts`, `src/theme-registry.ts`.

**„4-Farben"-Hypothese:** *Partiell bestätigt.* Der Theme-Vertrag ist faktisch 4 Farben (`--sd-bg/-accent/-fg/-code-bg`) + identische Fonts/Base über alle 5 DS-Themes. Der **Profi-Look** entsteht aber in einer optionalen „Charakter"-Schicht (Eyebrow, Signal-Callouts, hljs-Remap, Atmosphäre), die strukturell divergiert — **nicht** nur per Farbe. → Rechtfertigt `CHARACTER_CSS` im Fundament (B3) und den späteren 4-Farben-Knopf (Spec C).

**Visueller Gap (gerankt):** (1) Dead-Space/Single-Line-Folien top-anchored — auf *jedem* Theme. (2) Unbalancierte Spalten. (3) Tier-Sprung: `default/dark/serif/high-contrast` wirken ungestylt neben den DS-Themes. (4) Callouts nicht kontext-reskinnt (helle Karten auf Dark). (5) Inkonsistente/teils kontraproduktive Hintergründe. (6) Flache Hierarchie auf den Baseline-Themes (kein Eyebrow/Akzent).

**Override-Surface (Code):** User-`.css` wird verbatim als `entry.themeCss` injiziert (Cascade-Teil 5/6) → kann jeden Selektor + `background-image`-Verläufe setzen (Gradients **heute schon** möglich, nur undokumentiert/ungetestet im Export). Strukturell **fehlt**: Eyebrow-Element (h2-Hijack), Card (kein Bedarf), Callout-Tokenisierung, hljs/Mermaid-Wahl.

**DS-HTML-Skelett:** `.sd-slide` (+ `.top`-Variante) umschließt **plain** Markdown + `.sd-callout`. Eyebrow = `h2::before`. Akzent-Linie = `<hr>`. Keine Card, kein Footer/Slide-Number, keine Spalten-Container im Markup. → Bestätigt: kein neues Wrapper-Markup nötig.

**Datei-Referenzen:** Profi-DS-Themes `design/themes/*.css` · DS-Core `design/_ds/order-from-traces-design-system-5e542fc9-…/{styles.css,readme.md,_ds_manifest.json}` · Exporte `…/10_Pallas/Slide-Deck-Export/`.

## Anhang B — Folge-Specs (außerhalb dieses Scopes)

- **Spec C — User-Parametrisierung:** 4-Farben-Hex (+ semantische Tokens) in Settings/Frontmatter; gesegnete/dokumentierte Gradient-Rezepte mit Export-Garantie. Baut auf dem Token-Fundament (B1/B3) auf.
- **Spec D — LLM markdown→deck:** beliebige Markdown-Datei → Slide-Deck-kompatible Präsentation via lokale LLM-Modelle; Code-Seed aus `../vault-rag`. Eigener brainstorm→spec-Zyklus.
- **Backlog:** 8 aspirationale DS-Slide-Templates · Auto-Spalten-Rebalancing · dedizierte Eyebrow-Markdown-Affordanz · weitere hljs-Schemata.
