// Pure state logic of the AI settings UI: obsidian-free, DOM-free, node-testable and pinned by
// check-core-purity. The render layer (ai-settings-ui.ts) calls these and stays thin.

/** Mode of the model field: `dropdown` as soon as any models were loaded, else `freetext`
 *  (offline / not yet probed). A saved model missing from the list does NOT hide the dropdown —
 *  the render layer keeps it as an extra option (never lose it, but make it selectable). */
export function modelFieldMode(models: string[]): "dropdown" | "freetext" {
  return models.length > 0 ? "dropdown" : "freetext";
}

export interface ModelSelection { options: string[]; initial: string }

/** Options + preselection for a model dropdown. A saved model absent from the server list is kept
 *  as an extra option and stays selected — never silently drop what the user configured
 *  (UI-STANDARD §8). Without a saved value the first server model is shown, but showing is not
 *  choosing: the caller must not persist this without a real user action. */
export function initialModelSelection(models: string[], saved: string): ModelSelection {
  const options = saved && !models.includes(saved) ? [saved, ...models] : models;
  const initial = saved && options.includes(saved) ? saved : (options[0] ?? "");
  return { options, initial };
}
