// scripts/lib/verify-mirror.mjs
// Reiner Helfer: prüft nach dem Dual-Push, ob der GitHub-Mirror wirklich den Release-Stand
// trägt. Der Obsidian-Community-Store liest die Plugin-Version aus der manifest.json des
// Default-Branch — ein still fehlgeschlagener Branch-Push friert den Store auf der alten
// Version ein (0.5.0-Störfall: Tag kam an, Branch blieb auf 0.4.0). Die ls-remote-Ausgabe
// wird hereingereicht → ohne Netz testbar (Muster wie codeberg-release.mjs).
//
//   verifyMirrorRefs({ lsRemoteOutput, expectedSha, tag, branch, isAncestor })
//     → { ok, problems: string[] }
//   lsRemoteOutput = Ausgabe von `git ls-remote <remote> refs/tags/<tag>* refs/heads/<branch>`
//   expectedSha    = der Release-Commit: der Tag muss exakt darauf zeigen, der Branch muss
//                    ihn ENTHALTEN (darf voraus sein — z.B. Commits nach dem Release)
//   isAncestor     = (ancestor, descendant) => boolean — injiziert (git merge-base
//                    --is-ancestor); false auch bei lokal unbekanntem SHA (Divergenz)

export function verifyMirrorRefs({ lsRemoteOutput, expectedSha, tag, branch, isAncestor }) {
  const refs = new Map();
  for (const line of lsRemoteOutput.split(/\r?\n/)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha && ref) refs.set(ref, sha);
  }

  const problems = [];

  // Annotierte Tags liefern eine peeled-Zeile (`^{}`) mit dem Ziel-Commit; leichtgewichtige
  // Tags zeigen direkt auf den Commit.
  const tagSha = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
  if (!tagSha) {
    problems.push(`Tag ${tag} fehlt auf dem Mirror.`);
  } else if (tagSha !== expectedSha) {
    problems.push(`Tag ${tag} zeigt auf ${tagSha.slice(0, 8)}, erwartet ${expectedSha.slice(0, 8)}.`);
  }

  const branchSha = refs.get(`refs/heads/${branch}`);
  if (!branchSha) {
    problems.push(`Branch ${branch} fehlt auf dem Mirror.`);
  } else if (branchSha !== expectedSha && !isAncestor(expectedSha, branchSha)) {
    problems.push(
      `Branch ${branch} steht auf ${branchSha.slice(0, 8)} und enthält den Release-Commit `
      + `${expectedSha.slice(0, 8)} nicht — der Store liest die manifest.json vom Default-Branch `
      + `und bliebe auf der alten Version.`,
    );
  }

  return { ok: problems.length === 0, problems };
}
