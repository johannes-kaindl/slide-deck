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
| M3 | `sd-mermaid-var` trägt bis ins **PNG** | Ordner-Theme mit `pie1 <Probe>` **und** `pieOpacity 1`, exportieren, voll deckende Probe-Pixel im geschriebenen PNG zählen — Gegenprobe ohne die `pieOpacity`-Zeile im selben Punkt. Am DOM wäre er grün, während der Nutzer ein blasses Segment bekommt |
| M4 | `sender:` steht **sichtbar** im Deck | `.sd-slide-sender` trägt den Text **und** hat Breite > 0 (Klasse ohne Regel hinge inert im Baum) — Gegenprobe: eine Notiz ohne die Direktive hat 0 solche Elemente |
| M5 | Theme-eigener Modifier warnt nicht | Ordner-Theme mit `/* sd-modifiers: zzprobe */`, Notiz mit `<!-- layout: default zzprobe -->`: **keine** `.sd-warn-modifier-unknown`-Zeile in der Vorschau — Gegenprobe: dasselbe Theme minus der Zeile erzeugt genau eine |
| B1 | Einstellungen-Tab öffnet | Modal im Hauptfenster **oder** eigenes Settings-Fenster (ab Obsidian 1.13) |
| B2 | Kein roher i18n-Schlüssel in der Oberfläche | Tab-Text gegen `/deck\.[a-z]+\.…/` — `t()` fällt bei unbekanntem Schlüssel auf den Schlüssel zurück, nicht auf EN |
| B3 | Endpunkt-Zeileneditor ist verdrahtet | `.okit-ep-row` im Tab (Kit-Baustein, vendoriert) |
| B4 | Modellfeld-Placeholder ist der übersetzte Satz | ein `input[placeholder]` im Tab trägt exakt `deck.settings.model.placeholder` aus EN oder DE — „ähnlich" wäre ein Kit-Default |
| B5 | KI-Settings-Blöcke stapeln, statt eine Flex-Row zu werden | `display` der `.sd-settings-host`-Elemente **und** die Geometrie ihrer Kinder (verschiedene `top`, gleiche linke Kante) — **mit** Gegenkontrolle, dass ein gewöhnliches `.setting-item` in dieser Obsidian-Version überhaupt `display:flex` ist |
| C1 | Themes-Ordner ist im Explorer ausgeblendet | `display: none` am `.nav-folder-title[data-path=…]` — erst Existenz belegen, dann Eigenschaft |
| C2 | Ausschalten macht ihn wieder sichtbar | dieselbe Messung, invertiert |
| N1 | Bildplatz rendert als `.sd-image-slot` | Deck-iframe einer Notiz mit `slide-image`-Block: genau 1 Slot; Gegenprobe ohne Block: 0 |
| N2 | Nach Klick auf „Generate": Knopf bleibt bedienbar (heilbarer Grund) + Klassen da mit API, Empty-State ohne | mit Stub läuft `runSlot` bis `blocked` (busy) — der Knopf bleibt **aktiv** (heilbare Gründe dürfen keine Sackgasse sein), `.sd-slot-function`/`.sd-slot-prompt` bleiben im DOM; ohne API bricht `readImageApi` sofort ab, die Karte wird Empty-State und trägt laut `renderCard` **keine** der beiden Klassen |
| N2b | Rückschreib-Mechanik: Objektidentität gewahrt | dieselbe Sichern-Stub-Zurückschreiben-Mechanik wie N2s eigenes `finally`, gegen einen synthetischen Wächter statt gegen den (hier immer leeren) echten Vorbestand — mit Wächter muss danach **dasselbe Objekt** (`===`) an der Stelle liegen, ohne Wächter muss der Slot wieder leer sein. Bricht der Vergleich, **wirft** der Punkt statt nur rot zu melden |
| N3 | `is-checking` bewegt sich, `is-ok` steht | `animationName` zweier synthetischer `.sd-slot-status`-Icons (§8-Vokabel, dieselbe wie bei Endpunkt-Status) |
| N4 | Zurückschreiben trifft, unterbleibt bei geändertem Block | `replaceSlot`-Bauart über den echten Vault-Inhalt: Treffer ersetzt den Block durch das Bild-Embed; ein zwischenzeitlich geänderter Block bleibt unberührt |
| D1 | Bilder-Export schreibt die volle Serie | PNG-Dateien > 1 KB im Export-Ordner, Zahl gegen die Folienzahl |
| D2 | Modifier-Klasse überlebt den Export | `customCss` färbt `.sd-mod-sand` in eine Probe-Farbe, die kein Theme trägt; Pixel am linken Rand des PNG von Folie 4 des Regressions-Decks = Probe, das der Nachbarfolie ≠ Probe. Gelesen aus den geschriebenen Dateien (adapter → ImageBitmap), nicht aus dem Export-iframe |

