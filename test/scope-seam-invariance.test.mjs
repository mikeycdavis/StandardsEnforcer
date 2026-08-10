/**
 * The scope outcome does not depend on the evaluator seam.
 *
 * WHY THIS FILE EXISTS, AND WHY NOW. M2's contract work and M3's scope work were developed as two
 * lineages and reconciled by merge. Phase 3 then deliberately replaces the evaluator seam —
 * `runOfficialEvaluator` becomes contract-driven, and the verdict vocabulary stops being the
 * enforcer's own. Everything upstream of that seam is supposed to be untouched, and "the diff looks
 * narrow" is not evidence.
 *
 * So this file pins the scope-decisive outcomes as literals, taken immediately BEFORE the seam
 * changes. Phase 3 must leave every one of them identical for the same
 * `(target, scope registry, today)`. That makes "I did not disturb the concurrent scope work"
 * executable rather than a claim about a diff.
 *
 * THE FIXTURE IS THE ARGUMENT. The standards release materialised here is a real, tagged, verifiable
 * git repository that contains **no evaluator whatsoever** — no `scripts/`, no adapter, nothing to
 * invoke. Every case below must therefore resolve without the seam being reached at all. If Phase 3
 * ever moves adapter loading, contract validation, or invocation above scope resolution, these tests
 * do not merely change value: they turn into ENFORCEMENT_ERROR and say exactly what happened.
 *
 * That is the property ADR 0004 and ADR 0005 need together. A standard that is out of scope must not
 * become an integration failure because its pinned release lacks a contract, and a repository whose
 * scope is unresolved must not have an evaluator run against it in the meantime.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { detectFootprint, footprintDigest } from "../scripts/footprint.mjs";
import { STATE } from "../scripts/states.mjs";

const TODAY = "2026-08-09";
const REVIEWER = "ml-governance@acme.example";
const ID = "github:1024871";
const NAME = "acme/moneyball";

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

/**
 * A standards release with an identity and no implementation.
 *
 * Deliberate. Scope is resolved before anything is invoked, so every case here must succeed against
 * a release that could not possibly be invoked.
 */
