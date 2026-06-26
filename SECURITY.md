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

Slide Deck is a fully local, offline plugin — this is its core security property:

- **No network access.** The plugin does not make any outbound network requests. All rendering (markdown-it, KaTeX, highlight.js, Mermaid) runs locally in the Obsidian process.
- **No telemetry.** The plugin does not collect usage data or phone home.
- **No external services, no analytics, no remote logging.**
- **Export stays local.** PDF export uses the system print dialog; PNG export writes files into your vault's configured attachment folder. No data leaves your device.
- **Embedded images are resolved locally.** The plugin reads image files from your vault and embeds them as data-URLs in the export HTML. No image data is transmitted anywhere.

If you have questions about the plugin's data handling beyond what is described here, the same private contact above applies.