**A8 und D2 fahren gegen `docs/themes/regression-deck.md`.** Der Treiber schreibt den Prüfling zur
Laufzeit als `Regression deck.md` in den Vault und räumt ihn danach in den Papierkorb (`--keep`
lässt ihn liegen). Bewusst keine zweite Kopie im Fixture: der Prüfling hat eine Quelle, und die
Gegenprobe soll die Quelle treffen, nicht einen Stand von gestern.

**B2 ist der Wächter für den Befund von CORE-TEST-04** (`unauthorized` fehlte im Wörterbuch,
die Oberfläche zeigte den Schlüssel und sah aus wie ein plausibler String). Der Typecheck deckt
seither die Endpunkt-Statusklassen ab; **jeder andere** Schlüssel fällt weiterhin nur hier auf.

**B5 misst die Sache, nicht ihr Mittel — und die Gegenprobe hat gezeigt, warum das nötig war.**
`hostFor()` reicht *ein* Setting an einen §8-Block weiter, der darin *mehrere* Zeilen zeichnet.
Obsidians `.setting-item` ist `display:flex; flex-direction:row` — ohne Gegenmaßnahme stünden
Endpunkt-Liste, Modellfeld und Denk-Schalter nebeneinander statt untereinander (das Risiko aus
0.6.0). Die Aufgabe hatte dafür „einen Punkt auf `display`/`flex-direction` des Hosts" verlangt.
**Ein solcher Punkt hätte den benannten Defekt nicht gefunden.**

Gemessen am 2026-09-03 mit drei Sabotagen:

| Weggenommen | B5 | Warum |
|---|---|---|
| nur `removeClass("setting-item")` in `settingBodyHost` (der 0.6.0-Fall) | **grün** | `styles.css` setzt `.sd-settings-host { display: block }` und überschreibt die Flex-Row |
| nur `display: block` aus `styles.css` | grün | die Klasse ist gestrippt, der Host ist ohnehin ein `div` |
| **beides** | **rot** | 3 Hosts `display:flex`, 0 mit gestapelten Kindern |

