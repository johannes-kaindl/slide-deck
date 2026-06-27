# Slide-Deck Theming Guide

How to write a theme for the slide-deck Obsidian plugin — for humans **and** for
LLMs asked to "build/adjust a slide-deck theme". The two reference themes
[`kuro.css`](kuro.css) (dark) and [`shiro.css`](shiro.css) (light) are the
north-star: copy one, rename it, change the values.

---

## 1. The mental model (read this first)

A theme is **one `.css` file** in your themes folder (default `Slide-Deck-Themes/`,
configurable in settings). The plugin scans the folder; **each file becomes one
theme**, and the **file name without `.css` is the theme's key** — the value you
put in a note's frontmatter or pick in the preview's theme dropdown:

```yaml
---
theme: kuro          # ← loads Slide-Deck-Themes/kuro.css
---
```

**Frontmatter `theme:` is the source of truth for a note.** The settings
"Default theme" only applies to notes that have *no* `theme:` key.

**You do NOT restyle the whole slide.** The plugin always injects a shared,
theme-independent base — the fixed slide box, headings, lists, code wrapper,
callouts, and all layouts — written entirely against `var(--sd-*)` tokens. Your
theme's **only required job is to give those tokens values.** That is why light
and dark differ in ~7 values, not in two separate stylesheets — and why there is
**no `base.css` to inherit from**: the shared part lives in the plugin, never in
your file.

### CSS layer order (later overrides earlier)

```
katex  →  code-highlight  →  structure  →  layouts  →  YOUR THEME FILE  →  global "Custom CSS" setting
```

Your file comes after the structure, so any rule you add (§3) overrides the
plugin defaults. The global **Custom CSS** setting comes after your file, so it
can override any theme (it applies to every deck).

---

## 2. The seven tokens (the whole required contract)

Set these on `.sd-slide` (custom properties inherit, so every element resolves
them). This block alone is a complete, valid theme.

| Token | Purpose | `kuro` (dark) | `shiro` (light) |
|---|---|---|---|
| `--sd-bg` | Slide background | `#100e0c` | `#f7f2e8` |
| `--sd-fg` | Body text colour | `#ece4d3` | `#1f1a13` |
| `--sd-accent` | Links, rules, eyebrows | `#c79a4a` (gold) | `#7d5e26` (bronze) |
| `--sd-code-bg` | Code-block background | `#1b1712` | `#efe7d6` |
| `--sd-font` | Body font stack | Inter + system sans | Inter + system sans |
| `--sd-heading-font` | Heading/display font stack | EB Garamond + system serif | EB Garamond + system serif |
| `--sd-base` | Legibility floor (px) | `28px` | `28px` |

**Minimum valid theme** (copy, rename the file, change values):

```css
.sd-slide {
  --sd-bg: #101418;
  --sd-fg: #e6edf3;
  --sd-accent: #58a6ff;
  --sd-code-bg: #161b22;
  --sd-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --sd-heading-font: Georgia, "Times New Roman", serif;
  --sd-base: 28px;
}
```

### About `--sd-base`

`--sd-base` is the body font size **and** the legibility floor for the
fit-or-warn engine: a slide is scaled down to fit, but never below `--sd-base`
— past that it is flagged as overflowing instead of shrinking further. The
plugin reads this value out of your file, so keep it a plain `NNpx` (e.g.
`28px`). Larger floor = fewer words per slide before a warning.

---

## 3. Going further — what the plugin styles, and what you can override

Everything here is **optional**. Target these real selectors (this is the full
set the renderer produces):

| Selector | Plugin default | Common override |
|---|---|---|
| `.sd-slide h1` | `--sd-heading-font`, 2.2em | size, italic, tracking |
| `.sd-slide h2` | `--sd-heading-font`, 1.7em | mono "eyebrow": uppercase + `letter-spacing` + accent |
| `.sd-slide a` | colour `--sd-accent` | underline style |
| `.sd-slide ul, ol, li` | basic indent | `li::marker { color: … }` |
| `.sd-slide blockquote` | *(unstyled)* | serif italic + accent left border |
| `.sd-slide hr` | *(unstyled)* | thin accent rule |
| `.sd-slide pre.hljs` | `--sd-code-bg`, radius 8px | padding, border |
| `.sd-slide :not(pre) > code` | *(inline code, unstyled)* | mono + subtle panel |
| `.sd-slide .sd-callout` + `-note/-warning/-danger/-tip/-info` | see caveat below | background/text for dark themes |
| `.sd-embed`, `.sd-mermaid svg` | fit within slide | rarely needed |

Heading levels **h3–h6 are not styled** by the plugin beyond inheritance — add
rules if you use them.

See `kuro.css` §2 for worked examples (display H1, mono eyebrow H2, blockquote,
gold rule, inline code, callout repaint).

