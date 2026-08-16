/**
 * The frozen adapter-less release: a supported compatibility class, tested on purpose.
 *
 * THE PROPOSITION.
 *
 *     StandardsEnforcer can reason about a frozen standards release that predates the
 *     pack-declared invocation contract, without pretending the missing contract exists and
 *     without mutating the frozen authority.
 *
 * WHY THIS FILE EXISTS. MachineLearningStandards `v1.4.0` closed at `6bfd078` and ships no
 * `standards-adapter.json`; the contract arrived one release later, in `v1.4.1`. That makes it the
 * only real specimen of a class this repository has to handle and could not otherwise exercise —
 * and it is genuinely durable, because ADR 0010 in that repository makes a published release tag
 * immutable, so `v1.4.0` can never acquire the file.
 *
 * WHY IT IS NOT `scope.test.mjs`'S JOB. That suite pinned `v1.4.0` for historical reasons and its
 * assertions — `NOT_ADOPTED`, `OUT_OF_SCOPE`, disposition stability — all terminate before any
 * adapter is resolved, so they could not tell `v1.4.0` from any other release. The pin looked like
 * coverage and was not. It now pins `v1.5.0` with the rest of the end-to-end suites, and the
 * distinctive property is asserted here, where something actually depends on it.
 *
 * WHAT MUST NOT HAPPEN, AND IS THE REASON FOR THE NEGATIVE ASSERTIONS BELOW. ADR 0001 holds that a
 * pack declares its own passing set. A release that declares nothing therefore has no passing set,
 * and the enforcer must not supply one — not from a neighbouring release, not from `main`, not
 * from a built-in default. `loadAdapter` says so in its own words: *"NO FALLBACK, OF ANY KIND. If
 * the pinned release has no contract, that is an integration failure."* This file is what stops
 * that being quietly softened into a convenience later.
 *
 * The honest outcome is `ENFORCEMENT_ERROR` — the authority could not be established, heard, or
 * trusted — which the existing state model already carries. No new state was added for this class,
 * and adding one would have been the fabrication the class exists to test against.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce, runOfficialEvaluator, loadAdapter } from "../scripts/enforce.mjs";
import { STATE, exitFor, EXIT } from "../scripts/states.mjs";
import { resolveIdentity, checkoutIsExactly } from "../scripts/identity.mjs";
import { oracleAt } from "../test-support/oracle.mjs";

/**
 * Pinned deliberately, and this is the one suite entitled to pin it. `ORACLE_TAGS` retains
 * `v1.4.0` because of this file; if this file is ever deleted, that entry loses its reason and
 * should go with it rather than linger as another accidental dependency.
 */
const TAG = "v1.4.0";
const CACHE = path.join(tmpdir(), "standards-enforcer-test-cache");

const ORACLE = oracleAt(TAG);
const MLS = ORACLE.repo;
const SHA = ORACLE.sha;
const NEEDS_ORACLE = { skip: ORACLE.skip };

