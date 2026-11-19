import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/vendor/deck-core/pure/render/md2html";
import { MOBILE_EXPORT_CSP, mobileDeckHtml } from "../src/export";

const META = `<meta http-equiv="Content-Security-Policy" content="${MOBILE_EXPORT_CSP}">`;

describe("MOBILE_EXPORT_CSP", () => {
  it("sperrt Skripte (default-src 'none', kein script-src), erlaubt Fernbilder nur über https", () => {
    expect(MOBILE_EXPORT_CSP).toContain("default-src 'none'");
    expect(MOBILE_EXPORT_CSP).not.toMatch(/script-src/);
    expect(MOBILE_EXPORT_CSP).toMatch(/img-src [^;]*\bhttps:/);
    expect(MOBILE_EXPORT_CSP).not.toMatch(/img-src [^;]*\bhttp:(?!s)/);
    expect(MOBILE_EXPORT_CSP).not.toContain("unsafe-eval");
  });
});

describe("mobileDeckHtml (die lose Datei des mobilen PDF-Exports)", () => {
  it("trägt die Policy als erstes Kind des Kopfes nach dem charset, vor jedem Stil und jeder Folie", () => {
    const html = mobileDeckHtml({ css: ".sd-slide{}", bodyHtml: `<section class="sd-slide">x</section>`, extraCss: "@page{}" });
    const iMeta = html.indexOf(META);
    expect(iMeta).toBeGreaterThan(-1);
    expect(html.indexOf(`<meta charset="utf-8">`)).toBeLessThan(iMeta);
    expect(iMeta).toBeLessThan(html.indexOf("<style>"));
    expect(iMeta).toBeLessThan(html.indexOf("<body>"));
  });

  it("enthält die Policy genau einmal", () => {
    const html = mobileDeckHtml({ css: "", bodyHtml: "" });
    expect(html.split("Content-Security-Policy").length - 1).toBe(1);
    expect(html.split(META).length - 1).toBe(1);
  });

  it("setzt das meta direkt hinter das meta charset (die Stelle legt isolatedDeckHtml fest)", () => {
    expect(mobileDeckHtml({ css: "a{}", bodyHtml: "" })).toBe(
      `<!doctype html><html><head><meta charset="utf-8">${META}<style>a{}</style></head><body></body></html>`,
    );
  });

  it("Inhalt einer Folie mit Policy-Text ändert die Stelle nicht (kein Textersatz im Körper)", () => {
    const html = mobileDeckHtml({ css: "", bodyHtml: `<p>&lt;meta charset="utf-8"&gt;</p>` });
    expect(html.indexOf(META)).toBeLessThan(html.indexOf("<body>"));
    expect(html.split(META).length - 1).toBe(1);
  });
});

// Messung (Welle 27, A1a): auf dem Markdown-Weg steht kein Sanitizer. Die Zahl gehört in den
// CHANGELOG-Befund; der Renderer-Punkt PD1 misst dasselbe an der fertigen Datei.
describe("Messung: was aus der Notiz im Folien-HTML überlebt (renderMarkdown, Stufe vor dem DOM)", () => {
  const md = [
    `<script>window.__pd1 = 1</script>`,
    ``,
    `<img src="x" onerror="window.__pd1 = 2">`,
    ``,
    `<a href="javascript:window.__pd1=3">Klick</a>`,
    ``,
    `<iframe src="https://example.invalid/"></iframe>`,
    ``,
    `normaler Inhalt`,
  ].join("\n");
  const text = renderMarkdown({ markdown: md, resolveEmbed: () => null }).html;

  it("Gegenprobe: die Suche findet ein Muster in einem Text, der es sicher enthält", () => {
    expect(/<script/i.test(`<p><script>x</script></p>`)).toBe(true);
    expect(text).toContain("normaler Inhalt");
  });

  it("zählt die überlebenden Muster", () => {
    const survivors = {
      script: /<script/i.test(text),
      onerror: /onerror=/i.test(text),
      javascriptLink: /href="javascript:/i.test(text),
      iframe: /<iframe/i.test(text),
    };
    // 4 von 4: der Markdown-Weg sanitisiert nichts (md2html `html: true`). Fällt die Zahl, hat
    // jemand einen Sanitizer eingebaut, und die Policy der losen Datei ist neu zu bewerten.
    expect(survivors).toEqual({ script: true, onerror: true, javascriptLink: true, iframe: true });
  });
});
