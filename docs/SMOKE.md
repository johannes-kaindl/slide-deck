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
| A6 | Overflow-Folie trägt den roten Streifen, Warnzeile den Schwere-Namen als `title` | `inset`-box-shadow an der Folie im iframe (Effekt, nicht Klasse) **und** `title` der `error`-Zeile = `warn.severity.error` aus EN oder DE |
| A7 | Theme-Dropdown wirkt sofort und ephemer | Folienfarbe ändert sich **und** die Frontmatter der Notiz bleibt unangetastet |
| A8 | Eigener Layoutname: Hinweiszeile, aber kein Streifen | Regressions-Deck Folie 5 (`<!-- layout: tagesordnung -->`): keine `sd-slide-warn*`-Klasse, kein `inset`-Schatten, **und** eine `info`-Zeile für `#5` mit `title` = `warn.severity.info` — fehlt die Zeile, hat der Punkt keinen Gegenstand |
| M1 | Ordner-Theme färbt Mermaid über seine Tokens | Füllfarbe der Knoten im **gerenderten SVG** (`getComputedStyle`, nicht das CSS) = Probefarbe des Themes — Mermaid inlined seine Farben, eine CSS-Regel erreicht sie nicht |
| M2 | Eine `sd-mermaid`-Angabe schlägt die Ableitung | dieselbe Messung mit `/* sd-mermaid: dark */` in der Theme-Datei: Füllung ≠ Probefarbe (`mermaidPinned`) |
| B1 | Einstellungen-Tab öffnet | Modal im Hauptfenster **oder** eigenes Settings-Fenster (ab Obsidian 1.13) |
| B2 | Kein roher i18n-Schlüssel in der Oberfläche | Tab-Text gegen `/deck\.[a-z]+\.…/` — `t()` fällt bei unbekanntem Schlüssel auf den Schlüssel zurück, nicht auf EN |
| B3 | Endpunkt-Zeileneditor ist verdrahtet | `.okit-ep-row` im Tab (Kit-Baustein, vendoriert) |
| B4 | Modellfeld-Placeholder ist der übersetzte Satz | ein `input[placeholder]` im Tab trägt exakt `deck.settings.model.placeholder` aus EN oder DE — „ähnlich" wäre ein Kit-Default |
| C1 | Themes-Ordner ist im Explorer ausgeblendet | `display: none` am `.nav-folder-title[data-path=…]` — erst Existenz belegen, dann Eigenschaft |
| C2 | Ausschalten macht ihn wieder sichtbar | dieselbe Messung, invertiert |
| D1 | Bilder-Export schreibt die volle Serie | PNG-Dateien > 1 KB im Export-Ordner, Zahl gegen die Folienzahl |
| D2 | Modifier-Klasse überlebt den Export | `customCss` färbt `.sd-mod-sand` in eine Probe-Farbe, die kein Theme trägt; Pixel am linken Rand des PNG von Folie 4 des Regressions-Decks = Probe, das der Nachbarfolie ≠ Probe. Gelesen aus den geschriebenen Dateien (adapter → ImageBitmap), nicht aus dem Export-iframe |

**A8 und D2 fahren gegen `docs/themes/regression-deck.md`.** Der Treiber schreibt den Prüfling zur
Laufzeit als `Regression deck.md` in den Vault und räumt ihn danach in den Papierkorb (`--keep`
lässt ihn liegen). Bewusst keine zweite Kopie im Fixture: der Prüfling hat eine Quelle, und die
Gegenprobe soll die Quelle treffen, nicht einen Stand von gestern.

**B2 ist der Wächter für den Befund von CORE-TEST-04** (`unauthorized` fehlte im Wörterbuch,
die Oberfläche zeigte den Schlüssel und sah aus wie ein plausibler String). Der Typecheck deckt
seither die Endpunkt-Statusklassen ab; **jeder andere** Schlüssel fällt weiterhin nur hier auf.

**M ist der einzige Beleg, den `deck-core` nicht selbst führen kann.** `mermaidVarsFromDocument`
hängt eine `.sd-slide`-Sonde ins Deck-Dokument und liest die Tokens per `getComputedStyle` —
ohne Browser gibt es nichts zu messen, und `vitest` läuft dort wie hier mit
`environment: "node"`. Der Abschnitt stellt seinen Gegenstand selbst her: er legt ein
Ordner-Theme (`zz-mermaid-probe.css`) und eine Prüfnotiz an und räumt beide in den Papierkorb.
Zwei Eigenschaften der Theme-Datei sind Absicht — die Farbe kommt über eine `var()`-Kette, und
`--sd-surface` ist zweimal deklariert. Genau daran wäre der billigere Weg gescheitert, der bei
der Entscheidung zur Wahl stand (Regex im Pure-Core): er hätte den Literaltext
`var(--probe-akzent)` an Mermaid gereicht. **Der Punkt misst damit nicht nur, dass die
Ableitung wirkt, sondern den Fall, für den sie so gebaut wurde.**

