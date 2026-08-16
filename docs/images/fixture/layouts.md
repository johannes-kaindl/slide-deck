---
theme: shiro
aspect: "16:9"
---

<!-- layout: title -->

# Quarterly Review

## Acme Consulting

A title slide sets the stage.

---

<!-- layout: section -->

# Part One

---

<!-- layout: quote -->

> A deck is a projection of the note, never the other way round.

---

<!-- layout: image-focus -->

![Bar chart of signal strength across five quarters](DEMO_IMAGE)

---

<!-- layout: two-column -->

## Two columns

Left column holds the argument.

- Split with a column directive
- One shared fit-scale

<!-- column -->

Right column holds the evidence.

```ts
const deck = parseDeck(md);
render(deck, theme);
```

---

<!-- layout: columns-3 -->

## Three columns

Collect

Short notes go here.

<!-- column -->

Shape

The layout directive wins.

<!-- column -->

Ship

Export to PDF or PNG.

---

<!-- layout: stat -->

# 87%

of the deck is just Markdown

---

<!-- layout: cover-image -->

![Bar chart of signal strength across five quarters](DEMO_IMAGE)

# Cover image

---

## Default layout

Without a directive the layout is inferred from the slide's shape. Everything that does not match a
more specific pattern lands here: a heading, some prose, and a list.

- Inferred, not configured
- An explicit directive always wins
