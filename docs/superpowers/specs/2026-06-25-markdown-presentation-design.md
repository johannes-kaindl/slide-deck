# markdown-presentation — Design Spec

- **Status:** Draft (zur User-Review)
- **Datum:** 2026-06-25
- **Profil:** `ts-node` · `obsidian-plugin` (Leitkonvention `_docs/CONVENTIONS.md`)
- **Arbeitstitel / manifest:** Name „Slide Deck", `id: slide-deck` *(beide vor erstem Asset gegen `community-plugins.json` verifizieren — PROF-OBS-11)*

---

## 1. Zusammenfassung

Ein Obsidian-Plugin, das aus einer Markdown-Notiz eine **Präsentation** macht und sie als **PDF** oder **Bilderserie** (PNG) exportiert. Folien werden mit einer **eigenen, portablen HTML-Pipeline** gerendert (kein Marp, keine fremde Markdown-Engine) — der reine Render-/Export-Kern ist bewusst **obsidian- und netzfrei** und damit gleichzeitig der **Seed** für (a) ein künftiges universelles `md2pdf`-Plugin und (b) das geteilte `obsidian-kit`.

Leitidee: Eine **Constraint-Engine** (feste Folien-Geometrie, Lesbarkeits-Boden, Accessibility) ist die *eine Quelle der Wahrheit* mit fünf Abnehmern — Export-Gate, Live-Warnungen, Menschen-Doku, LLM-Prompt und LLM-Grader. Sie macht die Design-Constraints **prüfbar statt erhofft**.

## 2. Goals

1. Aus einer Markdown-Notiz mit `---`-getrennten Abschnitten eine Folienserie erzeugen.
2. **Export PDF** und **Export Bilderserie (PNG)** mit identischer, fester Geometrie.
3. **Live-Vorschau** in einem Side-Pane, die beim Tippen aktualisiert und **Fit-or-warn-Warnungen** inline + als Liste zeigt.
4. **Presets** je nach Anlass, wählbar via `theme:` im Frontmatter (eigenes CSS, kein fremdes Theme-System).
5. Rendern von: Standard-Markdown, Bildern (inkl. `![[embed]]`), **Math** (KaTeX), **Code-Highlighting**, **Callouts**, **Mermaid** (→ statisches SVG).
6. Reiner Kern ohne Obsidian-/Netz-Kopplung (Node-testbar), hinter schmaler Schnittstelle → später ins Kit hebbar.
7. Konventions-Konformität ab Commit 1 (PROF-OBS-Toolchain, Lizenzen, README, Release).

## 3. Non-Goals (bewusst, YAGNI)

- ❌ **Keine** Animationen / Fragmente / Folien-Übergänge — Export-Tool, kein Live-Show-Tool.
- ❌ **Kein** PPTX-/Keynote-Export.
- ❌ **Kein** WYSIWYG-Editor — Autoring bleibt Markdown (das ist der Punkt).
- ❌ **Kein** Dataview-/Runtime-Query-Rendering (laufzeitgebunden, unverträglich mit einer portablen Engine).
- ❌ **Kein** geteiltes `obsidian-kit` in *diesem* Projekt — das ist ein separates Projekt (siehe §15).

Jedes Non-Goal ist später nachholbar, *wenn* ein echter Bedarf auftaucht — nicht auf Vorrat.

## 4. Design-Prinzipien (governing constraints)

Diese Prinzipien sind **strukturell erzwungen**, nicht nur dokumentiert:

| Prinzip | Mechanismus |
|---|---|
| **Wenig Platz, feste Bühne** | Feste Folien-Geometrie (16:9, **1280×720 logische px**, 4:3 als Preset-Option). Identisch für Vorschau, PDF, Bilder. |
| **Lesbarkeit ist heilig** | **Fit-or-warn statt shrink-to-fit:** Auto-Fit skaliert nur bis zu einem **Lesbarkeits-Boden** (Mindest-Schriftgröße, default **24 px** Body @720p, einstellbar). Was darunter nicht passt, wird **markiert**, nicht weggeschummelt. |
| **Jedes Element hat klare Funktion** | Zurückhaltendes Default-Preset: starke Typo-Hierarchie, großzügiger Weißraum, **keine Deko**. Keine Stil-Optionen „weil schön". |
| **Best practices / Accessibility** | Kontrast **WCAG-AA**; **nie Bedeutung allein über Farbe** — Callouts/Hervorhebungen tragen Icon + Form + Text redundant (rot-grün-sicher; LESSONS 2026-06-24 WCAG 1.4.1). |

