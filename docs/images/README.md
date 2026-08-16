# Aufnahme-Vertrag — README-Bilder

Dieser Ordner hält die Bilder, die `README.md` und `README.de.md` einbetten. Diese Datei ist
der **Vertrag** dafür: welche Bilder es gibt, was jedes zeigen muss, in welcher Klasse es
steht — und wie man sie reproduzierbar neu aufnimmt.

Geprüft wird der Vertrag automatisch: `npm run shots:check` gleicht **Vertrag ↔ Dateien ↔
README-Einbettungen** in alle Richtungen ab. Ein Eintrag ohne Datei, eine Datei ohne Eintrag
und eine Einbettung ohne Vertragszeile sind je ein Befund.

## Zwei Wege, und warum sie getrennt sind

Die Folien entstehen in `deck-core` — parsen, Theme auflösen, rendern, Fit messen. Obsidian
kommt dabei nicht vor. Deshalb braucht die Mehrheit der Bilder **kein laufendes Obsidian**:

| Weg | Kommando | Was daraus entsteht |
|---|---|---|
| **A — Headless Chrome** | `npm run shots` | Alles, was nur Folien zeigt. Läuft überall, in Sekunden, ohne Vault. |
| **B — laufendes Obsidian (CDP)** | `npm run shots:obsidian` | Nur, was Obsidians eigene Oberfläche im Bild braucht. |

Weg A rendert durch **dieselbe Pipeline wie das Plugin** (`parseDeck` → `buildIsolatedDeck`),
nicht durch einen Nachbau — ein Bild zeigt also, was der Nutzer sieht. Jedes Theme bekommt
sein eigenes iframe, weil `deckCss` `.sd-slide` global deklariert und neun Themes auf einer
Seite einander sonst überschreiben. Das ist derselbe Isolationsmechanismus, den Vorschau und
Export benutzen.

## Die Bilder

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` | Eine `two-column`-Folie im Default-Theme `shiro`: Aufzählung, Inline-Code, KaTeX-Mathe und ein Bild, das seine Region füllt. Das Bild, an dem man in fünf Sekunden sieht, was das Plugin macht. |
| `preview-pane.png` | feature | `README.md`, `README.de.md` | Obsidian mit der Notiz links und der Vorschau rechts: Theme-Dropdown, Herkunftszeile `from frontmatter`, Refresh, `Export: PDF / Images`, Kopfzeile und Paginierung `1 / 5` auf den Folien. |
| `themes.png` | feature | `README.md`, `README.de.md` | Alle **neun** eingebauten Themes als 3×3-Raster mit Namen: `shiro`, `kuro`, `sumi`, `kairo`, `kurenai` und die vier `crimson`-Modi. Dieselbe Folie in jedem — nur Farbe, Schrift und Akzent unterscheiden sich. |
| `layouts.png` | feature | `README.md`, `README.de.md` | Alle **neun** Templates als 3×3-Raster mit Namen: `title`, `section`, `quote`, `image-focus`, `two-column`, `columns-3`, `stat`, `cover-image`, `default`. |
| `callouts.png` | feature | `README.md`, `README.de.md` | Alle fünf Callout-Typen mit Rahmenfarbe **und** geometrischer Form **und** Label-Wort (WCAG 1.4.1 — nie Farbe allein). |
| `overflow-warning.png` | feature | `README.md`, `README.de.md` | Fit-or-warn: die Warnzeile `#1 — Content overflows at the legibility floor — condense this slide.` über der rot markierten Folie. Der angeschnittene Text am unteren Folienrand ist **kein Zuschnittfehler**, sondern das `overflow:hidden` der Folie — genau der Zustand, den die Warnung meldet. |
| `settings.png` | detail | `README.md`, `README.de.md` | Der vollständige Einstellungen-Tab inklusive der Liste aller gültigen Theme-Schlüssel und des KI-Abschnitts. Zu hoch für die Textspalte (H/B 2.05), deshalb als Vorschaubild aus `thumbs/` mit Klick auf die Vollauflösung. |

## Aufnahme

### Weg A — ohne Obsidian

```bash
npm run shots                 # alle vier Bilder
npm run shots layouts         # nur eines
```

Quelle sind die Decks in `fixture/` (`hero.md`, `callouts.md`, `theme-sample.md`,
`layouts.md`) und `fixture/assets/demo-chart.svg`. Das Rezept — welches Bild aus welchem Deck
in welchen Themes entsteht — steht in `scripts/shots.mjs` unter `SHOTS`.

Einträge mit Präfix `_` sind **Diagnose**, keine Auslieferung; sie laufen nur, wenn man sie
ausdrücklich nennt (`npm run shots _cover-check`).

### Weg B — mit Obsidian

