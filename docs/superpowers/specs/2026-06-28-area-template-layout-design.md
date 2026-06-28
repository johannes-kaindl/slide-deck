# Area-/Template-Layout-Modell — Design Spec

- **Status:** Draft (design) — User-approved (Brainstorm 2026-06-28), pending Plan
- **Datum:** 2026-06-28
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `feat/area-template-layout` (Spec + Implementierung)
- **Baut auf:** Pro-Output Foundation (`main`, Merge `8912bc8`) — `inferLayout`, `compose-center`, Callout-Tokens B1, `parseThemeMeta`/per-Theme hljs+Mermaid B2
- **Grounding:** Richtungsnotiz `docs/area-model-direction.md` · Code-/Invarianten-/MARP-Referenz-Analyse (Anhang A, B) · visueller Brainstorm (Anatomie + Katalog im Companion bestätigt)
- **Ersetzt:** den `CHARACTER_CSS`/Plan-2-Ansatz (Politur war die falsche Schicht — die Ursache ist **strukturell**). Politur wird, wenn überhaupt, eine spätere Schicht *innerhalb* der Templates.

---

## 1. Zusammenfassung

Der GUI-Smoke der Pro-Output-Foundation bestätigte: Slides wirken **strukturell unprofessionell**. Ursache: Aller Inhalt liegt in *einem* `.sd-content`-Block, der als Ganzes skaliert wird; es gibt **keine benannten Bereiche**. Konkretes Symptom: ein Block-Bild oder Mermaid-Diagramm **fließt links im Textfluss** statt zentriert die Folienbreite zu nutzen.

Dieses Spec baut das flache Layout-Modell (`LAYOUTS` = nur Region-*Anzahl*, alles flex/grid auf *einem* `.sd-content`) zu einem **Area-/Template-Modell** aus, nach dem bewährten Muster der eigenen MARP-Themes (Anhang B): pro Folie ein **benanntes Template**, jedes Template eine echte Grid/Flex-Komposition, **Titel spannt volle Breite**, **Medien zentriert + bodybreit (`object-fit:contain`)**, **header/footer/pagination als schwebende Eck-Slots**.

**Architektur-Entscheidung: Hybrid (C).** Templates sind markdown-nativ (Styling nach Element-Rolle), wie bei MARP. `render-dom` macht **nur die DOM-Eingriffe, die reines CSS nicht leisten kann**: (1) Spanning-Titel-Hoist in Mehrspaltern, (2) cover-image-Hintergrund-Layer, (3) Slot-Elemente. **Ein** `transform: scale()` auf `.sd-content` bleibt — kein per-Bereich-Scale (Fit-Invariante unangetastet).

Berührt `src/core/**` (pure: Direktiven-/Modifier-Parsing, Inferenz, neue CSS-String-Module) **und** die Adapter-Schicht (`render-dom.ts`: Hoist, cover-Layer, Slots). Purity-, Realm-, Fit-Gates bleiben grün.

## 2. Goals

