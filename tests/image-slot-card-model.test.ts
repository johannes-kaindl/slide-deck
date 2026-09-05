import { describe, it, expect } from "vitest";
import { cardVm } from "../src/image/slot-card-model";
import { parseSlot } from "../src/image/slot-format";

const block = parseSlot("funktion: metaphorical\nEisberg");

describe("cardVm", () => {
  it("offers the button when the api is ready", () => {
    const vm = cardVm(block, { kind: "idle" });
    expect(vm.buttonEnabled).toBe(true);
    expect(vm.status).toBeNull();
  });

  it("shows an empty state instead of a dead button when the api is missing", () => {
    const vm = cardVm(block, { kind: "unavailable" });
    expect(vm.buttonEnabled).toBe(false);
    expect(vm.empty).toBe(true);
  });

  it("moves while running and names the phase", () => {
    const vm = cardVm(block, { kind: "running", phase: "loading-model", pct: null });
    expect(vm.status).toBe("is-checking");
    expect(vm.statusIcon).toBe("loader");
    expect(vm.buttonEnabled).toBe(false);
    expect(vm.progress).toBeNull(); // kein Balken ohne Zahl — ein eingefrorener waere schlimmer
  });

  it("shows a bar only when the backend reports a number", () => {
    expect(cardVm(block, { kind: "running", phase: "generating", pct: 40 }).progress).toBe(40);
  });

  it("carries the decorative reminder as a plain line, not as a warning state", () => {
    const dek = parseSlot("funktion: decorative\nTextur");
    const vm = cardVm(dek, { kind: "idle" });
    expect(vm.hint).not.toBeNull();
    expect(vm.status).toBeNull();       // kein is-warning: der Autor hat das GEWAEHLT
    expect(vm.statusIcon).toBeNull();
  });

  it("has no hint for the other five", () => {
    expect(cardVm(block, { kind: "idle" }).hint).toBeNull();
  });

  it("reports a failure as an error state with its own text", () => {
    const vm = cardVm(block, { kind: "blocked", reason: "no-gpu" });
    expect(vm.status).toBe("is-error");
    expect(vm.statusIcon).toBe("circle-x");
    expect(vm.statusLabel).not.toBe("image.fail.no-gpu"); // kein Schluessel-Fallback
  });
});
