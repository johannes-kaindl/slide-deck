# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

Follow-up to the Obsidian community-plugin review — clears the remaining advisories.

### Changed

- **Settings tab migrated to the declarative settings API** (`getSettingDefinitions`), replacing
  the deprecated imperative `display()`. Controls bind through `get`/`setControlValue`; the
  theme-key chips and the export-theme picker use `render`. No change to which settings exist or
  how they behave.
- **Documentation** — the per-slide layout syntax (templates, density modifiers, the
  layout/column directives, inference) moved into a dedicated guide (`docs/layouts.md`,
  `docs/layouts.de.md`); the README links to it. This also clears the review's README
  "placeholder text" warning, which the literal `<!-- layout -->` directive examples had tripped.

### Compatibility

- **`minAppVersion` raised from 1.8.7 to 1.13.0** — the declarative settings API requires
  Obsidian 1.13.0. Users on older Obsidian releases should stay on 0.3.1.

## [0.3.1] — 2026-06-30

Maintenance release for the Obsidian community-plugin review — no user-facing behaviour change.

### Changed

- **Obsidian lint compliance** — cleared every `eslint-plugin-obsidianmd` finding from the
  community-plugin review without inline `eslint-disable` comments:
  - Static inline styles (off-screen iframe staging, the deck-scale transform origin, the
    preview overflow clip) moved into CSS classes (`styles.css` / `STRUCTURE_CSS`); only
    genuinely per-render values (the fit scale and box size) stay inline via `setProperty`.
  - The realm-safe HTML insertion in the renderer no longer uses `innerHTML` — it parses with
    `DOMParser` and imports nodes via `importNode` + `replaceChildren` (verified equivalent,
    including Mermaid SVG namespacing).
  - `processFrontMatter` access is typed instead of suppressed.
  - The two remaining file-scoped overrides (a lazy `require("electron")`, a shadowed
    deprecated `display()`) are unavoidable and documented in `eslint.config.mjs`.
- **README** — refreshed for the 0.3.0 template model (nine templates, density modifiers, deck
  slots, smart layout inference, media-fill) and bumped the release badge.

### Fixed

- CHANGELOG 0.3.0 incorrectly said "eleven" templates; the template count is **nine**.

## [0.3.0] — 2026-06-28

### Added

- **Template/layout model** — nine per-slide templates (`default`, `title`, `section`, `quote`,
  `image-focus`, `two-column`, `columns-3`, `stat`, `cover-image`) plus combinable density
  modifiers (`compact`, `code-heavy`), chosen with `<!-- layout: <template> [modifier…] -->`.
  In multi-column layouts the title spans all columns.
- **Media that fills and centers** — block images and Mermaid diagrams now occupy the available
  space, horizontally and vertically centered and scaled to fit (`object-fit: contain`), for both
  Obsidian `![[embeds]]` and standard `![](…)` images — instead of flowing small and left-aligned.
- **Deck slots** — `header:`, `footer:` and `paginate:` frontmatter render as floating corner
  slots (pagination shows `n / N`).
- **Smart layout inference** — with no explicit directive, a lone heading becomes `section`, a lone
  quote becomes `quote`, a lone image/diagram becomes `image-focus`, and `<!-- column -->` splits
  pick `two-column`/`columns-3`; an explicit `<!-- layout -->` always wins.
- **Sparse slides compose vertically** — slides with little content are vertically centered instead
  of clinging to the top.
- **Per-theme code & Mermaid** — a user `.css` theme can declare its highlight.js and Mermaid theme
  via `/* sd-hljs: … */` and `/* sd-mermaid: … */` header directives, so dark decks get dark code
  and dark diagrams.

### Fixed

- Callout colours now derive from theme tokens, so dark themes render dark callouts without
  per-theme overrides.
- Mermaid diagrams scale to fill their area instead of being capped small.

## [0.2.0] — 2026-06-28

### Fixed

- PNG export no longer collapses inter-word spaces (switched the rasterizer from
  html2canvas to `modern-screenshot`).
- PDF export now prints the theme background (`print-color-adjust: exact` in `PRINT_CSS`) —
  dark themes no longer print on white.

### Added

- **Mobile support** (`isDesktopOnly: false`) — the plugin now runs on iOS/iPadOS. All
  desktop-only APIs are platform-guarded. On mobile, PDF export writes a self-contained HTML
  file into the export folder and opens it via the OS (`openWithDefaultApp`); the user then
  prints or shares to PDF from there.
- **Live theme switcher** — the preview toolbar now has a theme dropdown for ephemeral try-on, a
  source label (`from frontmatter` / `from default` / `● unsaved`) that disambiguates where the
  active theme comes from, and a **Set** button that writes `theme:` into the note's frontmatter
  via `setNoteTheme` (`processFrontMatter`). Fixes the „theme dropdown does nothing" confusion.
- **User themes** — drop `.css` files into the configurable themes folder (default
  `Slide-Deck-Themes/`); the frontmatter `theme:` value is the filename without the `.css`
  extension. Each file is a `--sd-*` token block with optional extra CSS; user themes inherit
  the built-in `default` theme's code-highlight and Mermaid styles. The Settings tab shows all
  valid theme keys live.
- **Theme import/export** — an **Open in Finder** button reveals the themes folder (drop files
  in); **Export theme as .css** writes any theme as an editable `.css` starting point; a toggle
  hides the themes folder in Obsidian's file explorer.

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