1. **Benannte Bereiche statt einem Block.** Titel / Body / Media sind als Bereiche modelliert; jedes Template ordnet sie definiert an. Akzeptanz: ein Block-Diagramm rendert **zentriert + bodybreit + contain**, nicht links-inline.
2. **Voller Template-Katalog (11) + Modifier.** `default · title · section · quote · image-focus · two-column · columns-3 · stat · cover-image` + kombinierbare Modifier `compact · code-heavy`. Akzeptanz: jedes Template rendert seine charakteristische Komposition im Smoke-Deck.
3. **Titel spannt in Mehrspaltern.** In `two-column`/`columns-3` spannt die Überschrift über alle Spalten (MARP-Muster), die Spalten teilen sich den Raum darunter. Akzeptanz: ein zweispaltiges Deck mit `# Titel` zeigt den Titel über beide Spalten.
4. **Schwebende Slots.** `header:`/`footer:`/`paginate:` aus dem Frontmatter rendern als absolut positionierte Eck-Slots (z-index über Content, außerhalb des Fit-Scale). Akzeptanz: `paginate: true` zeigt `n / N` unten rechts auf jeder Folie.
5. **Kombinierbare Modifier.** `<!-- layout: two-column compact -->` ist gültig; `compact`/`code-heavy` wirken auf jedes Template. Akzeptanz: ein `two-column compact`-Slide ist dichter als `two-column`.
6. **Maßvolle Inferenz, kein Bruch.** Ohne Direktive: lone heading→`section`, nur-Blockquote→`quote`, einzelner Media-Block→`image-focus`, `<!-- column -->`-Zahl→`two-column`/`columns-3`, sonst `default`. Explizite `<!-- layout: X -->` gewinnt weiter. Akzeptanz: bestehende Decks rendern gleich oder besser, nie schlechter.
7. **Invarianten gewahrt.** Pure-Core, Realm-Safety, Fixed-Geometry/Fit-Messung, theme-unantastbares Struktur-CSS — alle Gates grün; bestehende vitest grün + neue pure-Tests.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Eyebrow** — editorial Politur, nicht strukturell; H3-vor-Titel zu implizit. Token `--sd-eyebrow-glyph` bleibt für später reserviert.
- ❌ **Per-Folie-Slot-Override** (`<!-- header: … -->` pro Folie) — Slots sind v1 deck-weit via Frontmatter.
- ❌ **Asymmetrischer Split** (60/40) — späterer Knopf/Token an `two-column`, kein eigenes Template.
- ❌ **Per-Bereich-Fit** (Richtungsnotiz Schritt 4) — überflüssig: Media nutzt `object-fit:contain` (fittet seinen Bereich ohne eigenen Scale), Body behält den bestehenden Single-Scale. Macht den Umbau der Fit-Messung unnötig.
- ❌ **Auto-Rebalancing über Spalten** — Spalten-Split bleibt autorengesteuert (`<!-- column -->`).
- ❌ **MARP-`_class`-Alias**, **Timeline/Prozess** (=Mermaid), **Incremental Reveal** (statischer Export), **Speaker Notes** (Feature, kein Layout).
- ❌ **Neue Theme-Keys / Deprecation** — bestehende Theme-Keys stabil.
- ❌ **Color/Mode-Modifier** (`invert`/`no-glow`) — Farbe ist Sache des Theme-Systems.

## 4. Entschiedene Richtungsfragen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Scope | **Voller MARP-Ausbau** (11 Templates + Slots + Modifier) | User-Wahl im Brainstorm; kohärentes Bündel um *ein* Bereichsmodell. |
| Architektur | **Hybrid (C)**: semantische Templates + minimale render-dom-Eingriffe | MARP-treu; behält Single-Scale + Fit-Invariante; löst Media exakt. |
| Media-Füllung/-Balance | **Media-Zelle füllt per `flex:1` + `width/height:100%`+`object-fit:contain`** (`.sd-has-media`); `compose-center` nur für text-only sparse Folien | smoke-korrigiert: Prozent-`max-height` resolved nicht; flex-Zelle liefert Füllen + decode-timing-unabhängig. |
| `compact`/`code-heavy` | **Kombinierbare Modifier** (`<!-- layout: <tpl> [mod…] -->`) | MARP-treu; kein Nachrüsten später; generalisiert auf künftige Modifier. |
| Spanning-Titel | **Leading-Heading-Hoist** in Mehrspaltern (render-dom), rückwärtskompatibel | nur Hoist wenn `region[0]` mit h1/h2 startet → bestehende 2-Spalter brechen nicht. |
| Slots | **Frontmatter `header:`/`footer:`/`paginate:`**, deck-weit, MARP-kompatibel | trivial zu parsen; ein Slot-Primitiv für alle drei; teuerste Nachrüst-Stelle wird einmal richtig gebaut. |
| Eyebrow | **raus** | Politur, nicht Struktur. |

