const IMG_EMBED_RE = /^!\[\[.+\]\]$/;            // ![[name]]
const IMG_MD_RE = /^!\[[^\]]*\]\([^)]+\)$/;       // ![alt](src)

/** Infer a layout id from a slide's content shape, used only when the author set NO
 *  explicit <!-- layout --> directive. */
export function inferLayout(regions: string[]): string {
  if (regions.length === 2) return "two-column";
  if (regions.length >= 3) return "columns-3";
  // regions.length === 1 (or 0) below
  if (regions.length !== 1) return "default";
  const body = regions[0].trim();
  if (body === "") return "default";
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  // lone media block → image-focus
  if (lines.length === 1 && (IMG_EMBED_RE.test(lines[0]) || IMG_MD_RE.test(lines[0]))) return "image-focus";
  if (/^```mermaid\b/i.test(lines[0]) && lines[lines.length - 1] === "```") {
    // whole region is a single mermaid fence (no trailing prose)
    const inner = lines.slice(1, -1);
    if (inner.length > 0) return "image-focus";
  }
  if (lines.every((l) => l.startsWith(">"))) return "quote";
  if (lines.length === 1 && /^#{1,6}\s+\S/.test(lines[0])) return "section";
  return "default";
}
