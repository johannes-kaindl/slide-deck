# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — unreleased

First release.

### Added

- **Markdown notes → slides** — `---` separator line splits a note into individual slides;
  YAML frontmatter (`theme:`, `aspect:`, `minFontPx:`) controls deck-level directives.
- **Live preview pane** (`Open presentation preview` command) — renders the current note as a
  slide deck in the right sidebar, with a source-jump link to each slide's originating line.
- **Fit-or-warn readability** — each slide auto-scales content down to a configurable legibility
  floor (`minFontPx`, default 24 px); slides that would need even smaller text are flagged as
  overflowing rather than becoming unreadable.
- **PDF export** (`Export presentation to PDF` command) — renders all slides at native resolution
  and triggers the system print dialog (choose "Save as PDF").
- **PNG image-series export** (`Export presentation to image series` command) — captures each
  slide via html2canvas and writes numbered PNGs into `.slide-export/` at the vault root.
- **KaTeX math** — inline `$…$` and display `$$…$$` math rendered by KaTeX.
- **Code highlighting** — fenced code blocks highlighted by highlight.js.
- **Accessible callouts** — `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]`
  blocks rendered with redundant coding: border color + geometric shape + visible label word
  (not color-only; WCAG 1.4.1).
- **Mermaid diagrams** — fenced ` ```mermaid ``` ` blocks rendered as SVG.
- **EN/DE interface** — all UI strings follow Obsidian's language setting (English canonical,
  German supported). Settings tab and all notices are localized.
- **Settings tab** — Default preset (`defaultTheme`), Minimum body font size (`minFontPx`),
  Image export scale (`imageScale`).
- **Pure-core architecture** — `src/core/**` is Obsidian-free and Node-testable; a purity check
  runs as part of `npm test`. 22 unit tests covering slide parsing, geometry, fit, callouts,
  rendering, and constraints.
- `npm run deploy` (env-controlled via `$OBSIDIAN_PLUGIN_DIR`).