## 5. Bereichsmodell & DOM-Struktur

### 5.1 Bereiche (Rollen)

| Bereich | Quelle | Verhalten |
|---|---|---|
| **title** | erste `# `/`## ` einer Folie | spannt volle Breite; in Mehrspaltern via Hoist + `grid-column:1/-1`. |
| **body** | Text, Listen, Callouts, Code | semantischer Fluss (wie heute, in `.sd-region`). |
| **media** | Block-`![[…]]`/Block-`![](…)`/`.sd-mermaid` | zentriert, bodybreit, `object-fit:contain`; bleibt in Dokumentreihenfolge (kein Umsortieren). |
| **header/footer/pagination** | Frontmatter `header:`/`footer:`/`paginate:` | absolut positionierte Eck-Slots, außerhalb `.sd-content`. |
| **cover-media + scrim** | erstes Bild-Embed (nur `cover-image`) | Vollflächen-Hintergrund (`object-fit:cover`) + Verlaufs-Scrim, hinter dem Content. |

### 5.2 DOM-Struktur (Ziel)

```
.sd-slide.sd-layout-<layout>[.sd-mod-compact][.sd-mod-code-heavy]
  ├── .sd-cover-media        (nur cover-image; <img>, position:absolute, object-fit:cover, z-index:0)
  ├── .sd-cover-scrim        (nur cover-image; Verlaufs-Overlay, z-index:1)
  ├── .sd-slide-header       (optional; absolut, z-index:4)
  ├── .sd-content            (Grid/Flex-Container; trägt transform:scale(); z-index:3)
  │     ├── .sd-region.sd-region-title   (nur Mehrspalter-Hoist; grid-column:1/-1)
  │     └── .sd-region(+)                 (Body/Spalten; innerHTML = gerendertes Markdown)
  ├── .sd-slide-footer       (optional; absolut, z-index:4)
  └── .sd-slide-pagination   (optional; absolut, z-index:4)
```

**z-index-Modell** (MARP-analog): cover-media 0 · scrim 1 · content 3 · slots 4. Bei `cover-image` liegt der Titel (content z-index 3) über dem Bild (0). Slots liegen in den 64px-Rändern, werden **nicht** vom Fit-Scale erfasst (Geschwister von `.sd-content`, nicht Kind) und verfälschen die Body-Messung nicht.

### 5.3 Media-Verhalten (der eigentliche Fix — Punkt zum genau-Prüfen)

- **Media füllt + zentriert (Media-Zellen-Modell, smoke-korrigiert):** Bei einer einspaltigen Folie mit Block-Media (Block-`![[…]]`/`![](…)` als einziges Kind seines `<p>`, oder `.sd-mermaid`) markiert `render-dom` `.sd-content` mit `.sd-has-media`. Dann wird der Body zur Flex-Spalte, und die **Media-Zelle** (`<p>` bzw. `.sd-mermaid`) wächst per `flex:1` in den **verbleibenden** vertikalen Raum; das Media-Element nutzt `width:100%; height:100%; object-fit:contain` gegen diese **definite** Zelle → füllt + zentriert zuverlässig, **unabhängig vom Raster-Decode-Timing** (die Folienhöhe ist flex- statt bildgrößengetrieben). Inline-Bilder *innerhalb* eines Textabsatzes bleiben inline (`.sd-embed`-Fallback: `margin-inline:auto`, kein Fill).
  - **Wichtig (Lektion aus dem Smoke):** Prozent-`max-height` (z.B. `60%`/`80%`) wurde **verworfen** — es resolved nicht durch auto-Höhe-Vorfahren (`.sd-region`, `<p>`) und auch nicht zuverlässig auf Flex-Item-Bildern. Nur eine definite Flex-Zelle + `width/height:100%`+`contain` liefert Füllen.
