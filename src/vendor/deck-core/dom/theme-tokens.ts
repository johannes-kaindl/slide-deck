import type { HostDocument } from "./host-document";
import { MERMAID_TOKENS, mermaidVarsFor } from "../pure/presets";

/** Mermaid themeVariables for a theme that carries none of its own.
 *
 *  A built-in hands its token record to `mermaidVarsFor` when the registry is built; a user
 *  `.css` theme has no such record — its values live in the stylesheet, and the only thing
 *  that knows what they compute to is the cascade of the document the deck renders in. So
 *  we ask it: a `.sd-slide` probe, one `getComputedStyle`, out again. The alternative was to
 *  make theme authors declare the same colours a fourth time in mermaid's own vocabulary —
 *  a format to keep in sync, for values the browser already holds.
 *
 *  Returns `undefined` when nothing resolves: the theme declares no `--sd-*` tokens, or the
 *  host document is no browser window. The caller then keeps mermaid's named theme. */
export function mermaidVarsFromDocument(
  doc: HostDocument, container: HTMLElement,
): Record<string, string> | undefined {
  const view = doc.defaultView;
  if (!view?.getComputedStyle) return undefined;
  const probe = doc.createElement("div");
  // The class the token rules are written against — a bare div resolves nothing on a theme
  // that declares its tokens on `.sd-slide` (which every built-in and the documented user
  // form do). Custom properties inherit, so a `:root` declaration is reached as well.
  probe.className = "sd-slide";
  // Deliberately unstyled. The probe is appended to a container the caller has just emptied
  // and is removed before this function returns, so nothing can paint and there are no
  // siblings whose layout it could disturb — the two defensive inline styles this once
  // carried bought nothing. They cost something, though: a vendored copy of this file is
  // linted under the Obsidian store rules in `markdown-presentation`, and
  // `obsidianmd/no-static-styles-assignment` rejects exactly that pair. Anything this layer
  // really needs to style belongs in STRUCTURE_CSS as a class.
  container.appendChild(probe);
  const tokens: Record<string, string> = {};
  try {
    const computed = view.getComputedStyle(probe);
    for (const name of MERMAID_TOKENS) {
      const value = computed.getPropertyValue(name).trim();
      if (value) tokens[name] = value;
    }
  } finally {
    probe.remove();
  }
  return Object.keys(tokens).length > 0 ? mermaidVarsFor(tokens) : undefined;
}
