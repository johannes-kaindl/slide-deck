# Slide Deck

Turn a Markdown note into a slide deck and export it to PDF or a PNG image series, with live readability checks.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE)
[![Release](https://img.shields.io/badge/Release-0.1.0-green.svg)](https://codeberg.org/jkaindl/slide-deck/releases)
[![Platform: Desktop + Mobile](https://img.shields.io/badge/Platform-Desktop%20%2B%20Mobile-blue.svg)](https://codeberg.org/jkaindl/slide-deck/src/branch/main/manifest.json)

![Slide Deck — a two-column slide with bullet list, inline math, and an image](https://codeberg.org/jkaindl/slide-deck/raw/branch/main/docs/images/hero.png)

[Deutsch](https://codeberg.org/jkaindl/slide-deck/src/branch/main/README.de.md)

## Features

- **Theme isolation** — slides render inside a sandboxed iframe, so the active Obsidian theme never leaks into the preview or the exports. A deck looks identical regardless of the vault theme.
- **Four built-in themes** — `default` (light), `dark`, `serif`, `high-contrast` — selected per deck via the `theme:` frontmatter key; each carries a matching code-highlight and Mermaid theme.
- **Live theme switcher** — the preview toolbar has a theme dropdown for ephemeral try-on, a source label (`from frontmatter` / `from default` / `● unsaved`) that shows where the active theme comes from, and a **Set** button that writes `theme:` directly into the note's frontmatter. Frontmatter is the source of truth; the Settings default applies only to notes without a `theme:` key.
- **User themes** — drop `.css` files into a configurable themes folder (default `Slide-Deck-Themes/`); the frontmatter `theme:` value is the filename without the `.css` extension. Each file is a `--sd-*` token block with optional extra CSS; user themes inherit the built-in `default` theme's code-highlight and Mermaid styles. The Settings tab shows all valid theme keys live.
- **Theme import/export** — an **Open in Finder** button reveals the themes folder so you can drop files in; **Export theme as .css** writes any theme as an editable `.css` starting point; a toggle hides the themes folder in Obsidian's file explorer.
- **Five per-slide layouts** — `title`, `two-column`, `image-focus`, `section`, `quote` — set per slide with an HTML-comment directive `<!-- layout: two-column -->`; use `<!-- column -->` to separate regions in multi-column layouts.
- **Markdown notes → slides** — separate slides with a line containing only `---`; YAML frontmatter controls theme, aspect ratio, and font floor per note.
- **Live preview pane** — renders the current note as a slide deck in a side panel, scaled to pane width, with a click-to-source link on overflow warnings.
- **Fit-or-warn readability** — each slide auto-scales content down to a configurable legibility floor (`minFontPx`); slides that would need smaller text are flagged as overflowing instead of becoming unreadable.
- **Custom CSS** — an optional CSS snippet in Settings is appended to the deck styles in both preview and exports, for branding or tweaks.
- **PDF export** — renders all slides at their native resolution; on desktop, triggers the system print dialog (choose "Save as PDF"); on mobile (iOS/iPadOS), writes a self-contained HTML file and opens it via the OS so you can print or share to PDF from there.
- **PNG image-series export** — captures each slide via `modern-screenshot` and writes numbered PNGs into a configurable export folder (Settings, default `Slide-Deck-Export/`); typographically accurate inter-word spacing.
- **Mobile support** — runs on iOS/iPadOS (Obsidian Mobile); all desktop-only APIs are platform-guarded.
- **KaTeX math** — inline and display math (`$…$` / `$$…$$`) rendered by KaTeX.
- **Code highlighting** — fenced code blocks highlighted by highlight.js, per-theme.
- **Accessible callouts** — Obsidian-style `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]` blocks rendered with redundant coding: border color + geometric shape + visible label word (not color-only; satisfies WCAG 1.4.1).
- **Mermaid diagrams** — fenced ` ```mermaid ``` ` blocks rendered as SVG, per-theme.
- **EN/DE interface** — all UI strings follow Obsidian's language setting (English canonical, German supported).

## Screenshots

![Accessible callouts rendered with icon, shape, and label](https://codeberg.org/jkaindl/slide-deck/raw/branch/main/docs/images/callouts.png)

## Requirements

- **Obsidian ≥ 1.8.7**
- **Desktop + Mobile** (`isDesktopOnly: false`) — runs on desktop (Windows, macOS, Linux) and on mobile (iOS/iPadOS); desktop-only APIs are platform-guarded.
- **Desktop PDF export** uses the **system print dialog** — choose "Save as PDF" in the printer dropdown. It does not produce a PDF file directly.
- **Mobile PDF export** writes a self-contained HTML file into the export folder and opens it with the OS default app; from there you can print or share to PDF. The file name is `<export-folder>/<note-name>.html`.
- PNG export writes files into a **configurable export folder** (Settings → Slide Deck → Export folder, default `Slide-Deck-Export/`). PDF export on desktop goes through the system print dialog, where you choose the location.

## Install

### Community Plugins (intended channel)

Planned: once accepted into the Obsidian community plugin registry it will be installable via **Settings → Community plugins → Browse → search "Slide Deck"**.

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
| Custom CSS | `customCss` | *(empty)* | CSS appended to the deck styles in preview and exports, for branding or tweaks |
| Export folder | `exportFolder` | `Slide-Deck-Export` | Vault folder for the PNG image-series export |
| Themes folder | `themesFolder` | `Slide-Deck-Themes` | Vault folder scanned for user `.css` themes |
| Hide themes folder | `hideThemesFolder` | `true` | Hide the themes folder in Obsidian's file explorer |

### Per-note frontmatter

Add a YAML frontmatter block at the top of your note to control presentation-level settings:

```yaml
---
theme: dark
aspect: 16:9
minFontPx: 24
---
```

| Key | Values | Description |
|---|---|---|
| `theme` | `default` · `dark` · `serif` · `high-contrast` · *user-theme-key* | Visual preset name; user theme key = the `.css` filename without the extension |
| `aspect` | `16:9` (default), `4:3` | Canvas size: 1280×720 (16:9) or 960×720 (4:3) |
| `minFontPx` | any positive number | Per-note legibility floor; overrides the plugin setting |

### Per-slide layouts

Add an HTML comment at the start of a slide to choose its layout:

```markdown
<!-- layout: two-column -->

## Left heading

- Bullet one
- Bullet two

<!-- column -->

![An image on the right](attachment.png)
```

| Value | Description |
|---|---|
| `title` | Centered title slide with large heading and subtitle |
| `two-column` | Two equal columns separated by `<!-- column -->` |
| `image-focus` | Large image with optional caption |
| `section` | Full-bleed section divider |
| `quote` | Centered block quote with attribution |

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
3. **Theme isolation** — slides render inside a sandboxed iframe with the chosen theme's styles injected directly. The active Obsidian theme does not reach inside the iframe, so the deck looks identical in preview, PDF, and PNG regardless of vault theme.
4. **Fit-or-warn** — each slide's content is measured in the DOM. If it exceeds the canvas, the content is scaled down uniformly. Scaling stops at `minFontPx` (the legibility floor). If the content would still overflow at that scale, the slide is flagged with a warning in the preview pane rather than scaled further.
5. **Export** — the same theme-isolated iframe artifact feeds all export paths: the print pipeline (PDF) and per-slide `modern-screenshot` (`domToCanvas`) capture (PNG). On desktop, PDF is printed via `contentWindow.print()`; on mobile, a self-contained HTML file is written to the vault and handed to the OS via `openWithDefaultApp`.

## License

Code: [AGPL-3.0-or-later](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE).
Documentation: [CC BY-SA 4.0](https://codeberg.org/jkaindl/slide-deck/src/branch/main/LICENSE-DOCS).
Author: Johannes Kaindl — <https://jkaindl.de>
