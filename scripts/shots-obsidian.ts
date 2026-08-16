/**
 * README-Bilder, die ein LAUFENDES Obsidian brauchen — Vorschau-Pane, Overflow-Warnung,
 * Einstellungen. Alles, was nur die Folien zeigt, nimmt `scripts/shots.mjs` ohne Obsidian
 * auf; hier steht ausschliesslich, was Obsidians eigene Oberflaeche im Bild braucht.
 *
 * ```bash
 * export STAGING_VAULTS_DIR="/pfad/zu/StagingVaults"
 * npm run build && npm run shots:obsidian -- --setup   # Vault bauen, dann Obsidian NEU STARTEN
 * npm run shots:obsidian                               # aufnehmen
 * npm run shots:obsidian -- --only preview-pane        # ein einzelnes Bild
 * ```
 *
 * Obsidian muss mit offenem Debug-Port laufen:
 *   kill <pid>   # Electron behandelt SIGTERM als Quit; `osascript quit` scheiterte mit -128
 *   open -a Obsidian --args --remote-debugging-port=9222
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Cdp, attachTo, closeExtraLeaves, openExisting, pollUntil } from "./lib/cdp";
import { boxAround, boxOf, capture, setWindowSize, withMetrics, writeShot } from "./lib/shot";
import { buildVault, stagingVaultDir } from "./lib/vault";

const PLUGIN_ID = "slide-deck";
const VAULT_NAME = "slide-deck";
const VIEW_TYPE = "slide-deck-preview";
const PORT = Number(process.env.OBSIDIAN_DEBUG_PORT ?? 9222);
const REPO = process.cwd();
const OUT = join(REPO, "docs/images");
const SHOT_OPTS = { outDir: OUT, captureWidth: 1200, thumbWidth: 380 };
/** Aufnahmefenster. Bewusst gross (entspricht einem Vollbild auf 14"-MacBook), aber FEST:
 *  Vollbild selbst waere geraeteabhaengig und damit auf zwei Rechnern zwei Bilder. */
const WINDOW: [number, number] = [1512, 945];

/** pngquant auf ein geschriebenes Bild. Gleiche Begruendung wie in scripts/shots.mjs: ohne
 *  diesen Schritt liegt jedes Fenster-Bild ueber dem 400-KB-Budget des Bild-Standards.
 *  Exit 99 = Zielqualitaet nicht erreichbar; dann bleibt das Original stehen. */
