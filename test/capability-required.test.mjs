/**
 * The guard that makes a missing symlink capability visible.
 *
 * ST-08, and deliberately the same file shape as `oracle-required.test.mjs`, because it is the same
 * argument about a different thing:
 *
 *     ENFORCER_REQUIRE_SYMLINKS=1 asserts this run exercised the ADR 0005 link-containment cases.
 *     If the environment cannot create a symlink, that assertion is false, and a false assertion
 *     must fail.
 *
 * Deliberately NOT written as a skip. A guard that skips when it cannot check is precisely the
 * defect it was written to catch.
 */

import test from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import {
  SYMLINKS_REQUIRED,
  SIGNALS_REQUIRED,
  probeSymlinks,
  probeSignals,
  symlinkSkip,
  signalSkip,
  unmetSymlinkRequirement,
  unmetSignalRequirement,
} from "../test-support/capabilities.mjs";

test("capability · a run that claims link containment can create symlinks", () => {
  // Not required here means nobody claimed this run exercised those cases, and nothing is asserted.
  // That is the one branch which must never be reachable on authoritative CI.
  const unmet = unmetSymlinkRequirement();
  assert.equal(unmet, null, unmet ?? "");
});

test("capability · both arms of the requirement are exercised, on every platform", () => {
  // The point of the whole item. A requirement whose failing arm has never run is indistinguishable
  // from one that holds — so the arms are driven here from stub probes rather than from whatever
  // this machine happens to be, and they run identically on the workstation and in the container.
  const cannot = () => ({ available: false, why: "EPERM: operation not permitted, symlink" });
  const can = () => ({ available: true, why: null });

  const failed = unmetSymlinkRequirement({ required: true, probe: cannot });
  assert.ok(failed, "a claimed capability that is absent must fail; a skip here restores the defect");
  assert.match(failed, /EPERM/u, "the failure must carry the reason the environment gave");
  assert.match(failed, /ENFORCER_REQUIRE_SYMLINKS=1/u, "and name the claim that was falsified");
  assert.match(failed, /7b/u, "and name what went unexercised, not merely that something did");

  assert.equal(
    unmetSymlinkRequirement({ required: true, probe: can }),
    null,
    "a claimed capability that is present must pass",
  );

  assert.equal(
    unmetSymlinkRequirement({ required: false, probe: cannot }),
    null,
    "an ordinary developer run on a platform without symlinks is not a failure — this is not a " +
      "zero-skip rule, and turning it into one would make the requirement meaningless by making it " +
      "unavoidable",
  );
});

test("capability · the probe answers by trying, not by naming the platform", () => {
  // Independently re-derived rather than mirrored: the same question asked directly, so a probe
  // hardcoded to `true` — which would satisfy the guard everywhere and assert nothing — cannot
  // survive on a platform where symlink creation genuinely fails.
  const probed = probeSymlinks();

  const dir = fs.mkdtempSync(path.join(tmpdir(), "capability-oracle-"));
  let actual;
  try {
    fs.writeFileSync(path.join(dir, "a"), "x");
    fs.symlinkSync(path.join(dir, "a"), path.join(dir, "b"));
    actual = true;
  } catch {
    actual = false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(probed.available, actual, "the probe disagreed with an actual attempt to create one");
  assert.equal(
    probed.why === null,
    actual,
    "an unavailable capability must carry a reason, and an available one must not invent a doubt",
  );
});

test("capability · a satisfied requirement means the provenance cases are not skipped", () => {
  // The guard and the cases it protects, tied together. Without this a refactor could leave the
  // guard green while the four cases skipped for some other reason — the requirement would then be
  // asserting a capability nothing consumed, which is a decorative check.
  if (!SYMLINKS_REQUIRED) return;

  for (const caseId of ["7b", "7d", "7e", "7f"]) {
    assert.equal(
      symlinkSkip(caseId),
      false,
      `case ${caseId} would still skip in a run that claims to have exercised it`,
    );
  }
});

test("capability · an unexercised case says so rather than reading as a pass", () => {
  const reason = symlinkSkip("7b", () => ({ available: false, why: "EPERM" }));
  assert.match(reason, /NOT exercised/u, "a skip that does not say it skipped is read as a pass");
  assert.match(reason, /7b/u, "and it must say which case, since four share this wording");
});

// --- signals -------------------------------------------------------------------------------------
//
// FE-16's half of the same argument. The signalled-evaluator refusal cannot run on Windows at all, so
// without this the case skips on the machine most of this work happens on and is exercised nowhere
// that asserts it. See artifacts/evidence/2026-08-16-fe16-red-replay.md.

test("capability · a run claiming signal capability must actually have it", () => {
  // THE HEADLINE GUARD. Under ENFORCER_REQUIRE_SIGNALS=1 on a platform without signals, this is the
  // named test that fails — no shell reads a skip count to reach the same conclusion.
  const unmet = unmetSignalRequirement();
  assert.equal(unmet, null, unmet ?? "");
});

test("capability · the signal requirement's failing arm is reachable, and names the reason", () => {
  // The guard's own honesty. Driven from a stub rather than from this platform, so BOTH arms execute
  // everywhere — a requirement whose failure has never run is the defect one level up.
  const unmet = unmetSignalRequirement({
    required: true,
    probe: () => ({ available: false, why: "signals are not a thing here" }),
  });
  assert.match(String(unmet), /ENFORCER_REQUIRE_SIGNALS=1/u);
  assert.match(String(unmet), /signals are not a thing here/u, "the probe's reason must survive into the message");

  assert.equal(
    unmetSignalRequirement({ required: false, probe: () => ({ available: false, why: "x" }) }),
    null,
    "an unclaimed capability is not a failure",
  );
  assert.equal(
    unmetSignalRequirement({ required: true, probe: () => ({ available: true, why: null }) }),
    null,
    "a met claim is not a failure either",
  );
});

test("capability · the signal probe answers by trying, not by naming the platform", () => {
  // Independently re-derived, the same way the symlink probe's oracle works. If the probe ever grows
  // a `process.platform === "win32"` shortcut, this is what disagrees with it.
  const probed = probeSignals();
  const r = spawnSync(process.execPath, ["-e", 'process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 5000);'], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(probed.available, Boolean(r.signal), "the probe disagreed with an actual attempt");
  assert.equal(probed.why === null, probed.available, "an unavailable capability must carry a reason");
});

test("capability · a satisfied signal requirement means the signalled arms are not skipped", () => {
  if (!SIGNALS_REQUIRED) return;
  assert.equal(signalSkip("the signalled-evaluator arm"), false,
    "the signal arm would still skip in a run that claims to have exercised it");
});

test("capability · symlinks and signals are separate switches", () => {
  // One combined flag would force whoever adds the third capability to weaken it for everybody, and
  // an environment may honestly have one and not the other — this workstation has symlinks under
  // developer mode and no signals at all.
  assert.notEqual(
    unmetSymlinkRequirement({ required: true, probe: () => ({ available: false, why: "no symlinks" }) }),
    unmetSignalRequirement({ required: true, probe: () => ({ available: false, why: "no signals" }) }),
    "the two requirements must not produce the same message",
  );
  assert.equal(
    unmetSymlinkRequirement({ required: true, probe: () => ({ available: true, why: null }) }),
    null,
    "claiming signals must not implicate symlinks",
  );
});
