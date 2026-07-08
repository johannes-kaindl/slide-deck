import { describe, it, expect } from "vitest";
import { parseDeck } from "../../src/core/slide-model";

/** Regression fixture: one deck exercising every layout + modifiers + slots.
 *  Guards against content loss when parser/CSS refactorings touch the
 *  separator/fence/hoist logic — mirrors the Pallas smoke testdeck. */
const FIXTURE = `---
theme: kuro
header: Fixture
footer: fixture 1.0
paginate: true
---

<!-- layout: cover-image -->

![[bild.png]]

# Cover

## Kicker

---

<!-- layout: title -->

# Titel

## Eyebrow

Untertitel-Absatz.

---

<!-- layout: section -->

# Trenner

---

# Standard

- Punkt eins mit \`chip\`
- Punkt zwei

---

<!-- layout: two-column -->

# Spalten

## Links

- L1

<!-- column -->

## Rechts

- R1
    - R1a

---

<!-- layout: columns-3 -->

# Drei

Eins

<!-- column -->

Zwei

<!-- column -->

Drei

---

<!-- layout: quote -->

> Das Zitat.

*— Quelle*

---

<!-- layout: stat -->

# 42

Caption zur Zahl.

---

<!-- layout: image-focus -->

# Bild

![[bild.png]]

Caption.

---

# Callouts

> [!info] Info
> Body.

---

<!-- layout: default code-heavy -->

# Code

\`\`\`ts
const x = 1; // --- kein Separator im Fence
\`\`\`

---

<!-- layout: default compact -->

# Kompakt

- Bullet vor der Linie:

<hr>

Absatz nach der Linie.
`;

describe("all-layouts fixture (content-loss regression guard)", () => {
  const deck = parseDeck(FIXTURE);

  it("keeps every slide and its layout", () => {
    expect(deck.slides.map((s) => s.layout)).toEqual([
      "cover-image", "title", "section", "default", "two-column", "columns-3",
      "quote", "stat", "image-focus", "default", "default", "default",
    ]);
    expect(deck.slides[10].modifiers).toContain("code-heavy");
    expect(deck.slides[11].modifiers).toContain("compact");
  });

  it("slots live in the frontmatter directives, not in slide bodies", () => {
    expect(deck.directives.header).toBe("Fixture");
    expect(deck.directives.paginate).toBe(true);
    expect(deck.slides[0].markdown).not.toContain("header:");
  });

  it("a --- inside a code fence does not split the slide", () => {
    expect(deck.slides[10].markdown).toContain("kein Separator im Fence");
    expect(deck.slides[10].markdown).toContain("```");
  });

  it("an <hr> inside a slide body loses no surrounding content", () => {
    const compact = deck.slides[11].markdown;
    expect(compact).toContain("Bullet vor der Linie");
    expect(compact).toContain("<hr>");
    expect(compact).toContain("Absatz nach der Linie");
  });

  it("two-column keeps both regions incl. nested list content", () => {
    expect(deck.slides[4].regions.length).toBe(2);
    expect(deck.slides[4].regions[1]).toContain("R1a");
  });
});