function compress(name: string): string {
  const datei = join(OUT, name);
  const vorher = statSync(datei).size;
  try {
    execFileSync("pngquant", ["--quality", "82-98", "--speed", "1", "--force", "--output", datei, datei], { stdio: "pipe" });
  } catch (e) {
    const fehler = e as { status?: number; code?: string };
    if (fehler.status === 99 || fehler.code === "ENOENT") return `${Math.round(vorher / 1024)} KB (unkomprimiert)`;
    throw e;
  }
  const kb = Math.round(statSync(datei).size / 1024);
  return `${kb} KB${kb > 400 ? "  ⚠ ueber dem Budget von 400 KB" : ""}`;
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

if (args.includes("--setup")) {
  const vaultDir = stagingVaultDir(VAULT_NAME);
  for (const zeile of buildVault({
    repoRoot: REPO, vaultDir, fixtureDir: join(REPO, "docs/images/fixture"), pluginId: PLUGIN_ID,
  })) console.log("· " + zeile);
  console.log(`\nVault: ${vaultDir}`);
  console.log("Jetzt Obsidian NEU STARTEN — der Vault wird erst beim Start gelesen.");
  process.exit(0);
}

/** Die Vorschau oeffnen und warten, bis wirklich Folien darin stehen. Der Blattwechsel
 *  allein beweist nichts: die View existiert, bevor sie gerendert hat.
 *
 *  Das Aufklappen ist kein Kosmetik-Schritt: `activatePreview()` legt die View in die
 *  RECHTE Sidebar (`getRightLeaf`). Ist die zu, entsteht ein Bild der blossen Notiz —
 *  fehlerfrei, vollstaendig, und ohne das Plugin darin. Genau so lief der erste Versuch. */
async function openPreview(cdp: Cdp, note: string): Promise<void> {
  if (!(await openExisting(cdp, note, "source"))) throw new Error(`Notiz fehlt im Vault: ${note}`);
  await cdp.evaluate(`await app.commands.executeCommandById("${PLUGIN_ID}:open-preview");`);
  await cdp.evaluate(`
    const rechts = app.workspace.rightSplit;
    if (rechts) {
      if (rechts.collapsed) rechts.expand();
      // Breit genug, dass die Folie mehr als eine Briefmarke ist; die Vorschau skaliert
      // das Deck auf die Blattbreite.
      if (typeof rechts.setSize === "function") rechts.setSize(640);
    }
    await new Promise((r) => setTimeout(r, 900));
  `);
  // Die Vorschau hat keinen Listener auf den Notizwechsel — sie zeigt weiter das zuletzt
  // gerenderte Deck, bis jemand "Refresh" drueckt. Ohne diesen Aufruf nahm der Lauf fuer
  // "Overflow example" (1 Folie) das Deck von "Quarterly Review" (5 Folien) auf und meldete
  // dabei Erfolg. Das ist derselbe Weg, den der Refresh-Knopf der Toolbar nimmt.
  await cdp.evaluate(`
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    if (leaf && typeof leaf.view.refresh === "function") await leaf.view.refresh();
    await new Promise((r) => setTimeout(r, 600));
  `);
  const folien = await pollUntil<number>(cdp, `
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    if (!leaf) return 0;
    const frame = leaf.view.containerEl.querySelector("iframe.sd-deck-iframe");
    if (!frame || !frame.contentDocument) return 0;
    return frame.contentDocument.querySelectorAll(".sd-slide").length;
  `, 25_000);
  if (!folien) throw new Error("Vorschau zeigt keine Folien");
  console.log(`  Vorschau steht (${folien} Folien)`);
}

async function diagnose(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    const frame = leaf && leaf.view.containerEl.querySelector("iframe.sd-deck-iframe");
    return JSON.stringify({
      vault: app.vault.getName(),
      datei: app.workspace.getActiveFile() ? app.workspace.getActiveFile().path : null,
      vorschau: Boolean(leaf),
      folien: frame && frame.contentDocument ? frame.contentDocument.querySelectorAll(".sd-slide").length : 0,
      warnungen: leaf ? leaf.view.containerEl.querySelectorAll(".sd-warn").length : 0,
      pluginAn: Boolean(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]),
    });
  `);
}

/** Box vom Container-Anfang bis zum unteren Rand seines LETZTEN Kindes. `boxOf` misst den
 *  Container, und dessen Hoehe ist die des sichtbaren Ausschnitts, nicht die des Inhalts. */
async function cdpBoxOfLast(cdp: Cdp, selector: string) {
  const raw = await cdp.evaluate<string | null>(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
    if (!el) return null;
    const kinder = [...el.children];
    if (!kinder.length) return null;
    const r = el.getBoundingClientRect();
    const letzte = kinder[kinder.length - 1].getBoundingClientRect();
    // NICHT max(Containerhoehe, Inhalt): im simulierten hohen Fenster ist der Container
    // so hoch wie die Simulation, und der Ausschnitt bekommt unten einen Streifen Leere
    // (schwarz, weil ausserhalb des gemalten Bereichs). Der Inhalt entscheidet, nie der
    // Rahmen — dieselbe Falle wie der tote Weissraum, nur eine Ebene frueher.
    return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: letzte.bottom - r.y + 16 });
  `);
  return raw ? (JSON.parse(raw) as { x: number; y: number; width: number; height: number }) : null;
}