## 5. Architektur

Harte Naht zwischen **Obsidian-Adapter** (gekoppelt) und **Pure Core** (portabel):

```
markdown-presentation/
├─ [Obsidian-Adapter-Seite]                     gekoppelt an obsidian/DOM/Netz
│   ├─ main.ts            Plugin-Lifecycle, Commands, Settings-Registrierung
│   ├─ adapter.ts         Notiz lesen · ---split · ![[embed]]→Pfad auflösen
│   ├─ preview-view.ts    Live-Preview-Pane (debounced) + Warning-UI
│   ├─ export-host.ts     Print-/Capture-Fenster orchestrieren (Obsidian/Electron)
│   ├─ settings.ts        Settings-Tab (vanilla Setting-API, PROF-OBS-06)
│   └─ llm-assist.ts      ⟂ Phase 2, OPTIONAL, network (reuses vault-rag chat client)
│
└─ [PURE CORE]  src/core/                        zero obsidian-import · Node-testbar · md2pdf-Seed
    ├─ slide-model.ts     SlideDeck-Modell (Folien-Markdown + Frontmatter/Direktiven)
    ├─ render/
    │   ├─ md2html.ts      markdown-it + KaTeX + Code-Highlight + Callouts
    │   ├─ mermaid.ts      Mermaid → statisches SVG (Pre-Render-Pass, content-hash-cached)
    │   └─ embeds.ts       Embed-Platzhalter-Auflösung (Pfade vom Adapter injiziert)
    ├─ presets/           CSS-Presets (default, …) + Preset-Loader
    ├─ layout/
    │   └─ fit.ts          Auto-Fit bis Lesbarkeits-Boden, Overflow-Erkennung
    ├─ constraints/
    │   ├─ engine.ts       Validierung Deck→Warnungen (Single Source of Truth)
    │   └─ contract.ts     getAuthoringContract() → maschinenlesbarer Regel-Export
    └─ export/
        ├─ pdf.ts          Deck-HTML → PDF (feste Geometrie)
        └─ images.ts       Deck-HTML → PNG-Serie (feste Geometrie)
```

**Naht-Vertrag:** Der Adapter reicht dem Core *aufgelöste* Daten (Folien-Markdown + Embed-Pfade als Daten/Data-URLs) und bekommt *reines* HTML/SVG + Warnungen zurück. Der Core importiert **nie** `obsidian`, nutzt **nie** `fetch`/globales `document`. (PROF-OBS-03/04/12/13.)

### Die eine Quelle der Wahrheit, fünf Abnehmer

```
                 ┌─ Export-Gate     (PDF/Bilder nur sauber raus)
                 ├─ Live-Warnings   (beim Tippen im Preview-Pane)
constraints/ ────┼─ Menschen-Doku   (was ist eine gültige Folie?)
  engine+contract├─ LLM-Prompt      (Phase 2: „bau daraus eine Präsentation, HIER die Regeln")
                 └─ LLM-Grader      (Phase 2: Folie 4 läuft über → zurück ans LLM → Selbstkorrektur)
```

## 6. Folien-Modell

- **Split:** Eine Zeile, die nur `---` enthält (horizontale Linie), beginnt eine neue Folie. Die Notiz bleibt gültiges Obsidian-Markdown.
- **Deck-Frontmatter** (YAML am Notizanfang) steuert das Deck:
  - `theme: <preset>` — Preset/Look (default `default`).
  - `aspect: 16:9 | 4:3` (default `16:9`).
  - `minFontPx: <n>` — überschreibt den Lesbarkeits-Boden (default 24).
  - weitere Direktiven additiv, konservativ ergänzt (YAGNI).
- **Pro-Folie-Direktiven:** optional via HTML-Kommentar am Folienanfang (z.B. `<!-- slide: bg=… -->`) — minimal gehalten, nur wenn ein echter Bedarf besteht.

## 7. Rendering-Pipeline

