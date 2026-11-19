# Slide layouts & syntax

Per-slide layout reference for the **Slide Deck** plugin — the templates, the density
modifiers, the layout/column directives, and how layouts are inferred when you don't set one.
For deck-level settings (theme, aspect ratio, header/footer/pagination slots, the slide
separator) see the [README](https://github.com/johannes-kaindl/slide-deck/blob/main/README.md).

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
| `agenda` | Numbered contents: mono indices, hairline rows, a trailing meta per row |
| `threads` | Four-up grid of numbered cards |
| `closing` | Sign-off: large serif line, mono contact lines |

### `agenda`, `threads`, `closing`

These three come from the Traces slide specimens. Each takes a `# Title` and a `## eyebrow` (written after the title, shown above it, as in the hero layouts), and they read a list in a fixed way. The built-in `kogane` and `kami` themes also veil the background on the right of a `closing` slide. Example deck: `docs/themes/traces-layouts-deck.md`.

| Layout | List it reads |
|---|---|
| `agenda` | an ordered list; an inline code span at the end of an item (`` `5 min` ``) is the meta shown on the right |
| `threads` | an ordered list; each item starts with `**Card title**`, followed by its text |
| `closing` | a bullet list of `**key** value` contact lines |

## Heading levels

The slide title is the `#` heading; the `##` above or below it is the kicker (eyebrow). If your notes begin at `##` (an Obsidian linter that keeps a note's own title as `#`, say) a deck **without any `#` heading** is read one level up: `##` is the title, `###` the kicker. This is decided for the whole deck: one `#` anywhere (such as `# Thanks` on the last slide) keeps the plain reading everywhere, so a mixed deck does not shift half of its slides. Example: `docs/themes/h2-deck.md`.

## Images and their size

`![[image.png]]` and `![image](image.png)` fill the free space of the slide. Obsidian's size syntax sets a fixed size instead:

| Written | Result |
|---|---|
| `![[icon.svg\|48]]` | 48 px wide, height follows |
| `![[icon.svg\|48x30]]` | 48 × 30 px |
| `![[icon.svg\|Alt text]]` | normal image, `Alt text` as its alt text |

A sized image stays in the text line (a 48 px icon next to a word) and, alone on a slide, keeps its size instead of filling the slide. In a table cell write `\|` as usual; the backslash is table syntax and is ignored. `![[…]]` inside inline code, a code block or a `~~~` fence stays plain text.

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