async function emptyRelease(dir) {
  const repo = path.join(dir, "standards");
  await mkdir(repo, { recursive: true });
  git(["init", "--quiet", "-b", "main"], repo);
  git(["config", "user.email", "test@example.invalid"], repo);
  git(["config", "user.name", "Seam Invariance"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  await writeFile(path.join(repo, "VERSION"), "1.0.0\n");
  git(["add", "-A"], repo);
  git(["commit", "--quiet", "-m", "a release with no evaluator"], repo);
  git(["tag", "-a", "v1.0.0", "-m", "release"], repo);
  return { repo, sha: git(["rev-list", "-n", "1", "v1.0.0"], repo) };
}

async function registry(at, entry, { reviewers = [REVIEWER], key = ID } = {}) {
  await writeFile(at, JSON.stringify({
    schemaVersion: "1.0.0",
    authorisedReviewers: reviewers,
    repositories: entry === null ? {} : { [key]: { name: NAME, machineLearning: entry } },
  }, null, 2));
  return at;
}

const decision = (over = {}) => ({
  disposition: "in-scope",
  reviewedBy: REVIEWER,
  reviewedAt: "2026-08-01",
  reason: "Trains and evaluates predictive models.",
  evidence: ["src/train.py"],
  revisitWhen: ["training leaves this repository"],
  reviewedFootprint: null,
  expiresAt: null,
  ...over,
});

/**
 * Run one scope case and reduce it to the facts Phase 3 must not move.
 *
 * The detail string is deliberately excluded — it is prose, and pinning prose would make this file
 * fail on a reworded message while missing an actual behaviour change. State, disposition and
 * whether the standards were invoked are the contract.
 */
async function outcome({ files = {}, entry, inTarget = false, key = ID }) {
  const dir = await mkdtemp(path.join(tmpdir(), "seam-"));
  try {
    const { repo, sha } = await emptyRelease(dir);
    const target = path.join(dir, "target");
    await mkdir(target, { recursive: true });

    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(target, rel)), { recursive: true });
      await writeFile(path.join(target, rel), content);
    }

    // The evidence basis has to be computed from the target as it actually is, or the decision is
    // stale on arrival and every case collapses into SCOPE_REVIEW_REQUIRED for the wrong reason.
    const kinds = detectFootprint(target).kinds;
    const resolved = typeof entry === "function" ? entry({ kinds, digest: footprintDigest(kinds) }) : entry;

    const registryPath = await registry(
      path.join(inTarget ? target : dir, "scope-registry.json"),
      resolved,
      { key },
    );

    const r = await enforce({
      target,
      standardsRepo: repo,
      tag: "v1.0.0",
      sha,
      cacheRoot: path.join(dir, "cache"),
      scope: { registryPath, repoId: ID, repoName: NAME },
      today: TODAY,
    });

    return {
      state: r.state,
      passing: r.passing,
      scopeChecked: r.scope?.checked ?? false,
      disposition: r.scope?.disposition ?? null,
      governed: r.governed ?? null,
      // The seam was never reached, so no standards report can exist.
      invokedStandards: r.report !== undefined,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}


// ===========================================================================
// The pinned outcomes. Every literal below was captured before the seam changed.
// ===========================================================================

const ML = { "src/train.py": "import sklearn\nfrom sklearn.model_selection import train_test_split\nm.fit(X, y)\n" };

/** A decision whose evidence basis matches the target, so it is current rather than stale. */
const current = (over = {}) => (fp) => decision({ reviewedFootprint: fp, ...over });

test("scope · an unreviewed repository is SCOPE_REVIEW_REQUIRED, and nothing is invoked", async () => {
  const r = await outcome({ files: ML, entry: null });
  assert.deepEqual(r, {
    state: STATE.SCOPE_REVIEW_REQUIRED,
    passing: false,
    scopeChecked: true,
    disposition: null,
    governed: null,
    invokedStandards: false,
  });
});

test("scope · a recorded exclusion is OUT_OF_SCOPE, not an integration failure", async () => {
  // ADR 0005's boundary condition. This release has no adapter and no evaluator; a repository an
  // authorised reviewer excluded must resolve on that decision alone, never on what the pinned
  // release does or does not contain.
  //
  // `passing: true` is deliberate, and is the sharpest literal in this file. OUT_OF_SCOPE is the one
  // passing state that is not a standards verdict, and it is safe only because
  // REQUIRES_RECORDED_DECISION keeps it unreachable without a named authorised reviewer and a current
  // evidence basis. Phase 3 must not acquire a second route to a passing exit.
  const r = await outcome({
    entry: current({ disposition: "out-of-scope", reason: "No models are trained or served here." }),
  });
  assert.deepEqual(r, {
    state: STATE.OUT_OF_SCOPE,
    passing: true,
    scopeChecked: true,
    disposition: "out-of-scope",
    governed: null,
    invokedStandards: false,
  });
});

test("scope · in scope and unadopted is NOT_ADOPTED, reported as governed", async () => {
  const r = await outcome({ files: ML, entry: current() });
  assert.deepEqual(r, {
    state: STATE.NOT_ADOPTED,
    passing: false,
    scopeChecked: true,
    disposition: "in-scope",
    governed: true,
    invokedStandards: false,
  });
});

test("scope · a self-asserted exclusion is SCOPE_REVIEW_REQUIRED, not an exclusion", async () => {
  const r = await outcome({
    entry: current({ disposition: "out-of-scope", reviewedBy: "the-repo-owner@acme.example" }),
  });
  assert.deepEqual(r, {
    state: STATE.SCOPE_REVIEW_REQUIRED,
    passing: false,
    scopeChecked: true,
    disposition: null,
    governed: null,
    invokedStandards: false,
  });
});

test("scope · a registry inside the target it governs is SCOPE_REGISTRY_INVALID", async () => {
  const r = await outcome({ files: ML, entry: current(), inTarget: true });
  assert.deepEqual(r, {
    state: STATE.SCOPE_REGISTRY_INVALID,
    passing: false,
    scopeChecked: true,
    disposition: null,
    governed: null,
    invokedStandards: false,
  });
});

test("scope · a decision keyed to another identity does not transfer by name", async () => {
  const r = await outcome({ files: ML, entry: current(), key: "github:99" });
  assert.deepEqual(r, {
    state: STATE.SCOPE_REVIEW_REQUIRED,
    passing: false,
    scopeChecked: true,
    disposition: null,
    governed: null,
    invokedStandards: false,
  });
});

test("scope · a decision whose evidence basis has gone stale returns to review", async () => {
  // Staleness is a change in evidence, not the passage of time. The basis is recorded against a
  // footprint the target does not have, so the decision no longer describes this repository.
  const r = await outcome({
    files: ML,
    entry: () => decision({ reviewedFootprint: { kinds: [], digest: footprintDigest([]) } }),
  });
  assert.deepEqual(r, {
    state: STATE.SCOPE_REVIEW_REQUIRED,
    passing: false,
    scopeChecked: true,
    disposition: null,
    governed: null,
    invokedStandards: false,
  });
});

// ===========================================================================
// The property the literals above are protecting
// ===========================================================================

test("scope · no scope-decisive path reaches the evaluator seam", async () => {
  // Stated once, directly. Each case above asserts `invokedStandards: false` individually; this says
  // why that mattered, so a future reader deleting "a redundant assertion" meets the reason first.
  //
  // The release under test contains no scripts/ directory at all. Reaching the seam would produce
  // ENFORCEMENT_ERROR rather than a scope state, so these fail loudly — not subtly — if Phase 3 moves
  // adapter loading or invocation above scope resolution.
  const states = new Set();
  for (const c of [
    { files: ML, entry: null },
    { entry: current({ disposition: "out-of-scope" }) },
    { files: ML, entry: current() },
  ]) {
    const r = await outcome(c);
    assert.equal(r.invokedStandards, false);
    assert.notEqual(r.state, STATE.ENFORCEMENT_ERROR,
      "a scope-decisive case reached a release that cannot be invoked, so the seam moved above scope");
    states.add(r.state);
  }
  assert.equal(states.size, 3, "the three cases must remain distinguishable, not collapse into one state");
});
