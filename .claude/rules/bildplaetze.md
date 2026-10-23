---
paths:
  - "src/image/**"
  - "src/main.ts"
---

# Bildplätze (`slide-image`) — Gotchas

Gotchas zu `src/image/**` und `runSlot()` in `src/main.ts`.

- **`deck-core` parst den `slide-image`-Block NICHT — die Feld-Grammatik liegt hier.** Der Kern
  (Task 1) erkennt die Fence nur am `info`-String und reicht den Rohtext unverändert als
  `.sd-image-slot`-Karte durch; er kennt weder `funktion:` noch die Prompt-Zeile. Das ist
  dieselbe Pure-Core-Naht wie überall sonst: die Fence-Erkennung ist theme-/layout-artig und
  gehört in den Kern, die Bedeutung ihres Inhalts ist Consumer-Fachwissen (welches
  Nachbarplugin, welche Bildfunktionen es gibt) und gehört hier. `parseSlot()` in
  `src/image/slot-format.ts` ist deshalb die EINZIGE Stelle, die `funktion:` versteht — ein
  Grammatik-Fix in `deck-core` würde hier nichts finden, weil dort nichts geparst wird.
- **`apiVersion` allein sagt nichts über einzelne Methoden — die Methode wird selbst geprüft.**
  `readImageApi()` (`image-api.ts`) verlangt `apiVersion === 1` UND prüft `status`/`generate`/
  `save` als Funktionen. Der Grund ist kein Vorsichtsreflex: `recheck()` kam erst mit LIG 0.10.0
  dazu, und die Version blieb dabei bewusst bei 1 (kein Bruch, additive Erweiterung). Wer nur
  auf `apiVersion` prüft, hätte auf einer älteren LIG-Version einen `undefined`-Aufruf riskiert;
  `ensureReady()` ruft `recheck` deshalb nur auf, wenn `typeof api.recheck === "function"`.
  Dieselbe Vorsicht gilt für jede künftige optionale Methode am Vertrag — die Versionszahl
  markiert Formbrüche, nicht Zuwachs.
- **Zurückgeschrieben wird über Textidentität, nicht über Zeilennummern — mehrdeutig gilt wie
  fehlend.** Ein Bildlauf dauert Minuten (Laden des Modells, Generierung); in der Zeit kann die
  Notiz sich geändert haben, und `getSectionInfo`-Zeilen von Aufrufbeginn wären dann falsch.
  `replaceSlot()` (`slot-format.ts`) sucht stattdessen den vollständigen Original-Fence-Text als
  String im aktuellen Vault-Inhalt (`app.vault.process`, nicht `modify` — dieselbe
  Read-Modify-Write-Absicherung). Findet er ihn **kein Mal oder mehr als ein Mal**, schreibt er
  nichts und gibt `null` zurück; `main.runSlot()` meldet dann denselben Fehlerzustand wie „Block
  nicht mehr auffindbar" (`image.slot.lost`), obwohl das Bild bereits erzeugt und gespeichert
  ist. Die Begründung steht im Kommentar über der Funktion: ein Bild an der falschen Stelle ist
  schlimmer als gar keines — der Nutzer bekommt den Pfad seines Bildes und setzt es selbst ein.
  **Geprüft wird zusätzlich VOR dem Lauf** (`main.runSlot()`, `findSlotOnce()` in
  `slot-format.ts`): drei der Fälle, in denen das Rückschreiben scheitert (andere Fence-Form,
  Mehrfachvorkommen, Einrückung), sind schon beim Klick sichtbar und kosten so keine Minute
  GPU-Zeit mehr, um entdeckt zu werden — nur „während des Laufs geändert" bleibt der Job der
  Prüfung danach. `fenceSlot()`/`SLOT_LANG` (ebenfalls `slot-format.ts`) sind seither die
  EINZIGE Stelle, die den Fence-Namen und seine Klammerung kennt; Registrierung
  (`slot-card.ts`), Einfüge-Vorlage (`insert-slot.ts`) und Rückschreiben (`main.ts`) importieren
  von dort, statt die Form je einzeln zu buchstabieren.
- **Ein ungefüllter Bildplatz exportiert den Prompt-Rohtext sichtbar ins PDF/PNG.** `.sd-image-
  slot` ist eine gewöhnliche Folienregion — Export rendert sie wie jede andere. Spec-konform
  (v1 warnt dafür nicht), aber überraschend, wenn eine Präsentation mit offenem Bildplatz
  exportiert oder vorgeführt wird: der Text steht als lesbarer Prompt auf der Folie, nicht als
  Platzhalter-Hinweis.
