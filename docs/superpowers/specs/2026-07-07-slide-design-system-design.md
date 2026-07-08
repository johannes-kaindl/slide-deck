# Slide-Design-System — Typo-Skala, Spacing, Alignment, Nordstern-Built-ins

**Datum:** 2026-07-07 · **Status:** freigegeben (Design-Review mit Jay, 4 Abschnitte einzeln bestätigt)
**Branch:** `feat/slide-design-system` · **Release-Ziel:** 0.5.0 (brechend, pre-1.0)

## 1. Problem

Jays Urteil nach dem LLM-Deck-Smoke (Session 9): **„technisch ok, ästhetisch roh/unprofessionell."**
Vorher-Referenz: die Export-PNGs des CrewAI-Decks (Theme `sumi`) in
`10_Pallas/Slide-Deck-Export/CrewAI Quickstart — Deck/`. Vier Wurzeln, alle lokalisiert:

1. **Zentrierte Listen, schwebende Marker** — `layouts.css.ts` setzt auf den Hero-Templates
   `title`/`section`/`quote` `text-align:center` auf den *gesamten* Content. Listen zentrieren
   dann jede Textzeile, der Marker bleibt am Zeilenbox-Anfang → Bullets/Nummern schweben ohne
   Bezugskante (Folien 2, 5, 6). Verschärft dadurch, dass das LLM Hero-Layouts auch für
   listenlastige Folien wählt.
2. **Unbalancierte Typo-Skala** — keine modulare Skala: Struktur sagt h1 2.2em / h2 1.7em /
   title-h1 3em; Themes überschreiben mit eigenen Regeln (sumi: h1 2.5em serif-kursiv,
   h2 1.05em mono, 0.2em-Tracking, uppercase, gold, ◉-Ornament). 80px-Display gegen 32px-Body
   ohne Zwischenstufen; der „kleine" Eyebrow wirkt durch Sperrung riesig und bricht auf dem
   Cover zweizeilig.
3. **Fehlender vertikaler Rhythmus** — Abstände ad hoc verstreut (h1/h2 `.4em`, li `.25em`,
   Callout/Media `.4em`); `two-column` klebt mit `align-content:start` oben, große Leere unten
   (Folien 3, 4).
4. **Kein Spacing-Token-System** — `structure.css.ts` hardcodet 64px Padding, 48/36px Gaps;
   Themes haben außer den 7 Farb-/Font-Tokens keinen Hebel.

## 2. Entschiedene Rahmenbedingungen (Klärungsrunde)

- **Scope: alles zusammen** — Core-Design-System + Nordstern-Politur + LLM-Prompt-Härtung,
  **inkl. „alles japanisch"**: die fünf Nordstern-Themes werden offizielle Built-ins und
  ersetzen `default/dark/serif/high-contrast`.
- **Ästhetik: ruhig-modern, Charakter verfeinert** — Vorbild moderne Produkt-/Konferenz-Decks
  (Stripe, Linear, Keynote): gedämpfte modulare Skala, konsistente linke Ausrichtungskante,
  systematischer Weißraum. Nordstern behält Serif-Display + Akzentfarbe; Eyebrows werden klein
  und dezent; Ornamente (◉) entfallen.
- **Kompatibilität: freie Hand, auch brechend.** Bestehende Decks dürfen anders aussehen;
  Alt-Keys werden per Alias weitergeführt (s. §5).
- **Default-Theme: `shiro`** (hell). Alias-Map: `default→shiro, dark→kuro, serif→shiro,
  high-contrast→sumi` — still, ohne Warnung.

**Nicht-Ziele:** keine Eingriffe in render-dom / Fit-Engine / iframe-Pipeline (Ansatz C
verworfen — fragilste, DOM-untestbare Schicht; CSS leistet die Verteilung deklarativ).
Fixe Geometrie (1280×720 / 960×720) und fit-or-warn bleiben unangetastet. Keine neuen
Layout-Templates. Keine Font-Downloads (Privacy-Entscheidung aus 0.2.0 gilt weiter).

## 3. Typo-Skala & Rollen (Abschnitt 1, bestätigt)

Modulare Skala, **Ratio 1.25**, als Tokens in `structure.css` mit Defaults; Themes setzen
nur Werte, keine Regeln.

| Rolle | Token | Default | Verwendung |
|---|---|---|---|
| Display | `--sd-size-display` | 2.44em | h1 auf Hero-Layouts (title, cover-image, section) |
| Title | `--sd-size-h1` | 1.95em | h1 auf Content-Folien |
| Heading | `--sd-size-h2` | 1.25em | h2 als echte Zwischenüberschrift (Spalten, Abschnitte) |
| Body | — | 1em | Fließtext, Listen |
| Caption | `--sd-size-small` | 0.8em | Captions, Header/Footer/Paginate-Slots |
| Eyebrow | `--sd-size-eyebrow` | 0.68em | gesperrte Kicker-Zeile (kontextuell, s.u.) |

