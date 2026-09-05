import { describe, it, expect } from "vitest";
import { parseSlot, filledMarkdown, replaceSlot, findSlotOnce, fenceSlot, SLOT_LANG } from "../src/image/slot-format";
// ImageFunctionModal wird in GUI-Smoke getestet; slotSnippet ist pure und hier testbar.
import { slotSnippet } from "../src/image/insert-slot";

describe("parseSlot", () => {
  it("reads a leading funktion: line and keeps the rest as prompt", () => {
    const r = parseSlot("funktion: metaphorical\nEisberg im Polarmeer,\nkaltes Blau");
    expect(r.funktion).toBe("metaphorical");
    expect(r.prompt).toBe("Eisberg im Polarmeer,\nkaltes Blau");
  });

  it("treats a missing or unknown value as no function", () => {
    expect(parseSlot("Eisberg").funktion).toBeNull();
    expect(parseSlot("funktion: metaphorisch-symbolisch\nEisberg").funktion).toBeNull();
  });

  it("puts unknown leading keys back into the prompt instead of eating them", () => {
    const r = parseSlot("stil: dramatisch\nfunktion: emotional\nEisberg");
    expect(r.funktion).toBe("emotional");
    expect(r.prompt).toBe("stil: dramatisch\nEisberg");
  });

  it("stops reading keys at the first line that is not one", () => {
    const r = parseSlot("funktion: analytical\nEisberg\nstil: egal");
    expect(r.funktion).toBe("analytical");
    expect(r.prompt).toBe("Eisberg\nstil: egal"); // die zweite key-Zeile ist Prompt
  });
});

describe("filledMarkdown", () => {
  it("writes a one-line comment plus the embed", () => {
    expect(filledMarkdown("metaphorical", "Eisberg\nkaltes Blau", "Bilder/a.png"))
      .toBe("<!-- image: metaphorical | Eisberg kaltes Blau -->\n![[Bilder/a.png]]");
  });

  it("writes 'none' when there is no function", () => {
    expect(filledMarkdown(null, "Eisberg", "Bilder/a.png"))
      .toBe("<!-- image: none | Eisberg -->\n![[Bilder/a.png]]");
  });

  it("defuses --> so the comment cannot end inside the prompt", () => {
    const md = filledMarkdown(null, "a --> b", "x.png");
    expect(md.startsWith("<!-- image: none | a --&gt; b -->")).toBe(true);
    expect(md.split("-->").length).toBe(2); // genau EIN Kommentar-Ende
  });
});

describe("replaceSlot", () => {
  const block = "```slide-image\nfunktion: emotional\nEisberg\n```";
  it("replaces the block when it occurs exactly once", () => {
    const src = `# Folie\n\n${block}\n\nText`;
    expect(replaceSlot(src, block, "![[a.png]]")).toBe("# Folie\n\n![[a.png]]\n\nText");
  });

  it("refuses when the block is gone — the note changed during the run", () => {
    expect(replaceSlot("# Folie\n\nText", block, "![[a.png]]")).toBeNull();
  });

  it("refuses when the block occurs more than once — which one was meant is unknown", () => {
    const src = `${block}\n\n${block}`;
    expect(replaceSlot(src, block, "![[a.png]]")).toBeNull();
  });
});

describe("fenceSlot", () => {
  it("wraps the body in the fence form used to search the note — the single source of it (G1)", () => {
    expect(fenceSlot("funktion: emotional\nEisberg")).toBe(
      "```" + SLOT_LANG + "\nfunktion: emotional\nEisberg\n```",
    );
  });

  it("matches the block replaceSlot expects, round trip", () => {
    const src = "funktion: emotional\nEisberg";
    const block = fenceSlot(src);
    const note = `# Folie\n\n${block}\n\nText`;
    expect(replaceSlot(note, block, "![[a.png]]")).toBe("# Folie\n\n![[a.png]]\n\nText");
  });
});

describe("findSlotOnce — W2 pre-flight check before the expensive run", () => {
  const block = "```slide-image\nfunktion: emotional\nEisberg\n```";

  it("is true when the block occurs exactly once", () => {
    expect(findSlotOnce(`# Folie\n\n${block}\n\nText`, block)).toBe(true);
  });

  it("is false when the block is missing — a different fence form, e.g.", () => {
    expect(findSlotOnce("# Folie\n\nText", block)).toBe(false);
  });

  it("is false when the block occurs more than once", () => {
    expect(findSlotOnce(`${block}\n\n${block}`, block)).toBe(false);
  });

  it("is false for an indented copy — a different string entirely", () => {
    const indented = block.split("\n").map((l) => `  ${l}`).join("\n");
    expect(findSlotOnce(`# Folie\n\n${indented}\n\nText`, block)).toBe(false);
  });
});

describe("slotSnippet", () => {
  it("produces a block that parseSlot reads back — the round trip is the contract", () => {
    const md = slotSnippet("analytical");
    expect(md.startsWith("```slide-image\n")).toBe(true);
    const body = md.replace(/^```slide-image\n/, "").replace(/\n```\n?$/, "");
    expect(parseSlot(body).funktion).toBe("analytical");
  });
});
