/**
 * The result artifact must describe the environment that actually executed it.
 *
 * THE DEFECT THIS FALSIFIES. `ci/checks.sh` is the single authoritative check list and is run by both
 * the local Docker pipeline and the GitHub Actions workflow. It printed, unconditionally:
 *
 *     Environment:     Docker (local). This is NOT a GitHub Actions result.
 *
 * and wrote `"environment": "docker"` into the machine-readable result. On a hosted runner both were
 * false — observed verbatim in GitHub Actions run 32070499065, where a genuine hosted run announced
 * in its own summary that it was not one.
 *
 * WHY THAT IS WORTH A TEST RATHER THAN A ONE-LINE EDIT. This repository's entire reporting discipline
 * rests on keeping local containerised evidence distinct from hosted evidence: a local pass is not a
 * hosted pass, and a hosted red is not evidence against a branch. An artifact that misreports which
 * of the two produced it corrupts that distinction at the source, and the machine-readable field is
 * worse than the prose because a consumer reads it without a human present.
 *
 * WHY `GITHUB_ACTIONS` IS THE EVIDENCE. The runner sets it to the literal `true` before any step of
 * ours executes, so it is a property of the executing environment rather than an assertion by this
 * pipeline or its callers. A caller-supplied flag would be precisely the after-the-fact overwrite the
 * invariant forbids — which is why nothing here reads an argument.
 *
 * THE MUTATION THESE TESTS ARE BUILT AGAINST. Hardcode either branch and exactly one of the first two
 * assertions goes red. That is the whole point: a single test asserting only the local case would
 * have passed against the defect for as long as it existed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = path.join(ROOT, "ci", "environment.sh");

/** Ask the shell module what it reports, with the environment supplied explicitly. */
function reports(env) {
  const script = `. "${MODULE.split(path.sep).join("/")}"; printf '%s\n%s' "$(ci_environment_id)" "$(ci_environment_label)"`;
  const r = spawnSync("sh", ["-c", script], {
    encoding: "utf8",
    // A clean base environment, so an ambient GITHUB_ACTIONS on a developer's machine or in CI
    // cannot decide the answer for a case that is meant to be testing its absence.
    env: { PATH: process.env.PATH ?? "", ...env },
    windowsHide: true,
  });
  if (r.error || r.status !== 0) throw new Error(`sh failed: ${r.error?.message ?? r.stderr}`);
  const [id, ...label] = r.stdout.split("\n");
  return { id: id.trim(), label: label.join("\n").trim() };
}

const SHELL_AVAILABLE = spawnSync("sh", ["-c", "exit 0"], { windowsHide: true }).status === 0;
const NEEDS_SH = { skip: SHELL_AVAILABLE ? false : "no POSIX shell on PATH to execute ci/environment.sh" };

test("provenance · the module exists and is what checks.sh sources", NEEDS_SH, () => {
  assert.ok(existsSync(MODULE), "ci/environment.sh must exist for the check list to source it");
  const checks = spawnSync("sh", ["-c", `grep -c 'ci/environment.sh' "${path.join(ROOT, "ci", "checks.sh").split(path.sep).join("/")}"`], { encoding: "utf8" });
  assert.ok(Number(checks.stdout.trim()) > 0, "ci/checks.sh must source the provenance module rather than restating it");
});

test("provenance · without GITHUB_ACTIONS the result says Docker local CI", NEEDS_SH, () => {
  const { id, label } = reports({});
  assert.equal(id, "docker", "the machine-readable field is what a consumer reads");
  assert.match(label, /Docker local CI/u);
  assert.match(label, /NOT a GitHub Actions result/u,
    "the local caveat is load-bearing: a containerised pass must never be mistaken for hosted verification");
});

test("provenance · with GITHUB_ACTIONS=true the result says GitHub Actions", NEEDS_SH, () => {
  const { id, label } = reports({ GITHUB_ACTIONS: "true" });
  assert.equal(id, "github-actions");
  assert.match(label, /GitHub Actions/u);
  assert.doesNotMatch(label, /NOT a GitHub Actions result/u,
    "this is the observed defect: a hosted run denying that it is one");
  assert.doesNotMatch(label, /Docker/u, "a hosted runner is not the local container");
});

test("provenance · the two environments are never reported identically", NEEDS_SH, () => {
  const local = reports({});
  const hosted = reports({ GITHUB_ACTIONS: "true" });
  assert.notEqual(local.id, hosted.id, "hardcoding either branch collapses the distinction");
  assert.notEqual(local.label, hosted.label);
});

test("provenance · a caller cannot claim to be a hosted runner after the fact", NEEDS_SH, () => {
  // The invariant is that provenance comes from the executing environment. `CI` is set by almost
  // every provider and by many local tools, and a wrapper setting it must not be able to relabel a
  // local run as hosted.
  assert.equal(reports({ CI: "true" }).id, "docker",
    "only the runner's own marker decides; a generic CI flag does not");
  assert.equal(reports({ GITHUB_ACTIONS: "false" }).id, "docker");
  assert.equal(reports({ GITHUB_ACTIONS: "1" }).id, "docker",
    "the runner sets the literal string true; anything else is not that evidence");
});