Line-Height-Tokens pro Rolle: `--sd-lh-display: 1.08`, `--sd-lh-heading: 1.2`,
`--sd-lh-body: 1.45` (ersetzt das globale 1.4). `stat`-Layout behält seinen eigenen
`--sd-stat-size` (4.5em), ausgerichtet auf die Skala dokumentiert.

**Eyebrow = kontextuelle Rolle statt missbrauchtem h2.** Die layout-abhängigen Regeln leben
in `layouts.css` (die Rollen-Tokens in `structure.css`); der Kontext entscheidet:

- `.sd-layout-title h2`, `.sd-layout-cover-image h2`, `.sd-layout-section h2` → Eyebrow-
  Treatment: `--sd-size-eyebrow`, `letter-spacing: var(--sd-eyebrow-tracking, .14em)`,
  uppercase, `color: var(--sd-eyebrow-fg, var(--sd-accent))`,
  `font-family: var(--sd-eyebrow-font, var(--sd-font))`. Klein + gesperrt = edel.
- h2 überall sonst → ruhige 1.25em-Zwischenüberschrift, keine Sperrung, kein Ornament,
  keine Uppercase-Transformation.

**Treatment-Tokens** drücken Theme-Charakter aus, ohne Regeln zu überschreiben:
`--sd-display-style` (font-style, Nordstern: italic), `--sd-display-weight`,
`--sd-display-tracking`, `--sd-eyebrow-font/-fg/-tracking`. Damit kann ein Theme die Skala
nicht mehr zerlegen.

## 4. Spacing, Rhythmus & Alignment (Abschnitt 2, bestätigt)

**Spacing-Skala, em-basiert** (skaliert mit dem Fit-Scale mit):

```
--sd-space-2xs: .25em · -xs: .5em · -s: .75em · -m: 1em
--sd-space-l: 1.5em · -xl: 2.25em · -2xl: 3.5em
```

Sämtliche Margins/Gaps/Paddings in `structure.css`/`layouts.css` referenzieren nur noch diese
Tokens. Folien-Padding wird `--sd-pad` (Default 64px, bewusst px: liegt außerhalb des
skalierten `.sd-content`, definiert den festen Rand). Spalten-Gaps: two-column
`var(--sd-space-l)` (42px bei 28px-Base), columns-3 `var(--sd-space-m)` (28px) — nahe den
heutigen 48/36px, jetzt system-gebunden.

