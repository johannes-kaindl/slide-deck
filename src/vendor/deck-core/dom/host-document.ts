// What this layer actually needs from a document.
//
// `deck-core` is host-agnostic on purpose: the same renderer serves an Obsidian
// plugin, a local pipeline and — eventually — a non-browser host. Asking for the
// full `Document` overstates that dependency; six members cover everything the
// DOM layer touches. Declaring them is the honest contract, and it keeps the door
// open for a host that implements this port without being a browser at all.
//
// A real `Document` satisfies this structurally, so callers pass one unchanged.
/** Timers, taken from the document's own window so they stay correct in a popout.
 *  Declaring just the two members avoids the `Window & typeof globalThis` intersection,
 *  which carries two `setTimeout` overloads wherever Node's globals are also reachable —
 *  a written return type then picks a different one than the call does. */
export interface HostWindow {
  setTimeout(handler: () => void, timeout?: number): number;
  clearTimeout(id: number): void;
}

export interface HostDocument {
  createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K];
  readonly body: HTMLElement;
  readonly defaultView: HostWindow | null;
  readonly fonts: FontFaceSet;
  querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
  importNode<T extends Node>(node: T, deep?: boolean): T;
}
