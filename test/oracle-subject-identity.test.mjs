/**
 * ST-14 — an oracle-dependent assertion must name the bytes it evaluated, not just the bytes that
 * evaluated them.
 *
 * The authority half of every oracle test is object-addressed and verified: `resolveIdentity`
 * clones from the object database, detaches onto a SHA, and re-verifies the checkout before
 * anything executes. The subject half is not addressed at all. `test/enforce.test.mjs` hands
 * `ORACLE_REPO` -- a host working tree, at whatever state it happens to be in -- to `enforce` as
 * the governed repository, and the official evaluator reads that tree off disk.
 *
 * Two consequences, and both are asserted below rather than described:
 *
 *   content-dependence   an assertion about the result depends on bytes nobody recorded, so an
 *                        edit to the host changes what the suite reports
 *   time-dependence      two runs compared against the same path are only equal if nothing
 *                        changed between them, which no test establishes
 *
 * WHY A CLONE STANDS IN FOR THE HOST. These tests never write to `ORACLE_REPO`. It is a real
 * checkout belonging to whoever configured it, and a test suite that edits it to prove a point has
 * done the thing it is complaining about. A clone detached onto the same commit is the same kind of
 * object -- a mutable working tree over the oracle's history -- so mutating the clone demonstrates
 * exactly what mutating the host would, and demonstrates it deterministically rather than by racing
 * a concurrent edit.
 *
 * WHAT IS NOT CLAIMED. Nothing here says the host was in fact edited during any past run. The claim
 * is narrower and is about the consumption path: mutable working-tree bytes CAN reach the result,
 * established by making them do so.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { oracleAt, oracleSubject } from "../test-support/oracle.mjs";

const TAG = "v1.6.0";
const ORACLE = oracleAt(TAG);
const MLS = ORACLE.repo;
const SHA = ORACLE.sha;
const NEEDS_ORACLE = { skip: ORACLE.skip };

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

/** A mutable working tree over the oracle's history — what `ORACLE_REPO` is, without being it. */
function hostCheckout() {
  const dir = mkdtempSync(path.join(tmpdir(), "st14-host-"));
  const cloned = git(["clone", "--quiet", "--no-hardlinks", MLS, dir]);
  assert.equal(cloned.status, 0, `the stand-in host could not be cloned: ${cloned.stderr}`);
  const detached = git(["checkout", "--detach", "--quiet", SHA], dir);
  assert.equal(detached.status, 0, `the stand-in host could not be detached onto ${SHA}: ${detached.stderr}`);
  return dir;
}

function cacheRoot() {
  return mkdtempSync(path.join(tmpdir(), "st14-subject-cache-"));
}

/**
 * Edit something the official evaluator actually consumes.
 *
 * MachineLearningStandards declares every domain rule not-applicable in its own policy, which is
 * why the recorded verdict is NOT_EVALUATED over an applicable set of zero. Making one rule
 * applicable again moves that denominator, so the mutation is observable in the report rather than
 * merely present on disk.
 */
function mutateSubject(dir) {
  const policy = path.join(dir, "project-policy.yml");
  const before = readFileSync(policy, "utf8");
  assert.ok(before.includes("status: not-applicable"), "the mutation's anchor is gone; this fixture no longer edits what it claims to");
  writeFileSync(policy, before.replace("status: not-applicable", "status: applicable"));
}

const applicableOf = (r) => r.report?.denominator?.applicable;

// ===========================================================================
// The mutation is real — asserted before anything is concluded from it
// ===========================================================================

test("fixture · the mutation this file relies on is observable in the result", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const before = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: host });
    assert.equal(applicableOf(before), 0, "the recorded starting point is an applicable set of zero");

    mutateSubject(host);

    const after = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: host });
    assert.equal(applicableOf(after), 1, "the edit must change the reported evidence, or every test below passes vacuously");
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

// ===========================================================================
// ST-14 — the subject is frozen
// ===========================================================================

