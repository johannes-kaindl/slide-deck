# Folien-Layouts & Syntax

Referenz für die Folien-Layouts des **Slide Deck**-Plugins — die Templates, die Dichte-Modifier,
die Layout-/Spalten-Direktiven und wie das Layout abgeleitet wird, wenn du keins setzt. Für
Deck-weite Einstellungen (Theme, Seitenverhältnis, Header-/Footer-/Paginierungs-Slots, der
Folien-Trenner) siehe die [README](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.de.md).

> **`---` ist immer der Folien-Trenner** (Marp-Konvention) — es rendert nie als
> Trennlinie innerhalb einer Folie. Für eine sichtbare Linie `***`, `___` oder ein
> literales `<hr>` verwenden (die HTML-Form übersteht Markdown-Linter, die
> Linien-Marker zu `---` normalisieren).

## Layout wählen

Füge am Anfang einer Folie einen HTML-Kommentar ein, um das Template zu wählen, und nutze einen
Spalten-Kommentar, um Bereiche in Mehrspalten-Templates zu trennen:

```markdown
<!-- layout: two-column -->

## Linke Überschrift

- Punkt eins
- Punkt zwei

<!-- column -->

![Ein Bild rechts](anhang.png)
```

## Templates

| Wert | Beschreibung |
|---|---|
| `default` | Standard-Inhaltsfolie (Überschrift + Body); das implizite Layout |
| `title` | Zentrierte Titelfolie mit großer Überschrift und Untertitel |
| `section` | Vollflächiger Abschnittstrenner mit einer einzelnen großen Überschrift |
| `quote` | Zentriertes Blockzitat mit Quellenangabe |
| `image-focus` | Ein einzelnes Bild oder Diagramm, einpassend skaliert und zentriert |
| `two-column` | Zwei Spalten, getrennt durch `<!-- column -->`; eine führende Überschrift spannt über beide |
| `columns-3` | Drei Spalten, getrennt durch `<!-- column -->`; eine führende Überschrift spannt über alle |
| `stat` | Eine große Zahl/Aussage mit kurzer Bildunterschrift |
| `cover-image` | Das erste Bild wird zum vollflächigen Hintergrund mit Scrim und überlagertem Titel |

## Automatische Layout-Erkennung

Ohne `<!-- layout -->`-Direktive wird das Layout aus dem Inhalt der Folie abgeleitet:

- eine einzelne Überschrift → `section`
- ein einzelnes Blockzitat → `quote`
- ein einzelnes Bild oder Diagramm → `image-focus`
- zwei Bereiche (ein `<!-- column -->`) → `two-column`
- drei oder mehr Bereiche → `columns-3`
- sonst → `default`

Eine explizite `<!-- layout -->`-Direktive überschreibt die Erkennung immer.

## Dichte-Modifier

Hänge `compact` und/oder `code-heavy` an dieselbe Direktive an, um die Dichte zusätzlich zu jedem
Template anzupassen — sie kombinieren miteinander und mit jedem Layout:

```markdown
<!-- layout: two-column compact -->
```

| Modifier | Wirkung |
|---|---|
| `compact` | Engere Typografie und Abstände — passt mehr Inhalt hinein, bevor die Folie überläuft |
| `code-heavy` | Kleinere Code-Blöcke — für Folien, die von Fenced-Code dominiert werden |