1. **Parse & Split** → `SlideDeck` (Array von Folien-Markdown + Deck-Direktiven).
2. **Embed-Auflösung:** `![[bild.png]]` → echter Pfad/Data-URL (Pfade vom Adapter injiziert; Core bleibt vault-agnostisch). Fehlende Embeds → Platzhalter + Warnung.
3. **Mermaid-Pre-Render:** Alle `mermaid`-Codeblöcke werden **vorab** zu statischem SVG gerendert (async), content-hash-gecached. Parse-Fehler → Fehler-Platzhalter auf der Folie + Warnung (kein Deck-Crash).
4. **md2html:** `markdown-it` + `markdown-it-katex` (KaTeX) + Code-Highlight (**highlight.js**, sync; Shiki als späteres Upgrade vermerkt) + **Callout-Plugin** (eigenes, kleines markdown-it-Plugin: `> [!type] Titel` → Callout mit Icon+Label+Rahmen, **farbfehlsichtigkeits-sicher**).
5. **Preset-CSS** anwenden (`theme:`), feste Geometrie setzen.
6. **Fit-Pass** (§8) je Folie.
7. Ergebnis: **self-contained Deck-HTML** (alle Styles/Fonts/SVG inline) → identische Quelle für Preview *und* Export.

**Bundle-Hinweis:** Mermaid ist das einzige echte Gewicht (~mehrere 100 KB). Bewusst akzeptiert, weil Diagramme kommunizieren (passt „bauen, weil es Sinn macht"). KaTeX/highlight.js sind moderat.

## 8. Fit-or-warn & Constraint-Engine

- **Auto-Fit:** Pro Folie wird der Inhalt gemessen; passt er nicht in 1280×720, wird **bis zum Lesbarkeits-Boden** herunterskaliert (Schriftgröße/Skalierung). 
- **Boden erreicht und immer noch Overflow** → die Folie wird **als Warnung markiert** (`overflow`), **nicht** weiter geschrumpft.
- **Warning-Modell:** `{ slideIndex, kind: 'overflow' | 'belowFloor' | 'missing-embed' | 'mermaid-error' | 'low-contrast', message, sourceLine? }`. `sourceLine` erlaubt Rücksprung in den Editor.
- **`getAuthoringContract()`** emittiert dieselben Regeln maschinenlesbar (Geometrie, Boden, unterstützte Syntax, Preset-Fähigkeiten) — billig, auch ohne LLM nützlich (Doku) und macht den Core „LLM-ready by construction".

## 9. Live-Vorschau

- Eigener **Side-Pane-View** (`ItemView`), der das aktive Deck rendert.
- **Debounced** Re-Render bei Editor-Änderungen (z.B. 250–400 ms). **Mermaid nur gedrosselt** neu rendern (teuer) — Diagramme aus dem Hash-Cache wiederverwenden, wenn unverändert.
- Warnungen erscheinen **inline als Badge** auf der betroffenen Folie **und** als **Liste** oben; Klick auf eine Warnung springt zur `sourceLine`.
- Popout-sicher (PROF-OBS-13): `activeDocument`/`activeWindow`, kein globales `document`, Cleanup via Auto-Registrierung.

## 10. Export

**Anforderung:** PDF und Bilderserie teilen **dieselbe feste Geometrie** wie die Vorschau; programmatisch (ohne Dialog) bevorzugt; Desktop-first.

- **PDF:** Deck-HTML mit `@page { size: 1280px 720px; margin: 0 }` + `break-after: page` je Folie. Primär programmatisch über Electron `printToPDF` (`preferCSSPageSize`, `printBackground`), Fallback `window.print()` (dialogbasiert, à la `obsidian-letterhead`). Vektor-Fidelity.
- **Bilderserie (PNG):** Jede Folie wird in fester Pixelgröße gerastert (default 2× → 2560×1440 für scharfe Bilder). Primär Electron `capturePage()` eines isolierten Deck-Fensters/-Bereichs; `html2canvas` als portabler Fallback.
- **Ziel/Naming:** Export in vom User wählbaren Ordner; `<note>-NN.png` bzw. `<note>.pdf`.
- **Plattform:** MVP **`isDesktopOnly: true`** (Export hängt an Electron-Print/Capture; ehrlich gemäß PROF-OBS-14). Mobiler Pfad (`window.print()` + System-Share, wie letterhead) ist eine **spätere** Erweiterung.

> ⚠️ **Export ist die Risiko-Naht.** Erste Aufgabe im Plan ist ein **Export-Spike gegen die echte App** (LESSONS 2026-06-23: echter E2E-Smoke fängt, was Spec/Plan/Review nicht sehen) — Mechanismus validieren, *bevor* UI darum gebaut wird.

## 11. Speaker Notes (Seam vorhanden, Bau geparkt)

- Autoring-Idee: ein **eingeklapptes Callout** je Folie (z.B. `> [!speaker]- …`), das im Folien-Body nicht erscheint, sondern als Notiz erfasst wird.
- Der Core trägt das Feld bereits im Folien-Modell (`speakerNotes?: string`), Renderer/Export ignorieren es vorerst. Späterer Einbau: Notes-Seiten im PDF / separater Export — ohne Architektur-Bruch.

## 12. Phase 2 — LLM-gestützte Generierung (vorgedacht, später gebaut)

- **Modul `llm-assist.ts`** auf der **Obsidian-Adapter-Seite**, **nie** im Pure Core (sonst kehrt Netz-Kopplung in die portable Engine zurück).
- **Flow:** Notiz + `getAuthoringContract()` → LLM → Deck-Markdown → **derselbe** Core-Pfad + **derselbe** Validator. 
- **Modi:** *one-shot* und *stufenweise* (klären → freigeben). Das Stufenweise ist die **Validate→Refine-Schleife**: erzeugen → validieren (Fit-or-warn) → Warnungen zurück → verdichten → User-Freigabe.
- **Reuse:** vault-rag Chat-Client. Markdown-presentation wäre damit der **dritte** LLM-Consumer → öffnet die Kit-`llm-client`-Frage erneut (siehe §15). Netz strikt via `requestUrl`/XHR (PROF-OBS-12), settings-gated, mobil-bewusst. Notfalls später als **eigenes Plugin** abspaltbar.

## 13. Datenfluss

```
Editor-Notiz ──(adapter: read/split/resolve)──► SlideDeck(+embed-Pfade)
   └► core.render ─► mermaid-prerender ─► md2html ─► preset-css ─► fit ─► Deck-HTML + Warnings[]
        ├► preview-view  (Deck-HTML rendern, Warnings anzeigen)
        └► export-host   (Deck-HTML → pdf.ts | images.ts → Datei)
(Phase 2) llm-assist: Notiz + contract ─► LLM ─► Deck-Markdown ─► (zurück in core.render)
```

## 14. Konventions-Konformität (PROF-OBS-Checkliste)

- **OBS-01/11:** `id: slide-deck` (kebab, ohne „obsidian", unique-Check + früh pinnen, entkoppelt von Repo-Slug/CSS-Prefix/ViewType).
- **OBS-03/04:** `src/core/**` ohne `obsidian`-Import, Node-testbar (CI-grep-Gate).
- **OBS-06:** Settings-Tab vanilla Setting-API, gruppiert, sentence-case, kein eigenes CSS auf `.setting-item`.
- **OBS-07:** i18n EN/DE via `t()`-Muster, kanonische `pickLang/setLang/getLang/t(key,...args)`-Signatur (kit-ready, reines `i18n.ts`).
- **OBS-08/10:** `eslint-plugin-obsidianmd` type-checked als `npm run lint` + CI-Gate; `versions.json`; `minAppVersion` = höchste real aufgerufene API.
- **OBS-09:** Tag-getriggerte `release.yml` (SemVer ohne v), Assets `main.js`+`manifest.json`+`styles.css`.
- **OBS-12/13:** Netz (Phase 2) nur `requestUrl`/XHR; kein `innerHTML`, popout-safe, `dom-safe.ts`-Helfer (kanonisch, kit-ready).
- **OBS-14:** Commands ohne Default-Hotkeys/Präfix, `isDesktopOnly` ehrlich, README mit absoluten Links + `README.de`.
- **META-07/08:** Code AGPL-3.0; Doku CC BY-SA 4.0 (`LICENSE-DOCS`).
- **Scaffold:** Start aus `_docs/templates/obsidian-plugin/` (esbuild, vitest+obsidian-Mock, eslint.config + eslint.portal.config, version-bump, release.yml, README-START).

## 15. Kit-Beziehung & Sequencing

- **Plugin zuerst.** Der einzige wirklich neue Wert (html-export) hat null bestehende Impl → hier sauber bauen, wird der Seed.
- **„kit-ready":** `i18n.ts` + `dom-safe.ts` in **kanonischer** Form als lokale Kopien; Export hinter schmaler Schnittstelle → später 1:1 ins Kit hebbar.
- **Zwei getrennte Kit-Workströme:** (a) **jetzt/parallel, separates Projekt:** AI-Plugin-Dedup (think_splitter byte-identisch, http, i18n, capabilities) aus image-to-markdown + vault-rag. (b) **später:** Export-Engine-Extraktion, *nachdem* dieses Plugin die API bewährt hat (Survey-Risiko: keine unausgereifte Slide-API einfrieren).
- **Mechanismus** (wenn das Kit kommt): eigenes Codeberg-Repo `obsidian-kit`, eingebunden als **git-Dependency gepinnt auf Release-Tag**; esbuild inlined es. Sub-Pfade `pure` vs `obsidian` gegen Import-Leck.

## 16. Testing-Strategie

- **Pure Core (vitest, Node):** Snapshot-Tests md2html; Callout-Transform; Fit-Logik (Inhalt+Geometrie → erwartete Warnungen); Constraint-Contract-Emission; Mermaid-Pre-Render (gemockt). Ziel: hohe Abdeckung im Core.
- **Adapter:** dünn, gegen obsidian-Mock (`tests/__mocks__/obsidian.ts`).
- **Export:** **Spike + manueller Smoke auf echter App** zuerst (Risiko-Naht); danach so viel wie sinnvoll automatisierbar.
- **Kein `.only/.skip`** im Commit (PROF-TS-03).

## 17. Fehlerbehandlung

- Mermaid-Parse-Fehler → Fehler-Platzhalter auf Folie + Warnung, Deck rendert weiter.
- Fehlender Embed → Platzhalter + `missing-embed`-Warnung.
- Overflow trotz Boden → `overflow`-Warnung (kein Crash, kein Schrumpfen darunter).
- Export-Fehler → `Notice` mit klarer Ursache, kein State-Verlust.
- Leeres/markerloses Deck → freundlicher Hinweis, wie man Folien trennt.

## 18. Offene Detail-Entscheidungen (mit Default, im Plan final)

1. **manifest `id`/`name`** gegen `community-plugins.json` verifizieren (Default `slide-deck` / „Slide Deck").
2. **Preset-Set** für Release 1 (Default: ein exzellentes, accessibles `default`-Preset; weitere additiv).
3. **Lesbarkeits-Boden-Default** (Vorschlag 24 px Body @720p) — am echten Output kalibrieren.
4. **Code-Highlight:** highlight.js (MVP) vs Shiki (später).
5. **Bilder-Export:** capturePage (Desktop, scharf) vs html2canvas (portabel) — Spike entscheidet primär/fallback.

## 19. Meilensteine (grobe Bau-Reihenfolge für den Plan)

1. **Scaffold** aus Template + manifest/id + Toolchain (eslint-obsidianmd, vitest, release.yml) grün.
2. **Export-Spike** gegen echte App (PDF + 1 PNG, feste Geometrie) — Mechanismus festnageln.
3. **Pure Core:** slide-model → md2html (Standard + Math + Code) → preset-css → fit → constraints/engine + contract. Voll getestet.
4. **Callouts + Mermaid** in die Pipeline.
5. **Obsidian-Adapter:** Commands, Embed-Auflösung, Settings (i18n, dom-safe kanonisch).
6. **Live-Preview-Pane** mit Warnings (debounced, mermaid-throttled).
7. **Export-Befehle** (PDF + Bilderserie) auf Spike-Basis.
8. **Doku/Release:** README (+de, absolute Links), CHANGELOG, versions.json, erstes Release.
9. **(Phase 2, separat)** llm-assist + (separates Projekt) Kit-Cleanup.

---

*Referenz-Plugins (read-only): `obsidian-letterhead` (Print/@page/Share-Pfad), `image-to-markdown` & `vault-rag` (i18n/dom-safe/http/llm-Muster), Scaffold `_docs/templates/obsidian-plugin/`.*
