/**
 * FE-16 — a declared pass is not enough on its own.
 *
 * THE PROPOSITION. May StandardsEnforcer report an authority as passing when the evaluator process
 * itself did not complete successfully? Until this file, yes: `runOfficialEvaluator` carried
 * `r.status` as data and never consulted it, `r.signal` had no field at all, and `enforce()` decided
 * `passing` from the declared status alone. A pack could assert, in the same breath, that it passed
 * and that it did not finish.
 *
 * WIDTH B, AND WHY IT IS NOT "NONZERO IS BAD". The boundary is contradiction, not arithmetic:
 *
 *     any signalled termination                   not established   -> refused
 *     declared PASSING status + nonzero exit      contradiction     -> refused
 *     declared NON-PASSING status + nonzero exit  legitimate        -> evaluated, passing=false
 *
 * The third line is load-bearing and is the reason the rule cannot be widened. A real authority uses
 * a nonzero exit alongside a declared, parseable, non-passing status — MachineLearningStandards
 * exits 2 with `NOT_EVALUATED` — and it is correct to do so. A rule reading "any nonzero exit is an
 * enforcement error" would convert that legitimate evaluation into a failure and break an authority
 * behaving exactly as its contract says. See artifacts/evidence/2026-08-16-fe16-red-replay.md, arm E.
 *
 * NO MEANING IS ATTACHED TO WHICH CODE OCCURRED. Arms A and B of the replay differ only in the
 * number, 1 against 42, and must gate identically while remaining distinguishable in the evidence.
 *
 * WHY THE REFUSAL LIVES IN THE SEAM. `runOfficialEvaluator` is the only place holding both facts at
 * once — the pack's declared passing set and what its process did. `enforce()` already maps
 * `ok: false` to `ENFORCEMENT_ERROR`, so the decision is made where the evidence is and the state
 * machine is left alone. That also means the property holds for every caller of the seam, not only
 * for callers that went through `enforce()`.
 *
 * SYNTHETIC PACKS ON PURPOSE. These build a real pack and a real governed target on disk and run the
 * real seam. Nothing is stubbed. A pack that exits nonzero after declaring COMPLIANT is not
 * something a released authority can be asked to do on demand, and the property is about the seam
 * rather than about any pack.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { runOfficialEvaluator } from "../scripts/enforce.mjs";

const CONTRACT = {
  schemaVersion: "1.1.0",
  standard: { id: "synthetic" },
  evaluation: {
    entrypoint: "scripts/standards.mjs",
    arguments: ["check", "{target}", "--policy", "{policy}", "--json"],
  },
  result: { statuses: ["COMPLIANT", "NOT_EVALUATED"], passing: ["COMPLIANT"] },
};

/**
 * An evaluator that prints one valid report and then terminates the way `tail` says.
 *
 * The payload is always well-formed. This suite is about process completion, and a malformed one
 * would exercise the seam's JSON branch instead — a different defect, already handled.
 */
function evaluatorSource(status, tail) {
  return `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ status: ${JSON.stringify(status)} }) + "\\n");
${tail}
`;
}

const made = [];
const keep = (d) => (made.push(d), d);

test.after(async () => {
  for (const d of made) await rm(d, { recursive: true, force: true });
});

async function pack(status, tail) {
  const dir = keep(await mkdtemp(path.join(tmpdir(), "fe16-pack-")));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(CONTRACT));
  await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluatorSource(status, tail));
  return dir;
}

async function governed() {
  const dir = keep(await mkdtemp(path.join(tmpdir(), "fe16-gov-")));
  await writeFile(path.join(dir, "project-policy.yml"), 'project: "Governed"\n');
  return dir;
}

/** Run the real seam against a freshly built pack and target. */
async function seam(status, tail) {
  const p = await pack(status, tail);
  const t = await governed();
  return runOfficialEvaluator(p, { target: t, policyPath: path.join(t, "project-policy.yml") });
}

// ---------------------------------------------------------------------------
// The seam reports what the process did, before anything judges it.
// ---------------------------------------------------------------------------

test("completion · a signal is a field, not an absence", async () => {
  const r = await seam("COMPLIANT", "process.exit(0)");
  assert.ok("signal" in r,
    "the seam's return has no `signal` field, so a signalled evaluator is indistinguishable from a clean one");
  assert.equal(r.signal, null, "an evaluator that exited normally was not signalled");
});

