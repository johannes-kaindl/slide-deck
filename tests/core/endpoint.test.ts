import { describe, it, expect } from "vitest";
import { normalizeEndpoint, parseEndpointList } from "../../src/core/llm/endpoint";

describe("normalizeEndpoint", () => {
  it("lässt einen sauberen Endpoint unverändert", () => {
    expect(normalizeEndpoint("http://localhost:1234")).toBe("http://localhost:1234");
  });
  it("strippt ein trailing /v1", () => {
    expect(normalizeEndpoint("http://localhost:1234/v1")).toBe("http://localhost:1234");
  });
  it("strippt /v1 mit trailing Slash", () => {
    expect(normalizeEndpoint("http://localhost:1234/v1/")).toBe("http://localhost:1234");
  });
  it("strippt trailing Slashes", () => {
    expect(normalizeEndpoint("http://localhost:1234/")).toBe("http://localhost:1234");
  });
  it("trimmt Whitespace", () => {
    expect(normalizeEndpoint("  http://localhost:1234/v1  ")).toBe("http://localhost:1234");
  });
  it("entfernt nur EIN trailing /v1, kein /v1 mitten im Pfad", () => {
    expect(normalizeEndpoint("http://h/v1/api")).toBe("http://h/v1/api");
  });
});

describe("parseEndpointList", () => {
  it("splits lines, trims, drops blanks, preserves order", () => {
    expect(parseEndpointList("http://a\n\n  http://b  \n")).toEqual(["http://a", "http://b"]);
  });
  it("de-duplicates while keeping first-seen order", () => {
    expect(parseEndpointList("http://a\nhttp://b\nhttp://a")).toEqual(["http://a", "http://b"]);
  });
  it("returns [] for empty/whitespace input", () => {
    expect(parseEndpointList("   \n  ")).toEqual([]);
  });
});
