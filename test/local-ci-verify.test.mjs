/**
 * The submission gate, tested where it can be tested.
 *
 * The invariant local CI exists to enforce is:
 *
 *     A pull request may only be submitted if the exact commit SHA being pushed has passed the
 *     complete containerised CI pipeline.
 *
 * Demonstrating the *violation* of that on real history would mean committing during a
 * verification run and then attempting a push — mutating a real branch to prove a guard works.
 * That is a bad trade: the demonstration is destructive, unrepeatable, and proves the guard held
 * once rather than that it holds. So the comparison lives in ci/verify.mjs and is exercised here,
 * including every way it is allowed to say no.
 *
 * The cases below are not a list of things that seemed worth checking. They are the ways a
 * verification gate is known to fail open: no evidence read as fine, stale evidence read as
 * fresh, an abbreviated SHA compared against a full one, a working-tree run mistaken for a
 * commit, a failed run whose result field nobody looked at.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { decideSubmission, OUTCOME } from "../ci/verify.mjs";

// Real-shaped SHAs, with hex letters in them. All-digit fixtures would silently make the
// case-sensitivity check below vacuous.
const VERIFIED = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER = "9876543210fedcba9876543210fedcba98765432";

/** A passing result for `commit` on `branch`, in the shape ci/checks.sh actually writes. */
const passing = (commit = VERIFIED, branch = "feature/x", extra = {}) =>
  JSON.stringify({
    schema: "local-ci/1",
    repository: "StandardsEnforcer",
    branch,
    commit,
    source: "commit",
    result: "passed",
    environment: "docker",
    failedCheck: null,
    startedAt: "2026-08-15T10:00:00Z",
    completedAt: "2026-08-15T10:04:00Z",
    tests: { passed: 189, failed: 0, skipped: 0 },
    checks: ["environment", "no-install-invariant", "oracle-readiness", "test-suite"],
    ...extra,
  });

test("submission · a passing run authorises pushing the exact commit it verified", () => {
  const decision = decideSubmission({
    evidenceText: passing(),
    head: VERIFIED,
    branch: "feature/x",
  });

  assert.equal(decision.ok, true);
  assert.equal(decision.outcome, OUTCOME.OK);
  assert.match(decision.message, new RegExp(VERIFIED));
});

test("submission · THE INVARIANT — a commit made after verification is refused", () => {
  // The exact scenario: CI passed on VERIFIED, then the developer committed, so HEAD is now
  // OTHER. Nothing has verified OTHER.
  const decision = decideSubmission({
    evidenceText: passing(VERIFIED),
    head: OTHER,
    branch: "feature/x",
  });

  assert.equal(decision.ok, false, "an unverified commit must never be pushable");
  assert.equal(decision.outcome, OUTCOME.SHA_MISMATCH);
  assert.match(decision.message, /HEAD changed after CI verification/);
  assert.match(decision.message, /has not been verified/);
  assert.match(decision.message, /No branch was pushed and no PR was created/);
  // Both SHAs are named. A refusal that does not say which two things differed sends the reader
  // to re-run CI without understanding what happened.
  assert.match(decision.message, new RegExp(VERIFIED));
  assert.match(decision.message, new RegExp(OTHER));
});

test("submission · an abbreviated SHA is not treated as matching the full one it prefixes", () => {
  // The classic near-miss. `git rev-parse --short HEAD` is seven characters of the same commit,
  // and a prefix comparison would accept it — and would equally accept a *different* commit
  // sharing that prefix. Identity is the whole SHA or it is not identity.
  const short = VERIFIED.slice(0, 7);

  const decision = decideSubmission({ evidenceText: passing(VERIFIED), head: short, branch: "feature/x" });

  assert.equal(decision.ok, false);
  assert.equal(decision.outcome, OUTCOME.MALFORMED_HEAD);
});

test("submission · a missing result is a refusal, never a pass", () => {
  const decision = decideSubmission({ evidenceText: null, head: VERIFIED, branch: "feature/x" });

  assert.equal(decision.ok, false, "absence of evidence must not become evidence of a pass");
  assert.equal(decision.outcome, OUTCOME.NO_EVIDENCE);
  assert.match(decision.message, /Nothing has been verified/);
});

test("submission · an unparseable or non-object result is a refusal", () => {
  for (const text of ["", "   ", "{not json", "null", "[]", '"passed"']) {
    const decision = decideSubmission({ evidenceText: text, head: VERIFIED, branch: "feature/x" });
    assert.equal(decision.ok, false, `"${text}" must not authorise a push`);
  }
});

test("submission · a failed run is refused, and says so in the words the workflow promises", () => {
  const failed = JSON.stringify({
    branch: "feature/x",
    commit: VERIFIED,
    source: "commit",
    result: "failed",
    failedCheck: "test-suite",
  });

  const decision = decideSubmission({ evidenceText: failed, head: VERIFIED, branch: "feature/x" });

  assert.equal(decision.ok, false);
  assert.equal(decision.outcome, OUTCOME.NOT_PASSED);
  assert.match(decision.message, /CI failed\. No branch was pushed and no PR was created\./);
  assert.match(decision.message, /test-suite/, "the failing check is named");
});

test("submission · a result with no `result` field at all is refused", () => {
  // Not the same as `result: "failed"`. A document that never recorded a verdict is a document
  // whose verdict is unknown, and unknown resolves to no.
  const decision = decideSubmission({
    evidenceText: JSON.stringify({ commit: VERIFIED, branch: "feature/x", source: "commit" }),
    head: VERIFIED,
    branch: "feature/x",
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.outcome, OUTCOME.NOT_PASSED);
});

test("submission · a working-tree run does not authorise pushing a commit", () => {
  // `ci --working-tree` verifies uncommitted files. That is useful for iterating and proves
  // nothing about what would be pushed.
  const decision = decideSubmission({
    evidenceText: passing(VERIFIED, "feature/x", { source: "working-tree" }),
    head: VERIFIED,
    branch: "feature/x",
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.outcome, OUTCOME.NOT_A_COMMIT);
  assert.match(decision.message, /does not verify the commit that would be pushed/);
});

test("submission · evidence recorded on another branch does not authorise this one", () => {
  const decision = decideSubmission({
    evidenceText: passing(VERIFIED, "feature/other"),
    head: VERIFIED,
    branch: "feature/x",
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.outcome, OUTCOME.BRANCH_MISMATCH);
});

test("submission · a truncated, absent or non-hex verified commit is refused", () => {
  // Including the uppercase form: git emits lowercase, so an uppercase value in the record means
  // something rewrote it, and a case-insensitive comparison would wave that through.
  const bad = ["", "not-a-sha", VERIFIED.slice(0, 39), VERIFIED.toUpperCase()];

  for (const commit of bad) {
    const decision = decideSubmission({
      evidenceText: passing(commit),
      head: VERIFIED,
      branch: "feature/x",
    });
    assert.equal(decision.ok, false, `verified commit "${commit}" must not authorise a push`);
  }

  // And the field being missing entirely, which the helper's default would otherwise fill in.
  const absent = JSON.stringify({ branch: "feature/x", source: "commit", result: "passed" });
  assert.equal(decideSubmission({ evidenceText: absent, head: VERIFIED, branch: "feature/x" }).ok, false);
});
