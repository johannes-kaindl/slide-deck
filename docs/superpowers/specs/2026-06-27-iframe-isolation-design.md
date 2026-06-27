# iframe-Isolation — Design Spec

- **Status:** Implemented (feat/iframe-isolation) — pending merge to main
- **Datum:** 2026-06-27
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Branch:** `feat/iframe-isolation`
- **Baut auf:** CSS-Layouting (auf `main`, Merge `db56a71`) · [`2026-06-26-css-layouting-design.md`](2026-06-26-css-layouting-design.md)
- **Grounding:** 7-Investigator-Parallel-Recherche + adversariale Synthese (alle Architektur-Claims mit `file:line` belegt, siehe Anhang A). 4/7 Investigatoren lieferten; PNG/PDF/Mermaid waren durch den String-/Export-Pfad-Befund + Mermaid-Befund mitabgedeckt.

---

## 1. Zusammenfassung

Das aktive Obsidian-Theme **leakt** in die gerenderten Folien — in Preview **und** Export. Beobachtet: Kuro v4 erzwingt `JetBrains Mono` auf Headings, der PNG-Export zeigte Monospace statt der Theme-Sans. Ursache (Recherche): Folien werden heute in einem Off-Screen-Staging-`div` **im themed Dokument** gemessen und gerendert (`render-dom.ts:75-80`), also erreicht Obsidians App-/Theme-CSS sie. Das untergräbt das Theme-Feature: der Export sähe je Vault-Theme anders aus.

Diese Iteration isoliert die Folien gegen das Theme via **srcdoc-`<iframe>`** (nicht `!important`-Hardening — Specificity-Kämpfe sind brüchig, das iframe ist die saubere Naht: App-CSS erreicht den iframe-Inhalt gar nicht).

Leitidee: **ein Artefakt, drei isolierte Render-Flächen.** Genau ein Produzent serialisiert das Deck einmal zu `{ slidesHtml[], css }`; Preview, PNG und PDF rendern alle aus diesem identischen Artefakt, **jeweils in einem isolierten `sandbox="allow-same-origin"`-iframe** mit ausschließlich `deckCss`. Das schließt den Leak überall und verhindert Drift zwischen den drei Konsumenten.

> Phase-2 (LLM-Authoring) bleibt geparkt. Diese Iteration ändert **keinen** `src/core/**`-Code — nur die Adapter-Schicht und die Render-/Mess-Naht.

## 2. Goals

1. Folien rendern theme-isoliert: das aktive Obsidian-Theme erreicht weder Preview noch Export. Akzeptanz: Demo-Deck unter Kuro v4 → Headings in Theme-**Sans** (nicht JetBrains Mono); PNG/PDF sehen aus wie die Preview.
2. **Preview, PNG und PDF** teilen **ein** theme-isoliertes Build (`{ slidesHtml, css }`) — keine Pfad-Divergenz im gebackenen Scale.
3. Jede Render-Fläche ist ein `sandbox="allow-same-origin"`-iframe (Same-Origin für Messung; Scripts im Folien-HTML laufen **nicht** — Defense-in-Depth, da `markdown-it` mit `html:true` rohes Notiz-HTML durchreicht).
4. `fit-or-warn`, feste Geometrie (1280×720 / 960×720) und der Lesbarkeits-Boden bleiben **bitidentisch** garantiert — nur das Mess-Dokument wechselt.
5. Pure-Core-Naht bleibt erhalten: `src/core/**` unangetastet, Core-Purity-Check unberührt.
6. `renderDeckToContainer` wird **realm-sicher** (native DOM statt Obsidian-Augmentation), damit es gegen ein iframe-`contentDocument` laufen kann.

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Kein** Theme-Variablen-Durchfluss — Folien rendern voll neutral (nur `deckCss` + System-Fonts). Keine Obsidian-Accent-/Theme-Tokens fließen durch. Das ist der Zweck.
- ❌ **Kein** Folie-Klick→Quelle — der Warnungs-Streifen bleibt im Eltern-DOM und funktioniert unverändert (`preview-view.ts:77-80`); Folien bleiben inert. (Falls je gewünscht: via `postMessage`/iframe-Listener — der iframe ist nicht dagegen verdrahtet, aber auch nicht blockiert.)
- ❌ **Kein** pro-Folie-iframe — ein iframe fürs ganze Deck (Begründung §4).
- ❌ **Keine** neuen Themes/Layouts/Animationen — reine Isolations-Iteration.
- ❌ **Kein** Mobile-Support — bleibt `isDesktopOnly: true`.
- ❌ **Keine** Änderung an `computeFit`/`fit.ts`/Geometrie/Constraints — Mess-Logik unverändert.