const SHOTS: Record<string, (cdp: Cdp) => Promise<string>> = {
  // Das Bild, das dieses Plugin erklaert: die Notiz links, ihre Projektion rechts.
  "preview-pane.png": async (cdp) => {
    await setWindowSize(cdp, WINDOW[0], WINDOW[1]);
    await closeExtraLeaves(cdp);
    await openPreview(cdp, "Quarterly Review.md");
    return writeShot(cdp, "preview-pane.png", await capture(cdp), SHOT_OPTS);
  },

  // Fit-or-warn: die Folie wird markiert, nicht stumm beschnitten.
  "overflow-warning.png": async (cdp) => {
    await setWindowSize(cdp, WINDOW[0], WINDOW[1]);
    await closeExtraLeaves(cdp);
    await openPreview(cdp, "Overflow example.md");
    const warn = await pollUntil<number>(cdp, `
      const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
      return leaf ? leaf.view.containerEl.querySelectorAll(".sd-warn").length : 0;
    `, 15_000);
    if (!warn) throw new Error("keine Overflow-Warnung erschienen");
    console.log(`  ${warn} Warnung(en)`);
    // Bis zum Ende des DECKS klippen, nicht bis zum Ende des Blattes: darunter liegt nur
    // leerer Panel-Grund, und der bestuende jede Formpruefung als "Teil der Oberflaeche".
    const box = await boxAround(cdp, [".sd-toolbar", ".sd-warnings", ".sd-deck-host"], 8);
    if (!box) throw new Error("Vorschau-Blatt nicht sichtbar");
    // Kein Vorschaubild: H/B 0.95 liegt unter der 1.6-Grenze, das Bild wird inline gezeigt.
    return writeShot(cdp, "overflow-warning.png", await capture(cdp, box), SHOT_OPTS);
  },
};

// Die Einstellungen sind in Obsidian 1.13 ein EIGENES Fenster (url about:blank, Titel
// lokalisiert) — deshalb ueber die Sache waehlen, nicht ueber den Titel: das Fenster
// OHNE Workspace ist das Einstellungsfenster.
async function settingsShot(workspace: Cdp): Promise<string> {
  await workspace.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
  `);
  await new Promise((r) => setTimeout(r, 1200));
  const settings = (await attachTo("settings", PORT)) ?? workspace;
  // Der Tab ist hoeher als das Fenster und scrollt. Ohne simulierte Fensterhoehe endet das
  // Bild mitten in den Einstellungen — vollstaendig aussehend, weil unten sauber abgesetzt,
  // und trotzdem ohne die halbe Seite (hier fehlten Themes-Ordner oeffnen, Theme
  // exportieren, Ordner ausblenden, eigenes CSS).
  const png = await withMetrics(settings, 1100, 1900, async () => {
    await new Promise((r) => setTimeout(r, 700));
    // Bis zum LETZTEN Kind klippen, nicht auf den Container: dessen Box endet am
    // sichtbaren Bereich, der Inhalt geht darueber hinaus.
    const box = await cdpBoxOfLast(settings, ".vertical-tab-content");
    return capture(settings, box ?? undefined);
  });
  const hinweis = await writeShot(settings, "settings.png", png, { ...SHOT_OPTS, thumb: true });
  if (settings !== workspace) settings.close();
  await workspace.evaluate("app.setting.close();");
  return hinweis;
}

const vaultDir = stagingVaultDir(VAULT_NAME);
if (!existsSync(vaultDir)) throw new Error(`Aufnahme-Vault fehlt: ${vaultDir}\nErst: npm run shots:obsidian -- --setup`);

const cdp = await Cdp.attach(PORT, VAULT_NAME);
try {
  const namen = only ? [only.endsWith(".png") ? only : `${only}.png`] : [...Object.keys(SHOTS), "settings.png"];
  for (const name of namen) {
    try {
      const hinweis = name === "settings.png" ? await settingsShot(cdp) : await SHOTS[name](cdp);
      console.log(`✓ ${hinweis} → ${compress(name)}`);
    } catch (e) {
      // Ein Fehlschlag beendet den Lauf nicht — aber er meldet den Zustand, statt nur
      // "fehlgeschlagen" zu sagen. Diese Zeile ersetzt das Raten (nicht den Blick).
      console.log(`✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`  Zustand: ${await diagnose(cdp)}`);
    }
  }
} finally {
  cdp.close();
}
