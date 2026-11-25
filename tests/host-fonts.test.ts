import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StyleSheetSource } from "../src/vendor/kit/collect-css";

// Die Einbindung von Obsidians Inter in die Deck-CSS (PNG-Export setzte Fliesstext 12,8 % breiter als die Vorschau, Welle 38).
// `buildIsolatedDeck` ist der eine Weg, auf dem Vorschau, Fit-Messung und Export ihre CSS bekommen: hier wird festgehalten, was
// er im Export als `customCss` erhaelt, und dass jeder Aufruf im Plugin durch `withHostFonts` geht.

const seen: string[] = [];
vi.mock("../src/vendor/deck-core/dom/render-dom", () => ({
  buildIsolatedDeck: vi.fn(async (_doc: unknown, _deck: unknown, _r: unknown, _reg: unknown, customCss: string) => {
    seen.push(customCss);
    throw new Error("stop nach buildIsolatedDeck");
  }),
}));
vi.mock("../src/adapter", () => ({
  loadDeck: vi.fn(async () => ({ deck: { slides: [{}], directives: { aspect: "16:9", theme: "kami" } }, resolveEmbed: () => null })),
}));

const { withHostFonts, exportImages, exportPdf } = await import("../src/export");

const INTER = `@font-face { font-family: "Inter"; src: url("./public/inter-latin.woff2") format("woff2"); font-weight: 100 900; }`;
const OTHER = `@font-face { font-family: "Lato"; src: url("./public/lato.woff2"); }`;

/** Ein Hauptdokument wie Obsidian 1.15.1: Inter relativ (`./public/…`), Basis `app://obsidian.md/`. */
function hostDoc(rules: string[]): StyleSheetSource {
  return {
    baseURI: "app://obsidian.md/index.html",
    styleSheets: [{ href: "app://obsidian.md/app.css", cssRules: rules.map((cssText) => ({ cssText })) }],
  } as unknown as StyleSheetSource;
}

describe("withHostFonts", () => {
  it("setzt Obsidians Inter-@font-face mit absoluter app:-URL vor das eigene CSS", () => {
    const css = withHostFonts(hostDoc([INTER, OTHER, ".x { color: red; }"]), ".sd-slide { --sd-bg: #fff; }");
    expect(css).toContain(`url("app://obsidian.md/public/inter-latin.woff2")`);
    expect(css).toMatch(/^@font-face \{[^}]*font-family: "?Inter"?/);
    expect(css).not.toContain("Lato");
    expect(css).not.toContain(".x {");
    expect(css.endsWith("\n.sd-slide { --sd-bg: #fff; }")).toBe(true);
  });

  it("laesst das eigene CSS unveraendert, wenn das Dokument kein Inter laedt", () => {
    expect(withHostFonts(hostDoc([OTHER]), "a{}")).toBe("a{}");
  });
});

describe("Export gibt die Schrift an buildIsolatedDeck weiter", () => {
  beforeEach(() => { seen.length = 0; });
  const app = { vault: { adapter: {} } } as never;
  const doc = hostDoc([INTER]) as unknown as Document;

  it("exportImages", async () => {
    await exportImages(app, doc, {} as Window, null, {} as never, undefined, 2, "b{}");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("app://obsidian.md/public/inter-latin.woff2");
    expect(seen[0].endsWith("b{}")).toBe(true);
  });

  it("exportPdf", async () => {
    await exportPdf(app, doc, {} as Window, null, {} as never, undefined, "c{}");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("app://obsidian.md/public/inter-latin.woff2");
    expect(seen[0].endsWith("c{}")).toBe(true);
  });
});

describe("jeder Aufruf von buildIsolatedDeck im Plugin geht durch withHostFonts", () => {
  // Die Vorschau (ItemView) laeuft in Node nicht; der Textabgleich deckt sie und kuenftige Aufrufe ab.
  const src = join(__dirname, "..", "src");
  const files = readdirSync(src).filter((f) => f.endsWith(".ts")).map((f) => join(src, f));
  const calls = files.flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return [...text.matchAll(/\bbuildIsolatedDeck\(([^;]*)\);/g)].map((m) => ({ f, args: m[1] }));
  });

  it("findet die drei Aufrufe (Vorschau, PNG, PDF)", () => {
    expect(calls.map((c) => c.f.split("/").pop()).sort()).toEqual(["export.ts", "export.ts", "preview-view.ts"]);
  });

  it.each(["export.ts", "preview-view.ts"])("%s", (name) => {
    for (const c of calls.filter((x) => x.f.endsWith(name))) expect(c.args).toMatch(/withHostFonts\(/);
  });
});