## 4. Design-Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Scope | Preview **+** PNG **+** PDF aus **einem** isolierten Build (User-gewählt) | Export war das Symptom; geteiltes Artefakt schließt den Leak überall und verhindert „Drei-Konsumenten-Drift" (Anhang A, Risiko #6). |
| iframe-Granularität | **Ein** iframe fürs ganze Deck | Pro-Folie vervielfacht Realm-/Load-/`fonts.ready`-Kosten + N Mess-Handshakes ohne Nutzen — alle Folien teilen ein `deckCss`. `export.ts` macht heute schon `root.innerHTML = slidesHtml.join('')` unter **einem** `<style>`. |
| Sandbox | `sandbox="allow-same-origin"` (User-gewählt) | Same-Origin → Eltern kann `contentDocument` messen ✓; **keine** Script-Ausführung im Folien-HTML. Folien sind statisches HTML/SVG/CSS (Mermaid/KaTeX vorgebacken), brauchen keine Scripts. |
| Wo wird gemessen? | In **einem** Off-Screen-**Staging-iframe** mit `deckCss`, dort Scale baken, einmal serialisieren | Eltern-Staging (Status quo) misst themed Metriken = der Leak selbst. Native `scrollWidth/clientWidth` existieren in jedem Realm. |
| Preview-Zoom | Chromium-`zoom` aufs **`<iframe>`-Element** (auf `geoWidth=1280` dimensioniert) | iframe layoutet bei 1280 (native Overflow-Detection bleibt), Zoom skaliert nur den gemalten Kasten. ResizeObserver + `fitToWidth`-Formel bleiben, nur das Ziel wechselt. |
| Mermaid | Bleibt im Build-Realm; SVG-String wird vor Serialisierung gebacken | `mermaid.render` (`render-dom.ts:18`) gibt einen SVG-**String** ohne Container zurück, injiziert vor `outerHTML`-Capture → reist statisch ins iframe. Kein Mermaid-Runtime im Anzeige-iframe. |
| Overflow-Streifen | Stripe-CSS **nur** ins Preview-iframe; Warn-Klassen reisen inert in `slidesHtml` mit | Klassen sind schon in `slidesHtml` gebacken (`render-dom.ts:59-62`); ohne Stripe-CSS unsichtbar → Export bleibt automatisch stripe-frei. Einfacher als ein Eltern-Overlay. |
| PDF-Print | Aus dem **isolierten iframe** (`iframe.contentWindow.print()`) | **Verschärfung ggü. Recherche** (die mittlere Konfidenz für Eltern-Print hatte): Der Heading-Mono-Leak läuft genau über themed Render-/Print-CSS; „überall schließen" wurde gewählt. Bonus: das iframe enthält *nur* Folien → der „alles ausblenden"-Hack (`printRootCss`) entfällt, `@page` lebt im iframe. |

## 5. Architektur — ein Produzent, drei isolierte Konsumenten

```
                      buildIsolatedDeck()                 ← einziger Produzent
                  (Off-Screen Staging-iframe:
                   render + measure + bake scale
                   + serialize, dann teardown)
                              │
                   { slidesHtml[], css, warnings }
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   Preview-iframe        PNG: Capture-iframe    PDF: Print-iframe
   (persistent, im       (transient, html2canvas (transient,
    Pane; css +           je .sd-slide im         css + @page;
    PREVIEW_CHROME_CSS;   contentDocument)        contentWindow.print())
    zoom aufs Element)
```