- **Vertikale Balance (reiner Text):** sparse Folien **ohne** Media werden als *ganzer* Inhaltsstapel vertikal zentriert über das bestehende `compose-center` (erweitert auf `default`/`two-column`/`columns-3`).
- **image-focus:** media-dominant; nutzt dasselbe `.sd-has-media`-Media-Fill (Media füllt fast die ganze Folie), Titel/Caption nur zentriert (`text-align:center`).
- **cover-image:** render-dom hebt das **erste** Bild-Embed in `.sd-cover-media` (Hintergrund, `object-fit:cover`, randlos) + `.sd-cover-scrim`. Fehlt ein Bild: `box` bekommt `.sd-cover-empty` → Titel **zentriert** (statt unten verankert), kein Scrim, soft `cover-no-image`-Warnung.
- **compose-center (sparse vertikal zentrieren) — Mess-Korrektur:** Die Entscheidung „ist die Folie sparse?" misst die **natürliche Inhaltshöhe** (vertikaler Span der `.sd-content`-Kinder via `getBoundingClientRect`), **nicht** `scrollHeight` — das ist auf einer `height:100%`-Box gleich `clientHeight` und würde immer „voll" melden (Plan-1-Bug, hier behoben). Fit nutzt weiter `scrollHeight` (Overflow-Erkennung). Media-Fill-Folien (`.sd-has-media`) melden natH≈clientH → kein Compose (richtig, Media füllt bereits).

## 6. Template-Katalog (11) + Modifier

| Template | Komposition | Selektion |
|---|---|---|
| `default` | einspaltig: Titel + Body + optional Media (in Fluss, zentriert) | Fallback + Inferenz |
| `title` | Cover: großer Titel + Untertitel, beidseitig zentriert | explizit |
| `section` | Abschnitts-Trenner: zentrierte große Überschrift | explizit + Inferenz (lone heading) |
| `quote` | zentriertes Pull-Quote (groß, kursiv) + Attribution | explizit + Inferenz (nur Blockquote) |
| `image-focus` | media-dominant, füllt + zentriert | explizit + Inferenz (einzelner Media-Block) |
| `two-column` | 2 Spalten, **Titel spannt** | explizit + Inferenz (2 Regionen) |
| `columns-3` | 3 Spalten, **Titel spannt** | explizit + Inferenz (3+ Regionen) |
| `stat` | Riesen-Kennzahl + Label + Erklärer | explizit |
| `cover-image` | Vollflächen-Hintergrundbild + Scrim + Titel darüber | explizit |
| `compact` *(Modifier)* | dichtere Typo (kleinere Schrift/Zeilenhöhe/Abstände) | Modifier |
| `code-heavy` *(Modifier)* | größere Code-Schrift (`pre.hljs`) | Modifier |

**Modifier** werden via Klassen `.sd-mod-compact` / `.sd-mod-code-heavy` auf `.sd-slide` realisiert und kombinieren mit jedem Layout. CSS-Spezifität: Modifier-Regeln folgen den Layout-Regeln in `layouts.css.ts`.

`compose-center`-Gating wird auf `columns-3` erweitert (bisher nur `default`/`two-column`); `title`/`section`/`quote`/`image-focus`/`stat`/`cover-image` zentrieren über eigenes Template-CSS und sind vom Auto-Compose ausgenommen.

## 7. Auswahl-Grammatik

### 7.1 Direktive (erweitert)

`<!-- layout: <template> [modifier …] -->` — z.B. `<!-- layout: two-column compact -->`.

