# Slide layouts & syntax

Per-slide layout reference for the **Slide Deck** plugin — the templates, the density
modifiers, the layout/column directives, and how layouts are inferred when you don't set one.
For deck-level settings (theme, aspect ratio, header/footer/pagination slots, the slide
separator) see the [README](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.md).

> **`---` is always the slide separator** (Marp convention) — it never renders as a
> horizontal rule inside a slide. For a visible rule use `***`, `___`, or a literal
> `<hr>` (the HTML form survives Markdown linters that normalize rule markers to `---`).

## Choosing a layout

Add an HTML comment at the start of a slide to choose its template, and use a column comment
to separate regions in multi-column templates:

```markdown
<!-- layout: two-column -->

## Left heading

- Bullet one
- Bullet two

<!-- column -->

![An image on the right](attachment.png)
```

## Templates

| Value | Description |
|---|---|
| `default` | Standard content slide (heading + body); the implicit layout |
| `title` | Centered title slide with large heading and subtitle |
| `section` | Full-bleed section divider with a single large heading |
| `quote` | Centered block quote with attribution |
| `image-focus` | A single image or diagram, scaled to fill and centered |
| `two-column` | Two columns separated by `<!-- column -->`; a leading heading spans both |
| `columns-3` | Three columns separated by `<!-- column -->`; a leading heading spans all |
| `stat` | One big number/fact with a short caption |
| `cover-image` | First image becomes a full-bleed background with a scrim and overlaid title |

## Smart layout inference

If you set no `<!-- layout -->` directive, the layout is inferred from the slide's content:

- a lone heading → `section`
- a lone block quote → `quote`
- a lone image or diagram → `image-focus`
- two regions (one `<!-- column -->`) → `two-column`
- three or more regions → `columns-3`
- otherwise → `default`

An explicit `<!-- layout -->` directive always overrides inference.

## Density modifiers

Append `compact` and/or `code-heavy` to the same directive to tune density on top of any
template — they combine with each other and with any layout:

```markdown
<!-- layout: two-column compact -->
```

| Modifier | Effect |
|---|---|
| `compact` | Tighter type and spacing — fits more content before the slide overflows |
| `code-heavy` | Smaller code blocks — for slides dominated by fenced code |
