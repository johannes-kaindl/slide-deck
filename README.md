# Slide Deck

Turn a Markdown note into a slide deck and export it to PDF or a PNG image series, with live readability checks.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE)
[![Release](https://img.shields.io/badge/Release-0.1.0-green.svg)](https://codeberg.org/jkaindl/slide-deck/releases)
[![Platform: Desktop only](https://img.shields.io/badge/Platform-Desktop%20only-lightgrey.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/manifest.json)

<!-- hero image added before release -->

[Deutsch](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.de.md)

## Features

- **Markdown notes → slides** — separate slides with a line containing only `---`; YAML frontmatter controls theme, aspect ratio, and font floor per note.
- **Live preview pane** — renders the current note as a slide deck in a side panel, with a source-jump link to the originating note line.
- **Fit-or-warn readability** — each slide auto-scales content down to a configurable legibility floor (`minFontPx`); slides that would need smaller text are flagged as overflowing instead of becoming unreadable.
- **PDF export** — renders all slides at their native resolution and triggers the system print dialog (choose "Save as PDF" in the print dialog).
- **PNG image-series export** — captures each slide via html2canvas and writes numbered PNGs into your vault's configured attachment folder.
- **KaTeX math** — inline and display math (`$…$` / `$$…$$`) rendered by KaTeX.
- **Code highlighting** — fenced code blocks highlighted by highlight.js.
- **Accessible callouts** — Obsidian-style `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]` blocks rendered with redundant coding: border color + geometric shape + visible label word (not color-only; satisfies WCAG 1.4.1).
- **Mermaid diagrams** — fenced ` ```mermaid ``` ` blocks rendered as SVG.
- **EN/DE interface** — all UI strings follow Obsidian's language setting (English canonical, German supported).

## Requirements

- **Obsidian ≥ 1.8.7**
- **Desktop only** (`isDesktopOnly: true`) — export relies on `window.print()` for PDF and on `html2canvas` DOM capture for PNG; both require a desktop environment.
- PDF export uses the **system print dialog** — choose "Save as PDF" in the printer dropdown. It does not produce a PDF file directly.
- PNG export writes files into your vault's **configured attachment folder** (Settings → Files & links → "Default location for new attachments"). PDF export goes through the system print dialog, where you choose the location.

## Install

### Community Plugins (intended channel)

The plugin is submitted to the Obsidian community plugin registry. Once accepted it will be available via **Settings → Community plugins → Browse → search "Slide Deck"**.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://codeberg.org/jkaindl/slide-deck/releases).
2. Create the folder `.obsidian/plugins/slide-deck/` inside your vault.
3. Copy the three files into that folder.
4. In Obsidian: **Settings → Community plugins → Installed plugins** — enable **Slide Deck**.

### BRAT (Beta Reviewers Auto-update Tool)

1. Install the [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat).
2. In BRAT settings, add `https://codeberg.org/jkaindl/slide-deck` (or its GitHub mirror `https://github.com/johannes-kaindl/slide-deck`).
3. Reload Obsidian.

### Build from source

```bash
git clone https://codeberg.org/jkaindl/slide-deck.git
cd slide-deck
npm install
npm run build          # produces main.js
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/slide-deck/
```

## Configuration

### Plugin settings

| Setting | Key | Default | Description |
|---|---|---|---|
| Default preset | `defaultTheme` | `default` | Preset used when a note has no `theme` frontmatter directive |
| Minimum body font size (px) | `minFontPx` | `24` | Legibility floor — slides that would need smaller text are flagged as overflowing |
| Image export scale | `imageScale` | `2` | Pixel multiplier for PNG export (`2` = 2×, crisp on HiDPI screens) |

### Per-note frontmatter

Add a YAML frontmatter block at the top of your note to control presentation-level settings:

```yaml
---
theme: default
aspect: 16:9
minFontPx: 24
---
```

| Key | Values | Description |
|---|---|---|
| `theme` | `default` | Visual preset name (only `default` currently) |
| `aspect` | `16:9` (default), `4:3` | Canvas size: 1280×720 (16:9) or 960×720 (4:3) |
| `minFontPx` | any positive number | Per-note legibility floor; overrides the plugin setting |

### Slide separator

Use a line containing **only `---`** to split slides:

```markdown
---
theme: default
aspect: 16:9
---

# Slide 1

Content here.

---

# Slide 2

More content.
```

Note: the `---` in the YAML frontmatter block is the standard YAML delimiter and is not a slide separator.

## How it works

1. **Parsing** — the active note's Markdown is split on `---` lines into individual slide bodies. A YAML frontmatter block (if present) sets deck-level directives.
2. **Fixed canvas** — each slide is rendered onto a fixed canvas: 1280×720 px (16:9) or 960×720 px (4:3). The canvas size does not change with window size.
3. **Fit-or-warn** — each slide's content is measured in the DOM. If it exceeds the canvas, the content is scaled down uniformly. Scaling stops at `minFontPx` (the legibility floor). If the content would still overflow at that scale, the slide is flagged with a warning in the preview pane rather than scaled further.
4. **Export** — export builds the same self-contained HTML (inline CSS + resolved image data-URLs) and either sends it to the print pipeline (PDF) or captures each slide canvas with html2canvas (PNG). KaTeX and Mermaid rendering fidelity in html2canvas may vary by diagram complexity; see [AGENTS.md](https://codeberg.org/jkaindl/slide-deck/src/branch/main/AGENTS.md) for known constraints.

## License

Code: [AGPL-3.0-or-later](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE).
Documentation: [CC BY-SA 4.0](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE-DOCS).
Author: Johannes Kaindl — <https://jkaindl.de>