- `directives.ts`: `LAYOUT_RE` erfasst mehrere space-getrennte Tokens. **Erster erkannter Struktur-Template-Name** → `layout` (`layoutExplicit=true`); erkannte Modifier (`compact`,`code-heavy`) → `modifiers: string[]`; unbekannte Tokens → `directive-malformed`-Warnung (Token verworfen, Rest gilt). Zweites `<!-- layout -->` → `layout-multiple` (wie heute).
- **Modifier-only** (`<!-- layout: compact -->`, kein Struktur-Token): `layoutExplicit=false` → Struktur wird **inferiert**, `modifiers=[compact]` greift trotzdem. So lässt sich ein Modifier auf eine Auto-Layout-Folie legen.
- `DirectiveResult` gewinnt `modifiers: string[]`. `Slide` trägt `layout` + `modifiers`. `render-dom` setzt `.sd-mod-<m>` Klassen.

### 7.2 Inferenz (`infer-layout.ts`, erweitert)

Reihenfolge (nur wenn `!layoutExplicit`):
1. genau 1 Region, nur Blockquote-Zeilen → `quote`
2. genau 1 Region, genau 1 ATX-Heading-Zeile → `section`
3. genau 1 Region, einziger Inhalt ist ein Block-Media (Bild/Mermaid) → `image-focus` *(neu)*
4. ≥2 Regionen: 2 → `two-column`, ≥3 → `columns-3` *(neu; heute multi→default)*
5. sonst → `default`

Explizit-only (nie inferiert): `title`, `stat`, `cover-image`, `compact`, `code-heavy`.

### 7.3 Spanning-Titel-Hoist (render-dom, nur Mehrspalter)

Wenn `layout ∈ {two-column, columns-3}` **und** das erste gerenderte Top-Level-Element von `region[0]` ein `h1`/`h2` ist: dieses Element in eine eigene `.sd-region.sd-region-title` (vor den Spalten, `grid-column:1/-1`) verschieben; Rest von `region[0]` bleibt erste Spalte. Startet `region[0]` nicht mit Heading → kein Hoist (bestehende 2-Spalter unverändert). Realm-sicher (native DOM: `querySelector`/`insertBefore`).

## 8. Slots (header / footer / pagination)

- **Frontmatter (deck-weit):** `header: "Text"`, `footer: "Text"`, `paginate: true`. `DeckDirectives` gewinnt `header?: string`, `footer?: string`, `paginate?: boolean` (in `slide-model.parseDeck`).
- **render-dom** emittiert pro Folie als Geschwister von `.sd-content`: `.sd-slide-header` (oben rechts), `.sd-slide-footer` (unten links), `.sd-slide-pagination` (unten rechts, Text `${index+1} / ${total}`). Nur wenn gesetzt.
- **Styling** via Tokens (Farbe/Tracking), CSS in `structure.css.ts`. Position absolut innerhalb `.sd-slide` (im 64px-Rand).

## 9. Architektur — CSS-Cascade & Datei-Impact

**Cascade (später gewinnt):** `katex · hljs · STRUCTURE_CSS · LAYOUTS_CSS · themeCss · customCss`. Alles Neue strukturelle landet in **STRUCTURE_CSS** (Slots, Media-Block, cover, Tokens-mit-Fallback) bzw. **LAYOUTS_CSS** (Template-Grids, Modifier, Titel-Spanning). Beide referenzieren **nur `var(--sd-*)`** — keine Farben hartkodiert; Themes bleiben unantastbar (nur Token-Werte).

| Datei | Änderung |
|---|---|
| `src/core/presets/layouts.css.ts` | `LAYOUTS`-Registry um neue Templates; Grid/Flex-CSS pro Template; Titel-Spanning (`grid-column:1/-1`); Modifier-CSS (`.sd-mod-*`); compose-center-Erweiterung. |
| `src/core/presets/structure.css.ts` | Media-Block-CSS (zentriert/contain), Slot-CSS, cover-media/scrim-CSS, neue Tokens-mit-Fallback. |
| `src/core/directives.ts` | Multi-Token-Parsing (layout + modifiers); `modifiers` in `DirectiveResult`. |
| `src/core/infer-layout.ts` | image-focus + columns-3/two-column-Inferenz. |
| `src/core/slide-model.ts` | `Slide.modifiers`; `DeckDirectives.header/footer/paginate`; Frontmatter-Parse; Verdrahtung `layout`/`modifiers`. |
| `src/render-dom.ts` | Modifier-Klassen, Slot-Elemente, Spanning-Titel-Hoist, cover-image-Layer; compose-center-Gating. |
| `src/core/constraints/engine.ts` | `region-count` für neue Mehrspalter; `cover-image`-no-image-Warnung; ggf. neue Modifier-Validierung. |

