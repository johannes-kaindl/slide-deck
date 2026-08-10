import { describe, it, expect, beforeEach } from "vitest";
import { setLang } from "../src/i18n";
import { endpointListStrings } from "../src/ai-settings-ui";
import type { EndpointStatus, EndpointWarning } from "../src/vendor/kit/endpoint_diagnostics";

// The row editor itself is vendored kit code (buildEndpointList, obsidian-kit@0.26.0) and is
// tested there. What belongs to THIS repo is the translation layer between the kit's
// language-free contract and our EN-canonical t() vocabulary — that is what these cover.
// Completeness of the strings object is already enforced by tsc: a missing member fails the
// EndpointListStrings assignment in src/ai-settings-ui.ts.

describe("endpointListStrings", () => {
  beforeEach(() => { setLang("en"); });

  it("never surfaces the kit's hardcoded German klartext for a translated status kind", () => {
    const status = { kind: "refused", reachable: false, klartext: "Verbindung abgelehnt" } as EndpointStatus;
    const tip = endpointListStrings().statusTooltip(status);
    expect(tip).not.toContain("Verbindung");
    expect(tip).toContain("refused");
  });

  it("appends raw detail only for the unknown kind, which has no translated message of its own", () => {
    const s = endpointListStrings();
    const unknown = { kind: "unknown", reachable: false, klartext: "", raw: "ECONNRESET" } as EndpointStatus;
    expect(s.statusTooltip(unknown)).toContain("ECONNRESET");
    // A kind that IS fully translated must not leak kit-internal detail text alongside it.
    const refused = { kind: "refused", reachable: false, klartext: "", raw: "ECONNREFUSED" } as EndpointStatus;
    expect(s.statusTooltip(refused)).not.toContain("ECONNREFUSED");
  });

  it("spells out an unset global model instead of rendering an empty parenthesis", () => {
    const s = endpointListStrings();
    expect(s.emptyModelLabel("")).toContain("not set");
    expect(s.emptyModelLabel("")).not.toContain("()");
    expect(s.emptyModelLabel("qwen3")).toContain("qwen3");
  });

  it("fills the standby position into the role text and leaves no placeholder behind", () => {
    const s = endpointListStrings();
    expect(s.role({ kind: "standby", position: 3 })).toContain("3");
    // The active role takes no argument — a leftover "{0}" would be visible in the UI.
    expect(s.role({ kind: "active" })).not.toContain("{0}");
  });

  it("joins multiple input warnings into one tooltip", () => {
    const warnings = [{ rule: "scheme" }, { rule: "port" }] as EndpointWarning[];
    const text = endpointListStrings().warnings(warnings);
    expect(text).toContain("http://");
    expect(text).toContain("port");
  });

  it("returns an empty model hint when the kit reports no hint", () => {
    expect(endpointListStrings().modelHint("")).toBe("");
    expect(endpointListStrings().modelHint("unreachable")).not.toBe("");
  });

  it("translates with the active language", () => {
    setLang("de");
    expect(endpointListStrings().moveToFront).toBe("Zuerst verwenden");
  });
});
