/**
 * The guard that makes a missing oracle visible.
 *
 * FE-14. Before this file existed, `npm test` on CI exited 0 with every subject-touching test
 * skipped, because the only signal a missing oracle produced was a skip — and a skip is not a
 * failure. The tests themselves still cannot run without their subject; that part is honest. What
 * was missing is anything that turns their absence into a red suite when the run claims to be
 * authoritative.
 *
 * So the assertion here is not about any individual test. It is about the claim:
 *
 *     ENFORCER_REQUIRE_ORACLE=1 asserts this run exercised the authoritative integration surface.
 *     If the oracle is not there, that assertion is false, and a false assertion must fail.
 *
 * Deliberately NOT written as a skip. A guard that skips when it cannot check is the defect it was
 * written to catch, one level up.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ORACLE_REQUIRED, ORACLE_REPO, ORACLE_TAGS, ORACLE_STATE, oracleAt } from "../test-support/oracle.mjs";

test("oracle · a run that claims to be authoritative has an authoritative oracle", () => {
  if (!ORACLE_REQUIRED) {
    // Ordinary local development. Nobody claimed this run was authoritative, so nothing is asserted
    // about the oracle — and this is the one branch that must never be reachable on CI.
    return;
  }

  assert.ok(ORACLE_TAGS.length > 0, "no oracle tags are declared, so requiring the oracle would require nothing");

  const probes = ORACLE_TAGS.map((tag) => ({ tag, ...oracleAt(tag) }));
  const missing = probes.filter((p) => !p.available);

  assert.equal(
    missing.length,
    0,
    "ENFORCER_REQUIRE_ORACLE=1 was set, so this run asserts it exercised the authoritative " +
      "integration surface. It did not:\n" +
      missing.map((p) => `  ${p.tag} — [${p.state}] ${p.why}`).join("\n") +
      "\n\nOracle-dependent tests skipped because the authoritative repository is unavailable are " +
      "not evidence of passing integration. Provide a real standards release through " +
      "ENFORCER_ORACLE_REPO, or do not claim the run was authoritative. Synthetic packs prove the " +
      "mechanism and cannot satisfy this: an evaluator this repository wrote agreeing with this " +
      "repository's expectations is not independent evidence.",
  );
});

test("oracle · the three conditions stay distinguishable", () => {
  // The original defect was that "not here" and "not required here" produced one observable
  // outcome. If these ever collapse again, the guard above becomes unfalsifiable.
  const states = new Set(Object.values(ORACLE_STATE));
  assert.equal(states.size, 3, "the oracle vocabulary collapsed; absence and exemption are distinct");

  if (!ORACLE_REPO) {
    assert.equal(oracleAt("v1.5.0").state, ORACLE_STATE.UNCONFIGURED);
  }

  // A named repository that cannot serve is UNUSABLE, never UNCONFIGURED: silence and
  // misconfiguration send an operator to different fixes.
  const bogus = { ...oracleAt("v0.0.0-does-not-exist") };
  if (ORACLE_REPO) {
    assert.equal(bogus.state, ORACLE_STATE.UNUSABLE, "an unresolvable release must be UNUSABLE");
    assert.equal(bogus.available, false);
    assert.notEqual(bogus.skip, false, "an unusable oracle must not be treated as runnable");
  }
});