## 10. Token-Inventar (neu, `--sd-*`, mit Fallback = heutiges Verhalten)

| Token | Default-Fallback | Zweck |
|---|---|---|
| `--sd-slot-fg` | `var(--sd-muted, #6b7280)` | Farbe header/footer/pagination. |
| `--sd-slot-size` | `0.6em` | Schriftgröße Slots. |
| `--sd-scrim` | `linear-gradient(0deg, rgba(0,0,0,.78), rgba(0,0,0,.12) 60%, transparent)` | cover-image-Lesbarkeits-Overlay. |
| `--sd-stat-size` | `4.5em` | Schriftgröße `stat`-Kennzahl. |
| `--sd-compact-scale` | `0.82em` | Typo-Faktor für `compact` (em-Einheit erforderlich — speist `font-size`; zusätzlich kleinere h1/h2 + engere Abstände). |

Reserviert (nicht in diesem Spec): `--sd-eyebrow-glyph`, `--sd-rule-width`.

## 11. Invarianten (unangetastet)

1. **Pure-Core:** Direktiven-/Modifier-Parsing, Inferenz, alle CSS-String-Module pure (Node-testbar, kein `obsidian`/DOM). Nur Hoist/Slots/cover (messung-/DOM-abhängig) in `render-dom.ts`. Gate: `check-core-purity.mjs`.
2. **Realm-Safety:** `render-dom.ts` nur native DOM (`createElement`/`classList`/`querySelector`/`insertBefore`/`style.setProperty`/`innerHTML`). Keine Obsidian-Augmentierungen. Gate: `check-render-realm.mjs`.
3. **Fixed Geometry:** 1280×720 / 960×720, 64px Padding, `overflow:hidden`. Bereiche leben *innerhalb* des gepolsterten `.sd-content`; Slots im Rand.
4. **Fit-or-warn (Single-Scale):** Messung `.sd-content` `scrollWidth/Height` vs `clientWidth/Height` → **ein** `transform:scale()` bleibt. Grid-Reihen content-basiert (`auto`), damit Overflow in `scrollHeight` durchschlägt. Media via `object-fit:contain` (kein eigener Scale). cover-Hintergrund (`object-fit:cover`, geclippt) zählt **nicht** als Overflow. Overflow → `sd-slide-warn` + Warnung (wie heute).
5. **Theme-unantastbar:** Struktur/Layout-CSS nur `var(--sd-*)`; `--sd-base` bleibt einzig in `presetTokensCss`.

## 12. Akzeptanzkriterien (Smoke-Deck)

1. Block-Mermaid/-Bild rendert zentriert + bodybreit + contain (nicht links-inline). **[Kern-Fix]**
2. Alle 11 Templates rendern ihre Komposition; Smoke-Deck deckt jedes ab.
3. `two-column`/`columns-3` mit `# Titel`: Titel spannt; bestehender 2-Spalter ohne führenden Titel unverändert.
4. `paginate: true` → `n / N` unten rechts auf jeder Folie; `header:`/`footer:` erscheinen in den Ecken; ohne Frontmatter keine Slots.
5. `<!-- layout: two-column compact -->` rendert dichter als `two-column`.
6. cover-image: Bild randlos, Scrim, Titel lesbar darüber; ohne Bild nur Titel + soft-Warnung.
7. Inferenz: lone heading→section, nur-Blockquote→quote, einzelner Media-Block→image-focus, `<!-- column -->`-Zahl→Spaltenlayout. Bestehende Decks ≥ gleich.
8. Gates grün: `npm run lint && npm run build && npm test && npx tsc --noEmit`. Neue pure-Tests für Direktiven/Modifier/Inferenz.

