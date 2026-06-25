import { Plugin } from "obsidian";
import { runSpike } from "./spike-export";

export default class SlideDeckPlugin extends Plugin {
  async onload(): Promise<void> {
    // Folgetasks registrieren Commands, Settings, View hier.
    this.addCommand({
      id: "spike-export",
      name: "Spike: export demo deck",
      callback: () => { void runSpike(activeDocument, activeWindow); },
    });
  }
}
