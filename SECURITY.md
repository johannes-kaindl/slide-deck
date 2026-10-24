# Security Policy

## Supported Versions

Security updates are provided for the most recently released version of Slide Deck. Older versions do not receive backported fixes — please update to the latest release.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through public issues.

Instead, report them privately by email to **code@jkaindl.de** (PGP-encrypted mail is welcome). You will receive a prompt acknowledgement, and we will keep you informed as the fix progresses.

## Data Handling / Scope

Slide Deck renders and exports entirely locally; its one network use is the optional AI generation — this is its core security property:

- **Rendering makes no network requests.** All rendering (markdown-it, KaTeX, highlight.js, Mermaid) runs locally in the Obsidian process.
- **One optional network use: "Generate presentation from note".** Only when you press *Generate* does the plugin send the note's text (secrets such as private keys, bearer tokens and API keys replaced by placeholders) to the LLM endpoint you configured. That endpoint is a local server by default; it can also be a hosted provider you entered or, through the LLM Endpoint Manager, Claude at Anthropic. For the last two the note's content leaves your device. Opening the generation dialog or the settings tab additionally asks the configured endpoints for reachability, model lists and the model's context length. Nothing is sent in the background otherwise.
- **No telemetry.** The plugin does not collect usage data or phone home.
- **No analytics, no remote logging.**
- **Export stays local.** PDF export uses the system print dialog; PNG export writes files into your vault's configured attachment folder. The export itself transmits nothing.
- **Embedded images are resolved locally.** The plugin reads image files from your vault and embeds them as data-URLs in the export HTML. No image data is transmitted anywhere.

If you have questions about the plugin's data handling beyond what is described here, the same private contact above applies.
