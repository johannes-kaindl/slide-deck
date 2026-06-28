/** Infer a layout id from a single-region slide's content shape, used only when the
 *  author set NO explicit <!-- layout --> directive. Multi-region slides → "default". */
export function inferLayout(regions: string[]): string {
  if (regions.length !== 1) return "default";
  const lines = regions[0]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) return "default";
  if (lines.every((l) => l.startsWith(">"))) return "quote";
  if (lines.length === 1 && /^#{1,6}\s+\S/.test(lines[0])) return "section";
  return "default";
}