```bash
export STAGING_VAULTS_DIR="/pfad/zu/StagingVaults"
npm run build
npm run shots:obsidian -- --setup     # Aufnahme-Vault bauen
# Obsidian NEU STARTEN:
#   pkill -x Obsidian
#   open -a Obsidian --args --remote-debugging-port=9222
npm run shots:obsidian                # aufnehmen
npm run shots:obsidian -- --only settings
```

Der Vault entsteht vollständig aus `fixture/notes/` und `fixture/obsidian/` — er ist
Wegwerfware. Nur `slide-deck` ist darin aktiv, sonst malen fremde Ribbon-Icons ins Bild.

## Fallstricke, die je einen Anlauf gekostet haben

Alle gemessen am 2026-08-16, alle von der Sorte *„der Lauf meldet Erfolg, das Ergebnis ist
wertlos"*.

| Falle | Woran man sie erkennt | Was hilft |
|---|---|---|
| **SVG als `data:`-URL** wird nicht zum Bild | Das Markdown steht als **Rohtext** auf der Folie | markdown-its `validateLink` lässt `data:` nur für gif/png/jpeg/webp durch. `shots.mjs` rendert das SVG vorher nach PNG. |
| **Vorschau öffnet in der rechten Sidebar** | Ein tadelloses Bild der blossen Notiz — ohne Plugin darin | `activatePreview()` nutzt `getRightLeaf`. Vor der Aufnahme `rightSplit.expand()` + `setSize`. |
| **Vorschau folgt dem Notizwechsel nicht** | Bild der neuen Notiz zeigt das Deck der alten (1 Folie erwartet, 5 gezählt) | Es gibt keinen Listener darauf — `view.refresh()` aufrufen, denselben Weg wie der Refresh-Knopf. |
| **macOS-Vollbild schluckt `setSize`** | `getSize()` meldet die Bildschirmgrösse statt der angeforderten | `setWindowSize` hebt den Vollbildmodus erst auf und meldet eine abgelehnte Grösse. |
| **Trust-Dialog: die Zustimmung hat keine Klasse** | Der Vault bleibt im eingeschränkten Modus, das Plugin lädt nicht | `mod-cancel` ist die **Ablehnung**; wer auf `mod-cta` prüft und auf „erster Button" zurückfällt, lehnt ab. Über den Text wählen. |
| **Sprache: `obsidian.json` allein reicht nicht** | Oberfläche bleibt deutsch, obwohl `language: "en"` gesetzt ist | Zusätzlich `localStorage["language"]`, dann Neustart. Beides ist **app-weit** — nach der Aufnahme zurückstellen. |
| **Settings-Tab ist höher als das Fenster** | Bild endet mitten in den Einstellungen und sieht vollständig aus | `withMetrics(1100, 1900, …)` und bis zum **letzten Kind** klippen. |
| **Ausschnitt auf den Container statt auf den Inhalt** | Streifen Leere (schwarz) unter dem Bild | Nicht `max(Containerhöhe, Inhalt)` — im simulierten Fenster ist der Container so hoch wie die Simulation. |
| **`pollUntil` still danebenrufen** | „null Folien" in der Ausgabe, Lauf geht trotzdem weiter | `npm run shots:obsidian` bündelt mit esbuild **ohne `tsc`** — Typfehler im Treiber fallen durch. Signatur ist `(cdp, expression, timeoutMs)`. |
| **Weissraum-Mass ist auf `shiro` blind** | „1 % identische Zeilen" bei sichtbar halbleerer Folie | `shiro` trägt eine Papiertextur; keine zwei Zeilen sind byte-identisch. Auf texturierten Themes misst das Mass nichts — hier zählt der Blick. |

## Befunde am Prüfling

Beim Aufnehmen gefunden, nicht beim Aufnehmen verursacht:

| Befund | Beleg |
|---|---|
| **`cover-image` ist auf hellen Themes unlesbar.** Der Scrim ist ein fest schwarzer Verlauf (`structure.css.ts`), die Titelfarbe kommt aus `--sd-fg`. Auf `shiro`, `crimson-light` und `crimson-light-lc` steht dunkler Text auf dunklem Grund — darunter das **Default**-Theme. | Gegenprobe `npm run shots _cover-check`: identische Folie, identischer Scrim, `kuro` cremeweiss lesbar, `shiro` nicht. |
| **Zahlenwerte im Einstellungen-Tab folgen der System-Locale, nicht der UI-Sprache.** „Temperature" zeigt `0,3` mit Dezimalkomma, während die Oberfläche englisch ist. | `settings.png`, Abschnitt *AI (local)*. |
| `note` und `info` tragen dasselbe Symbol (ℹ). Die Redundanz-Zusage (Farbe + **Form** + Label) trägt zwischen diesen beiden nur über das Label. | `callouts.png` |

Der Fix für den ersten gehört nach **`deck-core`**, nicht in dieses Repo (`src/vendor/` ist
gepinnte Kopie) — deshalb steht er hier und nicht als Änderung daneben.
