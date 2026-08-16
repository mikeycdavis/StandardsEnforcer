/**
 * Environment capabilities a run may *claim*, and the machinery that makes an unmet claim fail.
 *
 * WHY THIS EXISTS. `test-support/oracle.mjs` solved this shape for a dependency: a suite that goes
 * green because its subject was absent is the failure this repository exists to refuse. ST-08 is the
 * same shape for a *capability*, and the specimen is on record.
 *
 * ADR 0005 case 7b — a symlinked entrypoint pointing outside the verified checkout must not execute
 * foreign bytes — was written correctly, committed, and had never once run. It skipped on the
 * Windows workstation for want of the privilege to create a symlink, and hosted Actions were not
 * running. The first environment that could exercise it was the containerised Linux pipeline, and it
 * failed immediately: two containment escapes had been sitting behind a control that reported
 * nothing at all. See artifacts/evidence/2026-08-16-entrypoint-link-containment.md.
 *
 * The repair closed the escapes. It did not make the *exercising* of those cases something the
 * pipeline asserts. Cases 7b, 7d, 7e and 7f run in the container because it happens to be Linux with
 * the privilege to create symlinks — a fact nothing checks. Take that capability away (a rootless
 * runtime, a hardened daemon, a filesystem without symlink support) and all four skip, the suite
 * exits 0, and the pipeline reports green with the escapes unguarded again.
 *
 * THE INVARIANT:
 *
 *     When authoritative container CI declares symlink capability required, inability to exercise
 *     the symlink provenance tests is a test failure, not a skip.
 *
 * NOT A GENERIC ZERO-SKIP RULE, and the distinction is the whole design. Platform-conditioned tests
 * are legitimate, and case 7b skipping on a Windows workstation is the correct report there — the
 * skip message is deliberately worded so the case reads as NOT exercised rather than as passing.
 * What is asserted is narrower: *this* environment claims symlink capability as part of the
 * authority it asserts, and a false claim must be red.
 *
 *     ENFORCER_REQUIRE_SYMLINKS=1  +  capability unavailable   → the suite fails, reason named
 *     ENFORCER_REQUIRE_SYMLINKS=1  +  capability available     → the provenance cases run normally
 *     unset                        +  capability unavailable   → skip, and it says NOT exercised
 *     unset                        +  capability available     → the provenance cases run normally
 *
 * The verdict stays driven by a named test — `test/capability-required.test.mjs`. No shell inspects
 * TAP counts, and no parsed number decides whether CI passed. `ci/checks.sh` says so explicitly, and
 * this is what lets that principle stand while the gap it leaves gets closed.
 */

import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

/** Whether this run claims the environment can create symlinks. */
export const SYMLINKS_REQUIRED = process.env.ENFORCER_REQUIRE_SYMLINKS === "1";

/**
 * Can this environment create a symlink at all?
 *
 * Probed against a throwaway file rather than inferred from `process.platform`, because the answer
 * depends on privilege and developer mode rather than on the OS name — Windows can do it, given
 * either. Kept separate from every fixture that needs it, so that "the platform cannot" and "the
 * fixture broke" stay distinguishable and only the first is ever allowed to skip.
 *
 * Returns `{ available, why }`. `why` carries the operating system's own refusal, because `EPERM`
 * and `ENOSYS` send an operator to different fixes and neither is "symlinks are off".
 */
export function probeSymlinks() {
  let probe;
  try {
    probe = fs.mkdtempSync(path.join(tmpdir(), "symlink-probe-"));
    fs.writeFileSync(path.join(probe, "a"), "x");
    fs.symlinkSync(path.join(probe, "a"), path.join(probe, "b"));
    return { available: true, why: null };
  } catch (err) {
    return { available: false, why: String(err?.message ?? err) };
  } finally {
    if (probe) fs.rmSync(probe, { recursive: true, force: true });
  }
}

/**
 * The skip value for one symlink-dependent case, or `false` when it must run.
 *
 * One wording, in one place, naming the case. Four tests previously carried four copies of it, which
 * is four chances for one of them to drift into reading like a pass.
 */
export function symlinkSkip(caseId, probe = probeSymlinks) {
  if (probe().available) return false;
  return (
    `symlinks unavailable on this platform; case ${caseId} was NOT exercised. ` +
    "Run this suite where symlinks can be created before treating symlink escape as established."
  );
}

/**
 * The requirement's verdict: `null` when the claim holds, otherwise why it does not.
 *
 * Both the requirement and the probe are parameters rather than module state, so both arms are
 * reachable from a test. A guard whose failing arm has never been executed would be this item's own
 * defect, one level up — and the first draft of case 7b is the evidence that it is not a
 * hypothetical way to be wrong.
 */
export function unmetSymlinkRequirement({ required = SYMLINKS_REQUIRED, probe = probeSymlinks } = {}) {
  if (!required) return null;
  const { available, why } = probe();
  if (available) return null;
  return (
    "ENFORCER_REQUIRE_SYMLINKS=1 was set, so this run asserts the environment can create symlinks " +
    "and therefore that the ADR 0005 link-containment cases (7b, 7d, 7e, 7f) were exercised. It " +
    `cannot: ${why}\n\n` +
    "Those cases skip without the capability, and a skipped containment control is not a control " +
    "that held — case 7b was correct, committed, never run, and failed the first time an " +
    "environment could execute it. Run this suite where symlinks can be created, or do not claim " +
    "the run exercised link containment."
  );
}
