# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-06-27

First release.

### Added

- **Markdown notes → slides** — a `---` separator line splits a note into individual slides;
  YAML frontmatter (`theme:`, `aspect:`, `minFontPx:`) controls deck-level directives.
- **Live preview pane** (`Open presentation preview` command) — renders the current note as a
  slide deck in the right sidebar, scaled to the pane width, with a source-jump link to each
  slide's originating line.
- **Theme isolation** — slides render inside a sandboxed iframe, so the active Obsidian theme
  can never leak into the preview or the exports; a deck looks identical regardless of the vault
  theme.
- **Four built-in themes** — `default` (light), `dark`, `serif`, and `high-contrast`, selected
  per deck via the `theme:` frontmatter; each carries a matching code-highlight and Mermaid theme.
- **Per-slide layouts** — `title`, `two-column`, `image-focus`, `section`, and `quote`, chosen
  per slide with an HTML comment directive (`<!-- layout: two-column -->`) and a `<!-- column -->`
  region separator.
- **Custom CSS** — an optional CSS snippet (Settings) is appended to the deck styles for branding
  and tweaks, in both the preview and the exports.
- **Fit-or-warn readability** — each slide auto-scales its content down to a configurable
  legibility floor (`minFontPx`, default 24 px); slides that would need even smaller text are
  flagged as overflowing (with a click-to-source warning) rather than becoming unreadable.
- **PDF export** (`Export presentation to PDF` command) — prints the deck (one slide per page,
  exact geometry) via the system print dialog (choose "Save as PDF"), theme-isolated.
- **PNG image-series export** (`Export presentation to image series` command) — captures each
  slide via html2canvas and writes numbered PNGs into a configurable export folder.
- **KaTeX math** — inline `$…$` and display `$$…$$` math.
- **Code highlighting** — fenced code blocks highlighted by highlight.js (per-theme stylesheet).
- **Accessible callouts** — `> [!note]`, `[!warning]`, `[!danger]`, `[!tip]`, `[!info]` blocks
  rendered with redundant coding: border colour + geometric shape + visible label word (not
  colour-only; WCAG 1.4.1).
- **Mermaid diagrams** — fenced ` ```mermaid ``` ` blocks rendered as SVG (per-theme).
- **EN/DE interface** — all UI strings follow Obsidian's language setting (English canonical,
  German supported); the settings tab and every notice are localized.
- **Settings tab** — default theme, minimum body font size, image-export scale, custom CSS, and
  export folder.
- **Pure-core architecture** — `src/core/**` is Obsidian-free and Node-testable; a core-purity
  check and a realm-safety check run as part of `npm test`, alongside a real-bundle smoke test
  and 63 unit tests.

### Notes

- Desktop only (`isDesktopOnly`) — PDF/PNG export needs a full browser DOM.
