---
paths:
  - "eslint.config.mjs"
  - "eslint.overrides.mjs"
  - "scripts/check-no-inline-disables.mjs"
---

# Lint und Store-Scanner — Gotchas

Gotchas zum Lint-Gate. Store-Regeln insgesamt: `../.claude/rules/release-und-store.md`.

- **Der Store-Scanner ist `eslint-plugin-obsidianmd` — er muss aktuell gehalten werden.** Bis
  2026-08-10 stand hier `"latest"`, installiert war aber 0.3.0, während der Store 0.4.1 fuhr:
  `npm run lint` lief grün, während der Review `obsidianmd/prefer-create-el` meldete. Eine
  Store-Prüfung, die lokal blind ist, ist keine Prüfung — dieselbe Lehre wie bei den
  Inline-disables (0.3.1/0.6.1), nur eine Ebene tiefer. Gepinnt in `package.json`.
  **Sollzustand ist null — Warnungen zählen als Befund, nicht als Rauschen.** Bis 2026-08-12
  standen hier neun `prefer-create-el`-Warnungen als „erwarteter Reststand", begründet damit,
  dass Warnungen den Review nicht blockieren. Diese Schwelle ist zu niedrig: sie hat die
  Meldung über Monate zum Grundrauschen gemacht. Aufgelöst hat sie ein Port-Typ in
  `deck-core` 0.3.0 (`HostDocument` statt `Document`) — die Regel spricht jeden Empfänger
  vom Typ `Document` an, und die DOM-Ebene braucht davon nur sechs Member. Kein
  `eslint-disable`, keine Verhaltensänderung. Der Autofix des Scanners (`doc.win.createEl`)
  war nie gangbar: `.win` ist eine Obsidian-Augmentierung, und der Code rendert in fremde
  Realms. **Taucht eine neue Warnung auf, wird sie behoben, nicht dokumentiert** — und der
  Fix gehört nach `deck-core`, wenn die Fundstelle unter `src/vendor/` liegt.
- **Keine Inline-`eslint-disable` in `src/`:** `scripts/check-no-inline-disables.mjs` läuft als
  erster Schritt von `npm run lint`. Der Community-Store wertet ein Inline-disable einer
  `obsidianmd/*`-Regel als **Error** — egal wie gut begründet (0.3.1 und 0.6.1 waren beide reine
  Wartungs-Releases genau dafür). Wer eine Regel nicht erfüllen kann: entweder den Code auflösen,
  oder einen **file-scoped Override mit Begründung** in `eslint.overrides.mjs` eintragen (die `eslint.config.mjs` ist eine Template-Kopie) — dort ist
  die Ausnahme sichtbar und reviewbar. Beides ist store-tauglich, das Inline-disable nicht.
