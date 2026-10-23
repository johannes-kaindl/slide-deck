---
paths:
  - "src/vendor/**"
  - "tests/vendor/**"
  - "src/vendor-css.ts"
  - "tools/sync-kit.sh"
  - "tools/kit-sync.json"
  - "scripts/check-core-purity.mjs"
---

# deck-core und Kit-Vendoring — Gotchas

Gotchas zur vendorten Schicht `src/vendor/` (deck-core, Kit). Aufbau: `docs/internal/architecture.md`.

`src/core/` gibt es seit 2026-08-03 nicht mehr. Modell, Renderer, Themes, Layout
und der Deck-Prompt leben in [`deck-core`](https://git.jkaindl.de/jkaindl/deck-core)
und liegen hier als gepinnte Kopie unter `src/vendor/deck-core/`.

**Dort nicht bearbeiten.** Änderungen gehören nach `deck-core`, danach neu
vendorieren und `VENDOR.json` (`version`, `sha`, `vendored`) nachziehen.

⚠️ **Beim Auflösen eines deck-core-Tags immer `<tag>^{}` nehmen, nie den Tag allein.**
Die Tags dort sind gemischt — `git rev-parse 0.10.0` liefert bei einem **annotated** Tag das
Tag-Objekt statt des Commits, und der landet dann falsch in `VENDOR.json`. Gemessen am
2026-09-05: 0.7.0/0.8.0 sind lightweight, 0.5.0/0.9.0/0.10.0 annotated. `rev-parse` ohne
`^{}` stimmt also meistens — was die Falle stellt, weil der Fehler erst auftritt, wenn man
ihn für ausgeschlossen hält. `git archive <tag>` löst dagegen von sich aus korrekt auf. Der Abgleich
Kopie-gegen-Quelle ist bislang **Handarbeit** — `drift-audit` deckt nur
Kit-Doppelungen zwischen den Plugin-Repos ab; `deck-core` liegt außerhalb seines
Wirkungskreises.

Was hier blieb, kennt Obsidian, das Kit oder den Endpunkt: `adapter`,
`theme-registry`, `export`, `main`, die Ansichten, die Einstellungen, `llm-client`,
`llm/ai-settings-model`, `llm/model-info`, `image/**` (das Nachbarplugin
`local-image-generator` ist ein Obsidian-Plugin, keine Kern-Zuständigkeit).

Dazu `vendor-css.ts`: die vier `import … from "*.css"`, die `deck-core` bewusst
nicht selbst macht — ein CSS-Import ist eine Annahme über den Bundler.

- **Kit-Vendoring:** `src/vendor/kit/**` sind **verbatim** Kopien aus `obsidian-kit/src/pure/` und `code-kit`, `src/vendor/kit-obsidian/**` aus `obsidian-kit/src/obsidian/` (die importieren `obsidian` und würden das Purity-Gate reißen, läge sie unter `kit/`). Abweichungen vom Verbatim sind nur die `rewrite`-Einträge in `tools/kit-sync.json` (kit-interne Importe wie `../pure/` werden auf das Vendor-Layout umgeschrieben) und der Kopf in Zeile 1 jeder Datei — mechanisch, bei jedem Re-Vendoring identisch. Sonst gilt: nie hier editieren, sondern vom gepinnten Tag neu vendoren (das `VENDOR.json` des jeweiligen Ordners hält `version` + `sha`).
- **Re-Vendoring läuft über `sh tools/sync-kit.sh`,** einen Wrapper auf das zentrale Dach-Werkzeug `../tools/kit-sync/` (Doku dort; Quellorte `KIT_DIR`/`CODEKIT_DIR`). Die Pins (`obsidian-kit`, `code-kit`, je ein fester Tag) stehen in `tools/kit-sync.json`, nicht im Skript (CORE-META-22).
- **`scripts/check-core-purity.mjs` walkt drei Wurzeln:** `deck-core/pure` (streng: kein Obsidian, kein Netz, keine Laufzeit, kein Fenster), `deck-core/dom` (darf ein Fenster, sonst nichts) und `src/vendor/kit` (obsidian-frei, ohne Versprechen zu Netz oder Laufzeit); deshalb darf der Kern aus `vendor/kit` importieren, ohne dass ein unpure gewordenes Kit-Modul still durchschlägt.
