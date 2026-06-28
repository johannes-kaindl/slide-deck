# Mobile-Support + Export-Fidelity — Design Spec

- **Status:** Approved (design) — pending plan
- **Datum:** 2026-06-28
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `feat/mobile-export-fidelity`
- **Baut auf:** Theme-Handling-UX (auf `main`, Merge `222cc7a`) · iframe-Isolation (`docs/superpowers/specs/2026-06-27-iframe-isolation-design.md`)
- **Grounding:** Live-Diagnose der kuro/shiro-Export-Artefakte (PNG vs. PDF vs. Preview) + Analyse von `../obsidian-letterhead` (`isDesktopOnly:false`, cross-platform Print/Share-Muster, `main.js` `exportViaShare`/`doPrint`). Anhang A.

---

## 1. Zusammenfassung

Der Smoke der neuen Themes deckte **zwei vorbestehende Export-Pipeline-Bugs** auf (beide im Plugin, **nicht** in den Themes — Preview rendert korrekt, dasselbe `buildIsolatedDeck`-Artefakt druckt im PDF typografisch sauber):

1. **PNG/html2canvas frisst Wort-Zwischenräume.** html2canvas 1.4.1 lässt Leerzeichen an Inline-Grenzen/Umbrüchen fallen → „Wörterklebenzusammen". Bekannte Rasterizer-Limitation (die iframe-Spec hatte html2canvas-Ersatz schon als Phase-2 markiert).
2. **PDF druckt den Theme-Hintergrund nicht** → Dark-Themes auf Weiß. **Bereits gefixt** in diesem Branch (Commit `f94e6e7`): `print-color-adjust: exact` in `PRINT_CSS` (`chrome-css.ts`).