**Vertikaler Rhythmus über Nachbarschafts-Regeln** (Owl-Selektor) statt Element-Margins:
Blöcke verlieren ihre Default-Margins; `.sd-region > * + * { margin-top: var(--sd-space-s) }`.
Differenzierung („mehr Luft davor als danach"):

- vor neuem h2-Abschnitt: `--sd-space-xl`
- Überschrift → zugehöriger Content (nach h1/h2): `--sd-space-s`
- zwischen Listenpunkten: `--sd-space-2xs`

**Drei Alignment-Axiome:**

1. **Listen sind intern immer linksbündig.** Marker hängen an einer konsistenten Kante.
2. **Zentriert wird der Block, nie die Zeile.** Hero-Layouts zentrieren Überschriften und
   einzelne Absätze (`text-align:center`); Listen, Code-Blöcke und Callouts bleiben
   Start-aligned und werden als Block zentriert (`width:fit-content; margin-inline:auto`,
   gedeckelt auf `max-width:85%` als Lesebreite), mehrzeilige `li` innen sauber an der Kante.
3. **Content-Folien haben eine linke Ausrichtungskante** (default/two-column/columns-3):
   alles linksbündig, Flattersatz rechts, keine Mischformen.

**Vertikale Verteilung:** two-column/columns-3 behalten Titel-spannt-Spalten; sparsamer
Content wird als Gruppe vertikal zentriert (bestehendes `compose-center` via
`align-content:center`). Slots (header/footer/paginate) rücken auf `--sd-size-small` und
gedämpfte Farbe (`--sd-slot-fg`-Mechanik bleibt).

## 5. Theme-Architektur: Nordstern-Built-ins, Aliase, Registry (Abschnitt 3, bestätigt)

**Fünf TS-Presets** in `src/core/presets/` ersetzen die alten vier (Dateien
`default/dark/serif/high-contrast.ts` werden gelöscht):

| Key | Label | Charakter | baseFontPx | hljs | mermaid |
|---|---|---|---|---|---|
| `shiro` | Shiro · 白 — rice paper | hell, Papier/Bronze — **Default** | 28 | github | default |
| `kuro` | Kuro · 黒 — the chamber | dunkel, Void/Gold | 28 | github-dark (o.ä.) | dark |
| `sumi` | Sumi · 墨 — ink on void | high-contrast dunkel, Schwarz/Gold | 32 | github-dark (o.ä.) | dark |
| `kairo` | Kairo · 回路 — the circuit | dunkel-cyan, Engineering | 28 | github-dark (o.ä.) | dark |
| `kurenai` | Kurenai · 紅 — danger signal | dunkel-crimson, Incident | 28 | github-dark (o.ä.) | dark |

(Exakte hljs-Theme-Wahl pro Preset entscheidet die Implementierung nach Sichtung der
gebündelten highlight.js-Styles; Kriterium: liest auf dem jeweiligen `--sd-code-bg`.)

- **Gemeinsame Charakter-Regeln wandern tokenisiert in `structure.css`:** Blockquote, `hr`,
  Inline-Code-Panel — heute identisch in jeder Nordstern-.css kopiert. Struktur stylt sie
  einmal gegen Tokens (`--sd-accent`, `--sd-code-bg`, Spacing-Skala); ein 7-Token-User-Theme
  sieht damit sofort fertig aus.
- **hljs/Mermaid pro Theme first-class:** dunkle Built-ins bekommen ein echtes dunkles
  hljs-Theme + `mermaid:"dark"` statt der Token-Remap-Hacks — schließt das seit 0.2.0 offene
  „Mermaid auf kuro rendert hell". Akzent-Feintuning pro Preset optional über ein neues
  Feld `extraCss?: string` am `Preset`.
- **Alias-Schicht:** `resolveTheme` löst `default→shiro, dark→kuro, serif→shiro,
  high-contrast→sumi` still auf (kein Warning). Aliase erscheinen nicht in `listThemes`
  (Dropdowns, Settings-Referenz). Fallback für unbekannte Keys: shiro. Settings-Default
  `defaultTheme` → `"shiro"`.
- **User-Theme-Vertrag stabil:** §1 bleibt bei den 7 Pflicht-Tokens; alle neuen Typo-/
  Spacing-/Treatment-Tokens sind optional mit Defaults. User-Themes erben künftig hljs/
  mermaid von **shiro** (statt „default", das es nicht mehr gibt).
- **Vault-Migration (Pallas):** `Slide-Deck-Themes/{kuro,shiro,sumi,kairo,kurenai}.css`
  würden die Built-ins per `overridesBuiltin` überschatten → beim Deploy-Smoke nach
  `_backup/` verschieben (Muster Session 9).

## 6. LLM-Prompt-Härtung (Abschnitt 4, bestätigt)

`deck-prompt.ts` / `getAuthoringContract()` bekommen explizite Layout-Wahl-Regeln:

- Hero-Layouts (`title`/`section`/`quote`/`cover-image`) **nur** für sparsamen Content:
  max. ~3 kurze Zeilen, **keine Listen, kein Code**.
- Listenlastiger Content → `default`/`two-column`/`columns-3`; max. 5 Bullets pro Region;
  Bullets als Fragmente (~≤10 Wörter).
- Eyebrow-Konvention: `##` direkt beim `#` auf Hero-Folien = Kicker, max. ~4 Wörter.

## 7. Fehlerpfade

Rein statisches CSS — keine neuen Laufzeitfehler. Alias-Auflösung still; unbekannte Keys
fallen wie bisher total auf den Default (jetzt shiro). fit-or-warn-, Core-Purity- und
Realm-Invarianten unberührt.

## 8. Tests & Verifikation (drei Ebenen)

1. **vitest (TDD):** Alias-Auflösung + `listThemes` ohne Aliase; Vollständigkeit der 5
   Presets (Tokens, Label, hljs, mermaid, baseFontPx); Skala-/Spacing-Tokens im Struktur-CSS
   vorhanden; Eyebrow-Kontextregeln im Layout-CSS vorhanden; Prompt-Vertrag enthält die
   Layout-Regeln. Bestehende 263 Tests bleiben grün; `bundle-smoke.mjs` („every theme")
   deckt die neuen Presets automatisch mit ab.
2. **Headless-Chrome-Harness** (0.3.0-Muster): CrewAI-Referenz-Deck + `docs/themes/demo-deck.md`
   durch das echte CSS rendern, Screenshot pro Folie, Sicht-Diff gegen die heutigen PNGs —
   fängt die Klasse „CSS-Bug, den kein Unit-Test sieht" vor dem GUI-Smoke.
3. **Jays GUI-Smoke in Pallas = Merge-Gate:** Re-Export CrewAI-Deck + frisch generiertes
   Deck; das ästhetische Urteil entscheidet.

## 9. Doku & Release

- **THEMING-GUIDE-Rewrite:** Rollen-/Token-Modell (Skala-Tabelle, Treatment-Tokens,
  Spacing-Skala, „was du nicht mehr selbst stylen musst"), Selektor-Tabelle aktualisiert.
- `docs/themes/`: Nordstern-.css-Vorlagen entfallen (jetzt Built-in, Kopien = Drift-Quelle);
  ersetzt durch **eine** minimale `example.css`. `demo-deck.md` aktualisiert.
- README: neue Built-in-Liste; Screenshots (bestehender Deferred-Punkt) separat.
- **CHANGELOG:** Breaking Changes dokumentiert (neue Built-ins, Alias-Map, neue Default-Optik,
  User-Themes erben von shiro).
- Branch `feat/slide-design-system`; **Release 0.5.0 erst nach grünem GUI-Smoke** (Jay).
