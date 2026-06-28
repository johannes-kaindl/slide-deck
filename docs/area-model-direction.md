# Nächste große Richtung: Area-/Template-Layout-Modell

> **Status:** Pre-Brainstorm-Richtungsnotiz (2026-06-28). Kein Spec — Grounding für eine *frische* Session, die mit `brainstorm→spec→plan` startet. Geschrieben nach dem Smoke von „Pro-Output Foundation" (Plan 1, gemerged auf `main` @ `8912bc8`).

## Das Problem (User-Befund aus dem Smoke)

Die Slides wirken **vom grundlegenden Layout der Elemente her noch unprofessionell**. Ursache (bestätigt): Content wird in *einen* `.sd-content`-Block gelegt und als Ganzes skaliert/zentriert. Es gibt **keine benannten Bereiche** (title / content / header / footer / media). Folge u.a.: ein Mermaid-Diagramm (oder ein Bild) fließt links im Textfluss statt **zentriert die Folienbreite zu nutzen** — schlechter lesbar, unprofessionell.

**User-Vorschlag (richtig):** Bereiche definieren für **title, content, header, footer (usw.)** und den Content dort hineinsetzen → korrekte vertikale/horizontale Zentrierung **und** korrekte Größenanpassung (Bilder, Mermaid).

## Referenz: die eigenen MARP-Themes (haben das bereits richtig gemacht)

Pfad: `50_Ressourcen/20_System/05-Tooling/30_Marp-Themes` (Pallas-Vault).
Dateien: `kuro.css` (Base, ~70 KB, Quell-Wahrheit) + Preset-Ordner (kuro, crimson, ember, biolink, circuit, ghost-protocol, phosphor, rust-signal, spectre, toxic-haze, voidwitch, neural-bleed, pearl = die **„Twelve Signals"**, also die *Vorfahren* von „Order from Traces"). Doku: `30_Marp-Themes.md`, `Kuro-Marp-Anleitung.md`, `Kuro-Demo.md`.

**Das bewährte Muster (genau das fehlt uns):**
- Jede Folie (`section`) ist ein **benanntes Template**, gewählt per `<!-- _class: X -->`.
- Jedes Template ist ein **CSS-Grid mit positionierten Bereichen**, z.B.
  - `section.split { display:grid; grid-template-columns:1fr 1fr }` — und die **Überschrift spannt beide Spalten** (`section.split > h1/h2/h3/hr`), Content fließt darunter in die Spalten.
  - `section.lead / .chapter / .quote-lead / .stat-lead / .columns-3 / .compact / .code-heavy` — je eigenes Template mit eigener Ausrichtung/Größe.
- **Header / Footer / Pagination** sind **native Slots** (eigene z-index-Bereiche) — `header:` / `footer:` / `paginate:` im Frontmatter.
- Mode-/Farb-Varianten (`.invert`, `.no-glow`, `.kuro-crimson`, …).

## Wie das auf unser Plugin abbildet

Wir haben den **Keim** schon: `LAYOUTS` (`default/title/section/quote/image-focus/two-column`) + `<!-- layout: X -->` (`src/core/presets/layouts.css.ts`, `src/core/directives.ts`). Aber **flach**: nur `flex`/`grid` auf *einem* `.sd-content`-Block, keine benannten Header/Footer/Media-Bereiche, Medien nicht an einen Bereich gebunden.

**Evolution (Kern des nächsten Specs):**
1. `LAYOUTS` zu **echten Grid-Templates** mit benannten Bereichen ausbauen: `header / eyebrow / title / body / media / footer / pagination`.
2. `render-dom` legt Regionen **in Bereiche** (statt alle in einen `.sd-content`-Block); Medien (`img`, `.sd-mermaid svg`) in einen **Media-Bereich**, der zentriert + auf Bodybreite skaliert (`width:100%`, `object-fit:contain`) — **das ist der konkrete Mermaid-Fix** (heute `.sd-mermaid svg{max-height:480px}` im linken Fluss).
3. **Header/Footer/Pagination** als First-Class-Bereiche (Frontmatter `header:`/`footer:`/`paginate:` analog MARP — oder Direktiven).
4. **Fit-or-warn** bleibt, greift aber pro Body-/Media-Bereich statt auf den Gesamtblock.

**Wichtig:** Dieses Modell **ersetzt** den alten Plan-2-Ansatz (`CHARACTER_CSS` war nur Politur: Eyebrow/Akzent-Linie). Die Grid-Templates mit Bereichen sind die *richtige* Architektur; die Politur wird eine **Schicht darin**. Die DS-Tokens (`design/_ds`) liefern die Optik, die MARP-Themes liefern die **Struktur**.

## Was Plan 1 schon geliefert hat (auf `main`, Fundament fürs Area-Modell)

`8912bc8` (gemerged): `inferLayout` (faktisch ein Proto-Template-Selektor: lone heading→section, lone quote→quote) · `compose-center` (interim — das Area-Modell subsumiert es) · **Callout-Tokens** (B1: `--sd-surface/-callout-base/-callout-{note,info,tip,warning,danger}`) · **`parseThemeMeta` + hljs/Mermaid pro Theme** (B2 — *Mermaid-auf-Dark im Smoke bestätigt ✓*). Spec/Plan: `docs/superpowers/specs/2026-06-28-pro-output-design.md`, `docs/superpowers/plans/2026-06-28-pro-output-foundation.md`.

## Offen / Reihenfolge

- **Jetzt dran (frische Session):** `brainstorm→spec` für das Area-/Template-Modell, gegroundet auf (a) MARP-Referenz oben, (b) `render-dom.ts` + `layouts.css.ts` + die fixe Geometrie / fit-or-warn-Invariante, (c) DS-Tokens für die Optik.
- **Smoke-Material vorhanden:** `slide-deck-tests/` (Pallas) + Theme `Slide-Deck-Themes/test-dark.css`.
- **Weiter vertagt:** Spec C (4-Farben-Knöpfe in Settings/Frontmatter) · Spec D (LLM markdown→deck, `../vault-rag`-Seed).
