# Slide Deck

Eine Markdown-Notiz in eine Präsentation verwandeln und als PDF oder PNG-Bilderserie exportieren — mit Live-Lesbarkeitsprüfung.

[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE)
[![Release](https://img.shields.io/badge/Release-0.1.0-green.svg)](https://codeberg.org/jkaindl/slide-deck/releases)
[![Plattform: Nur Desktop](https://img.shields.io/badge/Plattform-Nur%20Desktop-lightgrey.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/manifest.json)

<!-- hero image added before release -->

[English](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.md)

## Funktionen

- **Markdown-Notizen → Folien** — Folien werden durch eine Zeile, die nur `---` enthält, getrennt; YAML-Frontmatter steuert Preset, Seitenverhältnis und Schrift-Untergrenze je Notiz.
- **Live-Vorschau** — rendert die aktive Notiz als Folien-Deck in einer Seitenleiste; ein Link springt zur entsprechenden Quellzeile in der Notiz.
- **Fit-or-warn-Lesbarkeit** — jede Folie skaliert den Inhalt automatisch herunter bis zur konfigurierbaren Lesbarkeits-Untergrenze (`minFontPx`); Folien, die noch kleineren Text bräuchten, werden als überlaufend markiert statt unleserlich zu werden.
- **PDF-Export** — rendert alle Folien in nativer Auflösung und öffnet den System-Druckdialog (im Dialog „Als PDF speichern" wählen).
- **PNG-Bilderserie-Export** — erfasst jede Folie via html2canvas und schreibt nummerierte PNGs in einen `slide-export/`-Ordner im Vault.
- **KaTeX-Mathematik** — Inline- und Display-Mathematik (`$…$` / `$$…$$`) gerendert von KaTeX.
- **Code-Hervorhebung** — Fenced-Code-Blöcke werden von highlight.js eingefärbt.
- **Barrierefreie Callouts** — Obsidian-Callouts `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]` mit redundanter Kodierung: Rahmenfarbe + geometrische Form + sichtbares Label (nicht nur Farbe; erfüllt WCAG 1.4.1).
- **Mermaid-Diagramme** — Fenced-Blöcke ` ```mermaid ``` ` werden als SVG gerendert.
- **EN/DE-Oberfläche** — alle UI-Strings folgen der Obsidian-Spracheinstellung (Englisch kanonisch, Deutsch unterstützt).

## Voraussetzungen

- **Obsidian ≥ 1.8.7**
- **Nur Desktop** (`isDesktopOnly: true`) — der Export benötigt `window.print()` für PDF und `html2canvas` für PNG; beides erfordert eine Desktop-Umgebung.
- Der PDF-Export verwendet den **System-Druckdialog** — im Druckerdropdown „Als PDF speichern" wählen. Es wird keine PDF-Datei direkt erzeugt.
- Der PNG-Export schreibt Dateien in einen **`slide-export/`**-Ordner im Vault-Stammverzeichnis. Der Ordner wird beim ersten Export automatisch angelegt.

## Installation

### Community Plugins (vorgesehener Kanal)

Das Plugin ist bei der Obsidian Community Plugin Registry eingereicht. Nach Aufnahme ist es über **Einstellungen → Community-Plugins → Durchsuchen → "Slide Deck"** verfügbar.

### Manuelle Installation

1. `main.js`, `manifest.json` und `styles.css` aus dem [neuesten Release](https://codeberg.org/jkaindl/slide-deck/releases) herunterladen.
2. Ordner `.obsidian/plugins/slide-deck/` im Vault anlegen.
3. Die drei Dateien in diesen Ordner kopieren.
4. In Obsidian: **Einstellungen → Community-Plugins → Installierte Plugins** — **Slide Deck** aktivieren.

### BRAT (Beta Reviewers Auto-update Tool)

1. Das [BRAT-Plugin](https://obsidian.md/plugins?id=obsidian42-brat) installieren.
2. In den BRAT-Einstellungen `https://codeberg.org/jkaindl/slide-deck` (oder den GitHub-Mirror `https://github.com/johannes-kaindl/slide-deck`) hinzufügen.
3. Obsidian neu laden.

### Aus dem Quellcode bauen

```bash
git clone https://codeberg.org/jkaindl/slide-deck.git
cd slide-deck
npm install
npm run build          # erzeugt main.js
cp main.js manifest.json styles.css /pfad/zum/vault/.obsidian/plugins/slide-deck/
```

## Konfiguration

### Plugin-Einstellungen

| Einstellung | Schlüssel | Standard | Beschreibung |
|---|---|---|---|
| Standard-Preset | `defaultTheme` | `default` | Preset, wenn eine Notiz keine `theme`-Frontmatter-Direktive hat |
| Mindest-Schriftgröße Body (px) | `minFontPx` | `24` | Lesbarkeits-Untergrenze — Folien, die kleineren Text bräuchten, werden als überlaufend markiert |
| Bild-Export-Skalierung | `imageScale` | `2` | Pixel-Multiplikator für PNG-Export (`2` = 2×, scharf auf HiDPI) |

### Frontmatter je Notiz

Ein YAML-Frontmatter-Block am Anfang der Notiz steuert präsentationsweite Einstellungen:

```yaml
---
theme: default
aspect: 16:9
minFontPx: 24
---
```

| Schlüssel | Werte | Beschreibung |
|---|---|---|
| `theme` | `default` | Visuelles Preset (aktuell nur `default`) |
| `aspect` | `16:9` (Standard), `4:3` | Canvas-Größe: 1280×720 (16:9) oder 960×720 (4:3) |
| `minFontPx` | jede positive Zahl | Lesbarkeits-Untergrenze je Notiz; überschreibt die Plugin-Einstellung |

### Folien-Trenner

Eine Zeile, die **nur `---`** enthält, trennt Folien:

```markdown
---
theme: default
aspect: 16:9
---

# Folie 1

Inhalt hier.

---

# Folie 2

Weiterer Inhalt.
```

Hinweis: Das `---` im YAML-Frontmatter-Block ist der Standard-YAML-Begrenzer und kein Folien-Trenner.

## Wie es funktioniert

1. **Parsing** — das Markdown der aktiven Notiz wird an `---`-Zeilen in einzelne Folien-Körper aufgeteilt. Ein YAML-Frontmatter-Block (falls vorhanden) setzt Deck-weite Direktiven.
2. **Fester Canvas** — jede Folie wird auf einen festen Canvas gerendert: 1280×720 px (16:9) oder 960×720 px (4:3). Die Canvas-Größe ändert sich nicht mit der Fenstergröße.
3. **Fit-or-warn** — der Inhalt jeder Folie wird im DOM gemessen. Überschreitet er den Canvas, wird er gleichmäßig skaliert. Die Skalierung stoppt bei `minFontPx` (Lesbarkeits-Untergrenze). Würde der Inhalt bei dieser Skalierung immer noch überlaufen, wird die Folie in der Vorschau mit einer Warnung markiert statt weiter skaliert.
4. **Export** — der Export baut dasselbe selbst-enthaltene HTML (inline CSS + aufgelöste Bild-Data-URLs) und sendet es entweder an die Druck-Pipeline (PDF) oder erfasst jeden Folien-Canvas mit html2canvas (PNG). Die Rendering-Treue von KaTeX und Mermaid in html2canvas kann je nach Diagramm-Komplexität variieren; siehe [AGENTS.md](https://codeberg.org/jkaindl/slide-deck/src/branch/main/AGENTS.md) für bekannte Einschränkungen.

## Lizenz

Code: [AGPL-3.0-or-later](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE).
Dokumentation: [CC BY-SA 4.0](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE-DOCS).
Autor: Johannes Kaindl — <https://jkaindl.de>
