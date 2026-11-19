# Folien-Layouts & Syntax

Referenz für die Folien-Layouts des **Slide Deck**-Plugins — die Templates, die Dichte-Modifier,
die Layout-/Spalten-Direktiven und wie das Layout abgeleitet wird, wenn du keins setzt. Für
Deck-weite Einstellungen (Theme, Seitenverhältnis, Header-/Footer-/Paginierungs-Slots, der
Folien-Trenner) siehe die [README](https://github.com/johannes-kaindl/slide-deck/blob/main/README.de.md).

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
| `agenda` | Nummeriertes Inhaltsverzeichnis: Mono-Indizes, Haarlinien-Zeilen, eine Meta-Angabe am Zeilenende |
| `threads` | Raster aus vier nummerierten Karten |
| `closing` | Abschluss: große Serifenzeile, Kontaktzeilen in Mono |

### `agenda`, `threads`, `closing`

Diese drei stammen aus den Folien-Spezimen von Traces. Jedes nimmt einen `# Titel` und eine `## Eyebrow` (im Quelltext nach dem Titel, angezeigt darüber, wie bei den Hero-Layouts) und liest eine Liste auf feste Weise. Die eingebauten Themes `kogane` und `kami` legen auf einer `closing`-Folie zusätzlich einen Schleier über die rechte Seite des Hintergrunds. Beispiel-Deck: `docs/themes/traces-layouts-deck.md`.

| Layout | Welche Liste es liest |
|---|---|
| `agenda` | eine nummerierte Liste; ein Inline-Code am Ende eines Punkts (`` `5 min` ``) ist die Meta-Angabe rechts |
| `threads` | eine nummerierte Liste; jeder Punkt beginnt mit `**Kartentitel**`, danach der Text |
| `closing` | eine Aufzählung aus Kontaktzeilen `**Schlüssel** Wert` |

## Überschriftsebenen

Der Folientitel ist die `#`-Überschrift; die `##` darüber oder darunter ist der Kicker (Eyebrow). Beginnen deine Notizen bei `##` (etwa weil ein Obsidian-Linter den Notiztitel als `#` behält), wird ein Deck **ohne jede `#`-Überschrift** eine Ebene höher gelesen: `##` ist der Titel, `###` der Kicker. Das gilt für das ganze Deck: eine einzige `#` irgendwo (etwa `# Danke` auf der letzten Folie) lässt überall die bisherige Lesart gelten, damit ein gemischtes Deck nicht zur Hälfte verrutscht. Beispiel: `docs/themes/h2-deck.md`.

## Bilder und ihre Größe

`![[bild.png]]` und `![Bild](bild.png)` füllen den freien Platz der Folie. Obsidians Größen-Syntax setzt stattdessen eine feste Größe:

| Geschrieben | Ergebnis |
|---|---|
| `![[icon.svg\|48]]` | 48 px breit, Höhe folgt |
| `![[icon.svg\|48x30]]` | 48 × 30 px |
| `![[icon.svg\|Alt-Text]]` | normales Bild, `Alt-Text` als Alt-Text |

Ein Bild mit Größe bleibt in der Textzeile (ein 48-px-Symbol neben einem Wort) und behält allein auf einer Folie seine Größe, statt die Folie zu füllen. In einer Tabellenzelle schreibst du `\|` wie üblich; der Backslash gehört zur Tabellensyntax und wird ignoriert. `![[…]]` in Inline-Code, in einem Codeblock oder einem `~~~`-Zaun bleibt Text.

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
