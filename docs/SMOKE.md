# GUI-Smoke — Checkliste

Was gegen ein **laufendes** Obsidian geprüft wird, weil die vitest-Suite es strukturell nicht
kann: sie läuft mit `environment: "node"` — kein DOM, kein iframe, keine Schrift-Metriken.
Alles zwischen „das Deck ist geparst" und „die Folie steht im Fenster" ist dort unsichtbar.

**Automatisiert:** `npm run smoke:gui -- --vault slide-deck` (`scripts/gui-smoke.ts`).
**Von Hand bleibt**, was ein Treiber nicht entscheiden kann — unten in § Hand-Runde.

## Vorbereitung

```bash
npm run build
npm run shots:obsidian -- --setup      # Staging-Vault aus docs/images/fixture/ bauen
```

Der Vault heißt `slide-deck` und liegt unter `$STAGING_VAULTS_DIR`. Er ist Wegwerfware: verloren
heißt neu gebaut. Ein Lauf gegen den Arbeitsvault ist **kein** Ersatz — dort liegt der
Store-Build statt des Repo-Stands, und `manifest.version` sieht den Unterschied nicht (beide
tragen dieselbe Nummer). Der Treiber prüft die Herkunft deshalb per sha1, bevor er misst.

⚠️ **Vor dem Lauf: wer hängt sonst an Obsidian?** Dieser Smoke braucht keinen Neustart — läuft
schon eine Instanz mit Debug-Port, wird sie mitgenutzt. Fehlt nur der Vault, öffnet ihn ein
zusätzliches Fenster derselben Instanz (`open "obsidian://open?vault=slide-deck"`; kennt Obsidian
den frisch gebauten Vault noch nicht, `…?path=<datei im vault>` nehmen). Und: den CDP-Lock
nehmen, sonst blockt der Guard den ersten Treiber-Aufruf.

## Automatisierte Prüfpunkte

| # | Prüfpunkt | Misst |
|---|---|---|
| A1 | Vorschau öffnet in der rechten Seitenleiste | `leaf.getRoot() === rightSplit` — nicht „View existiert" |
| A2 | Deck rendert im isolierten iframe | `.sd-slide`-Zahl im `contentDocument` gegen die Fixture-Folienzahl |
| A3 | Vault-Theme erreicht die Folien nicht | Hintergrundfarbe der Folie bei getauschter Body-Theme-Klasse — **mit** Gegenkontrolle, dass die Elternfarbe wechselt |
| A4 | Code-Hervorhebung erreicht den iframe | hljs-Token-Farbe ≠ Fließtextfarbe (Fremd-CSS kommt über `deckCss` an) |
| A5 | Overflow wird gewarnt, nicht beschnitten | `.sd-warn` vorhanden **und** mit Formzeichen (▲/●/ℹ) — Bedeutung nicht nur über Farbe (WCAG 1.4.1) |
| A6 | Theme-Dropdown wirkt sofort und ephemer | Folienfarbe ändert sich **und** die Frontmatter der Notiz bleibt unangetastet |
| B1 | Einstellungen-Tab öffnet | Modal im Hauptfenster **oder** eigenes Settings-Fenster (ab Obsidian 1.13) |
| B2 | Kein roher i18n-Schlüssel in der Oberfläche | Tab-Text gegen `/deck\.[a-z]+\.…/` — `t()` fällt bei unbekanntem Schlüssel auf den Schlüssel zurück, nicht auf EN |
| B3 | Endpunkt-Zeileneditor ist verdrahtet | `.okit-ep-row` im Tab (Kit-Baustein, vendoriert) |
| C1 | Themes-Ordner ist im Explorer ausgeblendet | `display: none` am `.nav-folder-title[data-path=…]` — erst Existenz belegen, dann Eigenschaft |
| C2 | Ausschalten macht ihn wieder sichtbar | dieselbe Messung, invertiert |
| D1 | Bilder-Export schreibt die volle Serie | PNG-Dateien > 1 KB im Export-Ordner, Zahl gegen die Folienzahl |

**B2 ist der Wächter für den Befund von CORE-TEST-04** (`unauthorized` fehlte im Wörterbuch,
die Oberfläche zeigte den Schlüssel und sah aus wie ein plausibler String). Der Typecheck deckt
seither die Endpunkt-Statusklassen ab; **jeder andere** Schlüssel fällt weiterhin nur hier auf.

## Hand-Runde (bewusst nicht automatisiert)

- **PDF-Export (Desktop):** `contentWindow.print()` öffnet einen modalen Systemdialog — der
  blockiert jede weitere CDP-Nachricht. Der Treiber protokolliert den Punkt als übersprungen,
  damit die Lücke nicht wie Abdeckung aussieht.
- **PDF-Export (Mobile):** schreibt HTML in den Export-Ordner und übergibt an
  `openWithDefaultApp`. Braucht ein Gerät.
- **Ästhetik:** Ränder, Zeilenfall, Kontrast — „sieht gut aus" ist kein Prüfpunkt. Dafür sind
  `npm run visual-smoke` und `docs/themes/regression-deck.md` da.

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-09-02 | 1.13.7 | 12/12 grün (Vault `slide-deck`, Plugin 0.9.0) | 9/12 — A5, B2, C1 rot wie erwartet, kein weiterer fiel mit; nach Rückbau wieder 12/12 |

### Was die erste Gegenprobe gefunden hat — im Werkzeug, nicht im Prüfling

Drei Defekte wurden eingebaut (Formzeichen der Warnung entfernt, einen i18n-Schlüssel aus EN+DE
gelöscht, `buildHideCss` auf leer). A5 und C1 wurden rot, **B2 blieb grün** — und die
naheliegende Erklärung („der Schlüssel wird an der Stelle wohl gar nicht angezeigt") war falsch:
er stand sichtbar im Tab, die Suche fand ihn nur nicht.

**Ursache: `\b` in einem Regex gegen `textContent`.** Die Texte benachbarter DOM-Knoten werden
ohne Trenner aneinandergeklebt; im Settings-Tab steht deshalb `…-Keysettings.themesFolder.name`,
und zwischen "y" und "s" ist keine Wortgrenze. Der Prüfpunkt war grün, während der Defekt im
Fenster sichtbar war — die Fehlerklasse, die kein Wiederholen des Laufs je findet.

Zwei weitere Treiberfehler fielen schon beim Bauen auf, bevor sie einen Lauf kosteten: der
Bilder-Export schreibt nach `<exportFolder>/<Notizname>/` statt flach in den Ordner, und er
schreibt über `adapter.writeBinary` — Obsidians Datei-Index kennt die PNG erst verzögert, ein
Prüfpunkt über `getAbstractFileByPath` hätte die Indizierung gemessen statt den Export.
