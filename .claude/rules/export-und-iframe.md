---
paths:
  - "src/export.ts"
  - "src/vendor/deck-core/dom/**"
  - "src/preview-view.ts"
  - "src/dom-safe.ts"
---

# iframe-Isolation und Export — Gotchas

Gotchas zum isolierten Deck-iframe, zur Vorschau und zum PDF-/PNG-Export.

**Realm-Invariante:** `src/vendor/deck-core/dom/render-dom.ts` darf keine
Obsidian-DOM-Augmentierungen verwenden (`createDiv`/`createEl`/`createSpan`/`empty`/
`addClass`/`removeClass`/`setText`/`setAttr`). Das Gate dafür lebt seit Task 9 in
`deck-core` selbst, nicht mehr hier — `scripts/check-render-realm.mjs` gibt es in
diesem Repo nicht mehr, und `npm test` ruft es nicht auf.

- **iframe-Isolation:** Folien rendern in einem `sandbox="allow-same-origin"`-iframe — das
  aktive Obsidian-Theme erreicht den iframe-Inhalt nicht. Obsidians `createDiv`/`addClass`/etc.
  sind Prototype-Patches des Eltern-Realms und werfen auf iframe-Knoten. Deshalb ist der gesamte
  iframe-Pfad (renderDeckToContainer, buildIsolatedDeck) ausschließlich native DOM + String-
  Injektion. Messung wartet auf `load` + `contentDoc.fonts.ready` (KaTeX-Glyph-Metriken).
  Off-Screen-Staging: `position: fixed; left: -99999px` statt `display: none` —
  `display:none` unterdrückt das Layout und bricht scrollWidth-Messungen.
- **Export-Pfade plattformabhängig:** PNG nutzt `modern-screenshot` (foreignObject →
  natives Text-Layout; html2canvas wurde wegen zusammenklebender Wortabstände
  ersetzt). PDF verzweigt auf `Platform.isDesktopApp`: Desktop druckt den isolierten
  iframe (`contentWindow.print()`), Mobile schreibt `isolatedDeckHtml` in den
  Export-Ordner und ruft `app.openWithDefaultApp` (window.print ist im Mobile-WebView
  ein No-op — letterhead-Muster). `print-color-adjust: exact` in `PRINT_CSS` erzwingt
  den Theme-Hintergrund im Druck.
- **Der PNG-Export verliert eine CSS-Regel, die eine PREFIXLOSE Eigenschaft auf den
  UA-Default ihres Tags zurücksetzt.** `modern-screenshot` klont die Folie und schreibt
  berechnete Stile inline — aber nur die, die vom Default **abweichen** (`getDiffStyle`:
  `if (defaultStyle.get(name) === value && !priority) return`). Die `priority`-Hälfte greift
  nie: `getComputedStyle().getPropertyPriority()` liefert für berechnete Stile immer `""`,
  weil `!important` ein Merkmal der Kaskade ist und im Ergebnis nicht mehr existiert. Wer
  also im Theme gegen eine mitgeklonte Fremd-CSS anschreibt (Mermaid legt sein `<style>`
  **in** das SVG), darf den Default nicht als Korrekturwert nehmen: `opacity: 1 !important`
  wirkt in der Ansicht und **verschwindet im PNG**, `transform: none`, `filter: none` und
  `visibility: visible` genauso. Gleiche Bauart, gleiche Falle: `isolation`,
  `mix-blend-mode`, `clip-path`, `perspective`.
  Gemessen 2026-09-04 an einem Mermaid-`pie`: Ansicht `opacity: 1`, PNG exakt Alpha 0.70 —
  und mit `opacity: 0.99 !important` (kein Default) kommt derselbe Wert sauber durch, 525.266
  voll deckende Pixel gegen 0. **Der saubere Weg steht seit deck-core 0.7.0 bereit:**
  `/* sd-mermaid-var: pieOpacity 1 */` im Kopf der Theme-CSS — dann schreibt Mermaid den
  Wert gar nicht erst, und es gibt nichts zu überschreiben. `0.999` bleibt ein Workaround
  für alles, was keine Mermaid-Variable ist. Bewacht seit 2026-09-05 durch GUI-Smoke **M3**
  (am geschriebenen PNG, mit Gegenprobe im selben Punkt).
  ⚠️ **Zwei Präzisierungen, ohne die diese Regel zu breit warnt** (deck-core-Session
  2026-09-05, an `modern-screenshot@4.7.0/dist/index.mjs` **gelesen**, nicht am PNG belegt —
  dieselbe Beweislage wie die `includeStyleProperties`-Notiz):
  1. **Der Bezugswert ist der UA-Default des Tags, nicht der CSS-Initialwert.**
     `getDefaultStyle` (Z. 691) erzeugt *dasselbe Tag* in einem Sandbox-iframe ohne Host-CSS
     (`srcdoc` mit leerem `<body>`, Z. 672) und liest dessen berechneten Stil. Ein `<hr>`
     bekommt vom UA-Stylesheet einen Rahmen — `border: none` **weicht** dort also ab und wird
     geschrieben, obwohl `none` der Initialwert ist.
  2. **`applyTo` rettet Longhand-Familien über einen Prefix-Baum** (Z. 753–770).
     Eigenschaften mit `-` werden nach Prefix gruppiert; weicht **eine** Longhand ab, landen
     über `prefixs.push(prefix)` **alle** Geschwister der Gruppe im Ergebnis — auch die, die
     dem Default entsprechen. `border-*`, `background-*` und `font-*` sind dadurch weitgehend
     geschützt, solange ein Geschwister abweicht.

     Deshalb steht oben **prefixlos**: die kurzen Namen haben keine Familie, die sie rettet.
     Gegenprobe am eigenen Bestand (2026-09-05, 15 Dateien — alle `pure/presets/*.ts` inkl.
     Struktur-/Layout-CSS und der neun Themes, alle `dom/*.ts`, dazu `styles.css`): **keine
     ausführbare Regel dieser Art**. Der einzige Treffer eines breiteren Musters ist
     `.sd-slide hr { border: none }` in `structure.css.ts` — und der fällt aus **beiden**
     Gründen heraus.
  Volle Messung in der deck-core-Task „Export ≠ Ansicht“.
- **PDF via window.print (Desktop):** Der Desktop-PDF-Export druckt den isolierten iframe via
  `contentWindow.print()`. Obsidian-Themes, Browser-Erweiterungen und Systemdruck-Einstellungen
  können das Ergebnis beeinflussen. Die `@page`-CSS-Regel setzt die Seitengröße auf die
  Foliengröße.
- **Mermaid-IDs müssen eindeutig sein:** `src/vendor/deck-core/dom/render-dom.ts` vergibt
  eindeutige IDs (`sd-mm-<laufende Nummer>` aus einem globalen Zähler). Mermaid initialisiert
  sich global; doppelte IDs führen zu stummen Render-Fehlern.
