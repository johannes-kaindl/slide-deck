import { describe, it, expect, beforeEach } from "vitest";
import { pickLang, setLang, t } from "../src/i18n";

describe("i18n", () => {
  beforeEach(() => setLang("en"));
  it("pickLang maps locale prefix", () => { expect(pickLang("de-DE")).toBe("de"); expect(pickLang("fr")).toBe("en"); });
  it("interpolates positional args", () => { expect(t("export.done", 3)).toContain("3"); });
  it("falls back en -> key", () => { expect(t("does.not.exist")).toBe("does.not.exist"); });
});
