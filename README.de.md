# Slide Deck

Eine Markdown-Notiz in eine Präsentation verwandeln und als PDF oder PNG-Bilderserie exportieren — mit Live-Lesbarkeitsprüfung.

[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE)
[![Release](https://img.shields.io/badge/Release-0.1.0-green.svg)](https://codeberg.org/jkaindl/slide-deck/releases)
[![Plattform: Nur Desktop](https://img.shields.io/badge/Plattform-Nur%20Desktop-lightgrey.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/manifest.json)

![Slide Deck — eine Zwei-Spalten-Folie mit Aufzählung, Inline-Mathe und Bild](https://codeberg.org/jkaindl/slide-deck/raw/branch/main/docs/images/hero.png)

[English](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.md)

## Funktionen

- **Theme-Isolation** — Folien werden in einem sandboxed iframe gerendert, sodass das aktive Obsidian-Theme niemals in die Vorschau oder die Exporte durchsickert. Ein Deck sieht unabhängig vom Vault-Theme identisch aus.
- **Vier eingebaute Themes** — `default` (hell), `dark`, `serif`, `high-contrast` — über den `theme:`-Frontmatter-Schlüssel je Deck gewählt; jedes Theme bringt ein passendes Code-Highlighting- und Mermaid-Theme mit.
- **Live-Theme-Wechsler** — die Vorschau-Toolbar enthält ein Theme-Dropdown zum ephemeren Ausprobieren, eine Quell-Anzeige (`aus Frontmatter` / `aus Standard` / `● nicht gespeichert`), die zeigt, woher das aktive Theme stammt, und eine Schaltfläche **Setzen**, die `theme:` direkt in die Frontmatter der Notiz schreibt. Die Frontmatter ist die maßgebliche Quelle; der Einstellungs-Standard gilt nur für Notizen ohne `theme:`-Schlüssel.
- **Eigene Themes** — `.css`-Dateien in einen konfigurierbaren Themes-Ordner (Standard `Slide-Deck-Themes/`) ablegen; der `theme:`-Frontmatter-Wert entspricht dem Dateinamen ohne `.css`-Erweiterung. Jede Datei enthält einen `--sd-*`-Token-Block mit optionalem zusätzlichem CSS; eigene Themes erben das Code-Highlighting- und Mermaid-Theme des eingebauten `default`-Themes. Der Einstellungs-Tab zeigt alle gültigen Theme-Schlüssel live an.
- **Theme-Import/Export** — die Schaltfläche **Im Finder öffnen** zeigt den Themes-Ordner, sodass Dateien hineingezogen werden können; **Theme als .css exportieren** schreibt jedes Theme als editierbare `.css`-Ausgangsdatei; ein Schalter blendet den Themes-Ordner im Obsidian-Datei-Explorer aus.
- **Fünf Folien-Layouts** — `title`, `two-column`, `image-focus`, `section`, `quote` — je Folie per HTML-Kommentar-Direktive `<!-- layout: two-column -->` gesetzt; `<!-- column -->` trennt Bereiche in Mehrspalten-Layouts.
- **Markdown-Notizen → Folien** — Folien werden durch eine Zeile, die nur `---` enthält, getrennt; YAML-Frontmatter steuert Theme, Seitenverhältnis und Schrift-Untergrenze je Notiz.
- **Live-Vorschau** — rendert die aktive Notiz als Folien-Deck in einer Seitenleiste, skaliert auf die Fensterbreite; ein Klick auf Überlauf-Warnungen springt zur Quellzeile.
- **Fit-or-warn-Lesbarkeit** — jede Folie skaliert den Inhalt automatisch herunter bis zur konfigurierbaren Lesbarkeits-Untergrenze (`minFontPx`); Folien, die noch kleineren Text bräuchten, werden als überlaufend markiert statt unleserlich zu werden.
- **Eigenes CSS** — ein optionales CSS-Snippet in den Einstellungen wird an die Deck-Styles in Vorschau und Exporten angehängt, für Branding oder Anpassungen.
- **PDF-Export** — rendert alle Folien in nativer Auflösung und öffnet den System-Druckdialog (im Dialog „Als PDF speichern" wählen); theme-isoliert.
- **PNG-Bilderserie-Export** — erfasst jede Folie via html2canvas und schreibt nummerierte PNGs in einen konfigurierbaren Export-Ordner (Einstellungen, Standard `Slide-Deck-Export/`).
- **KaTeX-Mathematik** — Inline- und Display-Mathematik (`$…$` / `$$…$$`) gerendert von KaTeX.
- **Code-Hervorhebung** — Fenced-Code-Blöcke werden von highlight.js eingefärbt, theme-spezifisch.
- **Barrierefreie Callouts** — Obsidian-Callouts `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]` mit redundanter Kodierung: Rahmenfarbe + geometrische Form + sichtbares Label (nicht nur Farbe; erfüllt WCAG 1.4.1).
- **Mermaid-Diagramme** — Fenced-Blöcke ` ```mermaid ``` ` werden als SVG gerendert, theme-spezifisch.
- **EN/DE-Oberfläche** — alle UI-Strings folgen der Obsidian-Spracheinstellung (Englisch kanonisch, Deutsch unterstützt).

## Screenshots

![Barrierefreie Callouts mit Symbol, Form und Label gerendert](https://codeberg.org/jkaindl/slide-deck/raw/branch/main/docs/images/callouts.png)

## Voraussetzungen

- **Obsidian ≥ 1.8.7**
- **Nur Desktop** (`isDesktopOnly: true`) — der Export benötigt `window.print()` für PDF und `html2canvas` für PNG; beides erfordert eine Desktop-Umgebung.
- Der PDF-Export verwendet den **System-Druckdialog** — im Druckerdropdown „Als PDF speichern" wählen. Es wird keine PDF-Datei direkt erzeugt.
- Der PNG-Export schreibt Dateien in einen **konfigurierbaren Export-Ordner** (Einstellungen → Slide Deck → Export-Ordner, Standard `Slide-Deck-Export/`). Der PDF-Export läuft über den System-Druckdialog, wo du den Ort wählst.

## Installation

### Community Plugins (vorgesehener Kanal)

Geplant: Sobald das Plugin in die Obsidian Community Plugin Registry aufgenommen wurde, ist es über **Einstellungen → Community-Plugins → Durchsuchen → „Slide Deck"** installierbar.

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
| Eigenes CSS | `customCss` | *(leer)* | CSS, das in Vorschau und Exporten an die Deck-Styles angehängt wird, für Branding oder Anpassungen |
| Export-Ordner | `exportFolder` | `Slide-Deck-Export` | Vault-Ordner für den PNG-Bilderserie-Export |
| Themes-Ordner | `themesFolder` | `Slide-Deck-Themes` | Vault-Ordner, der nach eigenen `.css`-Themes durchsucht wird |
| Themes-Ordner ausblenden | `hideThemesFolder` | `true` | Themes-Ordner im Obsidian-Datei-Explorer ausblenden |

### Frontmatter je Notiz

Ein YAML-Frontmatter-Block am Anfang der Notiz steuert präsentationsweite Einstellungen:

```yaml
---
theme: dark
aspect: 16:9
minFontPx: 24
---
```

| Schlüssel | Werte | Beschreibung |
|---|---|---|
| `theme` | `default` · `dark` · `serif` · `high-contrast` · *eigener-Theme-Schlüssel* | Visuelles Preset; eigener Theme-Schlüssel = Dateiname der `.css`-Datei ohne Erweiterung |
| `aspect` | `16:9` (Standard), `4:3` | Canvas-Größe: 1280×720 (16:9) oder 960×720 (4:3) |
| `minFontPx` | jede positive Zahl | Lesbarkeits-Untergrenze je Notiz; überschreibt die Plugin-Einstellung |

### Folien-Layouts

Füge am Anfang einer Folie einen HTML-Kommentar ein, um das Layout zu wählen:

```markdown
<!-- layout: two-column -->

## Linke Überschrift

- Punkt eins
- Punkt zwei

<!-- column -->

![Ein Bild rechts](anhang.png)
```

| Wert | Beschreibung |
|---|---|
| `title` | Zentrierte Titelfolie mit großer Überschrift und Untertitel |
| `two-column` | Zwei gleiche Spalten, getrennt durch `<!-- column -->` |
| `image-focus` | Großes Bild mit optionaler Bildunterschrift |
| `section` | Vollflächiger Abschnittstrenner |
| `quote` | Zentriertes Blockzitat mit Quellenangabe |

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
3. **Theme-Isolation** — Folien werden in einem sandboxed iframe gerendert, in den die Styles des gewählten Themes direkt injiziert werden. Das aktive Obsidian-Theme dringt nicht in den iframe ein, sodass das Deck in Vorschau, PDF und PNG unabhängig vom Vault-Theme identisch aussieht.
4. **Fit-or-warn** — der Inhalt jeder Folie wird im DOM gemessen. Überschreitet er den Canvas, wird er gleichmäßig skaliert. Die Skalierung stoppt bei `minFontPx` (Lesbarkeits-Untergrenze). Würde der Inhalt bei dieser Skalierung immer noch überlaufen, wird die Folie in der Vorschau mit einer Warnung markiert statt weiter skaliert.
5. **Export** — dasselbe theme-isolierte iframe-Artefakt speist alle Export-Wege: die Druck-Pipeline (PDF) und die folienweise html2canvas-Erfassung (PNG). Die Rendering-Treue von KaTeX und Mermaid in html2canvas kann je nach Diagramm-Komplexität variieren; siehe [AGENTS.md](https://codeberg.org/jkaindl/slide-deck/src/branch/main/AGENTS.md) für bekannte Einschränkungen.

## Lizenz

Code: [AGPL-3.0-or-later](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE).
Dokumentation: [CC BY-SA 4.0](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE-DOCS).
Autor: Johannes Kaindl — <https://jkaindl.de>
