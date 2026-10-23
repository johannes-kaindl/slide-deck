---
paths:
  - "scripts/gui-smoke.ts"
  - "docs/SMOKE.md"
  - "docs/themes/regression-deck.md"
  - "scripts/visual-smoke.mjs"
  - "scripts/visual-smoke-entry.ts"
  - "scripts/shots-obsidian.ts"
---

# GUI-Smoke, Prüfling und README-Bilder — Gotchas

Gotchas zu `scripts/gui-smoke.ts` und den Aufnahmen. Allgemeines zu Treibern: `../.claude/rules/gui-smoke-treiber.md`.

**README-Bilder:** Der Aufnahme-Vertrag steht in `docs/images/README.md` — was jedes Bild
zeigen muss, beide Aufnahme-Wege, zehn dokumentierte Fallen und die Befunde am Pruefling.
Die Trennung folgt der Pure-Core-Naht: Folien entstehen in `deck-core`, also braucht ihre
Aufnahme kein Obsidian; nur Vorschau-Pane, Overflow-Warnung und Einstellungen brauchen es.
`shots:obsidian` setzt `$STAGING_VAULTS_DIR` und eine Zweitinstanz mit `--port <port>` voraus (Regeln: die Dach-Regeln `obsidian-instanz.md` und `cdp-lock.md`).

**GUI-Smoke (CORE-TEST-02 b):** `scripts/gui-smoke.ts` faehrt die Pruefpunkte aus `docs/SMOKE.md` per CDP gegen
ein laufendes Obsidian — die Naht, die `vitest` mit `environment: "node"` strukturell nicht
sieht: iframe-Isolation, Schrift-Metriken, Explorer-Markup, Bilder-Export. Checkliste,
Hand-Runde und Durchlauf-Vermerke in `docs/SMOKE.md`; die CDP-Bruecke kommt aus
`tools/obsidian-cdp/` im Dach (nicht vendoriert). Vault ist der Staging-Vault aus demselben Fixture wie
die README-Bilder (`npm run shots:obsidian -- --setup`), nie der Arbeitsvault — `requireEigenerBuild`
prueft vor dem ersten Punkt per sha1, dass der Lauf ueberhaupt gegen den Repo-Stand geht.
**Ein gruener Lauf zaehlt erst nach einer Gegenprobe:** die erste hier hat einen Fehler im
Treiber aufgedeckt, nicht im Plugin (`\b` gegen zusammengeklebtes `textContent`, s. `docs/SMOKE.md`).
Die zweite Runde ebenso: B4 war rot, weil auf dem Rechner ein LLM-Server antwortete und das
Modellfeld deshalb ein Dropdown ohne Placeholder war — **ein Pruefpunkt stellt seinen Gegenstand
selbst her** (Endpunkt auf toten Port), statt ihn von der Umgebung zu erwarten. Der Pruefling fuer
Warn-Schwere und Modifier-Export ist `docs/themes/regression-deck.md`, zur Laufzeit in den Vault
geschrieben, nicht als zweite Kopie im Fixture.
**Abschnitt M misst seit dem 2026-09-05 je zwei Faelle in EINEM Punkt** (M3 `sd-mermaid-var` am
geschriebenen PNG, M4 `sender:`, M5 `sd-modifiers`) — weil der Theme-Wechsel dazwischen ueber
`modify` laeuft und `modify` die Neuregistrierung NICHT ausloest. Ohne `refreshThemes()` misst
der zweite Fall das Theme des ersten und ist gruen, ohne seinen Gegenstand gesehen zu haben.
**Zwei verschiedene Zahlen im Protokoll sind deshalb der Beleg, dass gemessen wurde** —
identische waeren der stille Fehlschlag, egal welches Vorzeichen sie tragen.

**Regressions-Deck:** `docs/themes/regression-deck.md` ist kein Demo, sondern ein Prüfling —
jede seiner fünf Folien hat einen Defekt ausgelöst, der in `deck-core` 0.5.0 behoben wurde
(Bild in Spalten unbegrenzt, eigener Layoutname als Fehlalarm, verworfener Modifier). Aufnahme
mit `node scripts/visual-smoke.mjs docs/themes/regression-deck.md kami`. Die Bilder stecken
als `data:`-URI darin, damit er ohne Vault und ohne Netz läuft — **SVG geht dafür nicht**,
markdown-its `validateLink` lässt von `data:` nur gif/png/jpeg/webp durch und rendert ein
`data:image/svg+xml` als Literaltext. Wer die Klassen statt der Pixel prüfen will, nimmt
Chromes `--dump-dom` gegen denselben Entry (`scripts/visual-smoke-entry.ts`).