test("subject · editing the host checkout does not change what an oracle assertion evaluated", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");

    const before = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    // The host moves underneath, exactly as a concurrent checkout or edit would move it.
    mutateSubject(host);

    const after = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    assert.equal(
      applicableOf(after),
      applicableOf(before),
      "the result moved when the host checkout was edited, so the subject was the host and not a fixed identity",
    );
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · the comparison pair evaluates the same bytes on both sides", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");

    // `enforce.test.mjs` compares a direct evaluator run against an enforced one. The assertion is
    // content-invariant but not time-invariant: anything that changes between the two sides shows up
    // as a field-level difference with no local cause.
    const first = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });
    mutateSubject(host);
    const second = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    assert.deepEqual(
      second.report?.denominator,
      first.report?.denominator,
      "the two sides of the comparison saw different bytes, which is the time-dependence ST-14 files",
    );
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · the identity is established, not assumed from a directory existing", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");
    assert.equal(subject.frozen, true, "a subject that is not frozen may not be reported as one");
    assert.equal(subject.sha, SHA, "the subject must name the commit whose bytes it holds");

    // The claim is checkable from the directory itself rather than from what the helper returned.
    const head = git(["rev-parse", "HEAD"], subject.dir);
    assert.equal(head.status, 0, "the materialised subject is not a git checkout, so its identity cannot be established");
    assert.equal(head.stdout.trim(), SHA, "the materialised subject is not at the commit it claims");

    const dirty = git(["status", "--porcelain"], subject.dir);
    assert.equal(dirty.stdout.trim(), "", "the materialised subject has uncommitted content, so its bytes are not the commit's");

    assert.notEqual(path.resolve(subject.dir), path.resolve(host), "the subject must not be the host checkout itself");
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · mutating the frozen subject does change the result — the fixture is live", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");

    const before = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    // Guards the test above from passing for the wrong reason. If edits to the subject were also
    // invisible, "unchanged by a host edit" would prove nothing -- it would mean the evaluator reads
    // no bytes at all, or that this fixture stopped editing anything the evaluator consumes.
    mutateSubject(subject.dir);

    const after = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    assert.notEqual(
      applicableOf(after),
      applicableOf(before),
      "editing the subject changed nothing, so the frozen-subject assertions above are vacuous",
    );
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · an unmaterialisable identity fails rather than falling back to the host", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const absent = "0".repeat(40);
    const subject = oracleSubject(host, absent, cache);

    assert.equal(subject.ok, false, "a subject that could not be materialised must not report success");
    assert.notEqual(
      subject.dir === null ? null : path.resolve(subject.dir),
      path.resolve(host),
      "materialisation failed back onto the host working tree, which is the defect wearing a helper",
    );
    assert.ok(subject.why, "a refusal must say what could not be established");
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

// ===========================================================================
// The boundary — where a target is not a subject
// ===========================================================================

test("boundary · an identity mismatch consumes no subject bytes at all", NEEDS_ORACLE, async () => {
  const cache = cacheRoot();
  const empty = mkdtempSync(path.join(tmpdir(), "st14-empty-"));
  const host = hostCheckout();
  try {
    // `enforce.test.mjs:155` passes the oracle as `target` under a SHA that cannot resolve. ST-14's
    // acceptance text is written broadly enough to catch it, so the question is settled by execution
    // rather than by grepping for `target:`: if the bytes are never read, the target is not a
    // subject and freezing it would be a meaningless edit.
    const shape = { standardsRepo: MLS, tag: TAG, sha: "0".repeat(40), cacheRoot: cache };

    const overHost = await enforce({ ...shape, target: host });
    const overEmpty = await enforce({ ...shape, target: empty });

    assert.equal(overHost.state, overEmpty.state, "the state depended on the target's content");
    assert.equal(overHost.report, undefined, "nothing was evaluated, so there is no report to depend on anything");
    assert.equal(overEmpty.report, undefined, "nothing was evaluated, so there is no report to depend on anything");

    // The strongest form: two targets whose contents share nothing produce the same answer, so the
    // answer cannot be a function of either one's bytes.
    assert.deepEqual(overHost.detail, overEmpty.detail, "the message differed by target content");
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});
