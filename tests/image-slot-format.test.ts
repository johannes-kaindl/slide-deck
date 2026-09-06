import { describe, it, expect } from "vitest";
import { parseSlot, filledMarkdown, replaceSlot, findSlotOnce, fenceSlot, SLOT_LANG } from "../src/image/slot-format";
// ImageFunctionModal wird in GUI-Smoke getestet; slotSnippet ist pure und hier testbar.
import { slotSnippet, promptLineOffset } from "../src/image/insert-slot";
import { IMAGE_FUNCTIONS } from "../src/image/functions";

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

describe("promptLineOffset", () => {
  // Der Cursor soll nach dem Einfuegen in der leeren Prompt-Zeile stehen. Frueher war das
  // eine feste 2 im Aufrufer — sie haengt an der genauen Form von `slotSnippet`, und eine
  // Formaenderung haette den Cursor still woanders abgesetzt. Der Test prueft deshalb die
  // BEZIEHUNG, nicht die Zahl: die errechnete Zeile muss leer sein UND innerhalb des Blocks
  // liegen. Damit ueberlebt er eine Formaenderung, statt sie zu zementieren.
  it("points at an empty line inside the block, for every function", () => {
    for (const fn of IMAGE_FUNCTIONS) {
      const md = slotSnippet(fn);
      const zeilen = md.split("\n");
      const ziel = zeilen.length - 1 - promptLineOffset(md);
      expect(zeilen[ziel]).toBe("");
      expect(ziel).toBeGreaterThan(0);                       // nicht die Fence-Kopfzeile
      expect(ziel).toBeLessThan(zeilen.lastIndexOf("```"));  // vor dem schliessenden Fence
    }
  });

  // Gegenprobe im selben Test: bei einem Schnipsel mit einer Zeile mehr wandert das Ziel mit.
  it("moves with the shape instead of staying at a fixed number", () => {
    const schmal = "```x\nfunktion: a\n\n```\n";
    const breit = "```x\nfunktion: a\nstil: b\n\n```\n";
    expect(promptLineOffset(schmal)).toBe(2);
    expect(promptLineOffset(breit)).toBe(2);
    const zeilenBreit = breit.split("\n");
    expect(zeilenBreit[zeilenBreit.length - 1 - promptLineOffset(breit)]).toBe("");
  });
});
