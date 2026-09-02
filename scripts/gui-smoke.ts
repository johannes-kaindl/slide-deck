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
 * ⚠️ **Zuerst pruefen, wer sonst an Obsidian haengt.** Der Quit trifft die Instanz, an der
 * moeglicherweise eine andere Session arbeitet, und zerstoert deren Zustand — der eigene
 * Lauf ist danach sauber gruen, der Schaden faellt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "laeuft bereits — NICHT beenden"
 * curl -s http://127.0.0.1:9222/json/list | grep -o '"title":[^,]*'   # wen trifft ein Quit?
 * ```
 *
 * Hoert der Port schon, dann **mitnutzen statt neu starten** — dieser Smoke braucht keinen
 * frischen Start. Fehlt nur der Ziel-Vault, oeffnet ihn ein zusaetzliches Fenster derselben
 * Instanz:
 *
 * ```bash
 * open "obsidian://open?vault=slide-deck"                    # registrierter Vault
 * open "obsidian://open?path=<datei-im-vault>"               # frisch gebauter, unbekannter
 * ```
 *
 * Muss es doch eine eigene Instanz sein (Absturz reproduzieren, dutzendfach neu laden): die
 * Sperre haengt am Profil, nicht am Rechner — mit eigenem `--user-data-dir` und eigenem Port
 * laeuft eine zweite Instanz neben der regulaeren (Rezept in der `AGENTS.md` des Dachs).
 *
 * ```bash
 * npm run build && OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/slide-deck npm run deploy
 * npm run smoke:gui -- --vault slide-deck
 * npm run smoke:gui -- --section vorschau --keep
 * ```
 *
 * Der Vault entsteht aus dem getrackten Fixture: `npm run shots:obsidian -- --setup` baut ihn
 * (dieselbe Quelle, `docs/images/fixture/`), damit dieser Lauf nicht vom Arbeitsvault abhaengt.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  Cdp,
  attachTo,
  closeExtraLeaves,
  notices,
  openExisting,
  pollUntil,
  setPluginSetting,
} from "../../tools/obsidian-cdp/cdp.js";
import { requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";
// Das Woerterbuch selbst, nicht eine Kopie seiner Form: daraus kommen sowohl die exakten
// Schluessel als auch die Praefix-Liste fuer B2. Eine im Treiber gepflegte Musterliste waere
// beim naechsten neuen Namensraum still blind — und genau diese Sorte Blindheit misst B2.
import { STRINGS_EN } from "../src/i18n";

const PLUGIN_ID = "slide-deck";
const VIEW_TYPE = "slide-deck-preview";
/** Fixture-Notizen (docs/images/fixture/notes/ — buildVault legt sie flach in den Vault). */
const DECK_NOTE = "Quarterly Review.md";
const OVERFLOW_NOTE = "Overflow example.md";
/** Die Folienzahl steht im Fixture, nicht im Code: fuenf `---`-getrennte Abschnitte. */
const DECK_SLIDES = 5;

// --- Protokoll ---------------------------------------------------------------

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Luecke nicht wie
 *  Abdeckung aussieht — ein stillschweigend ausgelassener Punkt liest sich hinterher
 *  wie ein gruener. */
function skipped(name: string, reason: string): void {
  console.log(`  – ${name} — uebersprungen: ${reason}`);
}

// --- Helfer ------------------------------------------------------------------

/** Vom Lauf angelegte Ordner — im `finally` in den PAPIERKORB, nie hart geloescht. */
const erzeugteOrdner: string[] = [];

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

    // A6: das Dropdown schaltet ephemer — Wirkung sofort sichtbar, Notiz unangetastet.
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
      "A6 Theme-Dropdown wirkt sofort und laesst die Notiz in Ruhe",
      sichtbar && ephemer,
      wechsel.fehler
        ? wechsel.fehler
        : `${wechsel.von} → ${wechsel.nach}: ${wechsel.vorher} → ${wechsel.nachher}` +
          ` · Frontmatter bleibt "${wechsel.frontmatter}"` +
          (sichtbar ? "" : " · ACHTUNG: kein sichtbarer Unterschied") +
          (ephemer ? "" : " · ACHTUNG: die Notiz wurde geschrieben"),
    );
  },
};

/** B — die Einstellungen. Ab Obsidian 1.13 ein eigenes Fenster; beide Faelle offen halten. */
const einstellungen: Section = {
  key: "einstellungen",
  title: "B · Einstellungen (i18n + Endpunkt-Editor)",
  async run(cdp, ctx) {
    await cdp.evaluate(`
      app.setting.open();
      app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
      await new Promise((r) => setTimeout(r, 1200));
      return true;
    `);

    // Erst im Hauptfenster nach dem Modal sehen, sonst auf das Settings-Fenster verbinden.
    // Nie ueber den Fenstertitel entscheiden — sein erstes Wort ist lokalisiert.
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

    const tab = await ziel.evaluate<{ gefunden: boolean; text: string; endpunkte: number }>(`
      const wurzel = document.querySelector(".vertical-tab-content-container .vertical-tab-content")
        ?? document.querySelector(".vertical-tab-content");
      if (!wurzel) return { gefunden: false, text: "", endpunkte: 0 };
      return {
        gefunden: true,
        text: wurzel.textContent,
        endpunkte: wurzel.querySelectorAll(".okit-ep-row").length,
      };
    `);
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

    if (eigenesFenster) ziel.close();
    await cdp.evaluate(`app.setting.close(); return true;`);
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
    if (angelegt) erzeugteOrdner.push(ordner);

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
      `C1 Themes-Ordner "${ordner}" ist im Explorer ausgeblendet`,
      versteckt.da && versteckt.display === "none",
      versteckt.da
        ? `display: ${versteckt.display}`
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

    await openPreview(cdp, DECK_NOTE);
    // Obsidians Toast ist global — in ihn schreibt jedes Plugin im Vault. Vor der Aktion
    // leeren, sonst liest der Punkt eine fremde Meldung.
    await cdp.evaluate(`
      for (const n of document.querySelectorAll(".notice")) n.remove();
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
    if (bilder) erzeugteOrdner.push(zielOrdner);
    record(
      `D1 Bilder-Export schreibt ${DECK_SLIDES} PNG nach "${bildOrdner}"`,
      bilder === DECK_SLIDES,
      bilder
        ? `${bilder} PNG > 1 KB${meldung ? ` · Meldung: ${meldung}` : ""}`
        : `keine vollstaendige Serie${meldung ? ` · Meldung: ${meldung}` : " · keine Meldung des Pruflings"}` +
          ` · ${await diagnose(cdp)}`,
    );
  },
};