async function scratch(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-adapterless-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- The fixture's defining property, asserted rather than assumed -----------------------------

test("adapter-less · the pinned release genuinely ships no invocation contract", NEEDS_ORACLE, () => {
  const id = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
  assert.equal(id.ok, true, id.why ?? "the release must materialise");

  // Anti-vacuity: a checkout that failed to materialise would also have no adapter, and would pass
  // every assertion below for entirely the wrong reason.
  assert.ok(existsSync(path.join(id.dir, "package.json")),
    "the checkout must be a real release tree, or its missing adapter establishes nothing");

  assert.equal(existsSync(path.join(id.dir, "standards-adapter.json")), false,
    "v1.4.0 is the fixture precisely because it has no standards-adapter.json; if this fails, the " +
    "pin is no longer the specimen it was chosen for");
});

// --- The enforcer refuses, by name, without inventing anything ---------------------------------

test("adapter-less · loading the contract fails rather than falling back", NEEDS_ORACLE, () => {
  const id = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
  assert.equal(id.ok, true);
  assert.throws(() => loadAdapter(id.dir), /contract|adapter/i,
    "a release with no contract must throw rather than resolve one from anywhere else");
});

test("adapter-less · the official evaluator cannot be invoked, and says why", NEEDS_ORACLE, async () => {
  const id = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
  await scratch(async (dir) => {
    const policyPath = path.join(dir, "project-policy.yml");
    await writeFile(policyPath, "standardVersion: '1.4.0'\n");
    const run = runOfficialEvaluator(id.dir, { target: dir, policyPath });
    assert.equal(run.ok, false);
    assert.equal(run.report, null, "nothing may be reported for a release that could not be invoked");
    assert.equal(run.contract, null, "no contract may be synthesised for a release that declares none");
  });
});

test("adapter-less · a governed target under this release is ENFORCEMENT_ERROR, never a pass", NEEDS_ORACLE, async () => {
  await scratch(async (dir) => {
    await writeFile(path.join(dir, "train.py"), "import sklearn\nm.fit(X, y)\n");
    // Adopted, deliberately. Adoption is checked before the contract is loaded, so an unadopted
    // target stops at NOT_ADOPTED and never reaches the adapter — which would make this test pass
    // while establishing nothing about the adapter-less class.
    await writeFile(path.join(dir, "project-policy.yml"), "standardVersion: '1.4.0'\n");
    const r = await enforce({ target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });

    assert.notEqual(r.state, STATE.NOT_ADOPTED,
      "the target must be adopted, or this never reaches the missing contract at all");
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(r.passing, false, "a release that declared no passing set cannot have established one");
    assert.notEqual(r.state, STATE.EVALUATED, "no authority spoke, so nothing may read as though one had");
    assert.equal(exitFor(r.state, r.passing), EXIT.NOT_ENFORCEABLE,
      "the authority could not be established, heard or trusted — exit 4, not 0 and not 1");
  });
});

// --- The frozen authority is not touched --------------------------------------------------------

/**
 * WHY THIS COMPARES THE CHECKOUT AND NOT A LIST OF NAMES.
 *
 * This guard used to snapshot `readdir(id.dir)` before and after and compare the sorted names. That
 * is a strictly weaker claim than the one in the test's title, and the gap was not theoretical: with
 * the name list as the only comparison, editing the bytes of an existing file left the guard green,
 * and so did planting a new file beneath an existing directory. Only a NEW TOP-LEVEL entry was ever
 * detectable, which meant the single defect the guard actually caught was the one the second
 * assertion already named explicitly.
 *
 * `checkoutIsExactly` is the right instrument rather than a hand-rolled recursive digest, because it
 * is the same primitive `materialise` uses to decide whether a cached checkout may be executed at
 * all. Asserting it here means this test's guarantee IS the production guarantee — HEAD is the
 * commit, and the working tree matches that commit — rather than a second, parallel definition of
 * "unchanged" that could drift away from the one the enforcer actually relies on.
 *
 * ITS ONE RESIDUAL BLIND SPOT, NAMED RATHER THAN LEFT TO BE DISCOVERED. `git status --porcelain`
 * honours `.gitignore`, so a file written to an ignored path inside the release would not appear.
 * In the pinned oracle those paths are `artifacts/local-ci/` and `node_modules/`. Closing that would
 * mean changing `checkoutIsExactly` itself — a change to production identity verification, not to a
 * test — and this suite is not the place to decide it unilaterally.
 */
test("adapter-less · the frozen release is not mutated by being enforced against", NEEDS_ORACLE, async () => {
  const id = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });

  // Anti-vacuity. If the checkout were already dirty on the way in, "still dirty on the way out"
  // would prove nothing about what enforcement did, and the assertion below would be measuring a
  // pre-existing condition rather than this run.
  const start = checkoutIsExactly(id.dir, SHA);
  assert.equal(start.ok, true, `the release must be pristine before enforcement: ${start.why}`);

  await scratch(async (dir) => {
    await writeFile(path.join(dir, "train.py"), "import sklearn\n");
    await enforce({ target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
  });

  const end = checkoutIsExactly(id.dir, SHA);
  assert.equal(end.ok, true,
    `the enforcer must not modify the frozen release it executes: ${end.why}`);
  assert.equal(existsSync(path.join(id.dir, "standards-adapter.json")), false,
    "the missing contract must still be missing — a repaired fixture is no longer the fixture");
});
