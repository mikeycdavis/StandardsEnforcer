/**
 * The gate between "the oracle subject could not be materialised" and what a suite does about it.
 *
 * ST-20. `oracleSubject` has always reported a failed materialisation honestly and refused to fall
 * back to the host tree. What the suite then did with that report was a module-level constant in
 * `enforce.test.mjs` that turned every failure into a node:test skip. Under
 * `ENFORCER_REQUIRE_ORACLE=1` that is the FE-14 shape returning through the subject: the oracle
 * resolves, so `oracle-required.test.mjs` is satisfied, the subject cannot be built, and the two
 * subject-consuming tests skip while the run claims to have exercised them.
 *
 * These tests force a real materialisation failure rather than fabricating a failed result, so what
 * is observed is the route the suite actually takes, and they assert the failure first, so a
 * future change that made the forced case succeed could not leave them passing vacuously.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { oracleSubject, subjectGate } from "../test-support/oracle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNRESOLVABLE_SHA = "0".repeat(40);

async function forcedFailure(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "subject-gate-"));
  try {
    // A host that is not a repository, and a SHA that resolves nowhere: the same inputs a broken
    // runner would hand `oracleSubject`.
    const subject = oracleSubject(path.join(dir, "not-a-repository"), UNRESOLVABLE_SHA, path.join(dir, "cache"));
    assert.equal(subject.ok, false, "the forced case must really fail, or nothing below is exercised");
    assert.ok(subject.why, "a failed materialisation must carry its reason");
    return await fn(subject);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("subject gate · a failed subject in a required run is a failure carrying its reason, never a skip", async () => {
  await forcedFailure((subject) => {
    const gate = subjectGate(subject, { required: true });
    assert.equal(gate.skip, false, "a required run must not skip its subject-consuming tests");
    assert.equal(typeof gate.failure, "string");
    assert.ok(gate.failure.includes(subject.why), "the failure must name why the subject could not be built");
  });
});

test("subject gate · outside a required run the skip stays, and names its reason", async () => {
  await forcedFailure((subject) => {
    const gate = subjectGate(subject, { required: false });
    assert.equal(gate.failure, null, "an unrequired run is not failed by a missing subject");
    assert.equal(typeof gate.skip, "string", "the skip must be a visible, reason-bearing string");
    assert.ok(gate.skip.includes(subject.why));
  });
});

test("subject gate · a subject that materialised neither skips nor fails, in either mode", () => {
  const subject = { ok: true, dir: "somewhere", why: null };
  assert.deepEqual(subjectGate(subject, { required: true }), { skip: false, failure: null });
  assert.deepEqual(subjectGate(subject, { required: false }), { skip: false, failure: null });
});

test("subject gate · enforce.test.mjs routes its subject through the gate and asserts the failure", async () => {
  const source = await readFile(path.join(ROOT, "test", "enforce.test.mjs"), "utf8");
  assert.match(source, /subjectGate\(SUBJECT\)/u, "the subject skip must come from subjectGate");
  assert.match(source, /SUBJECT_GATE\.failure/u, "a test that always runs must assert the gate's failure");
  assert.doesNotMatch(source, /skip:\s*SUBJECT\.ok/u, "an inline skip derived from the subject would bypass the gate");
});