M2 ist nicht die Gegenprobe zu M1, sondern ein eigener Gegenstand: ohne ihn wäre M1 auch dann
grün, wenn die Ableitung eine ausdrückliche Theme-Entscheidung überstimmt — der Defekt, den
`deck-core` 0.6.0 hatte und 0.6.1 behob. Beide Punkte sind einzeln sabotiert worden
(Token-Sonde tot → nur M1 rot; `mermaidPinned` ignoriert → nur M2 rot), s. § Durchläufe.

⚠️ **Der Abschnitt steht vor D, nicht dahinter.** Der Export-Abschnitt setzt eine Probe-Regel
ins `customCss` und räumt sie erst im `finally` des Laufs weg; liefe M danach, färbte sie in
die Messung hinein. Die Probefarben sind zusätzlich verschieden gewählt (`#00838f` gegen
`#d81b60`) — tauchten in einem roten Protokoll zwei Punkte mit derselben Farbe auf, wäre nicht
mehr zu sehen, welcher Weg sie dorthin gebracht hat.

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
| 2026-09-03 | 1.13.7 | 16/16 grün (A6, A8, B4, D2 neu) | zwei Läufe: G1 (Streifen nach Anzahl statt Schwere, Modifier verworfen, Placeholder leer) → 13/16, rot A8, B4, D2; G2 (`title` der Warnzeile leer) → 14/16, rot A6, A8. Kein weiterer fiel mit; nach Rückbau 16/16 |
| 2026-09-03 (abends) | 1.14.0 | 18/18 grün gegen `deck-core` 0.6.2 (M1, M2 neu) | zwei Läufe mit `--section mermaid`: G1 (`mermaidVarsFromDocument` → `return undefined`) → nur M1 rot, Füllung `rgb(236,236,255)` (Mermaid-Default); G2 (`mermaidPinned` ignoriert) → nur M2 rot, Füllung = Probefarbe. Jeder Punkt an seinem eigenen Gegenstand; nach Rückbau 18/18 |

### Warum M überhaupt gebraucht wurde — und was der erste Anlauf kostete (2026-09-03)

Der Abschnitt entstand als **Beleg für vendorierten Kern-Code**: `deck-core` 0.6.2 brachte die
Token-Ableitung mit, konnte sie aber nicht belegen (kein laufendes Obsidian). Der erste Anlauf
lief als Ad-hoc-Treiber neben dem Repo — und **seine Sabotage-Gegenprobe blieb grün.**

Nicht der Prüfpunkt war schuld, sondern der Aufbau: Obsidian hielt den Bundle im Speicher, der
beim Öffnen des Fensters geladen worden war. Der Treiber schrieb die neue `main.js` und maß die
alte; der eingebaute Defekt lief nie. Erst `disablePlugin`/`enablePlugin` vor der ersten Messung
ließ ihn durchschlagen.

**Die allgemeine Form davon ist unangenehmer, als sie klingt:** `requireEigenerBuild` prüft die
deployte `main.js` per sha1 gegen die im Repo. Das belegt die **Herkunft** des Builds — nicht,
dass der laufende Prozess ihn geladen hat. Beide Aussagen klingen wie „der Lauf misst meinen
Stand", geprüft wird nur eine. `scripts/gui-smoke.ts` lädt deshalb neu und druckt „frisch
geladen"; wer einen Treiber daneben baut, erbt diese Zeile nicht. In `_docs/LESSONS.md`
(2026-09-03, calendar-notes) festgehalten, dort mit einem zweiten Fall aus einem anderen Repo.

### Was der erste Lauf von B4 gefunden hat — wieder im Werkzeug (2026-09-03)

B4 war beim ersten Lauf rot: kein `input[placeholder]` im Tab trug den Modell-Satz. Die
naheliegende Lesart „das Plugin hat den Placeholder verloren" war falsch. Der Placeholder gehört
zum **Freitext-Fallback**, und der existiert nur, solange kein Endpunkt Modelle liefert — sobald
die Probe zurück ist, wird das Feld zum Dropdown, am globalen Feld wie in der Kit-Zeile. Auf dem
Maintainer-Rechner antwortet LM Studio auf `:1234`, also gab es im Tab schlicht kein Textfeld.
Der Punkt stellt den Offline-Fall seither selbst her (Endpunkt auf einen toten Port, Tab neu
öffnen, danach zurückstellen). Die Lehre ist dieselbe wie bei A3: **ein Prüfpunkt muss seinen
Gegenstand herstellen, nicht voraussetzen** — was er misst, darf nicht davon abhängen, welche
Dienste auf dem Rechner gerade laufen.

Ebenfalls im Werkzeug, aber vor dem ersten Lauf gefangen: ein `\b` vor `sd-slide-warn` im
Klassen-Regex hätte auch `sd-slide-warn-soft` getroffen — der Bindestrich ist eine Wortgrenze.
Für Klassenlisten gilt `(^|\s)name(\s|$)`, nicht `\b`.

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
