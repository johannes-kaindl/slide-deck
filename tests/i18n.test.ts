import { describe, it, expect, beforeEach } from "vitest";
import { pickLang, setLang, t, STRINGS_EN, STRINGS_DE } from "../src/i18n";

describe("i18n", () => {
  beforeEach(() => setLang("en"));
  it("pickLang maps locale prefix", () => { expect(pickLang("de-DE")).toBe("de"); expect(pickLang("fr")).toBe("en"); });
  it("interpolates positional args", () => { expect(t("export.done", 3)).toContain("3"); });
  it("falls back en -> key", () => { expect(t("does.not.exist")).toBe("does.not.exist"); });
});

describe("theme-handling strings", () => {
  it("has EN + DE for the new keys", () => {
    const keys = ["toolbar.theme", "toolbar.setTheme", "source.frontmatter", "source.default", "source.unsaved",
      "settings.themesFolder.name", "settings.openFolder.button", "settings.exportTheme.button",
      "settings.availableThemes.name", "settings.hideFolder.name"];
    setLang("en");
    for (const k of keys) expect(t(k), `EN ${k}`).not.toBe(k);
    setLang("de");
    for (const k of keys) expect(t(k), `DE ${k}`).not.toBe(k);
    setLang("en");
  });
});

describe("export notices", () => {
  it("has EN + DE for notice.pdfOpened", () => {
    setLang("en"); expect(t("notice.pdfOpened", "x.html")).not.toBe("notice.pdfOpened");
    setLang("de"); expect(t("notice.pdfOpened", "x.html")).not.toBe("notice.pdfOpened");
    setLang("en");
  });
});

describe("deck-generation strings", () => {
  const keys = ["cmd.generateDeck", "deck.modal.title", "deck.modal.generate", "deck.modal.stop",
    "deck.modal.slideCount", "deck.modal.hint", "deck.modal.existsReplace", "deck.modal.existsCopy",
    "deck.modal.contextWarn", "deck.modal.noEndpoint", "deck.notice.done", "deck.notice.incomplete",
    "deck.notice.finishedBg", "deck.error.envelope", "deck.error.cors", "deck.error.invalid",
    "deck.settings.heading", "deck.settings.endpoints.name", "deck.settings.model.name",
    "deck.settings.maxTokens.name", "deck.settings.temperature.name", "deck.settings.suppressThinking.name"];
  it("has EN + DE for every deck key", () => {
    setLang("en"); for (const k of keys) expect(t(k), `EN ${k}`).not.toBe(k);
    setLang("de"); for (const k of keys) expect(t(k), `DE ${k}`).not.toBe(k);
    setLang("en");
  });
});

describe("EN/DE parity", () => {
  it("every EN key has a DE translation and vice versa", () => {
    expect(Object.keys(STRINGS_DE).sort()).toEqual(Object.keys(STRINGS_EN).sort());
  });
});
