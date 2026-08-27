/**
 * The authoritative oracle: which real standards release this suite runs against, whether it is
 * available, and whether its absence is permitted.
 *
 * WHY THIS EXISTS. Three suites each hardcoded `F:/Repos/MachineLearningStandards`, derived their
 * own availability flag, and attached `{ skip: !AVAILABLE && "..." }` to every test that touches the
 * subject. CI runs on `ubuntu-latest`, where that path cannot exist, so every identity, adoption,
 * oracle, gate-root and scope-integration test skipped and `npm test` exited 0. A suite that goes
 * green when its subject is missing is the failure this family of repositories exists to prevent,
 * and it was sitting inside the mechanism meant to detect it. See FE-14.
 *
 * THE INVARIANT, WRITTEN SO IT DOES NOT DEPEND ON A COUNT:
 *
 *     Oracle-dependent tests skipped because the authoritative repository is unavailable are not
 *     evidence of passing integration, and CI must not report a green authoritative suite merely
 *     because those tests were skipped.
 *
 * THREE CONDITIONS, NEVER COLLAPSED INTO TWO. The reason the original defect was invisible is that
 * "the oracle is not here" and "the oracle is not required here" produced the same observable
 * outcome — a skip, and exit 0.
 *
 *     UNCONFIGURED   no oracle was named. Ordinary local development; skipping is correct and the
 *                    suite stays green, because nobody claimed this run was authoritative.
 *     UNUSABLE       an oracle was named and cannot serve: the path is not a repository, or the
 *                    release the suite pins does not resolve in it. This is a misconfiguration and
 *                    is reported differently from silence, because the fixes differ.
 *     AVAILABLE      the named repository resolves the pinned tag. Tests run.
 *
 * `ENFORCER_REQUIRE_ORACLE=1` asserts that this run is authoritative. Under it, UNCONFIGURED and
 * UNUSABLE both fail the suite — see `oracle-required.test.mjs`. The flag means exactly what it
 * says, and nothing satisfies it but a real oracle.
 *
 * SYNTHETIC PACKS DO NOT SATISFY IT. `adapter-provenance.test.mjs` and `open-vocabulary.test.mjs`
 * build real git repositories with real tags and prove the mechanism and its hostile cases. They
 * cannot prove integration, because this repository wrote them: an evaluator we authored agreeing
 * with our expectations of it is not independent evidence. Only a pack somebody else released is.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { materialise } from "../scripts/identity.mjs";

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

/** The oracle repository, or `null` when none was named. No default: unset is unset. */
export const ORACLE_REPO = process.env.ENFORCER_ORACLE_REPO?.trim() || null;

/** Whether this run claims to be authoritative. */
export const ORACLE_REQUIRED = process.env.ENFORCER_REQUIRE_ORACLE === "1";

export const ORACLE_STATE = {
  UNCONFIGURED: "UNCONFIGURED",
  UNUSABLE: "UNUSABLE",
  AVAILABLE: "AVAILABLE",
};

/**
 * Probe one pinned release of the oracle.
 *
 * Probing rather than assuming is the discipline ADR 0005 case 7b already applies to symlink
 * capability: capability is established against the environment, separately from the fixture, so
 * *cannot* and *did not* stay distinguishable. A test that cannot run earns a skip only when nobody
 * claimed it had to.
 *
 * Returns `{ state, available, repo, tag, sha, why, skip }`. `skip` is the value to hand
 * `node:test` — `false` when the test must run, otherwise a reason string.
 */
export function oracleAt(tag) {
  const base = { repo: ORACLE_REPO, tag, sha: null };

  if (!ORACLE_REPO) {
    return {
      ...base,
      state: ORACLE_STATE.UNCONFIGURED,
      available: false,
      why: "ENFORCER_ORACLE_REPO is not set, so no authoritative standards release was named",
      skip: "no authoritative oracle configured (set ENFORCER_ORACLE_REPO)",
    };
  }

  if (!existsSync(path.join(ORACLE_REPO, ".git"))) {
    return {
      ...base,
      state: ORACLE_STATE.UNUSABLE,
      available: false,
      why: `${ORACLE_REPO} is not a git repository`,
      skip: `authoritative oracle unusable: ${ORACLE_REPO} is not a git repository`,
    };
  }

  // `rev-list -n 1` dereferences an annotated tag to its commit, which is what a release identity
  // means. `rev-parse <tag>` would return the tag object's own SHA — the exact mistake
  // identity.mjs diagnoses by name.
  const resolved = git(["rev-list", "-n", "1", tag], ORACLE_REPO);
  if (resolved.status !== 0) {
    const reason = (resolved.stderr || "").trim().split("\n")[0] || `git exited ${resolved.status}`;
    return {
      ...base,
      state: ORACLE_STATE.UNUSABLE,
      available: false,
      why: `${ORACLE_REPO} does not resolve ${tag}: ${reason}`,
      skip: `authoritative oracle unusable: ${ORACLE_REPO} does not resolve ${tag}`,
    };
  }

  return {
    ...base,
    state: ORACLE_STATE.AVAILABLE,
    available: true,
    sha: resolved.stdout.trim(),
    why: null,
    skip: false,
  };
}

