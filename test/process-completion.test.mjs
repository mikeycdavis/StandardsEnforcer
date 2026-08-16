/**
 * FE-16 — a failed process cannot produce a passing authority.
 *
 * THE PROPOSITION, replayed red against `6d91ee6` before any of this existed:
 *
 *     Can StandardsEnforcer report an authority as passing when the evaluator process itself did not
 *     complete successfully?
 *
 * It could, on three arms. A pack printing a declared passing status and then exiting 1, exiting 42,
 * or being killed by SIGKILL was reported EVALUATED / passing=true / exit 0 in every case, because
 * the seam carried `r.status` as data and never read `r.signal` at all. The measurements are in
 * artifacts/evidence/2026-08-16-fe16-red-replay.md, taken with the harness committed beside them.
 *
 * WHAT THE BOUNDARY IS, AND WHAT IT IS NOT. Not "a nonzero exit is an error" — that rule would break
 * a real authority. Measured on the same main: MachineLearningStandards at 27d4b61 exits 2 while
 * declaring NOT_EVALUATED with parseable JSON, which is a legitimate non-passing evaluation and must
 * stay one. The boundary is CONTRADICTION:
 *
 *     declared PASSING status + nonzero exit       → refused
 *     any signalled termination, any status        → refused
 *     declared non-passing status + nonzero exit   → ordinary EVALUATED, passing false
 *     declared passing status + exit 0             → ordinary EVALUATED, passing true
 *
 * WHY `trustworthiness` RATHER THAN `enforce`. The decision is exercised against a real spawned
 * evaluator, through the real seam, without also standing up an identity, a gate and a scope
 * registry. Those belong to other tests; standing them up here would mean this file could go red for
 * reasons that have nothing to do with process completion.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runOfficialEvaluator, trustworthiness } from "../scripts/enforce.mjs";
import { signalSkip } from "../test-support/capabilities.mjs";

const CONTRACT = {
  schemaVersion: "1.1.0",
  standard: { id: "synthetic-fe16" },
  evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["check", "{target}", "--policy", "{policy}"] },
  result: { statuses: ["COMPLIANT", "NON_COMPLIANT", "NOT_EVALUATED"], passing: ["COMPLIANT"] },
};

/** A pack that prints `status` and then completes however `tail` says. */
async function pack(status, tail, contract = CONTRACT) {
  const dir = await mkdtemp(path.join(tmpdir(), "fe16-pack-"));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(contract));
  await writeFile(
    path.join(dir, "scripts", "standards.mjs"),
    `console.log(JSON.stringify({ status: ${JSON.stringify(status)}, note: "the pack spoke" }));\n${tail}\n`,
  );
  return dir;
}

async function governed() {
  const dir = await mkdtemp(path.join(tmpdir(), "fe16-gov-"));
  await writeFile(path.join(dir, "project-policy.yml"), 'project: "Governed"\n');
  return dir;
}

