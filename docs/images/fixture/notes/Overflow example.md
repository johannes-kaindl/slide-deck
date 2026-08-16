---
theme: shiro
aspect: "16:9"
minFontPx: 24
---

# This slide holds too much

Fit-or-warn scales a slide's content down until it fits the canvas, but it stops at the
legibility floor set by `minFontPx`. Below that, shrinking further would trade a readable
slide for an unreadable one, so the deck refuses the trade and flags the slide instead.

- The preview marks the slide rather than clipping it silently
- The warning links back to the line in the note, so the fix is one click away
- Raise `minFontPx` per note in the frontmatter, or condense the slide until it fits

That is the whole contract: a slide either fits at a legible size, or it says so. Nothing is
cut off behind the edge of the canvas where you would not notice it until you stand in front
of an audience, and nothing shrinks to a size the back row cannot read from where they sit.

Condense the prose until the slide carries a single idea. Split it into two slides with a
separator line. Move the detail into the speaker's mouth, where it belongs, instead of
crowding it onto the canvas where it competes with everything else for the same attention.

- A slide is not a document, and a document is not a slide
- The note keeps the long form; the deck keeps the short one
- Both live in the same file, which is the point of the whole plugin

If you are reading this in a screenshot, the slide is flagged and the deck told you why.
