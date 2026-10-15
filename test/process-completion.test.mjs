/**
 * When the pack's declared status and its own process outcome disagree.
 *
 * ST-18 (originally FE-16 on the preserved integration line). Arms 3 and 5 were red on `main` at
 * d1bc8e0 before the remedy in `scripts/enforce.mjs`; arms 1, 2 and 4 were green there as controls.
 *
 * THE NARROW CLAIM, AND THE ONE IT IS NOT. StandardsEnforcer does not, and after this will still not,
 * interpret native exit codes. ADR 0001 forbids it and `states.mjs` explains why: Betting exits 2 on
 * NOT_EVALUATED, MachineLearning 3 on blocked, Health 4, Financial folds blocked into 1. There is no
 * common meaning to read. The enforcer's whole opinion about a verdict remains membership of the
 * pack's own `passing` set.
 *
 * What is claimed is smaller and structural: **a pack that declares a passing status and then does
 * not complete successfully has produced contradictory authority evidence, and contradictory evidence
 * is an unknown.** INV-E1 says an unknown is not a pass. Nothing here needs to know what the code
 * MEANS — only that "the authority said yes" and "the authority finished" disagree.
 *
 *   1  declared passing  + exit 0        ordinary success                    green today
 *   2  declared failing  + nonzero       ordinary failure, the common case   green today
 *   3  declared passing  + nonzero       contradiction                       RED today
 *   4  undeclared status + nonzero       vocabulary error, ordered FIRST     green today
 *   5  declared passing  + no exit code  completion not established          RED today
 *
 * WHY 1, 2 AND 4 ARE HERE THOUGH THEY ALREADY PASS. They are negative controls, the same discipline
 * as the FE-15 falsifier. Arm 2 is the one that matters most: a pack declaring failure and exiting
 * nonzero is *normal*, and a remedy that turned it into an enforcement error would have quietly made
 * the enforcer an exit-code interpreter — the exact thing the superseded plan's D3 was rejected for
 * proposing. Arm 4 pins ORDER: an undeclared status is an undeclared status even when the exit code
 * also disagrees, because `passing` cannot be computed from a word the contract never declared.
 *
 * WHY 3 AND 5 ARE SEPARATE ARMS. `exitCode !== 0` catches both, and collapsing them would be a
 * smaller diff. They are different findings: 3 is evidence that contradicts itself, 5 is evidence
 * that is missing. Both must prevent a passing result; a reader of the detail should be able to tell
 * which happened without re-running anything.
 *
 * Every assertion is about an OUTCOME. No branch, no condition and no message is named in advance,
 * because a test that names the fix is a test of the fix.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { enforce } from "../scripts/enforce.mjs";
import { STATE, EXIT, exitFor } from "../scripts/states.mjs";

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return (r.stdout || "").trim();
}

const CONTRACT = {
  schemaVersion: "1.0.0",
  standard: { id: "d3" },
  evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["judge", "--dir={target}", "--json"] },
  result: { statuses: ["REAL_PASS", "REAL_FAIL"], passing: ["REAL_PASS"] },
};

/**
 * An evaluator that reports `status` and then ends in the requested way.
 *
 * `ending` is `{ exit: <n> }` or `{ killed: true }`. The report is written and flushed BEFORE the
 * ending in both cases, so every arm reaches the enforcer with a complete, well-formed report — the
 * disagreement under test is between the report and the process, and a truncated report would be a
 * different defect wearing the same result.
 */
function evaluator(status, ending) {
  // Written SYNCHRONOUSLY to fd 1 and only then ended. `process.stdout.write` followed by an immediate
  // exit or SIGKILL is not guaranteed to flush to a pipe, so a truncated report would make an arm fail
  // intermittently, or make arm 5 pass through the unreadable-output refusal for the wrong reason.
  const emit = 'import { writeSync } from "node:fs";\n' +
    `writeSync(1, JSON.stringify({ status: ${JSON.stringify(status)} }) + "\\n");\n`;
  if (ending.killed) {
    // Not `process.exit`: the point of this arm is a process that never reported an exit code at all.
    return emit + 'process.kill(process.pid, "SIGKILL");\nsetTimeout(() => {}, 10_000);\n';
  }
  return emit + `process.exit(${ending.exit});\n`;
}

