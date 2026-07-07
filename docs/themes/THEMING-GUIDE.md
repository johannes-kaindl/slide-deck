# Slide-Deck Theming Guide

How to write a theme for the slide-deck Obsidian plugin — for humans **and** for
LLMs asked to "build/adjust a slide-deck theme". Start from
[`example.css`](example.css) — copy it, rename it, change the values.

---

## 1. The mental model (read this first)

A theme is **one `.css` file** in your themes folder (default `Slide-Deck-Themes/`,
configurable in settings). The plugin scans the folder; **each file becomes one
theme**, and the **file name without `.css` is the theme's key** — the value you
put in a note's frontmatter or pick in the preview's theme dropdown:

```yaml
---
theme: example        # ← loads Slide-Deck-Themes/example.css
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

The structure now ships a full design system: a modular type scale (ratio
1.25), a spacing scale, vertical rhythm (blocks own no margins; space comes
from adjacency), and tokenized blockquotes, rules, code panels and callouts.
Concretely: **a 7-token theme already looks finished** — §2 lists the optional
tokens for adding character on top of that.

### CSS layer order (later overrides earlier)

```
katex  →  code-highlight  →  structure  →  layouts  →  YOUR THEME FILE  →  global "Custom CSS" setting
```

Your file comes after structure and layouts, so any rule you add overrides the
plugin defaults. The global **Custom CSS** setting comes after your file, so it
can override any theme (it applies to every deck).

---

## 2. §1 · The seven tokens (the whole required contract)

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

## 3. §2 · Character tokens (optional)

Everything below has a sensible default — the seven-token theme from §1 works
without any of it. Set only the ones you want to change; all others fall back
to the plugin defaults listed here (verified against the shipped structure and
layout CSS — these are the only tokens the renderer actually reads).

### Type scale (ratio 1.25)

| Token | Default | Purpose |
|---|---|---|
| `--sd-size-h1` | `1.95em` | Non-hero heading size (`.sd-slide h1`) |
| `--sd-size-h2` | `1.25em` | Non-hero subheading size; also the `quote` layout's body size |
| `--sd-size-display` | `2.44em` | Hero title size (`title` / `section` / `cover-image` layouts) |
| `--sd-size-eyebrow` | `.68em` | Hero "eyebrow" kicker size (an `h2` used as a tracked label in hero layouts) |
| `--sd-size-small` | `.8em` | Type-scale rung used as the floating-slot font-size fallback (see `--sd-slot-size`) |

### Line-height

| Token | Default | Purpose |
|---|---|---|
| `--sd-lh-body` | `1.45` | Body text line-height |
| `--sd-lh-display` | `1.08` | Heading (`h1`) line-height |
| `--sd-lh-heading` | `1.2` | Subheading (`h2`) and eyebrow line-height |

### Spacing scale (vertical rhythm)

| Token | Default | Purpose |
|---|---|---|
| `--sd-space-2xs` | `.25em` | Blockquote vertical padding; gap between consecutive list items |
| `--sd-space-xs` | `.5em` | Code panel padding; gap after a lone `h1` → `h2`; `compact` mode's block gap; media gap |
| `--sd-space-s` | `.75em` | Default gap between adjacent blocks (the vertical-rhythm "owl" selector); code panel padding |
| `--sd-space-m` | `1em` | Blockquote left indent; `columns-3` layout's column gap |
| `--sd-space-l` | `1.5em` | `two-column` layout's column gap |
| `--sd-space-xl` | `2.25em` | Extra gap before a new `h2` section |
| `--sd-pad` | `64px` | Slide padding on all four sides |

### Code face

| Token | Default | Purpose |
|---|---|---|
| `--sd-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Inline `code` and fenced code-block font |

### Secondary text & surfaces

| Token | Default | Purpose |
|---|---|---|
| `--sd-muted` | `#6b7280`\* | Floating header/footer/pagination text colour |
| `--sd-surface` | `#f4f6f8` | Callout panel background |
| `--sd-callout-fg` | `#16181d` | Callout text colour |

\* Blockquote text reads `--sd-muted` too, but falls back to `inherit`
(i.e. `--sd-fg`) instead of `#6b7280` if you leave it unset — a dark theme that
only sets the seven §1 tokens still gets a legible blockquote.

### Hero title treatment

| Token | Default | Purpose |
|---|---|---|
| `--sd-display-style` | `normal` | Hero `h1` `font-style` (the five built-ins set `italic`) |
| `--sd-display-weight` | `700` | Hero `h1` `font-weight` (the five built-ins set `500`) |
| `--sd-display-tracking` | `normal` | Hero `h1` `letter-spacing` (the five built-ins set `-0.02em`) |