---

## 4. Caveats (the sharp edges)

- **Callouts are currently hardcoded to LIGHT colours** in the plugin's
  structure CSS (`background:#f4f6f8`, dark text, fixed per-type border hues).
  On a **dark** theme they look wrong out of the box, so a dark theme **must**
  override `.sd-callout` background + text (see `kuro.css`). Light themes are
  fine as-is. *(A future plugin version may tokenize callouts; until then, this
  override is the norm.)*
- **No network. Ever.** Do not use `@import url(...)` or remote `@font-face`
  `src: url(https://…)`. The slide renders in a sandboxed `srcdoc` iframe and
  the plugin is offline-by-design; remote URLs leak your IP, fail offline, and
  are unreliable in PNG/PDF export. (See §5 for the privacy-safe font path.)
- **Export fidelity.** PNG export uses html2canvas and PDF uses the print
  pipeline; both render the same isolated iframe. Exotic CSS (filters, complex
  gradients, blend modes) may differ in export — test by exporting, not just by
  eyeballing the preview.
- **Stay inside `.sd-slide`.** Don't restyle `html`/`body` or fight the fixed
  1280×720 / 960×720 geometry — that's fit-critical and owned by the plugin.

---

## 5. Fonts & privacy

**Default (recommended): name the faces, fall back to system.** Naming a family
in a stack does **not** trigger any request — only `@font-face`/`@import` do. So:

```css
--sd-heading-font: "EB Garamond", "Iowan Old Style", Palatino, Georgia, serif;
--sd-font:         "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

If the named face is installed it renders exactly; otherwise the system fallback
does. Zero network, zero tracking, works offline and in export.

**Never use Google Fonts** (`@import url('https://fonts.googleapis.com/…')`) — it
sends your IP to Google on every render and breaks offline/export.

**Gold standard for the *exact* faces, fully offline & private: self-host via
data-URI `@font-face`.** Embed the font binary as base64 directly in your theme
file — the same technique the plugin uses to inline KaTeX's fonts. Use only
embeddable licences (EB Garamond, Inter, JetBrains Mono are all OFL):

```css
/* In your theme .css — exact face, no network, works in export. */
@font-face {
  font-family: "EB Garamond";
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url("data:font/woff2;base64,d09GMgABAAAAA…(your woff2 here)…") format("woff2");
}
```

Generate the base64 with e.g. `base64 -i EBGaramond-Italic.woff2`. The file gets
large, but it is self-contained and private. Subset the font first (e.g. to
Latin) to keep it small.

---

## 6. For LLMs — rules for generating/adjusting a slide-deck theme

When asked to build or modify a slide-deck `.css` theme, follow these exactly:

1. **One file. Scope everything to `.sd-slide`** (or its descendants). Never
   style `html`/`body`, never change geometry, padding-box, or `--sd-w`/`--sd-h`.
2. **Always include the seven §2 tokens** with valid values. The file name
   (without `.css`) is the theme key — tell the user what to put in `theme:`.
3. **Set `--sd-base` to a plain `NNpx`** (e.g. `28px`); it is parsed by the
   plugin as the legibility floor.
4. **No network:** never emit `@import` or remote `url(...)`. For exact fonts,
   use data-URI `@font-face` (§5); otherwise name families + system fallback.
5. **Contrast/WCAG:** ensure `--sd-fg` on `--sd-bg` and text on `--sd-accent`
   meet at least AA (4.5:1 for body). Verify, don't guess.
6. **If the theme is dark, repaint callouts** (§4) — `.sd-callout` background +
   text — or they render light-on-dark.
7. **Keep optional rules optional and commented**; the token block must work
   standalone. Prefer one accent colour reused via a local `--my-*` variable.

Minimal skeleton to start from:

```css
/* my-theme — slide-deck theme. Frontmatter: `theme: my-theme` */
.sd-slide {
  --sd-bg: #__; --sd-fg: #__; --sd-accent: #__; --sd-code-bg: #__;
  --sd-font: system-ui, sans-serif;
  --sd-heading-font: Georgia, serif;
  --sd-base: 28px;
}
/* optional: .sd-slide h1 { … }  .sd-slide .sd-callout { … (dark only) } */
```

---

## 7. Install & use

1. Put the `.css` file in your themes folder (settings → "Open in Finder" opens
   it; drop the file in).
2. It appears in the preview's **Theme** dropdown and in the settings
   "Available themes" reference list (the key = file name without `.css`).
3. Apply it: pick it in the preview dropdown (try-on), then **Set** to write
   `theme:` into the note — or type `theme: <key>` in the note's frontmatter
   yourself.
4. Export (PDF / images) renders with the note's resolved theme.

Reference themes: [`kuro.css`](kuro.css) · [`shiro.css`](shiro.css).