Jede der vier Flächen ist ein isoliertes iframe (`sandbox="allow-same-origin"`, nur `deckCss`), erzeugt durch **einen** Helper.

### 5.1 Neuer Helper: `createIsolatedDeckIframe`

`src/iframe-host.ts` (neu, Adapter-Schicht):

```ts
createIsolatedDeckIframe(
  ownerDoc: Document,
  opts: { css: string; bodyHtml: string; extraCss?: string; offscreen: boolean }
): Promise<{ iframe: HTMLIFrameElement; contentDoc: Document; dispose: () => void }>
```

- Erzeugt `<iframe sandbox="allow-same-origin">` aus **`ownerDoc`** (Popout-Sicherheit — **nicht** ambient `activeDocument`, `dom-safe.ts:1`).
- `offscreen: true` → `position: fixed; left: -99999px; top: 0; width/height` gesetzt (**nicht** `display:none` — sonst unterdrückt der Browser das Layout, `scrollWidth` wird unbrauchbar).
- Inhalt: `<!doctype html><html><head><style>${css}${extraCss ?? ''}</style></head><body>${bodyHtml}</body></html>` via `srcdoc` **oder** `contentDocument.open()/write()/close()`.
- **Wartet auf `load`**, dann **`await contentDoc.fonts.ready`** (KaTeX-Glyph-Decode; heute wird `fonts.ready` *nirgends* awaited), dann Force-Reflow → erst dann nutzbar.
- `dispose()` entfernt das iframe und löst Listener.

