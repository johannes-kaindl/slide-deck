# Slide Deck

> [🇬🇧 English](https://github.com/johannes-kaindl/slide-deck/blob/main/README.md) · 🇩🇪 Deutsch

Eine Markdown-Notiz in eine Präsentation verwandeln und als PDF oder PNG-Bilderserie exportieren — mit Live-Lesbarkeitsprüfung.

[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/slide-deck/blob/main/LICENSE)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/slide-deck?label=release)](https://github.com/johannes-kaindl/slide-deck/releases)
[![Doku: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/slide-deck/blob/main/LICENSE-DOCS)
[![Plattform: Desktop + Mobile](https://img.shields.io/badge/Plattform-Desktop%20%2B%20Mobile-blue.svg)](https://github.com/johannes-kaindl/slide-deck/blob/main/manifest.json)

<img width="820" alt="Eine Zwei-Spalten-Folie im Theme kami: links eine Aufzählung mit Inline-Code und KaTeX-Mathe, rechts ein Balkendiagramm, das die Spalte füllt" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/hero.png">

## Funktionen

- **Theme-Isolation** — Folien werden in einem sandboxed iframe gerendert, sodass das aktive Obsidian-Theme niemals in die Vorschau oder die Exporte durchsickert. Ein Deck sieht unabhängig vom Vault-Theme identisch aus.
- **Neun eingebaute Themes** — das Nordstern-Set: `kami` 紙 (hell, Standard), `kogane` 黄金 (dunkel), `sumi` 墨 (echtes Schwarz, high-contrast), `kairo` 回路 (dunkel, cyan), `kurenai` 紅 (dunkel, rot); dazu die `crimson`-Familie 紅 in vier Modi (`crimson-dark`, `crimson-dark-lc`, `crimson-light`, `crimson-light-lc`) — Serifen-Display über einem Mono-Fließtext, mit einer feinen Scanline, die die kontrastarmen Modi dämpfen. Über den `theme:`-Frontmatter-Schlüssel je Deck gewählt; jedes Theme bringt ein passendes Code-Highlighting- und Mermaid-Theme mit. Alte 0.4.x-Schlüssel (`default`, `dark`, `serif`, `high-contrast`) funktionieren weiterhin — sie lösen sich still zu ihrem Nordstern-Nachfolger auf.
- **Live-Theme-Wechsler** — die Vorschau-Toolbar enthält ein Theme-Dropdown zum ephemeren Ausprobieren, eine Quell-Anzeige (`aus Frontmatter` / `aus Standard` / `● nicht gespeichert`), die zeigt, woher das aktive Theme stammt, und eine Schaltfläche **Setzen**, die `theme:` direkt in die Frontmatter der Notiz schreibt. Die Frontmatter ist die maßgebliche Quelle; der Einstellungs-Standard gilt nur für Notizen ohne `theme:`-Schlüssel.
- **Eigene Themes** — `.css`-Dateien in einen konfigurierbaren Themes-Ordner (Standard `Slide-Deck-Themes/`) ablegen; der `theme:`-Frontmatter-Wert entspricht dem Dateinamen ohne `.css`-Erweiterung. Jede Datei enthält einen `--sd-*`-Token-Block mit optionalem zusätzlichem CSS obendrauf auf das Design-System des Plugins (Type-Scale, Abstände, Rhythmus) — ein 7-Token-Theme sieht schon fertig aus; eigene Themes erben das Code-Highlighting- und Mermaid-Theme des `kami`-Themes, sofern nicht überschrieben. Siehe den [Theming-Guide](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/themes/THEMING-GUIDE.md). Der Einstellungs-Tab zeigt alle gültigen Theme-Schlüssel live an.
- **Theme-Import/Export** — die Schaltfläche **Im Finder öffnen** zeigt den Themes-Ordner, sodass Dateien hineingezogen werden können; **Theme als .css exportieren** schreibt jedes Theme als editierbare `.css`-Ausgangsdatei; ein Schalter blendet den Themes-Ordner im Obsidian-Datei-Explorer aus.
- **Zwölf Folien-Templates** — `default`, `title`, `section`, `quote`, `image-focus`, `two-column`, `columns-3`, `stat`, `cover-image`, `agenda`, `threads`, `closing` — je Folie per Layout-Direktive (ein HTML-Kommentar) gesetzt; Spalten werden per Spalten-Direktive getrennt, und in Mehrspalten-Templates spannt die führende Überschrift über alle Spalten. Siehe den [Layout-Leitfaden](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/layouts.de.md).
- **Kombinierbare Dichte-Modifier** — `compact` (engere Typografie) oder `code-heavy` (kleinerer Code) lassen sich in derselben Layout-Direktive an jedes Template anhängen.
- **Automatische Layout-Erkennung** — ohne explizite Direktive wird das Layout aus der Inhaltsform abgeleitet: eine einzelne Überschrift wird zu `section`, ein einzelnes Blockzitat zu `quote`, ein einzelnes Bild oder Diagramm zu `image-focus`, und Spalten-Trennungen ergeben `two-column` / `columns-3`. Eine explizite Layout-Direktive hat immer Vorrang.
- **Deck-Slots** — die Frontmatter-Schlüssel `header:`, `footer:` und `paginate:` rendern als schwebende Eck-Slots auf jeder Folie (Paginierung zeigt `n / N`).
- **Medien füllen und zentrieren** — Block-Bilder und Mermaid-Diagramme nutzen den verfügbaren Platz, horizontal und vertikal zentriert und einpassend skaliert (`object-fit: contain`), sowohl für Obsidian-`![[Einbettungen]]` als auch für Standard-`![](…)`-Bilder.
- **Spärliche Folien zentrieren vertikal** — Folien mit wenig Inhalt werden vertikal zentriert, statt am oberen Rand zu kleben.
- **Markdown-Notizen → Folien** — Folien werden durch eine Zeile, die nur `---` enthält, getrennt; YAML-Frontmatter steuert Theme, Seitenverhältnis und Schrift-Untergrenze je Notiz.
- **Live-Vorschau** — rendert die aktive Notiz als Folien-Deck in einer Seitenleiste, skaliert auf die Fensterbreite; ein Klick auf Überlauf-Warnungen springt zur Quellzeile.
- **Fit-or-warn-Lesbarkeit** — jede Folie skaliert den Inhalt automatisch herunter bis zur konfigurierbaren Lesbarkeits-Untergrenze (`minFontPx`); Folien, die noch kleineren Text bräuchten, werden als überlaufend markiert statt unleserlich zu werden.
- **Eigenes CSS** — ein optionales CSS-Snippet in den Einstellungen wird an die Deck-Styles in Vorschau und Exporten angehängt, für Branding oder Anpassungen.
- **PDF-Export** — rendert alle Folien in nativer Auflösung; auf dem Desktop wird der System-Druckdialog geöffnet (im Dialog „Als PDF speichern" wählen); auf Mobilgeräten (iOS/iPadOS) wird eine eigenständige HTML-Datei in den Export-Ordner geschrieben und über die Standard-App des Betriebssystems geöffnet — von dort kann als PDF gedruckt oder geteilt werden.
- **PNG-Bilderserie-Export** — erfasst jede Folie via `modern-screenshot` und schreibt nummerierte PNGs in einen konfigurierbaren Export-Ordner (Einstellungen, Standard `Slide-Deck-Export/`); typografisch korrekte Wortabstände.
- **Mobile-Unterstützung** — läuft auf iOS/iPadOS (Obsidian Mobile); alle Desktop-only-APIs sind plattformgesichert.
- **KaTeX-Mathematik** — Inline- und Display-Mathematik (`$…$` / `$$…$$`) gerendert von KaTeX.
- **Code-Hervorhebung** — Fenced-Code-Blöcke werden von highlight.js eingefärbt, theme-spezifisch.
- **Barrierefreie Callouts** — Obsidian-Callouts `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]` mit redundanter Kodierung: Rahmenfarbe + geometrische Form + sichtbares Label (nicht nur Farbe; erfüllt WCAG 1.4.1).
- **Mermaid-Diagramme** — Fenced-Blöcke ` ```mermaid ``` ` werden als SVG gerendert, theme-spezifisch.
- **EN/DE-Oberfläche** — alle UI-Strings folgen der Obsidian-Spracheinstellung (Englisch kanonisch, Deutsch unterstützt).

## Screenshots

**Die Notiz und ihre Projektion.** Das Deck rendert in einem Seitenpanel und bringt die
Werkzeugleiste mit: Theme-Auswahl, Herkunft des aktiven Themes, die beiden Export-Wege.

<img width="820" alt="Obsidian mit der Notiz links und der Slide-Deck-Vorschau rechts: Theme-Auswahl, Herkunftszeile from frontmatter, Export-Knöpfe für PDF und Bilder, Folien mit laufender Kopfzeile und Seitenanzeige" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/preview-pane.png">

**Neun eingebaute Themes.** Dieselbe Folie in jedem — nur Farbe, Schrift und Akzent ändern
sich; die Struktur bleibt theme-unabhängig.

<img width="820" alt="Ein Drei-mal-drei-Raster mit derselben Folie in allen neun eingebauten Themes: kami, kogane, sumi, kairo, kurenai, crimson-dark, crimson-dark-lc, crimson-light und crimson-light-lc" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/themes.png">

**Zwölf Folien-Templates.** Per Layout-Direktive gesetzt — oder aus der Form der Folie
abgeleitet. Das Raster zeigt die neun allgemeinen; `agenda`, `threads` und `closing` stehen im Layout-Leitfaden.

<img width="820" alt="Ein Drei-mal-drei-Raster der neun Folien-Templates: title, section, quote, image-focus, two-column, columns-3, stat, cover-image und default" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/layouts.png">

**Fit-or-warn.** Eine Folie, die Text unterhalb der Lesbarkeitsgrenze bräuchte, wird in der
Vorschau markiert statt stumm beschnitten.

<img width="820" alt="Die Vorschau mit der Warnung, dass der Inhalt von Folie 1 an der Lesbarkeitsgrenze überläuft, darüber die mit einem roten Balken markierte Folie" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/overflow-warning.png">

**Barrierefreie Callouts.** Die Bedeutung wird dreifach kodiert — Rahmenfarbe, geometrische
Form und ein sichtbares Label-Wort.

<img width="820" alt="Eine Folie mit allen fünf Callout-Typen (note, tip, info, warning, danger), jeder mit farbigem Rahmen, eigenem Symbol und Label-Wort" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/callouts.png">

**Einstellungen.** Der Tab listet alle gültigen `theme:`-Werte live — auch die Themes, die du
selbst in den Themes-Ordner legst.

<a href="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/settings.png"><img width="380" alt="Der Einstellungen-Tab von Slide Deck mit Standard-Theme, der Liste aller neun gültigen Theme-Schlüssel, der Lesbarkeitsgrenze, den Export- und Themes-Ordnern und dem Abschnitt für den lokalen KI-Endpunkt" src="https://raw.githubusercontent.com/johannes-kaindl/slide-deck/main/docs/images/thumbs/settings.png"></a>

<sub>Klick auf die Vorschau öffnet die Vollauflösung.</sub>

## Voraussetzungen

- **Obsidian ≥ 1.8.7** (`minAppVersion`). Ab 1.13.0 nutzt der Einstellungs-Tab die deklarative Settings-API; ältere Versionen bekommen dieselben Einstellungen über einen klassischen Fallback.
- **Desktop + Mobile** (`isDesktopOnly: false`) — läuft auf dem Desktop (Windows, macOS, Linux) und auf Mobilgeräten (iOS/iPadOS); Desktop-only-APIs sind plattformgesichert.
- **PDF-Export auf dem Desktop** verwendet den **System-Druckdialog** — im Druckerdropdown „Als PDF speichern" wählen. Es wird keine PDF-Datei direkt erzeugt.
- **PDF-Export auf Mobile** schreibt eine eigenständige HTML-Datei in den Export-Ordner und öffnet sie mit der Standard-App des Betriebssystems; von dort kann als PDF gedruckt oder geteilt werden. Der Dateiname lautet `<Export-Ordner>/<Notizname>.html`.
- Der PNG-Export schreibt Dateien in einen **konfigurierbaren Export-Ordner** (Einstellungen → Slide Deck → Export-Ordner, Standard `Slide-Deck-Export/`). Der PDF-Export auf dem Desktop läuft über den System-Druckdialog, wo du den Ort wählst.

## Installation

### Katalog (empfohlen)

**Über den [AnySource Sideloader](https://github.com/johannes-kaindl/anysource-sideloader)**, der Plugins von jeder Git-Forge installiert und aktualisiert. Den Plugin-Katalog einmal unter **Einstellungen → AnySource Sideloader → Kataloge → Hinzufügen** eintragen:

```
https://git.jkaindl.de/jkaindl/obsidian-catalog/raw/branch/main/catalog.json
```

Slide Deck erscheint dann in der Plugin-Liste des Sideloaders und aktualisiert sich wie jedes andere Plugin. Die Versionsprüfung geht live an die Releases dieses Repositorys — der Katalog listet nur, was es gibt, und liefert die Dateien nie selbst. Wer nur dieses eine Plugin ohne Katalog will, trägt stattdessen die Repository-URL als Quelle ein: `https://github.com/johannes-kaindl/slide-deck`.

### Manuelle Installation

1. `main.js`, `manifest.json` und `styles.css` aus dem [neuesten Release](https://github.com/johannes-kaindl/slide-deck/releases/latest) herunterladen.
2. Ordner `.obsidian/plugins/slide-deck/` im Vault anlegen.
3. Die drei Dateien in diesen Ordner kopieren.
4. In Obsidian: **Einstellungen → Community-Plugins → Installierte Plugins** — **Slide Deck** aktivieren.

### Aus dem Quellcode bauen

```bash
git clone https://git.jkaindl.de/jkaindl/slide-deck.git
cd slide-deck
npm install
npm run build          # erzeugt main.js
cp main.js manifest.json styles.css /pfad/zum/vault/.obsidian/plugins/slide-deck/
```

## Verwendung

1. Eine Markdown-Notiz öffnen und Folien durch eine Zeile trennen, die nur `---` enthält.
2. **Präsentations-Vorschau öffnen** ausführen (Befehlspalette) — das Deck erscheint in einem Seitenpanel und aktualisiert sich beim Bearbeiten. Folien, die überlaufen, werden dort markiert statt still abgeschnitten.
3. Theme, Seitenverhältnis und Schrift-Untergrenze je Notiz im YAML-Frontmatter setzen:

```yaml
---
theme: kami
aspect: "16:9"
minFontPx: 24
header: Mein Vortrag
paginate: true
---

# Erste Folie

---

# Zweite Folie
```

4. Mit **Präsentation als PDF exportieren** oder **Präsentation als Bilderserie exportieren** exportieren. Das PDF druckt auf dem Desktop das isolierte Deck direkt; auf Mobile wird eine eigenständige HTML-Datei in den Export-Ordner geschrieben und ans Betriebssystem übergeben, wo du sie als PDF druckst oder teilst.

Das Layout je Folie wählt eine Layout-Direktive — ein HTML-Kommentar in einer eigenen Zeile:

```markdown
<!-- layout: two-column compact -->

# Überschrift über beide Spalten

Inhalt der linken Spalte.

<!-- column -->

Inhalt der rechten Spalte.
```

Ohne Direktive wird das Layout aus der Form der Folie abgeleitet. Die vollständige Template- und Modifier-Referenz steht im [Layout-Leitfaden](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/layouts.de.md).

## Bild-Slots

Braucht das Plugin [local-image-generator](https://github.com/johannes-kaindl/local-image-generator) (nur Desktop). **Bildplatz einfügen** ausführen (Befehlspalette), eine von sechs Bildfunktionen wählen (dokumentarisch, analytisch, metaphorisch, emotional, navigierend, dekorativ) — jede steuert den Prompt mit einem eigenen Stil-Suffix — und einen Prompt schreiben:

````markdown
```slide-image
funktion: metaphorical

A single lantern in fog, one clear light source
```
````

Der Block erscheint als Karte mit einem Knopf **Bild erzeugen**. Ein Klick fragt das Nachbar-Plugin nach einem Bild, speichert es nach dessen eigenen Einstellungen und ersetzt den Block durch ein schlichtes Embed samt Prompt-Kommentar (damit ein späteres Neu-Würfeln etwas hat, wovon es ausgehen kann):

```markdown
<!-- image: metaphorical | A single lantern in fog, one clear light source -->
![[lantern-fog.png]]
```

Ohne installiertes und aktiviertes `local-image-generator` zeigt die Karte einen Leerzustand statt eines Knopfs.

## Konfiguration

### Plugin-Einstellungen

| Einstellung | Schlüssel | Standard | Beschreibung |
|---|---|---|---|
| Standard-Theme | `defaultTheme` | `kami` | Preset, wenn eine Notiz keine `theme`-Frontmatter-Direktive hat |
| Mindest-Schriftgröße Body (px) | `minFontPx` | `24` | Lesbarkeits-Untergrenze — Folien, die kleineren Text bräuchten, werden als überlaufend markiert |
| Bild-Export-Skalierung | `imageScale` | `2` | Pixel-Multiplikator für PNG-Export (`2` = 2×, scharf auf HiDPI) |
| Eigenes CSS | `customCss` | *(leer)* | CSS, das in Vorschau und Exporten an die Deck-Styles angehängt wird, für Branding oder Anpassungen |
| Bild-Export-Ordner | `exportFolder` | `Slide-Deck-Export` | Vault-Ordner für den PNG-Bilderserie-Export |
| Themes-Ordner | `themesFolder` | `Slide-Deck-Themes` | Vault-Ordner, der nach eigenen `.css`-Themes durchsucht wird |
| Themes-Ordner im Datei-Explorer ausblenden | `hideThemesFolder` | `true` | Themes-Ordner im Obsidian-Datei-Explorer ausblenden |

### Frontmatter je Notiz

Ein YAML-Frontmatter-Block am Anfang der Notiz steuert präsentationsweite Einstellungen:

```yaml
---
theme: kogane
aspect: 16:9
minFontPx: 24
header: Mein Vortrag
footer: ACME GmbH
paginate: true
---
```

| Schlüssel | Werte | Beschreibung |
|---|---|---|
| `theme` | `kami` · `kogane` · `sumi` · `kairo` · `kurenai` · `crimson-dark` · `crimson-dark-lc` · `crimson-light` · `crimson-light-lc` · *eigener-Theme-Schlüssel* (alte Schlüssel `default`/`dark`/`serif`/`high-contrast` funktionieren weiterhin) | Visuelles Preset; eigener Theme-Schlüssel = Dateiname der `.css`-Datei ohne Erweiterung |
| `aspect` | `16:9` (Standard), `4:3` | Canvas-Größe: 1280×720 (16:9) oder 960×720 (4:3) |
| `minFontPx` | jede positive Zahl | Lesbarkeits-Untergrenze je Notiz; überschreibt die Plugin-Einstellung |
| `header` | beliebiger Text | Schwebender Header-Slot auf jeder Folie |
| `footer` | beliebiger Text | Schwebender Footer-Slot auf jeder Folie |
| `paginate` | `true` · `yes` · `on` | Seitenanzeige (`n / N`) auf jeder Folie einblenden |

### Folien-Layout & Syntax

Zwölf Folien-Templates (`default`, `title`, `section`, `quote`, `image-focus`, `two-column`, `columns-3`, `stat`, `cover-image`, `agenda`, `threads`, `closing`), kombinierbare Dichte-Modifier (`compact`, `code-heavy`), die Layout- und Spalten-Direktiven sowie die automatische Layout-Erkennung sind im **[Folien-Layouts- & Syntax-Leitfaden](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/layouts.de.md)** dokumentiert.

### Folien-Trenner

Eine Zeile, die **nur `---`** enthält, trennt Folien:

```markdown
---
theme: kami
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
5. **Export** — dasselbe theme-isolierte iframe-Artefakt speist alle Export-Wege: die Druck-Pipeline (PDF) und die folienweise `modern-screenshot`-Erfassung (`domToCanvas`) (PNG). Auf dem Desktop wird PDF via `contentWindow.print()` gedruckt; auf Mobilgeräten wird eine eigenständige HTML-Datei in den Vault geschrieben und via `openWithDefaultApp` ans Betriebssystem übergeben.

## Netzwerknutzung (lokale KI)

Der Befehl **Präsentation aus Notiz erzeugen** sendet Notiz-Inhalte an einen **von dir
konfigurierten OpenAI-kompatiblen LLM-Endpoint** (Standard `http://localhost:1234`, also ein
lokales LM Studio). Kein Cloud-Dienst ist beteiligt, solange du den Endpoint nicht auf einen
richtest.

Ist das Plugin **LLM Endpoint Manager** installiert, kommen die Endpunkte (samt Schlüsseln) stattdessen von ihm: Der Einstellungs-Tab bietet dann eine Endpunkt- und Modellwahl, und deine lokale Liste bleibt als Rückfall erhalten, wenn der Manager aus ist.

- **Erreichbarkeits-Pings und Modell-Listen** werden abgefragt, wenn du den Erzeugen-Dialog oder
  den Einstellungs-Tab öffnest. Das sind automatische Requests an die konfigurierten Endpoints.
- **Notiz-Inhalte werden nur beim Klick auf „Erzeugen" gesendet.**
- Keine Telemetrie, keine Analyse, keine Drittanbieter.

### Server-CORS

Das Streaming läuft über `XMLHttpRequest` unter der Obsidian-Origin; der Endpoint muss also
Cross-Origin-Requests erlauben. LM Studios CORS-Schalter muss an sein; Ollama braucht
`OLLAMA_ORIGINS=app://obsidian.md` (oder `*`). Beantwortet der Endpoint den Ping, verweigert aber
den Stream, **fällt das Plugin automatisch auf einen Non-Streaming-Request zurück** (die
Live-Token-Ansicht entfällt, das Deck entsteht trotzdem).

## Dokumentation

- [Dokumentations-Index](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/README.md) — alle Anleitungen an einem Ort (englisch).
- [Getting started](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/getting-started.md) — von der Installation bis zum ersten exportierten Deck (englisch).
- [Troubleshooting](https://github.com/johannes-kaindl/slide-deck/blob/main/docs/troubleshooting.md) — die genaue Meldung, ihre Ursache und die Abhilfe (englisch).

## Lizenz

Code: [AGPL-3.0-or-later](https://github.com/johannes-kaindl/slide-deck/blob/main/LICENSE) — eine kommerzielle Lizenz gibt es auf Anfrage, siehe [`LICENSING.md`](https://github.com/johannes-kaindl/slide-deck/blob/main/LICENSING.md).
Dokumentation: [CC BY-SA 4.0](https://github.com/johannes-kaindl/slide-deck/blob/main/LICENSE-DOCS).
Autor: Johannes Kaindl — <https://jkaindl.de>