const SECTIONS: Section[] = [vorschau, einstellungen, explorer, exportSektion];

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const keep = argv.includes("--keep");
  const sectionArg = flag("section");

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(`Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`);
  }

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster auf Port ${port}${vault ? ` fuer Vault "${vault}"` : ""}.\n` +
      "Laeuft Obsidian mit --remote-debugging-port? Bei mehreren Fenstern --vault <name> angeben.",
    );
  }

  // Ausserhalb des try: das finally muss auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben koennen.
  let vorherigeEinstellungen: string | null = null;

  try {
    // Ohne Fokus drosselt Chromium den Renderer, das Deck rendert nicht und JEDER Punkt
    // waere rot — die Suche begaenne dann am Plugin statt am Fenster.
    await cdp.send("Page.bringToFront");
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
      await cdp.send("Page.bringToFront");
      await new Promise((r) => setTimeout(r, 800));
    }
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    const fokus = await cdp.evaluate<boolean>(
      `return document.hasFocus() && document.visibilityState === "visible";`,
    );
    if (!fokus) {
      throw new Error(
        "Das Obsidian-Fenster hat keinen Fokus — Chromium drosselt dann den Renderer und jeder " +
        "Pruefpunkt waere rot, ohne dass am Plugin etwas fehlt. Fenster nach vorn holen und erneut fahren.",
      );
    }

    const vaultInfo = await cdp.evaluate<{ name: string; basePath: string; configDir: string }>(`
      return { name: app.vault.getName(), basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };
    `);
    console.log(`Vault: ${vaultInfo.name}`);

    // Gegen WELCHEN Build laeuft das hier? `manifest.version` ist dafuer strukturell blind
    // (Store- und Repo-Build tragen dieselbe Nummer). Der Pfad kommt aus der LAUFENDEN
    // Instanz, nicht aus stagingVaultDir() — ein Treiber kann per --vault an jedes Fenster
    // andocken, und ein Check am konfigurierten Ort pruefte dann eine Datei, die mit dem
    // Lauf nichts zu tun hat (Lesson 2026-09-02, kuro-gamification).
    requireEigenerBuild(
      join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID, "main.js"),
      join(process.cwd(), "main.js"),
    );

    // Neu laden, bevor irgendetwas gemessen wird: `npm run deploy` ersetzt nur Dateien, die
    // laufende Instanz behaelt den alten Code im Speicher. Ohne das misst der Smoke den
    // zuletzt geladenen Stand und meldet ihn als Ergebnis fuer den gerade gebauten.
    const plugin = await cdp.evaluate<{ an: boolean; version: string }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      if (app.plugins.plugins[id]) {
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
      }
      await app.plugins.enablePlugin(id);
      await new Promise((r) => setTimeout(r, 800));
      const p = app.plugins.plugins[id];
      return { an: Boolean(p), version: p ? p.manifest.version : "" };
    `);
    if (!plugin.an) throw new Error(`Plugin ${PLUGIN_ID} liess sich nicht aktivieren.`);
    console.log(`Plugin: ${PLUGIN_ID} ${plugin.version} (frisch geladen)\n`);

    vorherigeEinstellungen = await cdp.evaluate<string>(`
      return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings);
    `);

    for (const section of sections) {
      console.log(`── ${section.title}`);
      await section.run(cdp, { port, vault });
      console.log("");
    }
  } finally {
    // Aufraeumen haengt nie am Ergebnis: auch ein abgebrochener Lauf gibt den Vault so
    // zurueck, wie er ihn vorgefunden hat.
    if (vorherigeEinstellungen !== null) {
      await cdp
        .evaluate(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          Object.assign(plugin.settings, JSON.parse(${JSON.stringify(vorherigeEinstellungen)}));
          await plugin.saveSettings?.();
          if (typeof plugin.applyFolderHide === "function") plugin.applyFolderHide();
          return true;
        `)
        .catch(() => undefined);
    }
    if (!keep && erzeugteOrdner.length) {
      await cdp
        .evaluate(`
          for (const pfad of ${JSON.stringify(erzeugteOrdner)}) {
            // Papierkorb, nicht Hard-Delete: was ein Werkzeug im Vault des Maintainers
            // anfasst, muss zurueckholbar bleiben. Kennt der Index den frisch geschriebenen
            // Ordner noch nicht, erst indizieren lassen — und nur wenn das nichts bringt,
            // ueber den Adapter raeumen (dann ohne Papierkorb, deshalb die Meldung).
            let f = app.vault.getAbstractFileByPath(pfad);
            if (!f) { await new Promise((r) => setTimeout(r, 1500)); f = app.vault.getAbstractFileByPath(pfad); }
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
    await closeExtraLeaves(cdp).catch(() => 0);
    cdp.close();
  }

  const rot = results.filter((c) => !c.passed);
  console.log(`${results.length - rot.length}/${results.length} gruen`);
  if (rot.length > 0) {
    console.log("Rot:");
    for (const c of rot) console.log(`  - ${c.name}: ${c.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