> Net-neu: Async-Lifecycle (`load` + `fonts.ready` + Teardown). Es gibt heute **null** Async-Wait-Code (kein `rAF`, kein `fonts.ready`, kein `load`-Listener) — diese Timing-Schicht ist vollständig neu (Anhang A, Risiko #1).

### 5.2 Produzent: `buildIsolatedDeck` (Evolution von `buildSelfContainedDeckHtml`)

`src/render-dom.ts:67`. Heute: Off-Screen-`div` im themed Eltern-Dokument, misst, serialisiert. Neu:

1. `createIsolatedDeckIframe(ownerDoc, { css: deckCss(...), bodyHtml: '', offscreen: true })`.
2. `renderDeckToContainer(contentDoc, contentDoc.body, deck, resolveEmbed)` — rendert + misst **im iframe** (siehe §5.3, §6).
3. Pro `.sd-slide` `outerHTML` serialisieren (Scale ist als inline `transform:scale` gebacken, `render-dom.ts:58`).
4. `dispose()` → `{ slidesHtml, css, warnings }`.

Bleibt `async` (ist es schon wg. `renderMermaidSlots`). Reiner String-Produzent — Konsumenten besitzen ihre eigenen iframes.

### 5.3 `renderDeckToContainer` realm-sicher machen

`src/render-dom.ts:27-65`. Heute nutzt es 4 Obsidian-Augmentationen, die auf iframe-Realm-Nodes `is not a function` werfen (Anhang A, Risiko #4 — TS fängt das **nicht**, da die globale Augmentation die Methoden auf jedem `HTMLElement` vortäuscht):

| Zeile | Heute | Neu (nativ) |
|---|---|---|
| `:37` | `container.empty()` | `container.replaceChildren()` |
| `:39` | `container.createDiv({cls})` | `doc.createElement('div')` + `.className` + `appendChild` |
| `:42` | `box.createDiv({cls})` | dito |
| `:46` | `inner.createDiv({cls})` | dito |

`regionEl.innerHTML` (`:47`) und Mermaid-`slots[i].innerHTML` (`:19`) sind schon nativ. Die Funktion bekommt das Ziel-`doc` explizit durchgereicht (der `doc`-Param existiert bereits, ist aber unterausgenutzt) und nutzt `doc.createElement` statt `container.createDiv`. Danach läuft sie gegen **jedes** Dokument-Realm.

### 5.4 Konsument Preview

`src/preview-view.ts`. Heute: `renderDeckToContainer(activeDoc(), this.deckInner, ...)` rendert direkt ins Eltern-Pane. Neu:

- `refresh()` ruft `buildIsolatedDeck()` → `{ slidesHtml, css }`.
- Ein **persistentes** Preview-iframe (ersetzt `this.deckInner` als Render-Ziel) bekommt Inhalt: `css` + **`PREVIEW_CHROME_CSS`** (Overflow-Streifen + Card-Box-Shadow) + `slidesHtml.join('')`.
- `fitToWidth` (`preview-view.ts:91-99`) setzt `zoom` aufs **iframe-Element** (Breite = `geoWidth`); ResizeObserver bleibt auf `deckEl`.
- Warnungs-Streifen (`warnEl`) + `jumpTo` bleiben Eltern-DOM, **unverändert** (waren nie auf Folien-Nodes).
- iframe-Teardown in `onClose`.

### 5.5 Konsument PNG-Export

`src/export.ts:exportImages`. Heute: Off-Screen-`div` im themed Eltern-Dokument (`export.ts:54-57`) → das ist der PNG-Leak-Pfad. Neu: `buildIsolatedDeck()` → transientes Off-Screen-Capture-iframe (`css` + `slidesHtml`) → pro `.sd-slide` im `contentDoc` `html2canvas(slideEl, { width: geo.width, height: geo.height, scale, backgroundColor:'#fff' })` → `canvas.toDataURL` → `app.vault.adapter.writeBinary` nach `<exportFolder>/<base>/NN-<base>.png` (Schreib-Pfad **unverändert**, `export.ts:60-74`) → `dispose()`. **Geparkt §8.2:** html2canvas muss den gebackenen `transform:scale` ehren + iframe-`contentDocument`-Nodes erfassen.

### 5.6 Konsument PDF-Export

`src/export.ts:exportPdf`. Neu: `buildIsolatedDeck()` → transientes Off-Screen-Print-iframe (`css` + **`PRINT_CSS`** mit `@page { size: <geo> }` + Seitenumbruch je Folie) → `iframe.contentWindow.print()` → Teardown in `afterprint` (spiegelt das existierende `afterprint`/`safetyTimer`-Muster, `export.ts:33-43`). Der `printRootCss`-„alles-ausblenden"-Hack entfällt (das iframe enthält nur Folien). **Geparkt §8.3.**

## 6. Datenfluss & Lebenszyklus (net-neu)

```
buildIsolatedDeck:
  iframe an (offscreen) ──load──▶ head ← <style>deckCss</style>
    └▶ renderDeckToContainer(contentDoc, body, deck, resolveEmbed)
         └▶ await renderMermaidSlots(inner)        // SVG-String injiziert
       └▶ await contentDoc.fonts.ready             // KaTeX-Metriken
       └▶ Force-Reflow
       └▶ computeFit(inner.scrollWidth/clientWidth …)   // nativ, jeder Realm
       └▶ inner.style.transform = scale(fit.scale)      // gebacken
    └▶ slides = [...body.querySelectorAll('.sd-slide')].map(el => el.outerHTML)
    └▶ dispose()
  ▶ { slidesHtml, css, warnings }
```

**Teardown-Disziplin:** Staging-iframe sofort · Preview-iframe persistent → `onClose` · Print-iframe → `afterprint` · Capture-iframe → nach letztem `html2canvas`.

## 7. Fehlerbehandlung & Degradation

- **Nie vor `load`+`fonts.ready` messen.** `fonts.ready` mit **Safety-Timeout** (wie der existierende Print-`safetyTimer`), damit ein hängender Font-Decode nicht blockiert.
- **`scrollWidth === 0`-Guard:** als „nicht bereit" behandeln (ein `rAF` warten + erneut), nie durch ~0 teilen (sonst `needed=Infinity` → falscher Scale, falsche Overflow-Flags).
- **iframe-Erzeugung schlägt fehl** (same-origin, sollte nicht): Deck-Level-Warnung über den existierenden `collectWarnings`-Kanal; kein stiller Fehler.
- `computeFit`/Constraints **unverändert** → `fit-or-warn` bleibt bitidentisch.

## 8. Geparkte empirische Verifikationen (prototype-first, je mit Fallback)

Diese drei werden **zuerst** prototypt (de-risk vor dem Vollbau), weil sie die einzigen nicht-im-Code-beweisbaren Annahmen sind (happy-dom/Node haben keine Layout-Engine):

1. **Zoom aufs iframe-Element** (§5.4) — Scrollbar/Scroll-Container-Verhalten + ResizeObserver-Loop-Limit. Der Kommentar in `preview-view.ts:90` verlässt sich darauf, dass `zoom` (anders als `transform`) reflowed, damit die Scrollbar stimmt. *Fallback:* Zoom im iframe-Body, oder `transform:scale` aufs iframe + manuelle Scrollbar-Höhe.
2. **html2canvas-Treue** (§5.5) — ehrt den inline `transform:scale`? Erfasst iframe-`contentDocument`-Nodes (html2canvas klont intern in sein eigenes Sandbox-iframe)? *Fallback:* Capture in einem Eltern-Holder mit theme-neutralisierendem CSS-Reset.
3. **`contentWindow.print()` aus Off-Screen-iframe** (§5.6) — druckt ein `left:-99999px`-iframe? `@page` im iframe greift? *Fallback:* Eltern-Print-Root (Status quo) mit aggressivem Reset.

## 9. Testing-Strategie

- **Core (57 vitest) bleibt grün** — `src/core/**` unangetastet; Core-Purity-Check unberührt.
- **Unit-testbar (vitest + happy-dom):**
  - HTML/CSS-Assembly: `slidesHtml`+`css`-Konkatenation; `PREVIEW_CHROME_CSS` getrennt von `deckCss` (Export-Build enthält **keine** Stripes); `@page` im `PRINT_CSS`; `sandbox="allow-same-origin"` gesetzt.
  - iframe-Lifecycle-State-Machine mit gemocktem iframe (`load` → `fonts.ready` → `dispose`-Reihenfolge; Safety-Timeout).
  - **Realm-Sicherheits-Guard:** `renderDeckToContainer` gegen ein **nacktes** happy-dom-Dokument (ohne Obsidian-Augmentation) laufen lassen und beweisen, dass es **nicht** wirft → sichert dauerhaft ab, dass keine `createDiv`/`empty` zurückrutschen.
- **Bundle-Smoke** (`scripts/bundle-smoke.mjs`, in `npm test`) bleibt; deckt ESM/CJS, nicht Layout.
- **Nicht unit-testbar** (keine Layout-Engine): Mess-Fidelität, Zoom-Scrollbar, html2canvas-Treue, Print-Isolation → **manueller Smoke in Pallas**: deploy → Demo-Deck unter Kuro öffnen → Headings Sans? → PNG **und** PDF exportieren → theme-isoliert? Das ist der Pfad, auf dem der Leak ursprünglich beobachtet wurde = die echte Akzeptanzprobe. Die 3 geparkten Verifikationen (§8) werden hier abgehakt.

## 10. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/iframe-host.ts` | **neu** — `createIsolatedDeckIframe` + Lifecycle |
| `src/render-dom.ts` | `renderDeckToContainer` realm-sicher (4 Calls nativ); `buildSelfContainedDeckHtml` → `buildIsolatedDeck` (misst im Staging-iframe) |
| `src/preview-view.ts` | Preview-iframe statt `deckInner`; `zoom` aufs iframe-Element; `PREVIEW_CHROME_CSS` |
| `src/export.ts` | PNG: Capture-iframe; PDF: Print-iframe + `contentWindow.print()`; `printRootCss` → `PRINT_CSS` im iframe |
| `src/deck-css.ts` | `PREVIEW_CHROME_CSS` + `PRINT_CSS` exportieren (Chrome aus `deckCss` herauslösen) |
| `styles.css` | Overflow-Stripe-/Card-Regeln nach `PREVIEW_CHROME_CSS` migriert (aus dem Eltern-Pane raus) |
| `tests/**` | Assembly-, Lifecycle-, Realm-Guard-Tests |
| `AGENTS.md` | iframe-Naht + Realm-Regel dokumentieren |

## 11. Offene Punkte für die Spec-Review
- §8.2/§8.3 sind empirisch; falls ein Fallback nötig wird, ist er dokumentiert — kein Re-Design.
- `srcdoc`-Attribut vs. `contentDocument.open()/write()` für die Inhalts-Injektion: im Prototyp (§8) entscheiden, welcher robuster lädt; das Interface von `createIsolatedDeckIframe` kapselt die Wahl.

---

## Anhang A — Grounding-Belege (verifiziert, `file:line`)

- **Realm-Falle:** Obsidian patcht `Node/Element/HTMLElement`-Prototypen des **Eltern**-Realms (`node_modules/obsidian/obsidian.d.ts:49-74, 183-196`). srcdoc-iframe = same-origin, aber **eigener** Realm → `iframeDoc.createElement('div').createDiv` ist `undefined`. Sichere Regel: HTML als **String** im Eltern-Realm bauen, in den iframe injizieren (`export.ts:28-30,67` macht das schon). `obsidian.d.ts:215-220` (`onWindowMigrated`) + `:262-281` (`activeWindow/Document`) belegen, dass Obsidian explizit pro-Realm neu patcht.
- **String-Pfad existiert:** Core ist string-only (`md2html.ts:66-83`); `buildSelfContainedDeckHtml` nutzt `doc.createElement` (`render-dom.ts:70,75,78`), **nicht** `createDiv`; liefert `{ slidesHtml[], css, warnings }` (`:67-69,84`); `export.ts` konkateniert `<style>${css}</style>` + `slidesHtml.join('')`.
- **Mess-Mechanik:** synchron, `inner.scrollWidth/scrollHeight` vs. `clientWidth/clientHeight` auf `.sd-content` (`render-dom.ts:52-56`); `transform:scale` gebacken (`:57-58`); `minScale = minFontPx / preset.baseFontPx` (`:31-32`); kein `fonts.ready`/`rAF` heute.
- **Der Leak:** Mess-/Staging-`div` lebt im themed Eltern-Dokument (`render-dom.ts:75-80`) → Theme-CSS erreicht es. Das Mess-Dokument selbst muss isoliert werden (sonst werden themed Metriken gebacken).
- **Mermaid:** `mermaid.render(id, src)` ohne Container → SVG-**String**, injiziert vor `outerHTML` (`render-dom.ts:18-19,83`) → reist statisch ins iframe.
- **KaTeX/Assets:** woff2 als `data:`-URIs zur Build-Zeit inlined (esbuild `inlineKatexFonts`); hljs ist reines CSS ohne `url()` → in `about:srcdoc` identisch auflösbar (Recherche-Widerspruch *aufgelöst*: kein Asset-URL-Risiko; nur Font-**Decode**-Timing bleibt → `fonts.ready`).
- **Zoom:** `fitToWidth` setzt `zoom` auf `deckInner`, `factor = min(1, (deckEl.clientWidth-16)/geoWidth)` (`preview-view.ts:91-99`).
- **Popout:** iframe aus `contentEl.ownerDocument`, nicht ambient `activeDocument` (`dom-safe.ts:1`).

## Anhang B — Recherche-Limitierung

3/7 Investigatoren (PNG-Export, PDF-Export, Mermaid/KaTeX) erreichten den StructuredOutput-Retry-Cap und lieferten kein strukturiertes Ergebnis. Ihre Themen sind dennoch entscheidungs-vollständig abgedeckt: der DOM-/String-Pfad-Investigator traf den Export-Pfad mit `file:line` (`export.ts:28-30,67`), der Mermaid-Befund steckt im DOM-Investigator (`render-dom.ts:18-19`). Die verbleibenden PNG-/PDF-Unbekannten sind genau die geparkten §8.2/§8.3-Verifikationen — bewusst empirisch, nicht statisch beweisbar.
