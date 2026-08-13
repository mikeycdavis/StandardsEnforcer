/**
 * The reviewed surface, and the two digests that describe it.
 *
 * The implementation of [ADR 0007](../artifacts/adr/0007-the-review-surface-is-the-whole-repository.md).
 * That document is the contract; if this file wants different semantics, the ADR changes first.
 *
 *     surfaceDigest    resolver semantics + exclusion configuration
 *                      WHAT WAS AGREED TO BE LOOKED AT
 *
 *     contentDigest    the canonical tracked tuples falling inside that surface
 *                      WHAT WAS ACTUALLY THERE
 *
 * Kept apart because they fail differently and have different owners: a changed `surfaceDigest` means
 * somebody altered the agreement, a changed `contentDigest` means the repository changed underneath
 * an unaltered agreement. One combined value would make those indistinguishable.
 *
 * NOTE ON THE CIRCULARITY THAT ISN'T. `surfaceDigest` is computed from the exclusion configuration,
 * and the exclusion configuration is recorded in the determination — so it may look as though it must
 * always match itself. It does not: the RECORDED digest is the reviewer's frozen value, and the
 * RECOMPUTED one comes from the configuration as it stands now. Widening an exclusion after the
 * review changes the recomputation and not the record, which is exactly the mismatch that must be
 * caught.
 *
 * WHAT THIS MODULE NEVER DOES. It never returns a digest it could not compute, never substitutes an
 * empty surface for an unreadable one, and has no path that treats an uncomputable value as a match.
 * Failure returns `{ ok: false, why }`, which callers turn into `undetermined` — ADR 0007's second
 * forbidden shortcut, and INV-E1 in this domain.
 */

import { createHash } from "node:crypto";

import { trackedFiles, worktreeState, notCovered, GitFactsError } from "./gitfacts.mjs";
import { compileExclusions, excludedBy, GlobError } from "./glob.mjs";

/**
 * The version of "reviewed repository state" itself.
 *
 * Covered by `surfaceDigest`, so a bump **intentionally invalidates every prior attestation** and no
 * migration path suppresses it. If v2 computes a different surface from the same repository, then
 * every review conducted under v1 answered a different question.
 */
export const RESOLVER_VERSION = 1;

const hash = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Canonicalise one tracked path, or refuse it.
 *
 * Each refusal is a case where two machines, or a machine and a reviewer, would disagree about what
 * the surface contained — and a digest computed over a disagreement is worse than no digest.
 */
function canonicalPath(p) {
  // NFC so that a path typed on macOS and one typed on Windows are the same path.
  const nfc = p.normalize("NFC");
  if (nfc.includes("\n") || nfc.includes("\0")) {
    return { ok: false, why: `the tracked path ${JSON.stringify(p)} contains a newline or NUL, which no canonical stream can represent unambiguously` };
  }
  if (nfc.split("/").includes("..")) {
    return { ok: false, why: `the tracked path ${JSON.stringify(p)} contains \`..\`` };
  }
  return { ok: true, path: nfc };
}

/**
 * Build the reviewed surface for a repository under a set of exclusions.
 *
 * Returns `{ ok: true, ... }` with both digests, or `{ ok: false, why, code }`. **Never throws for an
 * ordinary condition** — an unreadable repository is a result this system has a name for.
 */
export function reviewSurface(repo, exclusions = []) {
  let compiled;
  try {
    compiled = compileExclusions(exclusions);
  } catch (e) {
    if (e instanceof GlobError) return { ok: false, code: "EXCLUSION_INVALID", why: e.message };
    throw e;
  }

  let facts;
  let worktree;
  try {
    facts = trackedFiles(repo);
    worktree = worktreeState(repo);
  } catch (e) {
    if (e instanceof GitFactsError) return { ok: false, code: e.code, why: e.message };
    throw e;
  }

  const included = [];
  const excludedCounts = new Map(compiled.map((g) => [g.pattern, 0]));
  const seenLower = new Map();

  for (const f of facts.files) {
    const c = canonicalPath(f.path);
    if (!c.ok) return { ok: false, code: "PATH_NOT_CANONICAL", why: c.why };

    // Two paths differing only in case are one file on NTFS and two on ext4. Whichever answer this
    // machine gives, the other machine gives a different digest for the same commit — so the surface
    // is not reproducible and must not be digested.
    const lower = c.path.toLowerCase();
    if (seenLower.has(lower) && seenLower.get(lower) !== c.path) {
      return {
        ok: false,
        code: "CASE_COLLISION",
        why: `the tracked paths ${JSON.stringify(seenLower.get(lower))} and ${JSON.stringify(c.path)} differ only in case, ` +
          "so this repository's surface is not reproducible across filesystems",
      };
    }
    seenLower.set(lower, c.path);

    const hit = excludedBy(compiled, c.path);
    if (hit) {
      excludedCounts.set(hit.pattern, excludedCounts.get(hit.pattern) + 1);
      continue;
    }
    included.push({ ...f, path: c.path });
  }

  // Sort over UTF-8 bytes rather than by `String.prototype.sort` or `localeCompare`, both of which
  // depend on locale or on UTF-16 code units and would order the same file list differently on two
  // machines.
  included.sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));

  // The surface: what was agreed to be looked at. Exclusions are sorted so that recording the same
  // set in a different order is the same agreement.
  const surfaceStream =
    `resolver=${RESOLVER_VERSION}\n` +
    compiled
      .map((g) => g.pattern)
      .sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")))
      .map((p) => `exclude=${p}\n`)
      .join("");

  // The content: what was actually there. Mode is included, so a file becoming executable — or
  // becoming a symlink — changes the digest.
  const contentStream = included.map((f) => `${f.mode} ${f.blobSha} ${f.path}\n`).join("");

  return {
    ok: true,
    repo: facts.repo,
    resolverVersion: RESOLVER_VERSION,
    surfaceDigest: hash(surfaceStream),
    contentDigest: hash(contentStream),
    counts: { tracked: facts.files.length, reviewed: included.length, excluded: facts.files.length - included.length },
    // Reported with every run so growth inside an exclusion is visible even where it does not
    // invalidate — ADR 0007's third bound, and the information a human actually acts on.
    exclusions: compiled.map((g) => ({ path: g.pattern, reason: g.reason, matched: excludedCounts.get(g.pattern) })),
    // Present, and participating in nothing. A reviewer reading a dirty tree is not reading what the
    // digest covers.
    reproducible: worktree.clean,
    untracked: worktree.untracked,
    modified: worktree.modified,
    notCovered: notCovered(included),
  };
}