### Eyebrow (hero kicker)

| Token | Default | Purpose |
|---|---|---|
| `--sd-eyebrow-font` | `var(--sd-font)` | Kicker font family (the five built-ins set it to `var(--sd-mono)`) |
| `--sd-eyebrow-fg` | `var(--sd-accent)` | Kicker colour |
| `--sd-eyebrow-tracking` | `.14em` | Kicker letter-spacing |

### Floating slots (header / footer / pagination)

| Token | Default | Purpose |
|---|---|---|
| `--sd-slot-size` | `var(--sd-size-small, .8em)` | Slot font-size |
| `--sd-slot-fg` | `var(--sd-muted, #6b7280)` | Slot colour |

### Layout-specific

| Token | Default | Purpose |
|---|---|---|
| `--sd-scrim` | `linear-gradient(0deg, rgba(0,0,0,.78), rgba(0,0,0,.12) 60%, transparent)` | `cover-image` readability scrim over the background media |
| `--sd-stat-size` | `4.5em` | `stat` layout's oversized lead number (`h1`) |
| `--sd-compact-scale` | `0.82em` | `compact` density modifier's base font-size |

See `example.css` §2 for the same list as ready-to-uncomment declarations.

---

## 4. What you should NOT style anymore

The design system in §2 replaces a handful of things themes used to hand-roll.
Don't re-add these — they fight the rhythm/scale system instead of composing
with it:

- **`h1`/`h2` `font-size` rules.** Use `--sd-size-h1` / `--sd-size-h2` /
  `--sd-size-display` (§2) instead of a raw `.sd-slide h1 { font-size: … }`
  override — the scale is a single ratio (1.25); changing one rung by hand
  desyncs it from the others.
- **List/paragraph alignment tweaks.** Axiom: lists are never line-centered.
  Hero layouts (`title`, `section`, `quote`) center the *block* as a whole
  (flex alignment on the container) while list text itself stays start-aligned
  — don't add `text-align: center` to `ul`/`ol`/`li`.
- **Margins on headings, paragraphs, lists, code, blockquotes.** Vertical
  rhythm is owned by the plugin's adjacency rule (the "owl" selector,
  `* + *`) driven by the `--sd-space-*` scale — blocks themselves carry
  `margin: 0`. A theme that sets its own margins breaks the rhythm for every
  layout at once.

Rule-level overrides are still *technically* possible — your file loads after
`structure`/`layouts` in the cascade (see "CSS layer order" above), so a raw `.sd-slide h1 { … }` rule
in your theme does win. It's just **unsupported**: it isn't covered by the fit
engine's assumptions and will drift the next time the design system changes.
Prefer setting a token.

---

## 5. Built-in themes

Five Nordstern presets ship with the plugin. Each sets the §1 contract plus
most of the §2 character tokens; pick one as a reading example, or as a
starting point via **Export theme as .css** (Settings).

| Key | Label | Voice | Base px |
|---|---|---|---|
| `shiro` | Shiro · 白 — rice paper | Light, warm paper, bronze accent (**default**) | `28` |
| `kuro` | Kuro · 黒 — the chamber | Dark, warm charcoal, gold accent | `28` |
| `sumi` | Sumi · 墨 — ink on void | True black, cream text, gold accent — highest contrast | `32` |
| `kairo` | Kairo · 回路 — the circuit | Dark, cool cyan accent, circuit-board texture | `28` |
| `kurenai` | Kurenai · 紅 — danger signal | Dark, red accent, alert texture | `28` |

Dark built-ins (`kuro`, `sumi`, `kairo`, `kurenai`) use a real dark
highlight.js scheme and Mermaid's `dark` theme, so code and diagrams stay
legible on a dark background — see §7 for how a user theme opts into the same
thing.

### Legacy keys (0.4.x) still work

Older decks with a pre-Nordstern `theme:` value keep rendering — the key
resolves silently to its successor, no note needs editing:

| Legacy key | Resolves to |
|---|---|
| `default` | `shiro` |
| `dark` | `kuro` |
| `serif` | `shiro` |
| `high-contrast` | `sumi` |

An unrecognized/missing key (including a user theme file that was deleted)
also falls back to `shiro`.

---

## 6. For LLMs — rules for generating/adjusting a slide-deck theme

When asked to build or modify a slide-deck `.css` theme, follow these exactly:

