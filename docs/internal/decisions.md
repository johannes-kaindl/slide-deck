# Entscheidungen in slide-deck — das Warum

Verdichtete Design-Essenz zu den Regeln im Kern (`AGENTS.md`). Die Herleitungen liegen im Coding-Cockpit des Maintainers (CORE-META-14, maintainer-lokal). Vor dem Übernehmen einer Altentscheidung gilt: Grund aufsuchen, messen, ob er heute trägt, Ergebnis melden.

## Warum es das Plugin gibt

**Warum es existiert:** Präsentationen direkt aus dem eigenen Wissens-Vault heraus erstellen —
ohne Format-Konvertierungen, Powerpoint, oder externe SaaS-Tools. Markdown-Notizen bleiben
kanonisch; die Folienansicht ist eine Projektion davon.

**Herkunft:** Eigenständige Neuentwicklung (md2pdf-Seed) mit der Absicht, langfristig einen
sauberen Core wiederzuverwenden (z.B. in einem Kommandozeilen-Tool zum Batch-Export). Die
Architektur ist von Anfang an auf die Pure-Core-Naht ausgelegt.

## Bewusste Designentscheidungen

Die ersten beiden (Fit-or-warn, feste Geometrie) stehen im Kern.

- **Accessible Callouts:** Bedeutung wird redundant kodiert (Rahmenfarbe + geometrische Form +
  Label-Wort), nicht nur per Farbe (erfüllt WCAG 1.4.1).

- **Phase 2 (LLM) ist umgesetzt:** das Panel „Erzeugen“ und der Befehl `generate-deck` verwandeln eine Notiz mit einem konfigurierbaren LLM-Endpunkt in ein Deck; die Folien selbst entstehen weiterhin lokal.

## Warum der Folienkern ein eigenes Repo ist

Der Grund für die Trennung ist die Lizenz, nicht die Größe: derselbe Kern soll ein
AGPL-Plugin, eine AGPL-Pipeline und eine spätere Store-App bedienen, deren
Bedingungen mit der AGPL unvereinbar sind.

## GitHub als Verteilweg

Der Ausstieg vom 2026-09-06 (Anlass: 0.10.0 ohne GitHub-Release) ist seit 2026-09-24 aufgehoben: `npm run release` pusht Branch und Tag per Dual-Push (Dach-Standard), der Tag löst `release.yml` aus. `authorUrl` zeigt seit 2026-09-24 wieder auf `https://github.com/johannes-kaindl` (`https://jkaindl.de` galt vom 2026-09-06 bis 2026-09-24).
