# Getting started

This walk-through takes you from a fresh install to a deck that is previewed, styled and exported as images. It needs about ten minutes and no server; the optional last step uses a local model.

## 1. Install and enable the plugin

Follow one of the [install routes in the README](https://github.com/johannes-kaindl/slide-deck/blob/main/README.md#install), then enable **Slide Deck** under **Settings → Community plugins**. It runs on desktop and on mobile.

## 2. Write a deck in a note

A deck is an ordinary Markdown note. A line containing only `---` separates slides. Create a note and paste this:

````markdown
---
theme: kami
aspect: "16:9"
paginate: true
---

# My first deck

A note becomes slides.

---

# Two things to remember

- A line with only `---` starts a new slide
- The frontmatter picks theme and aspect ratio

---

<!-- layout: two-column -->

# Text and picture

Left column.

<!-- column -->

Right column.
````

The `---` pair at the very top is the frontmatter, not a slide separator.

## 3. Open the preview

Run **Open presentation preview** from the command palette. The deck renders in a side panel and updates as you edit. A slide whose content does not fit is flagged there — "Slide 2: content overflows — condense it" — instead of being clipped silently.

## 4. Try another theme

In the preview toolbar, open the **Theme** dropdown and pick another one, for example `kogane`. This is a trial only: the source label shows "unsaved". Press **Set** to write `theme:` into the note's frontmatter — then the label reads "from frontmatter". Notes without a `theme:` key use the **Default theme** from the settings.

## 5. Export

- **Images:** press **Images** in the toolbar, or run **Export presentation to image series**. A notice says "Exported N slides", and one PNG per slide lands in `Slide-Deck-Export/<note name>/` (folder configurable under **Settings → Slide Deck**).
- **PDF:** press **PDF**, or run **Export presentation to PDF**. On desktop this opens the system print dialog — choose "Save as PDF" as the printer. On mobile a self-contained HTML file is written to the export folder and opened with your default app; print or share it to PDF from there.

## 6. Optional: let a local model draft the deck

Click the wand icon in the ribbon, or run **Generate presentation from note**. Pick the endpoint and model, set the target slide count if you like, and press **Generate**. This needs an OpenAI-compatible server such as [LM Studio](https://lmstudio.ai) (default `http://localhost:1234`) with CORS enabled; the [local LLM setup guide](https://uplink.jkaindl.de/llm-setup) covers server and model. Note contents are sent to the endpoint only when you press **Generate**.

## Where to go next

- Style your own: [Write your own theme](themes/THEMING-GUIDE.md).
- All layouts: [Slide layouts & syntax](layouts.md).
- Every setting and frontmatter key: the [README](https://github.com/johannes-kaindl/slide-deck/blob/main/README.md#configuration).