1. **One file. Scope everything to `.sd-slide`** (or its descendants). Never
   style `html`/`body`, never change geometry, padding-box, or `--sd-w`/`--sd-h`.
2. **Always include the seven §1 tokens** (above: `--sd-bg`, `--sd-fg`,
   `--sd-accent`, `--sd-code-bg`, `--sd-font`, `--sd-heading-font`,
   `--sd-base`) with valid values. The file name (without `.css`) is the theme
   key — tell the user what to put in `theme:`.
3. **Set `--sd-base` to a plain `NNpx`** (e.g. `28px`); it is parsed by the
   plugin as the legibility floor.
4. **Don't hand-roll type size, spacing, or margins** (§4) — if you want a
   bigger hero title or tighter section gaps, set the matching §2 token
   (`--sd-size-display`, `--sd-space-xl`, …) instead of a raw rule.
5. **No network:** never emit `@import` or remote `url(...)`. For exact fonts,
   use data-URI `@font-face` (§8); otherwise name families + system fallback.
6. **Contrast/WCAG:** ensure `--sd-fg` on `--sd-bg` and text on `--sd-accent`
   meet at least AA (4.5:1 for body). Verify, don't guess.
7. **If the theme is dark, set `--sd-surface` and `--sd-callout-fg`** (§2) to a
   dark panel + light text pair, or callouts render light-on-dark. Also
   consider a `/* sd-hljs: github-dark */` and `/* sd-mermaid: dark */` header
   directive (§7) so code and diagrams aren't stuck on the light scheme.
8. **Keep optional §2 tokens optional and commented**; the §1 token block must
   work standalone. Prefer one accent colour reused via a local `--my-*`
   variable.

Minimal skeleton to start from (or copy `example.css` directly):

```css
/* my-theme — slide-deck theme. Frontmatter: `theme: my-theme` */
.sd-slide {
  --sd-bg: #__; --sd-fg: #__; --sd-accent: #__; --sd-code-bg: #__;
  --sd-font: system-ui, sans-serif;
  --sd-heading-font: Georgia, serif;
  --sd-base: 28px;
}
/* optional: --sd-surface / --sd-callout-fg (dark only), --sd-size-display, --sd-eyebrow-* … */
```

---

## 7. Caveats (the sharp edges)

- **Code-highlight and Mermaid inherit `shiro`'s scheme by default.** A user
  theme gets `shiro`'s highlight.js scheme (`github`, light) and Mermaid theme
  (`default`, light) unless the `.css` file declares an optional header
  directive:

  ```css
  /* sd-hljs: github-dark */
  /* sd-mermaid: dark */
  ```

  `sd-mermaid` accepts `default` / `dark` / `neutral` / `forest`. On a light
  theme the inherited default is fine as-is; on a dark theme, set both — see
  any of the dark built-ins for the values they use (`github-dark` / `dark`).
- **An optional `/* sd-label: My Theme */` directive** sets the human-readable
  name shown in the theme dropdown and Settings' theme list; without it, the
  UI falls back to the file name (the theme key).
- **No network. Ever.** Do not use `@import url(...)` or remote `@font-face`
  `src: url(https://…)`. The slide renders in a sandboxed `srcdoc` iframe and
  the plugin is offline-by-design; remote URLs leak your IP, fail offline, and
  are unreliable in PNG/PDF export. (See §8 for the privacy-safe font path.)
- **Export fidelity.** PNG export uses html2canvas and PDF uses the print
  pipeline; both render the same isolated iframe. Exotic CSS (filters, complex
  gradients, blend modes) may differ in export — test by exporting, not just by
  eyeballing the preview.
- **Stay inside `.sd-slide`.** Don't restyle `html`/`body` or fight the fixed
  1280×720 / 960×720 geometry — that's fit-critical and owned by the plugin.

---

## 8. Fonts & privacy

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

## 9. Install & use

1. Put the `.css` file in your themes folder (settings → "Open in Finder" opens
   it; drop the file in).
2. It appears in the preview's **Theme** dropdown and in the settings
   "Available themes" reference list (the key = file name without `.css`; the
   display label = the optional `sd-label` directive, §7, or the key itself).
3. Apply it: pick it in the preview dropdown (try-on), then **Set** to write
   `theme:` into the note — or type `theme: <key>` in the note's frontmatter
   yourself.
4. Export (PDF / images) renders with the note's resolved theme.

Starting point: [`example.css`](example.css). Reference the five built-in
Nordstern themes' exact values via **Export theme as .css** in Settings.
