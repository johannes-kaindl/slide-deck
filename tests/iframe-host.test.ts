import { describe, it, expect } from "vitest";
import { isolatedDeckHtml, createIsolatedDeckIframe } from "../src/iframe-host";

describe("isolatedDeckHtml", () => {
  it("builds a doctype document with css in head and body html in body", () => {
    const html = isolatedDeckHtml({ css: ".sd-slide{color:red}", bodyHtml: "<div class='sd-slide'>x</div>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>.sd-slide{color:red}</style>");
    expect(html).toContain("<body><div class='sd-slide'>x</div></body>");
  });

  it("appends extraCss after the base css (so chrome/print overrides win)", () => {
    const html = isolatedDeckHtml({ css: "BASE", bodyHtml: "", extraCss: "EXTRA" });
    expect(html.indexOf("BASE")).toBeLessThan(html.indexOf("EXTRA"));
    expect(html).toContain("<style>BASEEXTRA</style>");
  });
});

// Minimal fake DOM seam: enough of Document/HTMLIFrameElement to drive the lifecycle.
function makeFakeOwnerDoc() {
  const removed: any[] = [];
  let fontsResolve!: () => void;
  const contentDoc: any = {
    open() {}, write() {}, close() {},
    fonts: { ready: new Promise<void>((r) => { fontsResolve = r; }) },
    body: {}, documentElement: { scrollHeight: 700 },
  };
  const listeners: Record<string, (() => void)[]> = {};
  const iframe: any = {
    style: {}, sandbox: { value: "", add(v: string) { this.value = v; } },
    setAttribute(_k: string, v: string) { this.sandbox.value = v; },
    addEventListener(t: string, cb: () => void) { (listeners[t] ??= []).push(cb); },
    removeEventListener() {},
    set srcdoc(_v: string) { queueMicrotask(() => (listeners["load"] ?? []).forEach((cb) => cb())); },
    contentDocument: contentDoc, contentWindow: {},
    remove() { removed.push(iframe); },
  };
  const ownerDoc: any = {
    createElement: (tag: string) => (tag === "iframe" ? iframe : { style: {} }),
    body: { appendChild() {} },
  };
  return { ownerDoc, iframe, contentDoc, removed, fireFonts: () => fontsResolve() };
}

describe("createIsolatedDeckIframe", () => {
  it("sets the sandbox, resolves after load + fonts.ready, and disposes", async () => {
    const f = makeFakeOwnerDoc();
    const p = createIsolatedDeckIframe(f.ownerDoc as any, { css: "X", bodyHtml: "Y", offscreen: true });
    // Not resolved until fonts.ready settles:
    let settled = false;
    void p.then(() => (settled = true));
    await new Promise<void>((r) => setTimeout(r, 0)); // drain the full load→await microtask ladder
    expect(settled).toBe(false);
    f.fireFonts();
    const handle = await p;
    expect(f.iframe.sandbox.value).toBe("allow-same-origin");
    expect(f.iframe.style.left).toBe("-99999px"); // offscreen
    expect(handle.contentDoc).toBe(f.contentDoc);
    handle.dispose();
    expect(f.removed).toContain(f.iframe);
  });
});