/**
 * Compare a recorded basis against the repository as it stands.
 *
 * The three dispositions of ADR 0007, and the inversion that makes them safe:
 *
 *     observable, equal        current
 *     observable, different    stale
 *     not observable           undetermined
 *
 * The packs write `if (current && current !== recorded)`, so an uncomputable digest is falsy and
 * reads as a match. This asks the question the other way round — `!current || current !== recorded` —
 * and that inversion is the whole point.
 */
export const SURFACE_DISPOSITION = { CURRENT: "current", STALE: "stale", UNDETERMINED: "undetermined" };

export function compareSurface(recorded, observed) {
  if (!recorded || typeof recorded !== "object") {
    return { disposition: SURFACE_DISPOSITION.UNDETERMINED, why: "the determination records no reviewed surface, so whether it still describes this repository cannot be established" };
  }
  const { resolverVersion, surfaceDigest, contentDigest } = recorded;
  if (typeof surfaceDigest !== "string" || typeof contentDigest !== "string" || !Number.isInteger(resolverVersion)) {
    return { disposition: SURFACE_DISPOSITION.UNDETERMINED, why: "the recorded reviewed surface is missing a resolver version or a digest" };
  }

  if (!observed || observed.ok !== true) {
    return {
      disposition: SURFACE_DISPOSITION.UNDETERMINED,
      why: observed?.why ?? "the current reviewed surface could not be established",
      code: observed?.code ?? null,
    };
  }

  // A recorded surface produced under different resolver semantics describes a different question,
  // not a different answer. Reported before the digests, because "the digests differ" would be a
  // true but useless explanation of a version bump.
  if (resolverVersion !== observed.resolverVersion) {
    return {
      disposition: SURFACE_DISPOSITION.STALE,
      why: `the review was recorded under resolver version ${resolverVersion} and this run computes version ` +
        `${observed.resolverVersion}, which defines the reviewed surface differently`,
      resolverChanged: true,
    };
  }
  if (surfaceDigest !== observed.surfaceDigest) {
    return {
      disposition: SURFACE_DISPOSITION.STALE,
      why: "the exclusions in force no longer match the ones this determination was reviewed under, so the " +
        "agreement about what counts as reviewed has changed",
      surfaceChanged: true,
    };
  }
  if (contentDigest !== observed.contentDigest) {
    return {
      disposition: SURFACE_DISPOSITION.STALE,
      why: `the tracked content of the reviewed surface has changed since the review (${observed.counts.reviewed} ` +
        "files are in scope now)",
      contentChanged: true,
    };
  }
  return { disposition: SURFACE_DISPOSITION.CURRENT, why: null };
}

/**
 * The block a reviewer pastes into a determination.
 *
 * Refuses on a non-reproducible or empty surface. **Reviewing nothing must not be attestable**, and
 * an attestation made over a dirty tree describes content the reviewer did not see. Both refusals
 * are cheaper than the determination they would otherwise produce.
 */
export function proposeSurface(repo, exclusions = []) {
  const observed = reviewSurface(repo, exclusions);
  if (!observed.ok) return observed;
  if (!observed.reproducible) {
    return {
      ok: false,
      code: "NOT_REPRODUCIBLE",
      why: `${observed.untracked.length} untracked and ${observed.modified.length} modified path(s) mean this working ` +
        "tree is not the tracked content the digest would cover, so no determination is emitted",
      observed,
    };
  }
  if (observed.counts.reviewed === 0) {
    return { ok: false, code: "EMPTY_SURFACE", why: "the reviewed surface contains no files; reviewing nothing is not reviewing", observed };
  }
  return {
    ok: true,
    reviewedSurface: {
      resolverVersion: observed.resolverVersion,
      surfaceDigest: observed.surfaceDigest,
      contentDigest: observed.contentDigest,
      exclusions: observed.exclusions.map((e) => ({ path: e.path, reason: e.reason })),
      counts: observed.counts,
    },
    observed,
  };
}
