---
theme: shiro
aspect: "16:9"
minFontPx: 24
header: Acme Consulting
paginate: true
---

<!-- layout: title -->

# Quarterly Review

## Acme Consulting

Written as a note, presented as a deck.

---

<!-- layout: section -->

# Where we stand

---

<!-- layout: two-column -->

## One note, one deck

The slide is a **projection** of this note — the Markdown stays canonical.

- Split slides with `---`
- Set the theme in frontmatter
- Export to PDF or PNG

<!-- column -->

## Nothing leaks in

Slides render inside a sandboxed iframe, so the vault theme never reaches them.

```ts
const deck = parseDeck(md);
render(deck, theme);
```

---

<!-- layout: quote -->

> A deck is a projection of the note, never the other way round.

---

<!-- layout: stat -->

# 87%

of the deck is just Markdown