**Die Blöcke hängen also an zwei unabhängigen Riegeln, nicht an einem.** Das ist keine Schwäche
des Prüfpunkts, sondern eine Eigenschaft des Aufbaus: solange ein Riegel hält, ist die Sache in
Ordnung, und ein roter Punkt wäre falsch. Deshalb misst B5 den **Zustand** („stapeln sie?") statt
eines der beiden Mittel — ein Punkt auf `settingBodyHost` allein wäre bei Sabotage 1 rot geworden,
obwohl die Oberfläche korrekt aussieht, und ein Punkt auf `display` allein wäre dort grün
geblieben, ohne je etwas gemessen zu haben.

⚠️ **Der Umkehrschluss steht auch fest:** ein Ausfall eines einzelnen Riegels bleibt unbemerkt.
Wer `settingBodyHost` entfernt, weil „der Smoke ja grün bleibt", nimmt dem Aufbau die Redundanz,
ohne dass irgendetwas widerspricht — die Doppelung ist Absicht und gehört nicht wegoptimiert.

Die Gegenkontrolle auf das gewöhnliche `.setting-item` ist Pflicht, nicht Zierde: in einer
Obsidian-Version, die es nicht mehr als Flex-Row zeichnet, wäre „Host ist nicht flex" gratis wahr
und der Punkt grün ohne Gegenstand — dasselbe Muster wie bei A3.

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

**M3–M5 (2026-09-05) hängen am selben Gerüst und messen je zwei Fälle in EINEM Punkt.** Das
ist kein Sparen an Prüfpunkten, sondern die Absicherung gegen die Falle vom 2026-09-04: der
Theme-Wechsel zwischen den Fällen läuft über `modify`, und `modify` löst die Neuregistrierung
**nicht** aus. Ohne `refreshThemes()` dazwischen misst der zweite Fall das Theme des ersten,
liefert dieselbe Zahl und ist grün, ohne seinen Gegenstand gesehen zu haben. **Zwei
verschiedene Zahlen im Protokoll sind deshalb der Beleg, dass der Apparat überhaupt wach war** —
identische wären der stille Fehlschlag, egal welches Vorzeichen sie tragen.

Aus demselben Grund löscht M3 das alte PNG, bevor er exportiert: er läuft zweimal über
dieselbe Notiz, und ein Poll auf `exists` + `size` fände beim zweiten Mal sofort das Artefakt
des ersten Laufs (der offene Befund an D1/D2). Nach dem Löschen kann eine gefundene Datei nur
die neue sein.

Jeder der drei stellt seinen Theme-Fall **selbst** her, statt den Stand des Vorgängers zu
erben. Dass das nötig ist, hat der erste Lauf gezeigt: M3s Ja-Fall erbte das Aufräum-Theme aus
M5 und maß ein Segment ohne Probefarbe — 0 Pixel gegen 2.256 in der Gegenprobe. Gefangen hat
es die eingebaute Gegenprobe, weil sie **mehr** lieferte als der Fall, der gewinnen soll.

⚠️ **Der Abschnitt steht vor D, nicht dahinter.** Der Export-Abschnitt setzt eine Probe-Regel
ins `customCss` und räumt sie erst im `finally` des Laufs weg; liefe M danach, färbte sie in
die Messung hinein. Die Probefarben sind zusätzlich verschieden gewählt (`#00838f` gegen
`#d81b60`) — tauchten in einem roten Protokoll zwei Punkte mit derselben Farbe auf, wäre nicht
mehr zu sehen, welcher Weg sie dorthin gebracht hat.

**N steht vor D, aus demselben Grund wie M:** der Export-Abschnitt setzt eine Probe-Regel ins
`customCss` und räumt sie erst im `finally` des Laufs weg; liefe N danach, hätte D bereits
gefärbt, ohne dass N das gebraucht hätte — aber die Reihenfolge ist ohnehin die verbindliche
Konvention für alles, was vor D läuft.

**N2 hat beim ersten Anlauf eine falsche Annahme über die Karte widerlegt.** Die naheliegende
Erwartung — Knopf aktiv, wenn `local-image-generator` registriert ist, Empty-State sonst —
stimmt nicht: `registerSlotCard` startet die Karte **immer** im Zustand `idle` (Knopf aktiv),
unabhängig davon, ob die API existiert. `readImageApi(app)` wird erst gelesen, wenn `runSlot`
läuft — also erst beim Klick auf „Generate". Ein Punkt, der nur den ersten Render liest, hätte
in beiden Fällen „aktiv" gemeldet und wäre am eigenen Gegenstand vorbeigemessen. N2 klickt
deshalb den Knopf und liest danach: mit gestubter API läuft `runSlot` bis `status: "blocked"`
(die Stub-`generate()` liefert `reason: "busy"`) — der Knopf bleibt **aktiv** (Stand seit der
Schluss-Review-Fixwelle, s. u.), die Karte bleibt die volle Ansicht mit
`.sd-slot-function`/`.sd-slot-prompt`; ohne API bricht `readImageApi` synchron ab, die Karte
wird zum Empty-State und trägt laut `renderCard` (früher Return bei `vm.empty`) **keine** der
beiden Klassen. Genau dieser Kontrast ist die vom Review verlangte Klassenprobe „gegen den Fall
ohne API".

⚠️ **N2 erwartete zunächst „gesperrt" statt „aktiv" — das war der Stand VOR der
Schluss-Review-Fixwelle (2026-09-06), nicht ein Fehler des Punkts.** `blocked` sperrte den Knopf
bis dahin dauerhaft, auch bei heilbaren Gründen — ausgerechnet `busy` sagt dem Nutzer „warte, bis
er fertig ist", und wer wartete, hatte danach keinen Knopf mehr; der einzige Ausweg war, die
Notiz komplett neu zu rendern. Der Fix (`slot-card-model.ts`, Fall `blocked`) gibt den Knopf jetzt
frei, genau wie `error` es schon tat. N2 hielt die alte (fehlerhafte) Erwartung fest, bis der
Smoke-Lauf nach der Fixwelle sie als rot meldete — der Punkt hat damit **funktioniert**: er
bewacht jetzt genau die Sackgasse, die gerade behoben wurde, und ein Rücksprung auf „gesperrt"
wäre die Regression.

**Der zweite Treiberfehler beim Bauen von N2: zwei offene Leseansichten teilen sich `document`.**
Ein frisches Blatt pro `knopfZustand`-Aufruf (`getLeaf(true)`) reicht nicht — ohne das alte
vorher abzutrennen, stehen zwei `.sd-slot-card` im DOM, und ein ungescopter
`document.querySelector` griff beim zweiten Aufruf weiterhin die ERSTE (stehengebliebene) Karte.
Beide Fälle meldeten deshalb identisch „gesperrt" — der stille Fehlschlag, den diese Datei an
mehreren Stellen davor warnt. Der Fix: alle Markdown-Blätter abtrennen, bevor das nächste
öffnet, und danach über `blatt.view.containerEl` lesen statt über das globale `document`.

**N2b prüft die Rückschreib-MECHANIK, nicht den zufälligen Vorbestand dieses Vaults.**
`local-image-generator` ist im Staging-Vault nie installiert — ein Punkt, der nur den hiesigen
Vorbestand spiegelt, führt deshalb in jedem Lauf denselben Zweig („war nicht installiert") und
misst den eigentlich schutzbedürftigeren Fall („war installiert → ist danach **dasselbe
Objekt**") in keinem einzigen Durchlauf. Und ein Vergleich auf `!== undefined` allein wäre auch
dann wahr, wenn dort ein **fremdes** Objekt läge — also genau dann, wenn die Wiederherstellung
schiefgegangen ist. Die erste Fassung dieses Punkts hatte beide Lücken.

N2b legt deshalb vor jeder Messung einen synthetischen, eindeutig wiedererkennbaren Wächter an
und fährt zweimal dieselbe Sichern-Stub-Zurückschreiben-Mechanik wie N2s eigenes `finally` (auch
ein Treiber, der einen Stub „unbedingt" löscht statt zurückzuschreiben, zerstört bei jedem, der
das echte LIG installiert hat, dessen Live-Registrierung — der eigene Lauf bliebe grün, der
Schaden entstünde beim Nachbarn): einmal mit Wächter vorher (danach muss exakt **derselbe**
Wächter wieder da sein, `===`, nicht bloß „irgendetwas"), einmal ohne (danach muss der Slot
wieder leer sein). Der echte Vorbestand dieses Vaults wird während der Messung gesichert und
danach zurückgeschrieben — derselbe Sorgfalt, die der Punkt selbst einfordert.

**Bricht der Identitätsvergleich, wirft N2b zusätzlich zum roten `record()`.** Ein misslungenes
Zurückschreiben ist kein Testergebnis, sondern ein Schaden an fremdem Zustand — der Lauf bricht
ab, damit kein nachfolgender Punkt auf einem beschädigten Nachbarplugin-Slot aufbaut. Gegenprobe
(2026-09-05, Fix-Runde 1): die Zurückschreib-Zeile durch ein bedingungsloses `delete` ersetzt →
`mit Waechter: (nichts) · ohne: (nichts)`, rot, und der Lauf brach mit einer eigenen
`Abbruch:`-Meldung ab, **bevor** N3/N4 liefen. Nach Rückbau wieder 5/5.

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
| 2026-09-03 (spät) | 1.14.0 | 19/19 grün (B5 neu) | drei Sabotagen, s. § B5: nur `removeClass` weg → grün (zweiter Riegel hält); nur `display:block` weg → grün; **beide weg → B5 rot** (3 Hosts flex, 0 gestapelt). Der in der Aufgabe benannte Defekt allein macht den Punkt nicht rot — und soll es nicht |
| 2026-09-05 (3) | 1.14.0 | **22/22 grün** nach dem D1/D2-Fix (`leereExport` vor jedem Export) | **drei Läufe, beide Punkte einzeln belegt** — D2 misst nach Farbwechsel die neue Farbe; ohne Löschung meldet er die Farbe des Vorlaufs (rot); D1 zählt mit einem untergeschobenen sechsten PNG sechs statt fünf, bei noch laufendem Export (rot). Der Verdacht aus der Task war damit erstmals **am Treiber** gemessen, nicht am Ad-hoc-Skript |
| 2026-09-05 (2) | 1.14.0 | **22/22 grün** (M3, M4, M5 neu) | **in jedem Punkt eingebaut**, statt als eigener Sabotage-Lauf: M3 696.483 volle Probe-Pixel gegen 2.256, M4 1 Slot mit 162 px gegen 0 Elemente, M5 0 `modifier-unknown` gegen 1. Dazu eine ungeplante echte Gegenprobe — der erste Lauf war rot an M3 (0 gegen 2.256), weil der Ja-Fall sein Theme nicht selbst stellte; der Punkt hat seinen eigenen Treiberfehler gemeldet |
| 2026-09-05 | 1.14.0 | 19/19 grün gegen `deck-core` 0.10.0 (keine neuen Punkte) | **keine** — der Lauf belegt ein Vendoring, keinen neuen Prüfpunkt. Die vier Zusagen von 0.9.0/0.10.0 sind stattdessen einzeln am Kern gemessen (`modifiers:` deckweit, `sender:` kommt an, `footer:` dahinter leckt nicht, `bildfolie cover` meldet nichts) und die Consumer-Naht als vitest-Test **mit** Gegenprobe abgesichert (`tests/adapter.test.ts` § Consumer-Kette) |
| 2026-09-05 (4) | 1.14.0 | **27/27 grün** (N1, N2, N2b, N3, N4 neu, Abschnitt `bild`) | **in jedem Punkt eingebaut**: N1 1 Slot gegen 0; N2 „gesperrt (funktion=true prompt=true)" mit API gegen „leer (funktion=false prompt=false)" ohne; N2b (erste Fassung, seither ersetzt — s. Zeile darunter) Vorzustand des Nachbarplugins vorher/nachher identisch; N3 `checking=sd-spin` gegen `ok=none`; N4 „ersetzt" gegen „unberuehrt" bei geändertem Block. Baseline direkt davor (unveränderter Treiber) lief bereits 22/22 grün — die Umgebung selbst war also nicht die Fehlerquelle. Zwei Treiberfehler unterwegs gefangen, s. § oben: N2s Annahme über den initialen Kartenzustand (Klick nötig, kein reiner Render-Vergleich) und zwei offene Leseansichten, die sich `document` teilten |
| 2026-09-05 (5, Fix-Runde 1) | 1.14.0 | **27/27 grün** (N2b neu gebaut: Wächter-Objekt + Identitätsvergleich + Abbruch bei Bruch) | N2b „mit Waechter: Waechter (identisch) · ohne: (nichts)" — zwei unterscheidbare Werte, beide Zweige jetzt in EINEM Lauf gemessen. Gegenprobe: Rückschreib-Zeile durch bedingungsloses `delete` ersetzt → „mit Waechter: (nichts) · ohne: (nichts)", rot, **und der Lauf brach ab** (`Abbruch: N2b: Rueckschreib-Mechanik verletzt Objektidentitaet …`), bevor N3/N4 liefen. Nach Rückbau wieder 5/5 (Abschnitt) bzw. 27/27 (voller Lauf) |
| 2026-09-06 (Fix-Runde 2) | 1.14.0 | **27/27 grün** (N2-Erwartung nachgezogen: „aktiv" statt „gesperrt") | Die Schluss-Review-Fixwelle behob eine echte Sackgasse (`blocked` sperrte den Knopf dauerhaft, auch bei heilbaren Gründen wie `busy`) — N2 wurde dadurch rot, weil sein `record()` noch „gesperrt" erwartete. Kein Abschwächen: die Erwartung wurde auf das neue, richtige Verhalten gezogen. Protokollzeile danach: „aktiv (funktion=true prompt=true) · leer (funktion=false prompt=false)" — weiterhin zwei unterscheidbare Werte |

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

### Warum D1 und D2 vor dem Export löschen (2026-09-05)

Beide warten auf ihr Artefakt mit `exists` + `size > 1024`. **Beides erfüllt eine Datei des
Vorlaufs sofort** — der Poll kehrt zurück, bevor der laufende Export geschrieben hat, und der
Prüfpunkt misst den alten Stand. Der Treiber räumt zwar am Ende auf, aber genau dann nicht,
wenn es darauf ankommt: bei `--keep`, nach einem Abbruch (der Aufräum-Block hängt an
`.catch`) oder wenn eine Datei dem Index fehlt. `leereExport(ordner)` löscht deshalb vorher;
danach kann eine gefundene Datei nur die neue sein.

**Bis zum 2026-09-05 war das ein Verdacht, kein Befund** — gemessen worden war es an einem
Ad-hoc-Skript gleicher Bauart, nicht am Treiber. Jetzt ist es am Treiber gemessen, in beiden
Punkten einzeln:

| Gegenprobe | Aufbau | Ergebnis |
|---|---|---|
| **D2** | Lauf A mit Probe-Farbe `#d81b60` und `--keep`, dann Farbe auf `#2e7d32`, Lauf B | **mit** Löschung meldet B `rgb(46,125,50)` — die neue Farbe, also frisch exportiert |
| **D2 ohne Löschung** | Farbe zurück auf `#d81b60`, `leereExport` ausgebaut | **rot**: gemeldet wird `rgb(46,125,50)`, die Farbe aus Lauf B. Der Punkt las die alte Datei |
| **D1 ohne Löschung** | ein sechstes PNG in den Zielordner kopiert | **rot**: „6 PNG > 1 KB", und die Meldung stand noch auf „Exportiere…" — der Poll kehrte zurück, **während** der Export lief |

⚠️ **Die harmlose Richtung ist die, die man sieht.** In allen drei Fällen wurde der Punkt rot,
weil die Gegenprobe die Farbe bzw. die Dateizahl absichtlich verschoben hat. Im Alltag
verschiebt sie niemand: derselbe Treiber, dieselbe Probe-Farbe, ein liegengebliebenes
Artefakt — dann ist der Punkt **grün** und hat den aktuellen Build nie gesehen. Genau das war
im D1-Lauf nebenbei zu sehen: D2 stand dort auf grün, obwohl seine Löschung noch ausgebaut
war, weil die alte Datei zufällig dieselbe Farbe trug.

**Negativbefund zu den Nachbarn (2026-09-05, gemessen):** `llm-lab` und `vault-rag` tragen die
Bauart **nicht**. llm-labs Poll wartet auf eine frisch erzeugte `id` im Dateiinhalt — das ist
das empfohlene Gegenmittel, nicht die Falle; sein `exists` ist nur ein Vorfilter. vault-rag
hat überhaupt keinen Artefakt-Poll (die Größenschwelle dort wählt eine **bestehende** Notiz
aus). Der Verdacht aus der Task ist damit ausgeräumt, kein Zeiger nötig.

### Was am 2026-09-05 nachgezogen wurde — und was die Lücke lehrte

Bis zu diesem Tag standen hier drei Fähigkeiten ohne Prüfpunkt: `sd-mermaid-var` (0.7.0),
`sender:` und `sd-modifiers` (0.9.0/0.10.0). Jede war zum Zeitpunkt ihres Baus vorbildlich
belegt — Pixelprobe, Kern-Messung, vitest mit Gegenprobe — und keine war **bewacht**. Sie sind
jetzt M3, M4 und M5.

**Die Fehlerklasse ist größer als die drei Fälle: „belegt ist nicht bewacht."** Ein Beleg ist
eine Momentaufnahme, ein Prüfpunkt die Dauerbewachung. Drei Features in zwei Tagen sind so
durchgerutscht, jedes an einer Stelle, an der die Sorgfalt sichtbar hoch war — die Lücke
entsteht nicht aus Nachlässigkeit, sondern daraus, dass ein guter Beleg sich wie ein
Abschluss anfühlt. **Wer eine Fähigkeit belegt, hat sie noch nicht bewacht**; das nächste
Vendoring kann sie brechen, ohne dass etwas widerspricht.

Der praktische Merksatz für den nächsten Ausbau: **eine neue Zusage von `deck-core` ist erst
fertig, wenn sie einen Prüfpunkt hat, dessen Gegenprobe im selben Punkt sitzt.** Zwei
verschiedene Zahlen im Protokoll — nicht eine grüne — sind der Beleg dafür, dass gemessen
wurde.