/** Run one pack through the real seam and judge it exactly as `enforce` does. */
async function judge(status, tail, contract = CONTRACT) {
  const packDir = await pack(status, tail, contract);
  const targetDir = await governed();
  try {
    const run = runOfficialEvaluator(packDir, {
      target: targetDir,
      policyPath: path.join(targetDir, "project-policy.yml"),
    });
    return { run, trust: trustworthiness(run) };
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
}

// --- the three red arms --------------------------------------------------------------------------

test("completion · a passing status with exit 1 is refused, not carried", async () => {
  const { run, trust } = await judge("COMPLIANT", "process.exit(1);");
  assert.equal(run.ok, true, "the seam still parsed the report — the refusal is not a parse failure");
  assert.equal(trust.refused, true);
  assert.equal(trust.failure, "contradicted-completion");
  assert.equal(run.completion.exitCode, 1);
  assert.equal(run.completion.signal, null);
  // The pack's own words survive the refusal.
  assert.equal(trust.status, "COMPLIANT");
  assert.match(trust.why, /contract lists as passing/u);
});

test("completion · exit 42 is refused identically to exit 1, and says which it was", async () => {
  // 1 and 42 must be INDISTINGUISHABLE for gating — no meaning is attached to the number — while
  // remaining distinguishable in evidence, because an operator debugging 42 needs to see 42.
  const one = await judge("COMPLIANT", "process.exit(1);");
  const fortyTwo = await judge("COMPLIANT", "process.exit(42);");

  assert.equal(one.trust.failure, fortyTwo.trust.failure, "the gating decision must not depend on the code");
  assert.equal(one.trust.refused, fortyTwo.trust.refused);

  assert.equal(one.run.completion.exitCode, 1);
  assert.equal(fortyTwo.run.completion.exitCode, 42);
  assert.match(fortyTwo.trust.why, /exited 42/u);
  assert.notEqual(one.trust.why, fortyTwo.trust.why, "the evidence must still tell them apart");
});

test("completion · a signalled evaluator is refused, and no exit code is invented", async (t) => {
  const unexercised = signalSkip("the signalled-evaluator arm");
  if (unexercised) {
    // Windows has no signals: process.kill(self, "SIGKILL") returns status 1, signal null. Reported
    // as NOT exercised rather than simulated — and note the platform is not thereby safe, because
    // that collapse lands the case on the nonzero-exit arm above, which was itself a false pass.
    t.skip(unexercised);
    return;
  }
  const { run, trust } = await judge("COMPLIANT", 'process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 5000);');

  assert.equal(trust.refused, true);
  assert.equal(trust.failure, "signalled");
  assert.equal(run.completion.signal, "SIGKILL");
  // THE FIELD THAT MUST NOT BE FILLED IN. No exit code existed; reporting 1 here would tell an
  // operator the evaluator decided something when it was killed mid-run.
  assert.equal(run.completion.exitCode, null);
  assert.match(trust.why, /SIGKILL/u);
  assert.match(trust.why, /unfinished run/u);
});

// --- the controls that make the boundary a boundary ----------------------------------------------

test("completion · a passing status with exit 0 still passes", async () => {
  const { run, trust } = await judge("COMPLIANT", "");
  assert.equal(trust.refused, false);
  assert.equal(trust.status, "COMPLIANT");
  assert.equal(trust.passing, true);
  assert.deepEqual(run.completion, { exitCode: 0, signal: null });
});

test("completion · THE SYMMETRY: a non-passing status with a nonzero exit is an ordinary evaluation", async () => {
  // The arm that decides the width, and the reason "nonzero is an error" is not the rule. This is
  // MachineLearningStandards' real shape at 27d4b61 — exit 2 with a declared NOT_EVALUATED — and
  // refusing it would break a pack behaving exactly as its contract says.
  const { run, trust } = await judge("NOT_EVALUATED", "process.exit(2);");

  assert.equal(trust.refused, false, "a non-passing status with a nonzero exit is not a contradiction");
  assert.equal(trust.status, "NOT_EVALUATED");
  assert.equal(trust.passing, false);
  assert.equal(run.completion.exitCode, 2);
});

test("completion · a signal is refused even when the status is NOT passing", async (t) => {
  const unexercised = signalSkip("the signalled non-passing arm");
  if (unexercised) {
    t.skip(unexercised);
    return;
  }
  // "NON_COMPLIANT, and then something killed the evaluator" is not a non-compliance finding. The
  // run did not finish deciding, so it establishes nothing in either direction — otherwise a killed
  // evaluator could still produce a citable verdict.
  const { trust } = await judge("NON_COMPLIANT", 'process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 5000);');
  assert.equal(trust.refused, true);
  assert.equal(trust.failure, "signalled");
});

// --- the failure kinds stay diagnostically apart -------------------------------------------------

test("completion · the invocation failures keep distinct kinds and distinct messages", async () => {
  const seen = new Map();

  // no-output: the evaluator runs and prints nothing.
  {
    const dir = await mkdtemp(path.join(tmpdir(), "fe16-silent-"));
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(CONTRACT));
    await writeFile(path.join(dir, "scripts", "standards.mjs"), "process.exit(3);\n");
    const target = await governed();
    const run = runOfficialEvaluator(dir, { target, policyPath: path.join(target, "project-policy.yml") });
    const t = trustworthiness(run);
    seen.set(t.failure, t.why);
    assert.equal(t.failure, "no-output");
    assert.match(t.why, /exited 3/u, "the completion is described even when there is nothing to parse");
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }

  // malformed-output
  {
    const dir = await mkdtemp(path.join(tmpdir(), "fe16-garbage-"));
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(CONTRACT));
    await writeFile(path.join(dir, "scripts", "standards.mjs"), 'console.log("not json at all");\n');
    const target = await governed();
    const run = runOfficialEvaluator(dir, { target, policyPath: path.join(target, "project-policy.yml") });
    const t = trustworthiness(run);
    seen.set(t.failure, t.why);
    assert.equal(t.failure, "malformed-output");
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }

  // entrypoint: the contract names something the release does not ship.
  {
    const dir = await mkdtemp(path.join(tmpdir(), "fe16-absent-"));
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(CONTRACT));
    const target = await governed();
    const run = runOfficialEvaluator(dir, { target, policyPath: path.join(target, "project-policy.yml") });
    const t = trustworthiness(run);
    seen.set(t.failure, t.why);
    assert.equal(t.failure, "entrypoint");
    assert.deepEqual(run.completion, { exitCode: null, signal: null }, "no process ran, so nothing is claimed about one");
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }

  // undeclared-status
  {
    const { trust } = await judge("SPLENDID", "");
    seen.set(trust.failure, trust.why);
    assert.equal(trust.failure, "undeclared-status");
  }

  // contradicted-completion
  {
    const { trust } = await judge("COMPLIANT", "process.exit(1);");
    seen.set(trust.failure, trust.why);
  }

  assert.equal(seen.size, 5, `five kinds should be distinguishable, saw: ${[...seen.keys()].join(", ")}`);
  assert.equal(new Set(seen.values()).size, 5, "and each should say something different");
});

test("completion · a refusal keeps the pack's own words rather than discarding them", async () => {
  // An operator handed only the enforcer's opinion has nothing to check it against.
  const { run, trust } = await judge("COMPLIANT", "process.exit(7);");
  assert.equal(trust.refused, true);
  assert.equal(run.report.status, "COMPLIANT");
  assert.equal(run.report.note, "the pack spoke");
  assert.equal(trust.status, "COMPLIANT", "the declared status travels with the refusal");
});
