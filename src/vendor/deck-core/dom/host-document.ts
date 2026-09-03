// What this layer actually needs from a document.
//
// `deck-core` is host-agnostic on purpose: the same renderer serves an Obsidian
// plugin, a local pipeline and — eventually — a non-browser host. Asking for the
// full `Document` overstates that dependency; a handful of members covers everything the
// DOM layer touches. Declaring them is the honest contract, and it keeps the door
// open for a host that implements this port without being a browser at all.
//
// A real `Document` satisfies this structurally, so callers pass one unchanged.
/** What the DOM layer needs from the document's own window: timers (taken from there so
 *  they stay correct in a popout) and the resolved cascade.
 *  Naming the members we use avoids the `Window & typeof globalThis` intersection,
 *  which carries two `setTimeout` overloads wherever Node's globals are also reachable —
 *  a written return type then picks a different one than the call does. */
export interface HostWindow {
  setTimeout(handler: () => void, timeout?: number): number;
  clearTimeout(id: number): void;
  /** The cascade, read back. A user .css theme hands over no token record — resolving its
   *  `--sd-*` values is only possible by asking the document what they compute to. */
  getComputedStyle(element: Element): CSSStyleDeclaration;
}

export interface HostDocument {
  createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K];
  readonly body: HTMLElement;
  readonly defaultView: HostWindow | null;
  readonly fonts: FontFaceSet;
  querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
  importNode<T extends Node>(node: T, deep?: boolean): T;
}