/** A genuine pinned release. Content differs per arm, so each gets its own identity and cache entry. */
async function pack(status, ending) {
  const dir = await mkdtemp(path.join(tmpdir(), "d3-pack-"));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(CONTRACT));
  await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator(status, ending));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@example.invalid"], dir);
  git(["config", "user.name", "D3"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "release"], dir);
  git(["tag", "-a", "v1.0.0", "-m", "release"], dir);
  return { dir, tag: "v1.0.0", sha: git(["rev-list", "-n", "1", "v1.0.0"], dir) };
}

/** Run one arm end to end, through the ordinary entry point with ordinary arguments. */
async function judged(status, ending) {
  const p = await pack(status, ending);
  const target = await mkdtemp(path.join(tmpdir(), "d3-target-"));
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "d3-cache-"));
  try {
    await writeFile(path.join(target, "project-policy.yml"), 'standardVersion: "1.0.0"\nproject: "t"\nexceptions: []\n');
    return await enforce({ target, standardsRepo: p.dir, tag: p.tag, sha: p.sha, cacheRoot });
  } finally {
    await rm(p.dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

/**
 * Can this platform produce a process that finished with no exit code?
 *
 * Probed rather than inferred from `process.platform`, and probed against the SAME construct the
 * fixture uses. Windows has no signals: `process.kill` becomes `TerminateProcess`, which supplies an
 * exit code, so a killed evaluator arrives as arm 3 rather than arm 5 there. That is a real property
 * of the platform and not a reason to stop asserting anything — see arm 5.
 */
function killedProcessHasNoExitCode() {
  const dir = mkdtempSync(path.join(tmpdir(), "d3-probe-"));
  try {
    const file = path.join(dir, "probe.mjs");
    writeFileSync(file, evaluator("REAL_PASS", { killed: true }));
    const r = spawnSync(process.execPath, [file], { encoding: "utf8", windowsHide: true });
    // A fixture that failed to emit is not a platform limit, and must not be read as one.
    assert.ok(r.stdout && r.stdout.trim(), "the probe evaluator printed nothing, so the fixture is broken");
    return r.status === null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// 1 and 2 — the ordinary world. Controls: the remedy must not disturb either.
// ===========================================================================

test("1 · a declared passing status with a successful exit is an ordinary pass", async () => {
  const r = await judged("REAL_PASS", { exit: 0 });
  assert.equal(r.report?.status, "REAL_PASS", "the full JSON report was not received, so the outcome below proves nothing");

  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.authority.status, "REAL_PASS");
  assert.equal(r.passing, true);
  assert.equal(exitFor(r.state, r.passing), EXIT.OK);
});

test("2 · a declared non-passing status with a nonzero exit is ordinary, not an enforcement error", async () => {
  // The control that keeps the remedy honest. A pack saying no and exiting nonzero is the single most
  // common real outcome in the portfolio. Turning it into ENFORCEMENT_ERROR would read every pack's
  // native failure code as a fault in enforcement, which is the reading D3 was rejected for once.
  const r = await judged("REAL_FAIL", { exit: 1 });
  assert.equal(r.report?.status, "REAL_FAIL", "the full JSON report was not received, so the outcome below proves nothing");

  assert.equal(r.state, STATE.EVALUATED,
    "a pack that declared failure and exited nonzero was treated as an enforcement fault");
  assert.equal(r.authority.status, "REAL_FAIL");
  assert.equal(r.passing, false);
  assert.equal(exitFor(r.state, r.passing), EXIT.NOT_PASSING);
});

// ===========================================================================
// 3 — the defect. Authority evidence that contradicts itself.
// ===========================================================================

test("3 · a declared passing status with a nonzero exit does not produce a passing result", async () => {
  // 7, deliberately. Nothing here may depend on which nonzero code it was: the enforcer is not
  // allowed to know that 1 means findings or that 3 means blocked, and a fixture using 1 would let a
  // remedy that special-cased 1 pass this arm.
  const r = await judged("REAL_PASS", { exit: 7 });
  assert.equal(r.report?.status, "REAL_PASS", "the full JSON report was not received, so the outcome below proves nothing");

  assert.equal(r.passing, false,
    "a pack declared itself passing and did not exit successfully, and the enforcer passed it anyway");
  assert.notEqual(exitFor(r.state, r.passing), EXIT.OK,
    "the process projection let a self-contradictory result through as success");
  assert.equal(r.state, STATE.ENFORCEMENT_ERROR,
    "a contradiction between the declared status and the process outcome is an unknown, not a verdict");
  assert.ok(r.detail && r.detail.trim().length > 0, "an enforcement error must say why");
});

// ===========================================================================
// 4 — ordering. A word the contract never declared is a vocabulary error first.
// ===========================================================================

test("4 · an undeclared status with a nonzero exit is still reported as an undeclared status", async () => {
  // Both conditions hold at once. The vocabulary check must win, because `passing` is not computable
  // from a status the contract does not declare — so "the status contradicts the exit code" is not a
  // statement this run is in a position to make.
  const r = await judged("SOMETHING_ELSE", { exit: 7 });
  assert.equal(r.report?.status, "SOMETHING_ELSE", "the full JSON report was not received, so the outcome below proves nothing");

  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
  assert.equal(r.passing, false);
  assert.match(r.detail, /SOMETHING_ELSE/,
    "the undeclared status was not named, so exit-contradiction logic was ordered ahead of the " +
      "vocabulary check and reported the wrong finding");
});

// ===========================================================================
// 5 — the second defect. Evidence that is missing rather than contradictory.
// ===========================================================================

test("5 · a declared passing status from a process that reported no exit code does not pass", async () => {
  const nullIsProducible = killedProcessHasNoExitCode();
  const r = await judged("REAL_PASS", { killed: true });
  assert.equal(r.report?.status, "REAL_PASS", "the full JSON report was not received, so the outcome below proves nothing");

  // Asserted on EVERY platform. Whatever the operating system reported, an evaluator that was killed
  // after declaring success must not produce a pass. This is the property; the rest is its reason.
  assert.equal(r.passing, false,
    "an evaluator that did not survive its own run was allowed to declare the repository passing");
  assert.notEqual(exitFor(r.state, r.passing), EXIT.OK);
  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);

  if (!nullIsProducible) {
    // Windows: `process.kill` is `TerminateProcess`, which supplies an exit code, so this arrives as
    // arm 3. The outcome above still holds and was still checked. What cannot be observed here is the
    // DISTINCTION between contradiction and absence — CI runs on Linux, where it can.
    return;
  }

  const contradictory = await judged("REAL_PASS", { exit: 7 });
  assert.notEqual(r.detail, contradictory.detail,
    "a process that never reported an exit code and one that reported a contradictory exit code " +
      "produced the same explanation, so the two findings are not distinguishable by a reader");
});

// ===========================================================================
// The documented contract. Codex found the code and the docs disagreeing on PR #110.
// ===========================================================================

test("docs · architecture no longer says the process status is never interpreted, and the sequence shows the refusal", async () => {
  const { readFileSync } = await import("node:fs");
  const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
  const arch = readFileSync(path.join(docs, "architecture.md"), "utf8");
  const seq = readFileSync(path.join(docs, "architecture-sequence.mmd"), "utf8");
  const svg = readFileSync(path.join(docs, "architecture-sequence.svg"), "utf8");
  assert.ok(!/recorded, never interpreted/u.test(arch), "architecture.md still states the pre-FE-16 contract");
  assert.match(arch, /Process completion \(FE-16/u);
  assert.match(arch, /^13\. \*\*Process-completion gate/mu, "the numbered execution flow has no process-completion step");
  assert.ok(!/entirety of the enforcer's\s+opinion about the verdict/u.test(arch),
    "step 12 still claims passing-set membership is the whole decision");
  const plan = readFileSync(path.join(docs, "..", "artifacts", "plan", "2026-08-12-m3-reconciled-plan.md"), "utf8");
  assert.match(plan, /Dated note, 2026-10-14 — D3 admitted/u);
  const adr = readFileSync(path.join(docs, "..", "artifacts", "adr", "0001-orchestrate-do-not-reimplement.md"), "utf8");
  assert.match(adr, /## Amendment, 2026-10-14/u, "ADR 0001 does not record the process-completion refusal");
  assert.match(seq, /declared passing status, but the process exited nonzero or reported no exit code/u);
  assert.ok(svg.includes("contradicting or missing"), "the rendered sequence SVG does not show the refusal branch");
});
