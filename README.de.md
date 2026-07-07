# Slide Deck

Eine Markdown-Notiz in eine Präsentation verwandeln und als PDF oder PNG-Bilderserie exportieren — mit Live-Lesbarkeitsprüfung.

[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE)
[![Release](https://img.shields.io/badge/Release-0.3.1-green.svg)](https://codeberg.org/jkaindl/slide-deck/releases)
[![Plattform: Desktop + Mobile](https://img.shields.io/badge/Plattform-Desktop%20%2B%20Mobile-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/manifest.json)

![Slide Deck — eine Zwei-Spalten-Folie mit Aufzählung, Inline-Mathe und Bild](https://codeberg.org/jkaindl/slide-deck/raw/branch/main/docs/images/hero.png)

[English](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.md)

## Funktionen

- **Theme-Isolation** — Folien werden in einem sandboxed iframe gerendert, sodass das aktive Obsidian-Theme niemals in die Vorschau oder die Exporte durchsickert. Ein Deck sieht unabhängig vom Vault-Theme identisch aus.
- **Fünf eingebaute Themes** — das Nordstern-Set: `shiro` 白 (hell, Standard), `kuro` 黒 (dunkel), `sumi` 墨 (echtes Schwarz, high-contrast), `kairo` 回路 (dunkel, cyan), `kurenai` 紅 (dunkel, rot) — über den `theme:`-Frontmatter-Schlüssel je Deck gewählt; jedes Theme bringt ein passendes Code-Highlighting- und Mermaid-Theme mit. Alte 0.4.x-Schlüssel (`default`, `dark`, `serif`, `high-contrast`) funktionieren weiterhin — sie lösen sich still zu ihrem Nordstern-Nachfolger auf.
- **Live-Theme-Wechsler** — die Vorschau-Toolbar enthält ein Theme-Dropdown zum ephemeren Ausprobieren, eine Quell-Anzeige (`aus Frontmatter` / `aus Standard` / `● nicht gespeichert`), die zeigt, woher das aktive Theme stammt, und eine Schaltfläche **Setzen**, die `theme:` direkt in die Frontmatter der Notiz schreibt. Die Frontmatter ist die maßgebliche Quelle; der Einstellungs-Standard gilt nur für Notizen ohne `theme:`-Schlüssel.
- **Eigene Themes** — `.css`-Dateien in einen konfigurierbaren Themes-Ordner (Standard `Slide-Deck-Themes/`) ablegen; der `theme:`-Frontmatter-Wert entspricht dem Dateinamen ohne `.css`-Erweiterung. Jede Datei enthält einen `--sd-*`-Token-Block mit optionalem zusätzlichem CSS obendrauf auf das Design-System des Plugins (Type-Scale, Abstände, Rhythmus) — ein 7-Token-Theme sieht schon fertig aus; eigene Themes erben das Code-Highlighting- und Mermaid-Theme des `shiro`-Themes, sofern nicht überschrieben. Siehe den [Theming-Guide](https://codeberg.org/jkaindl/slide-deck/src/branch/main/docs/themes/THEMING-GUIDE.md). Der Einstellungs-Tab zeigt alle gültigen Theme-Schlüssel live an.
- **Theme-Import/Export** — die Schaltfläche **Im Finder öffnen** zeigt den Themes-Ordner, sodass Dateien hineingezogen werden können; **Theme als .css exportieren** schreibt jedes Theme als editierbare `.css`-Ausgangsdatei; ein Schalter blendet den Themes-Ordner im Obsidian-Datei-Explorer aus.
- **Neun Folien-Templates** — `default`, `title`, `section`, `quote`, `image-focus`, `two-column`, `columns-3`, `stat`, `cover-image` — je Folie per Layout-Direktive (ein HTML-Kommentar) gesetzt; Spalten werden per Spalten-Direktive getrennt, und in Mehrspalten-Templates spannt die führende Überschrift über alle Spalten. Siehe den [Layout-Leitfaden](https://codeberg.org/jkaindl/slide-deck/src/branch/main/docs/layouts.de.md).
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

![Barrierefreie Callouts mit Symbol, Form und Label gerendert](https://codeberg.org/jkaindl/slide-deck/raw/branch/main/docs/images/callouts.png)

## Voraussetzungen

- **Obsidian ≥ 1.13.0** (der Einstellungs-Tab nutzt die deklarative Settings-API aus 1.13.0)
- **Desktop + Mobile** (`isDesktopOnly: false`) — läuft auf dem Desktop (Windows, macOS, Linux) und auf Mobilgeräten (iOS/iPadOS); Desktop-only-APIs sind plattformgesichert.
- **PDF-Export auf dem Desktop** verwendet den **System-Druckdialog** — im Druckerdropdown „Als PDF speichern" wählen. Es wird keine PDF-Datei direkt erzeugt.
- **PDF-Export auf Mobile** schreibt eine eigenständige HTML-Datei in den Export-Ordner und öffnet sie mit der Standard-App des Betriebssystems; von dort kann als PDF gedruckt oder geteilt werden. Der Dateiname lautet `<Export-Ordner>/<Notizname>.html`.
- Der PNG-Export schreibt Dateien in einen **konfigurierbaren Export-Ordner** (Einstellungen → Slide Deck → Export-Ordner, Standard `Slide-Deck-Export/`). Der PDF-Export auf dem Desktop läuft über den System-Druckdialog, wo du den Ort wählst.

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
| Standard-Preset | `defaultTheme` | `shiro` | Preset, wenn eine Notiz keine `theme`-Frontmatter-Direktive hat |
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
header: Mein Vortrag
footer: ACME GmbH
paginate: true
---
```

| Schlüssel | Werte | Beschreibung |
|---|---|---|
| `theme` | `shiro` · `kuro` · `sumi` · `kairo` · `kurenai` · *eigener-Theme-Schlüssel* (alte Schlüssel `default`/`dark`/`serif`/`high-contrast` funktionieren weiterhin) | Visuelles Preset; eigener Theme-Schlüssel = Dateiname der `.css`-Datei ohne Erweiterung |
| `aspect` | `16:9` (Standard), `4:3` | Canvas-Größe: 1280×720 (16:9) oder 960×720 (4:3) |
| `minFontPx` | jede positive Zahl | Lesbarkeits-Untergrenze je Notiz; überschreibt die Plugin-Einstellung |
| `header` | beliebiger Text | Schwebender Header-Slot auf jeder Folie |
| `footer` | beliebiger Text | Schwebender Footer-Slot auf jeder Folie |
| `paginate` | `true` · `yes` · `on` | Seitenanzeige (`n / N`) auf jeder Folie einblenden |

### Folien-Layout & Syntax

Neun Folien-Templates (`default`, `title`, `section`, `quote`, `image-focus`, `two-column`, `columns-3`, `stat`, `cover-image`), kombinierbare Dichte-Modifier (`compact`, `code-heavy`), die Layout- und Spalten-Direktiven sowie die automatische Layout-Erkennung sind im **[Folien-Layouts- & Syntax-Leitfaden](https://codeberg.org/jkaindl/slide-deck/src/branch/main/docs/layouts.de.md)** dokumentiert.

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
5. **Export** — dasselbe theme-isolierte iframe-Artefakt speist alle Export-Wege: die Druck-Pipeline (PDF) und die folienweise `modern-screenshot`-Erfassung (`domToCanvas`) (PNG). Auf dem Desktop wird PDF via `contentWindow.print()` gedruckt; auf Mobilgeräten wird eine eigenständige HTML-Datei in den Vault geschrieben und via `openWithDefaultApp` ans Betriebssystem übergeben.

## Netzwerknutzung (lokale KI)

Der Befehl **Präsentation aus Notiz erzeugen** sendet Notiz-Inhalte an einen **von dir
konfigurierten OpenAI-kompatiblen LLM-Endpoint** (Standard `http://localhost:1234`, also ein
lokales LM Studio). Kein Cloud-Dienst ist beteiligt, solange du den Endpoint nicht auf einen
richtest.

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

## Lizenz

Code: [AGPL-3.0-or-later](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE).
Dokumentation: [CC BY-SA 4.0](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE-DOCS).
Autor: Johannes Kaindl — <https://jkaindl.de>
