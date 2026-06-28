import { describe, it, expect } from "vitest";
import { isolatedDeckHtml, createIsolatedDeckIframe } from "../src/iframe-host";
import { PRINT_CSS } from "../src/chrome-css";

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

// Fake DOM seam modelling the real iframe load race: connecting an iframe (appendChild)
// fires `load` for whatever document is current at that moment — about:blank if srcdoc has
// not been set yet, the srcdoc document if it has. Setting srcdoc on a connected iframe
// fires a second load. The helper must end up holding the SRCDOC document, never about:blank.
function makeFakeOwnerDoc() {
  const removed: any[] = [];
  let fontsResolve!: () => void;
  const srcdocDoc: any = {
    open() {}, write() {}, close() {},
    fonts: { ready: new Promise<void>((r) => { fontsResolve = r; }) },
    body: { childElementCount: 1 }, documentElement: { scrollHeight: 700 }, URL: "about:srcdoc",
  };
  const aboutBlankDoc: any = {
    fonts: { ready: Promise.resolve() }, // would resolve WITHOUT fireFonts → exposes the bug
    body: { childElementCount: 0 }, documentElement: { scrollHeight: 0 }, URL: "about:blank",
  };
  const listeners: Record<string, (() => void)[]> = {};
  let connected = false;
  let srcdocSet = false;
  let currentDoc: any = null;
  // A navigation is an ASYNC macrotask-level event: contentDocument only becomes the target
  // doc when its load fires (a real navigation, not a microtask), so the helper's await-load
  // continuation reads whatever document is current at THAT load — about:blank if it loaded
  // first. Modelling this (setTimeout, not queueMicrotask) is what exposes the race.
  const navigate = (doc: any) => setTimeout(() => { currentDoc = doc; (listeners["load"] ?? []).slice().forEach((cb) => cb()); }, 0);
  const iframe: any = {
    style: {}, sandbox: { value: "" },
    setAttribute(_k: string, v: string) { this.sandbox.value = v; },
    addEventListener(t: string, cb: () => void) { (listeners[t] ??= []).push(cb); },
    removeEventListener(t: string, cb: () => void) { listeners[t] = (listeners[t] ?? []).filter((x) => x !== cb); },
    set srcdoc(_v: string) { srcdocSet = true; if (connected) navigate(srcdocDoc); },
    get contentDocument() { return currentDoc; },
    contentWindow: {},
    remove() { removed.push(iframe); },
  };
  const connect = () => { connected = true; navigate(srcdocSet ? srcdocDoc : aboutBlankDoc); };
  const ownerDoc: any = {
    createElement: (tag: string) => (tag === "iframe" ? iframe : { style: {} }),
    body: { appendChild: connect },
    defaultView: globalThis,
  };
  return { ownerDoc, iframe, srcdocDoc, aboutBlankDoc, removed, fireFonts: () => fontsResolve() };
}

describe("createIsolatedDeckIframe", () => {
  it("captures the srcdoc document (not about:blank), resolves after load + fonts.ready, and disposes", async () => {
    const f = makeFakeOwnerDoc();
    const p = createIsolatedDeckIframe(f.ownerDoc as any, { css: "X", bodyHtml: "Y" });
    // Not resolved until fonts.ready settles. (If the helper captured about:blank, its
    // fonts.ready is already resolved and `settled` would flip true here — guarding the race.)
    let settled = false;
    void p.then(() => (settled = true));
    await new Promise<void>((r) => setTimeout(r, 0)); // drain the full load→await microtask ladder
    expect(settled).toBe(false);
    f.fireFonts();
    const handle = await p;
    expect(f.iframe.sandbox.value).toBe("allow-same-origin");
    expect(f.iframe.style.left).toBe("-99999px"); // parked offscreen during load
    expect(handle.contentDoc).toBe(f.srcdocDoc); // the populated doc, NOT about:blank
    expect(handle.contentDoc).not.toBe(f.aboutBlankDoc);
    expect(handle.contentDoc.URL).toBe("about:srcdoc");
    handle.reveal();
    expect(f.iframe.style.left).toBe(""); // reveal clears the offscreen positioning
    handle.dispose();
    expect(f.removed).toContain(f.iframe);
  });

  it("defaults the sandbox to allow-same-origin and accepts an override (allow-modals for print)", async () => {
    const f = makeFakeOwnerDoc();
    f.fireFonts();
    await createIsolatedDeckIframe(f.ownerDoc as any, { css: "X", bodyHtml: "Y", sandbox: "allow-same-origin allow-modals" });
    expect(f.iframe.sandbox.value).toBe("allow-same-origin allow-modals");
  });
});

describe("mobile PDF artifact", () => {
  it("isolatedDeckHtml + PRINT_CSS is a self-contained printable doc", () => {
    const html = isolatedDeckHtml({
      css: ".sd-slide{background:#000}",
      bodyHtml: '<div class="sd-slide">A</div>',
      extraCss: PRINT_CSS(1280, 720),
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("@page");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain('class="sd-slide"');
  });
});