## 13. Test-/Smoke-Strategie

- **Unit (vitest, node):** `directives.ts` (Multi-Token + Modifier + malformed), `infer-layout.ts` (neue Regeln), `slide-model.ts` (Frontmatter-Slots, modifiers-Verdrahtung), `engine.ts` (Warnungen). CSS-Module bleiben über `bundle-smoke.mjs` (every-theme deckCss baut) abgedeckt.
- **DOM/Visuell nicht harness-testbar** → **manueller Pallas-GUI-Smoke ist das eigentliche Akzeptanz-Gate**: Smoke-Deck (`slide-deck-tests/`) um Folien für jedes Template + Modifier + Slots + cover-image erweitern; auf `Slide-Deck-Themes/test-dark.css` prüfen.

## 14. Offene Detail-Entscheidungen für den Plan

- Genaue `max-height`-Werte/Em-Skalen pro Template (Tuning im Smoke).
- `stat`-Erkennung der Kennzahl (erste `# `-Zeile als Stat? oder reine Größe via Template-CSS — bevorzugt CSS, kein Parsing).
- Pagination-Format `n / N` vs `n` (Default `n / N`).
- Reihenfolge der TDD-Tasks (Plan).

---

## Anhang A — Aktueller Zustand (Code, verifiziert)

- DOM heute: `.sd-slide > .sd-content > .sd-region(+)`. Alle Layouts stylen *einen* `.sd-content` (flex/grid). `two-column` ist das einzige Grid (`1fr 1fr`, anonym). `LAYOUTS`-Eintrag = `{id, regions:number}` (Anzahl, keine Namen).
- Media inline in `.sd-region`-Textfluss; `.sd-embed{max-width:100%;max-height:60%;object-fit:contain}` ohne `display:block;margin:auto` → links-inline. `.sd-mermaid svg{max-height:480px}`.
- Fit: `computeFit({scrollW,scrollH},{clientW,clientH},minScale)` auf `.sd-content`; ein `transform:scale()`. `minScale = minFontPx/baseFontPx` (Default 24/base). `shouldCenterCompose` (`COMPOSE_CENTER_THRESHOLD=0.7`) zentriert sparse Folien (heute nur `default`/`two-column`).
- `directives.ts`: `<!-- layout: X -->` (ein Token), `<!-- column -->` (Region-Split). `infer-layout.ts`: multi-Region→default.

## Anhang B — MARP-Referenz (verifiziert, korrigiert die Prämisse)

Die eigenen MARP-Themes (`kuro.css`, 1757 Z.) nutzen **kein** `grid-template-areas`/`grid-area` (null Vorkommen). Bewährtes Muster: (1) eine `_class` pro Folie wählt eine Section-Variante; (2) Varianten = flex-column (Hero) **oder** Grid mit anonymen Spuren (`1fr 1fr` / `repeat(3,1fr)`) mit `grid-column:1/-1` für spannende Überschriften; (3) „Bereiche" = semantische Markdown-Rollen auf Element-Typen (H1=Titel, p=Body, blockquote=Quote, Bild=Media) — **keine Wrapper-Divs** (Marpit strippt class-Attribute, deshalb *musste* MARP markdown-nativ bleiben); (4) header/footer/pagination = absolut positionierte native Slots (z-index 4); (5) Farbe/Modus = Token-Swaps. **Unser Vorteil:** Wir kontrollieren das DOM in `render-dom.ts`, dürfen also gezielt Wrapper/Hoists/Hintergrund-Layer bauen, die MARP nicht konnte — daher Hybrid (C): MARP-Struktur-Muster + minimale DOM-Eingriffe nur, wo CSS nicht reicht.
