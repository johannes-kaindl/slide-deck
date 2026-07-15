import { describe, it, expect } from "vitest";
// @ts-expect-error — reines .mjs-Skript-Modul ohne Typdeklaration (wie scripts/lib/codeberg-release.mjs)
import { verifyMirrorRefs } from "../scripts/lib/verify-mirror.mjs";

const HEAD = "807c7f74b4eeba3280b31a9c8ef085d83d07ec13";
const OLD = "39980b2797df92b12511e418f60f1870f7124961";
const AHEAD = "aaaa111122223333444455556666777788889999";
const TAG_OBJ = "06d9275b6207e81f3ab37212727bed29e0efe915";

function lsRemote(lines: string[]): string {
  return lines.join("\n") + "\n";
}

// Simuliert die lokale Historie OLD → HEAD → AHEAD.
const isAncestor = (ancestor: string, descendant: string): boolean => {
  const order = [OLD, HEAD, AHEAD];
  const a = order.indexOf(ancestor);
  const d = order.indexOf(descendant);
  return a >= 0 && d >= 0 && a <= d;
};

describe("verifyMirrorRefs", () => {
  it("meldet ok, wenn Tag (annotiert, peeled) und Branch auf dem Release-Commit stehen", () => {
    const out = lsRemote([
      `${TAG_OBJ}\trefs/tags/0.5.0`,
      `${HEAD}\trefs/tags/0.5.0^{}`,
      `${HEAD}\trefs/heads/main`,
    ]);
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it("meldet ok bei leichtgewichtigem Tag (keine peeled-Zeile)", () => {
    const out = lsRemote([`${HEAD}\trefs/tags/0.5.0`, `${HEAD}\trefs/heads/main`]);
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(true);
  });

  it("erkennt den 0.5.0-Störfall: Tag da, aber Branch hängt auf dem alten Release-Commit", () => {
    const out = lsRemote([
      `${TAG_OBJ}\trefs/tags/0.5.0`,
      `${HEAD}\trefs/tags/0.5.0^{}`,
      `${OLD}\trefs/heads/main`,
    ]);
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain("main");
    expect(r.problems[0]).toContain(OLD.slice(0, 8));
  });

  it("erkennt fehlenden Tag und fehlenden Branch", () => {
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: "", expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(2);
  });

  it("erkennt einen Tag, dessen Commit nicht dem erwarteten Release-Commit entspricht", () => {
    const out = lsRemote([
      `${TAG_OBJ}\trefs/tags/0.5.0`,
      `${OLD}\trefs/tags/0.5.0^{}`,
      `${HEAD}\trefs/heads/main`,
    ]);
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("0.5.0");
  });

  it("meldet ok, wenn der Branch VOR dem Release-Commit steht (enthält ihn)", () => {
    const out = lsRemote([
      `${TAG_OBJ}\trefs/tags/0.5.0`,
      `${HEAD}\trefs/tags/0.5.0^{}`,
      `${AHEAD}\trefs/heads/main`,
    ]);
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(true);
  });

  it("erkennt einen divergierten Branch (Release-Commit nicht enthalten)", () => {
    const foreign = "ffff000011112222333344445555666677778888";
    const out = lsRemote([`${HEAD}\trefs/tags/0.5.0`, `${foreign}\trefs/heads/main`]);
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain(foreign.slice(0, 8));
  });

  it("verkraftet Leerzeilen und CRLF", () => {
    const out = `${HEAD}\trefs/tags/0.5.0\r\n\r\n${HEAD}\trefs/heads/main\r\n`;
    const r = verifyMirrorRefs({ isAncestor, lsRemoteOutput: out, expectedSha: HEAD, tag: "0.5.0", branch: "main" });
    expect(r.ok).toBe(true);
  });
});
