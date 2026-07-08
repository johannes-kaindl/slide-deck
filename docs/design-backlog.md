# Design-Backlog

Kosmetik-Punkte unterhalb der „muss gefixt werden"-Schwelle, bewusst vertagt (aus den
Design-Review-Runden 2026-07). Kein Merge-Blocker; bei Gelegenheit oder wenn sie stören.

## Offen

- **Header-Text-Shadow-Ghosting auf Bild-Titelfolien.** Der doppelte `text-shadow`
  (`0 1px 12px rgba(0,0,0,.7), 0 0 4px rgba(0,0,0,.5)`) auf `.sd-layout-cover-image`-Slots
  erzeugt über hellem Bildhimmel einen leichten „Geister"-Doppelrand um die Mono-Glyphen.
  Auf Beamer-Distanz unsichtbar, nah erkennbar. Fix-Optionen: ein einzelner weicher Shadow
  (`0 2px 16px rgba(0,0,0,.8)`) oder eine dezente Blur-Backdrop-Pille hinter dem Header.
  _Quelle: Review-Abschluss, Beobachtung #1._

- **HR-Gradient links härter als rechts.** `.sd-slide hr` startet an der linken Kante etwas
  satter in Gold als es rechts ausläuft — bei `linear-gradient(90deg,transparent,accent 50%,
  transparent)` optisch minimal asymmetrisch wahrgenommen. Kosmetik; ggf. Stop-Verteilung
  feinjustieren. _Quelle: Review-Abschluss, Beobachtung #2._

## Ideen / später

- **Helles Nordstern-Pendant zu Kuro** (zweites Voll-Atmosphäre-Theme). Eigene Design-Runde.
