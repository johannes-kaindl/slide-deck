/** Theme key = the .css file's name without its extension, verbatim (frontmatter "theme:" value). */
export function keyFromFilename(filename: string): string {
  return filename.trim().replace(/\.css$/i, "");
}

/** Read the --sd-base legibility-floor token (in px) from a theme's CSS, if it declares one. */
export function parseBaseFontPx(css: string): number | undefined {
  const m = /--sd-base\s*:\s*([\d.]+)px/.exec(css);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
