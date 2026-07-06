import { describe, it, expect, vi } from "vitest";
import { runGenerateDeck } from "../src/generate-deck";

const opts = { model: "m", temperature: 0.3, maxTokens: 8192, suppressThinking: true };
const baseMessages = [{ role: "user" as const, content: "src" }];
function deps(client: any, over: any = {}) {
  return { client, messages: baseMessages, streamOpts: opts, themeKey: "dark", signal: new AbortController().signal, onState: () => {}, ...over };
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
});