// ---------------------------------------------------------------------------
// Arms A and B — a declared pass contradicted by the exit code.
// ---------------------------------------------------------------------------

for (const code of [1, 42]) {
  test(`completion · a declared pass with exit ${code} is a contradiction, not a pass`, async () => {
    const r = await seam("COMPLIANT", `process.exit(${code})`);

    assert.equal(r.ok, false,
      `a pack declaring COMPLIANT while exiting ${code} was accepted by the seam`);
    assert.equal(r.exitCode, code, "the code that occurred stays visible in the evidence");
    assert.match(r.why, /COMPLIANT/u, "the reader is told which status was declared");
    assert.match(r.why, new RegExp(String(code)), "and which exit contradicted it");
    assert.equal(r.report, null, "a report that cannot be trusted is not handed on as though it could");
  });
}

test("completion · the two contradictions gate identically and stay distinguishable", async () => {
  const a = await seam("COMPLIANT", "process.exit(1)");
  const b = await seam("COMPLIANT", "process.exit(42)");

  // Asserted absolutely, not just as equality. `a.ok === b.ok` is satisfied when both are `true`,
  // which is exactly the pre-remedy defect — so equality alone would have passed against the very
  // behaviour this file exists to remove.
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  assert.equal(a.ok, b.ok, "no meaning may attach to which nonzero code occurred");
  assert.notEqual(a.exitCode, b.exitCode,
    "gating identically must not erase the difference from the evidence");
});

// ---------------------------------------------------------------------------
// Arm C — signalled termination. Linux only; win32 has no signals.
// ---------------------------------------------------------------------------

const NO_SIGNALS = process.platform === "win32" &&
  "win32 has no signals: process.kill(self, 'SIGKILL') sets status 1 and signal null, so this arm " +
  "cannot be established here. It is NOT simulated — authoritative Linux CI is where it runs.";

test("completion · a signalled evaluator is not established, whatever it declared",
  { skip: NO_SIGNALS }, async () => {
    const r = await seam("COMPLIANT", "process.kill(process.pid, 'SIGKILL')");

    assert.equal(r.ok, false,
      "a SIGKILLed evaluator that had already printed COMPLIANT was accepted by the seam");
    assert.equal(r.signal, "SIGKILL", "the signal is carried, not merely detected");
    assert.match(r.why, /SIGKILL/u,
      "the signal is named, because an absent exit code explains nothing on its own");
  });

test("completion · a signal refuses a non-passing status too — it is not a contradiction rule",
  { skip: NO_SIGNALS }, async () => {
    const r = await seam("NOT_EVALUATED", "process.kill(process.pid, 'SIGKILL')");

    assert.equal(r.ok, false,
      "a signalled run is unestablished regardless of what it declared; only the contradiction arm " +
      "consults the passing set");
    assert.equal(r.signal, "SIGKILL");
  });

// ---------------------------------------------------------------------------
// Arm E — the contrast that stops the rule widening into "nonzero is bad".
// ---------------------------------------------------------------------------

test("completion · a declared NON-passing status with a nonzero exit is a legitimate evaluation", async () => {
  const r = await seam("NOT_EVALUATED", "process.exit(2)");

  assert.equal(r.ok, true,
    "a pack that declared a non-passing status and exited nonzero was refused; that is the real " +
    "MachineLearningStandards behaviour and refusing it breaks a conforming authority");
  assert.equal(r.exitCode, 2);
  assert.equal(r.report.status, "NOT_EVALUATED");
});

// ---------------------------------------------------------------------------
// Arm D — the control. A clean pass must stay a pass.
// ---------------------------------------------------------------------------

test("completion · a declared pass with exit 0 is still a pass", async () => {
  const r = await seam("COMPLIANT", "process.exit(0)");

  assert.equal(r.ok, true, "the remedy must not make every pack unpassable");
  assert.equal(r.exitCode, 0);
  assert.equal(r.report.status, "COMPLIANT");
});

// ---------------------------------------------------------------------------
// The refusal must be a refusal, not a downgrade.
// ---------------------------------------------------------------------------

test("completion · a refused run carries no report, so nothing downstream can read a verdict out of it", async () => {
  for (const tail of ["process.exit(1)", "process.exit(42)"]) {
    const r = await seam("COMPLIANT", tail);
    assert.equal(r.report, null);
    assert.ok(r.contract, "the contract stays, because the reader still needs to know which pack this was");
  }
});
