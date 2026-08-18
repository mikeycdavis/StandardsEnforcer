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
 *   v1.5.0  the authority-side repair of the false green — a run in which every applicable rule was
 *           skipped used to report COMPLIANT. `enforce`, `gate` and `scope` all run against it.
 *   v1.4.0  the only frozen release that ships no `standards-adapter.json`; the contract arrived one
 *           release later, in v1.4.1. `adapter-less-release.test.mjs` is the sole reason this entry
 *           exists. If that file goes, this entry goes with it rather than becoming another
 *           accidental dependency.
 *
 * `v1.4.0` is durable as a fixture rather than merely convenient: MachineLearningStandards ADR 0010
 * makes a published release tag immutable, so it can never acquire the contract it lacks.
 */
export const ORACLE_TAGS = ["v1.4.0", "v1.5.0"];