/**
 * Every release the suite pins, so the required-oracle guard checks all of them rather than
 * whichever one it happens to import.
 *
 * A guard that checked one would pass on an oracle that cannot serve the other, which is the same
 * partial-coverage error one level down.
 *
 * EACH ENTRY IS HERE FOR A STATED REASON, and the reasons are different. Recorded because until
 * 2026-08-16 one of them had no reason at all: `scope.test.mjs` pinned `v1.4.0` because that was the
 * first release it was integrated against, which read as coverage of that release and was not.
 *
 *   v1.6.0  the first release whose invocation contract declares schemaVersion 1.1.0 and admits
 *           `{policy}`. `enforce`, `gate` and `scope` all run against it. At 1.0.0 a bound
 *           `{policy}` is silently dropped, so before this release the binding could only be
 *           exercised against packs this repository wrote -- which is not independent evidence.
 *   v1.5.0  the authority-side repair of the false green: a run in which every applicable rule was
 *           skipped used to report COMPLIANT. Retained as a fixture in its own right, not as the
 *           incidental import it once was. No suite pins it today, and that is not a reason to drop
 *           it -- the release where a repair FIRST exists is the specimen for that repair, and an
 *           oracle unable to serve it cannot demonstrate the behaviour whatever else it can serve.
 *           Semantic ancestry is not substitution: that v1.6.0 descends from v1.5.0 makes the
 *           behaviour present, not the fixture reproducible.
 *   v1.4.0  the only frozen release that ships no `standards-adapter.json`; the contract arrived one
 *           release later, in v1.4.1. `adapter-less-release.test.mjs` is the sole reason this entry
 *           exists. If that file goes, this entry goes with it rather than becoming another
 *           accidental dependency.
 *
 * Note the asymmetry, because it is the whole point of this list. `v1.4.0` and `v1.5.0` are retained
 * for what they are -- an adapter-less release and a false-green repair, each unreproducible from any
 * other tag under ADR 0010's immutability. `v1.6.0` is here because three suites import it. An entry
 * needs one of those two reasons; it may not survive on neither.
 *
 * `v1.4.0` is durable as a fixture rather than merely convenient: MachineLearningStandards ADR 0010
 * makes a published release tag immutable, so it can never acquire the contract it lacks. That ADR
 * resolves at the commit below -- pinned by commit, not by branch, because the ref carrying it is a
 * branch and therefore movable:
 * https://github.com/mikeycdavis/MachineLearningStandards/blob/e30a84c6ffd74b9401d9e3ec0ffe08fb8cfa703d/artifacts/adr/0010-published-release-tags-are-public-authorities.md
 */
export const ORACLE_TAGS = ["v1.4.0", "v1.5.0", "v1.6.0"];

/**
 * The SUBJECT a test evaluates, as distinct from the AUTHORITY that evaluates it (ST-14).
 *
 * Two identities travel through every oracle-dependent test and only one of them has ever been
 * pinned:
 *
 *     authority identity   which standards implementation executes   -- resolveIdentity, verified
 *     subject identity     which repository bytes are evaluated      -- ORACLE_REPO, whatever it is
 *
 * `ORACLE_REPO` is a host working tree. It is a transport for an object database and nothing about
 * it is fixed: it can be edited, checked out elsewhere, or rebased while a suite is mid-run, and an
 * assertion about an evaluation result then depends on bytes no one recorded. That is the defect
 * ST-14 files, and the authority half already shows what the remedy looks like.
 *
 * @param {string} hostRepo  a git repository to take the subject FROM (never evaluated in place)
 * @param {string} sha       the commit whose bytes are the subject
 * @param {string} cacheRoot where the materialised subject lives
 * @returns {{ok: boolean, dir: string|null, sha: string, frozen: boolean, why: string|null}}
 */
export function oracleSubject(hostRepo, sha, cacheRoot) {
  // THE SAME VERIFIED ROUTE THE AUTHORITY ALREADY USES, and deliberately not a second one.
  // `materialise` clones from the object database, detaches onto the SHA, and re-verifies the
  // checkout with `checkoutIsExactly` before returning it. Reusing it means the subject and the
  // authority are frozen by one mechanism with one set of guarantees; a bespoke copy here would be
  // a second definition of "these bytes are that commit" that could drift from the first.
  //
  // A COPY OF THE WORKING TREE WOULD NOT DO. Copying whatever `hostRepo` currently holds fixes the
  // bytes for the run but pins them to no identity: the result would be reproducible only by whoever
  // still had that directory. What makes an assertion checkable later is that the bytes are named.
  // A CACHE ROOT OF ITS OWN, and this is load-bearing rather than tidiness. `materialise` keys an
  // entry by SHA alone, and the subject's commit is routinely the authority's commit -- an oracle
  // evaluated under its own release is the whole point of these tests. Sharing a root would hand
  // both roles the same directory, and `resolveIdentity` would then verify the authority, find the
  // subject's state, and REPAIR it out from under the run. Discovered by the liveness test below:
  // mutating the subject changed nothing, because the next enforce silently restored it.
  const materialised = materialise(hostRepo, sha, path.join(cacheRoot, "subject"));
  if (!materialised.ok) {
    // NO FALLBACK. Returning the host on failure would restore the defect behind a helper that
    // reports success -- an unknown reported as a pass, which is the one thing this repository
    // refuses everywhere else. A test that cannot establish its subject does not have one.
    return { ok: false, dir: null, sha, frozen: false, why: materialised.why };
  }
  return { ok: true, dir: materialised.dir, sha, frozen: true, why: null };
}
