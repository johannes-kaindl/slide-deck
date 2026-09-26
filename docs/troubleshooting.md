# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## The preview is empty

> No slides. Separate slides with a line containing only ---
> Open a Markdown note, then click Refresh.

**Cause:** no Markdown note is active, or the note has no `---` separators, so there is nothing to split.

**Fix:** open the note you want to present, put a line with only `---` between slides, and press **Refresh**. The `---` pair at the top of a note is the frontmatter, not a separator.

## A slide is flagged as overflowing

> Slide 2: content overflows — condense it

**Cause:** the slide's content does not fit the canvas (1280×720 for 16:9, 960×720 for 4:3) even after scaling down to the font floor (**Minimum body font size**, default 24 px). Text is never shrunk below that floor.

**Fix:** shorten the slide, split it in two, or lower `minFontPx` in the note's frontmatter or in the settings if you accept smaller text.

## An embed is missing

> Slide 3: embed not found

**Cause:** the slide embeds an image or note (`![[…]]`) that does not resolve in the vault.

**Fix:** check the file name and that the file still exists.

## Export failed

> Export failed: {reason}
> No active note.

**Cause:** an export needs an active note. Beyond that the reason names what went wrong, for example the export folder could not be written.

**Fix:** open the note first; check the **Image export folder** setting and that the vault can write there.

## PDF: nothing is saved

> Print failed.
> Opened {file} — use your browser's Print → Save as PDF (or Share).

**Cause:** on desktop the PDF export opens the **system print dialog** — the plugin does not write a PDF file itself. If the dialog is dismissed or the system refuses, "Print failed." appears. On mobile the export writes a self-contained HTML file and opens it with the default app (the second message).

**Fix:** in the dialog, choose "Save as PDF" as the printer and pick a location. On mobile print or share the opened file to PDF. For files without a dialog use **Export presentation to image series**.

## The theme is not applied

**Cause:** a `theme:` key that matches no theme falls back to `kami` without a warning; a user theme's key is its file name without `.css`, and it is only found in the **Themes folder** (default `Slide-Deck-Themes`).

**Fix:** open **Settings → Slide Deck → Available themes** — it lists every valid key live. See [Write your own theme](themes/THEMING-GUIDE.md).

## Generate: no endpoint reachable

> No endpoint reachable — check the AI settings.
> Set a model in the AI settings or pick one above.

**Cause:** none of the endpoints answers, or no model is chosen. Under **Settings → Slide Deck → AI (local)** each row shows its own status:

| Row status | Meaning |
|---|---|
| Connection refused — server not running or wrong port. | The server is off, or the port in the address is wrong. |
| Timed out — network unreachable (wrong network / VPN off?). | The machine is not reachable from here. |
| Access denied — API key missing or invalid. | The server wants an API key. Enter it on that row. |
| Not reachable | Nothing answers at that address. |

**Fix:** start the server, load a model, press **Check connections**, and choose the model in the row's dropdown (**Refresh model list** re-reads it).

## Generate: the stream is refused

> The endpoint answered the ping but refused the stream (likely CORS). Enable CORS on the server (e.g. OLLAMA_ORIGINS); it fell back to non-streaming.

**Cause:** the live stream comes from the origin `app://obsidian.md` and the server refuses it. The deck is still generated, only without the live token view.

**Fix:** enable CORS — in LM Studio the CORS toggle in the server settings; for Ollama `OLLAMA_ORIGINS=app://obsidian.md`.

## Generate: the deck is invalid or incomplete

> The model did not return a valid deck ({reason}).
> Deck written but may be incomplete — token limit reached.
> Server error: {reason}. Load the model or raise its context length, then retry.
> The note may exceed the model context (~N tokens vs M). Consider shortening it.

**Cause:** the model returned something that is not a deck, hit its output limit, or the note is larger than the model's context window.

**Fix:** use a larger model, raise **Max output tokens** in the AI settings, or shorten the note. If the note already looks like a deck ("This note already looks like a deck.") choose **New copy** rather than replacing it.

## The image slot has no Generate button

> Local Image Generator is not available.

**Cause:** image slots need the **Local Image Generator** plugin (desktop only), installed and enabled.

**Fix:** install and enable it (the card links to how). Other messages come from that plugin: "No image server configured. Set an endpoint in Local Image Generator." or "The image server does not answer."

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/slide-deck/issues) with your Obsidian version, the plugin version (Settings → Community plugins), your platform (desktop or mobile) and the exact message you saw.