Zugleich soll das Plugin **mobile-fähig** werden. Faktenlage (Code-Scan, Anhang A): fast alles läuft mobil schon (Preview-srcdoc-iframe, Theme-Registry, Ordner-Scan, `processFrontMatter`, Folder-Hide via `adoptedStyleSheets`, Settings; „Open in Finder" degradiert via `FileSystemAdapter`-Check zu einer Notice). **Echte Mobile-Blocker: genau zwei** — der `isDesktopOnly: true`-Flag und der PDF-Export via `contentWindow.print()` (auf Obsidian-Mobile ein No-op).

Beides vereint sich: ein **foreignObject-Rasterizer** (`modern-screenshot`) fixt den PNG-Wortbug **und** ist reines Web (mobil-fähig); `../obsidian-letterhead` liefert das erprobte Mobile-PDF-Muster (HTML-Datei in den Vault schreiben → `app.openWithDefaultApp` → OS-Print/Share). Eine Iteration, beide Ziele.

> Diese Iteration ändert **keinen** `src/core/**`-Code — nur Adapter-Schicht (Export, Manifest, Dependency) + die Platform-Weiche.

## 2. Goals

1. **PNG-Treue:** Folien exportieren mit **korrekten Wortabständen** und Fonts. Akzeptanz: das kuro/shiro-Demo-Deck als PNG zeigt sauberen Fließtext (keine zusammenklebenden Wörter), auf Desktop **und** Mobile.
2. **Mobile-fähig:** `isDesktopOnly: false`; Preview, Theme-Switch, Settings, beide Export-Pfade funktionieren auf Obsidian-Mobile (iOS/iPadOS).
3. **PDF auf Mobile:** PDF-Export liefert auf Mobile ein Ergebnis via `openWithDefaultApp` (HTML → OS-Print/Share → PDF), Desktop bleibt beim direkten Druck. Akzeptanz: PDF-Export auf iPhone öffnet das Deck in Safari, druckbar/teilbar.
4. **Desktop unverändert gut:** Desktop-PDF (`contentWindow.print()`) und -PNG bleiben funktional; Theme-Isolation bleibt erhalten.
5. **Graceful degradation:** desktop-only-APIs (Electron-Reveal) sind hinter `Platform`/Adapter-Checks; kein Crash, keine toten Buttons auf Mobile.
6. **Pure-Core unangetastet:** `src/core/**` unberührt; Purity- + Realm-Gates bleiben grün.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Kein** eigener PDF-Renderer (kein jsPDF/pdf-lib). Mobile-PDF läuft über das OS (openWithDefaultApp), wie bei letterhead.
- ❌ **Keine** Mermaid/hljs-Theme-Wahl pro Theme (separat dokumentierter Folge-Change aus dem Theming-Guide — nicht hier).
- ❌ **Kein** Redesign der Preview/Toolbar (gerade erst gemacht).
- ❌ **Keine** Custom-Share-UI über das Nötige hinaus — ein schlichter „Öffnen/Teilen"-Pfad genügt (letterhead-Muster).
- ❌ **Kein** Reveal-in-Finder-Ersatz für Mobile (der Notice-Fallback bleibt; Drop-in-Themes gehen auf Mobile über Obsidians Dateiverwaltung/Sync).

## 4. Design-Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| PNG-Rasterizer | **`modern-screenshot`** (`domToCanvas`/`domToPng`) ersetzt html2canvas (User-gewählt) | foreignObject + natives Browser-Text-Layout → korrekte Wortabstände + bessere Fonts; reines Web → mobil-fähig; aktiv gepflegt. |
| PDF-Strategie | **Platform-Weiche** (letterhead-Muster): Desktop → `contentWindow.print()`; Mobile → HTML-Datei + `app.openWithDefaultApp` | `window.print()` ist im Mobile-WebView ein No-op (Anhang A). Das HTML-Artefakt existiert bereits (`isolatedDeckHtml`). |
| Plattform-Check | **`obsidian.Platform.isDesktopApp`** | Offizielle API; minAppVersion 1.8.7 hat sie. Keine `process`/Electron-Sniffing. |
| `isDesktopOnly` | **`false`** | Nach den Platform-Guards gibt es keinen harten Desktop-Zwang mehr. |
| html2canvas | **entfernen** (Dependency raus) | Nach dem Swap nirgends mehr genutzt; reduziert Bundle + Angriffsfläche. |
| Mobile-PDF-Dateiort | **`<exportFolder>/<note>.html`** (bestehender, konfigurierbarer Export-Ordner) | Konsistent mit dem PNG-Export; nutzer-auffindbar; kein neuer Pfad-Begriff. |
| Reveal-in-Finder | **unverändert** (FileSystemAdapter-Guard → Notice) | Degradiert schon korrekt; kein Mobile-Crash. |
| PNG auf Mobile | **gleicher `modern-screenshot`-Pfad** wie Desktop | Ein Code-Pfad, beide Plattformen; Ausgabe via `adapter.writeBinary` (plattformneutral). |

## 5. Architektur — eine Platform-Weiche, ein Rasterizer

```
buildIsolatedDeck(ownerDoc, deck, resolveEmbed, registry, customCss)   ← unverändert
        │  { slidesHtml[], css, warnings }
        ├───────────────── PNG (exportImages) ─────────────────┐
        │   off-screen isoliertes iframe → pro .sd-slide:        │
        │   modern-screenshot domToCanvas(slideEl,{w,h,scale})   │  Desktop + Mobile
        │   → toDataURL → adapter.writeBinary(<folder>/NN.png)   │
        │                                                        │
        └───────────────── PDF (exportPdf) ─────────────────────┤
            Platform.isDesktopApp ?                              │
              Desktop: createIsolatedDeckIframe(allow-modals)    │
                       → contentWindow.print()  (wie bisher)     │
              Mobile:  isolatedDeckHtml({css, PRINT_CSS, body})  │
                       → adapter.write(<folder>/<note>.html)     │
                       → app.openWithDefaultApp(path)            │
```

### 5.1 PNG: html2canvas → modern-screenshot (`src/export.ts`)

`exportImages` ersetzt den Capture-Aufruf. Heute:
```ts
const canvas = await html2canvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
```
Neu (`modern-screenshot`):
```ts
import { domToCanvas } from "modern-screenshot";
const canvas = await domToCanvas(slides[i], { width: geo.width, height: geo.height, scale, backgroundColor: "#fff" });
```
Rest (`toDataURL` → `writeBinary`-Pfad, mkdir-vor-iframe, dispose in finally) **unverändert**. `import html2canvas` entfällt; `html2canvas` aus `package.json` entfernen.

> **Empirisch zu verifizieren (§8):** rendert `modern-screenshot` einen Knoten aus dem off-screen `contentDoc` korrekt (Fonts/KaTeX-data-URI-Glyphen, gebackener `transform:scale`)? foreignObject-Serialisierung über Dokument-Realms ist der Risikopunkt — Fallback dokumentiert.

### 5.2 PDF: Platform-Weiche (`src/export.ts`)

`exportPdf` bekommt am Anfang die Weiche:
```ts
import { Platform } from "obsidian";
// … nach buildIsolatedDeck:
if (Platform.isDesktopApp) {
  // bestehender Pfad: createIsolatedDeckIframe(..., sandbox "allow-same-origin allow-modals")
  //                   → contentWindow.print() + afterprint/safetyTimer/dispose
} else {
  await exportDeckHtmlAndOpen(app, file, slidesHtml, css, geo);
}
```
Neuer Helper (`exportDeckHtmlAndOpen`): baut `isolatedDeckHtml({ css, bodyHtml: slidesHtml.join(""), extraCss: PRINT_CSS(geo.width, geo.height) })`, schreibt es nach `<exportFolder>/<base>.html` (mkdir bei Bedarf), ruft dann `await app.openWithDefaultApp(path)` (guarded: `typeof app.openWithDefaultApp === "function"`, sonst Notice mit dem Pfad). Spiegelt letterheads `exportViaShare` (Anhang A).

> `app.openWithDefaultApp` ist in `obsidian.d.ts` evtl. nicht typisiert → schmaler lokaler Typ/Guard wie bei letterhead (`typeof … === "function"`).

### 5.3 Manifest + Plattform (`manifest.json`)

`isDesktopOnly: true` → `false`. minAppVersion bleibt `1.8.7` (hat `Platform`). Keine weiteren Manifest-Änderungen.

### 5.4 Reveal-in-Finder (`src/theme-source.ts`) — unverändert

Bleibt: `if (!(adapter instanceof FileSystemAdapter)) { new Notice(dir); return; }` → auf Mobile (kein FileSystemAdapter) greift der Notice-Fallback; der Electron-`require` wird nie erreicht. Kein Eingriff nötig.

## 6. Datenfluss & Lebenszyklus

```
exportImages (beide Plattformen):
  buildIsolatedDeck → off-screen iframe → für jede .sd-slide:
    domToCanvas(slideEl) → toDataURL("image/png") → bytes → adapter.writeBinary(<folder>/NN-<base>.png)
  dispose iframe (finally) · Notice(count)

exportPdf:
  buildIsolatedDeck → { slidesHtml, css }
  Desktop: print-iframe (allow-modals) → contentWindow.print() → afterprint→dispose (unverändert)
  Mobile:  html = isolatedDeckHtml({css, extraCss:PRINT_CSS, body})
           adapter.write(<folder>/<base>.html) → openWithDefaultApp(path) → Notice
```

## 7. Fehlerbehandlung & Degradation

- **`openWithDefaultApp` fehlt/wirft** → Notice mit dem geschriebenen Pfad (User öffnet manuell). Nie stiller Fehler.
- **`modern-screenshot` wirft** (foreignObject/Realm) → `try/catch` → Notice (`notice.exportFailed`), iframe-dispose im `finally` (wie heute).
- **Export-Ordner fehlt** → `mkdir` vor Schreiben (wie im PNG-Pfad heute).
- **Kein aktiver/Markdown-File** → bestehender `loadDeck`-Guard (Notice `noActiveNote`).
- **Mobile ohne `print-color-adjust`-Unterstützung im OS-Viewer** → Hintergrund evtl. hell; das HTML setzt es trotzdem (best effort).

## 8. Geparkte empirische Verifikationen (prototype-first, je mit Fallback)

Nicht harness-testbar (Node-vitest hat kein DOM/keine foreignObject-/Print-/Mobile-Engine) → **manueller Smoke auf Desktop + iOS** ist das Akzeptanz-Gate:

1. **modern-screenshot-Treue** (§5.1) — Wortabstände korrekt? KaTeX/Mermaid/Embeds erfasst? gebackener `transform:scale` geehrt? Knoten aus dem iframe-`contentDoc` serialisierbar? *Fallback:* Capture im Eltern-Dokument mit theme-neutralem Reset; oder `domToCanvas` im `contentWindow`-Kontext ausführen.
2. **Mobile-PDF via openWithDefaultApp** (§5.2) — öffnet iOS die `.html` in Safari, druckbar/teilbar zu PDF? *Fallback:* Notice mit Pfad + Anleitung; oder `.html` im Reading-View öffnen.
3. **Desktop-PDF unverändert** (§5.2) — `contentWindow.print()` weiterhin theme-isoliert (jetzt mit `print-color-adjust`, kuro auf Schwarz).
4. **isDesktopOnly:false** — Plugin lädt auf Mobile, kein Crash beim onload (Electron-Reveal nie ungeguardet erreicht).

## 9. Testing-Strategie

- **Core (82 vitest) bleibt grün** — `src/core/**` unangetastet; Purity-/Realm-Gates unberührt.
- **Unit-testbar (vitest, node):**
  - `chrome-css.test.ts`: `print-color-adjust: exact` in `PRINT_CSS` (✓ schon in `f94e6e7`).
  - Reiner HTML-Assembler: `isolatedDeckHtml` mit `PRINT_CSS` als `extraCss` enthält `@page` + die Folien (für den Mobile-Pfad).
- **Bundle-Smoke** (`scripts/bundle-smoke.mjs`) bleibt grün; ggf. Import-Check, dass `modern-screenshot` im Bundle auflöst (CJS/ESM-Interop — dieselbe Fehlerklasse wie KaTeX, daher in die Smoke aufnehmen).
- **Nicht unit-testbar** (§8) → **manueller Smoke Desktop + iOS** mit dem kuro/shiro-Demo-Deck.

## 10. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/chrome-css.ts` | `print-color-adjust: exact` in `PRINT_CSS` (**erledigt**, `f94e6e7`) |
| `src/export.ts` | PNG: `domToCanvas` statt `html2canvas`; PDF: `Platform`-Weiche + `exportDeckHtmlAndOpen`-Helper (HTML schreiben + `openWithDefaultApp`) |
| `manifest.json` | `isDesktopOnly: false` |
| `package.json` | `modern-screenshot` hinzufügen, `html2canvas` entfernen |
| `scripts/bundle-smoke-entry.ts` | (optional) Import-/Auflösungs-Check für `modern-screenshot` |
| `tests/**` | `isolatedDeckHtml`+`PRINT_CSS`-Assembler-Test (Mobile-Artefakt) |
| `AGENTS.md` | Export-Naht (modern-screenshot, Platform-Weiche, Mobile-PDF), `isDesktopOnly:false`, Abweichungs-Eintrag aktualisieren |
| `README` / `CHANGELOG` | Mobile-Support + Export-Treue beschreiben |

## 11. Offene Punkte für die Spec-Review / Plan
- **modern-screenshot-Aufrufkontext:** Knoten aus `host.contentDoc` direkt an `domToCanvas` geben vs. die Lib im `contentWindow` laufen lassen. Im Plan/Prototyp klären (§8.1).
- **Mobile-PDF-Datei aufräumen?** `.html` im Export-Ordner liegen lassen (auffindbar) vs. nach dem Öffnen löschen. Vorschlag: liegen lassen (wie die PNGs); im Plan bestätigen.
- **`openWithDefaultApp`-Typisierung:** schmaler lokaler Cast vs. `obsidian`-augmentation. Plan wählt den lint-saubersten Weg.

---

## Anhang A — Grounding-Belege

**Diagnose (Live-Artefakte, `Slide-Deck-Export/slide-deck-themes-demo/`):**
- PNG 01/03/05: kuro-Farben + Dark-Callout-Fix + dark-readable hljs **korrekt**, aber Fließtext-Wörter zusammengeklebt (html2canvas).
- kuro-PDF: typografisch **perfekt** (Print-Pfad), aber auf weißem Hintergrund (→ `print-color-adjust` fehlte, Bug B, gefixt `f94e6e7`).
- Schluss: identischer DOM, drei Konsumenten → der Wortbug liegt rein im html2canvas-Rasterizer; Themes sind korrekt.

**letterhead (`../obsidian-letterhead`, `isDesktopOnly:false`, `main.js`):**
- Weiche: `if (Platform.isDesktopApp) { doPrint(html, css); } else { await exportViaShare(html, css); }`.
- Code-Kommentar: *„window.print() is a no-op in the Obsidian mobile WebView, so write the letter as a standalone file into the vault and hand it to the system via openWithDefaultApp — the user prints it to PDF from Safari."*
- `exportViaShare`: schreibt eine self-contained Datei nach `.letterhead-export` → `await this.app.openWithDefaultApp(this.path)` (guarded mit `typeof this.app.openWithDefaultApp === 'function'`), Share-Modal mit „Öffnen"-Button.
- `doPrint`: `setTimeout(()=>{ try { window.print(); } catch { Notice } }, 150)` + `afterprint`-cleanup + Safety-Timer (dasselbe Muster wie slide-decks aktueller Desktop-PDF-Pfad).

**slide-deck Mobile-Blocker (Code-Scan):** nur `manifest isDesktopOnly:true` + `export.ts:38 frameWin.print()`. `theme-source.ts` Electron-`require` ist hinter `FileSystemAdapter`-Check (mobil-safe). html2canvas ist kein Blocker (reines Web), nur der Wortbug.
