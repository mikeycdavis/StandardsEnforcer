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
 * THE FIXTURE IS THE ARGUMENT. Every standards release materialised here is a real, tagged,
 * verifiable git repository that is nonetheless a **broken authority integration** — no adapter and
 * no evaluator, a malformed adapter, or an evaluator that cannot produce a verdict. Scope-decisive
 * cases must resolve without the seam being reached at all. If Phase 3 ever moves adapter loading,
 * contract validation, or invocation above scope resolution, these tests do not merely change value:
 * they turn into ENFORCEMENT_ERROR and say exactly what happened.
 *
 * Three kinds rather than one, because a single "no evaluator" fixture can be satisfied by an
 * implementation that happens to check for `scripts/` early and would still break on a malformed
 * contract. The property is about ordering, so it has to hold for every way the release can be
 * unusable.
 *
 * That is the property ADR 0004 and ADR 0005 need together, and it has two arms. A standard that is
 * out of scope must not become an integration failure because its pinned release lacks a contract —
 * and the identical release must stop a governed repository dead. Both arms are asserted over all
 * three defects, because an implementation that gets one right by accident gets the other wrong.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { detectFootprint, footprintDigest, SURFACE } from "../scripts/footprint.mjs";
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
 * Three ways a standards release can be a broken authority integration.
 *
 * Each has a real identity — it tags, it resolves, it materialises — and is unusable in a different
 * way once something tries to obtain a verdict from it. Parameterising over all three is what stops
 * the ordering property from being proved by one lucky fixture: "no evaluator" alone could be passed
 * by an implementation that happens to check for `scripts/` early and would still break on a
 * malformed contract.
 */
const BROKEN = {
  "no adapter and no evaluator": {},
  "a malformed adapter": { "standards-adapter.json": "{ this is not json" },
  "an unusable evaluator": {
    "standards-adapter.json": JSON.stringify({
      schemaVersion: "1.0.0",
      // Must equal STANDARD, and asserted below so the two cannot drift.
      //
      // It read "seam-fixture" until 0.5.0, which was incidental to what this fixture is for — an
      // evaluator that cannot produce a verdict — and stopped being incidental when R2 began
      // refusing a release that declares a pack the invocation did not ask for. With a mismatched id
      // the governed case never reached the unusable evaluator at all: it failed earlier, on
      // identity, and the paired assertion below would have been proving the wrong refusal. The
      // assertions are untouched; only the fixture reaches the path it was written to exercise.
      standard: { id: "machine-learning" },
      evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["validate", "{target}", "--json"] },
      result: { statuses: ["COMPLIANT", "NON_COMPLIANT"], passing: ["COMPLIANT"] },
    }),
    "scripts/standards.mjs": "process.stderr.write('this release cannot produce a verdict\\n');\nprocess.exit(1);\n",
  },
};

/**
 * A standards release with an identity and a chosen kind of brokenness.
 *
 * Deliberate, and the argument this file rests on. Scope is resolved before anything is invoked, so
 * a reviewed exclusion must succeed against a release that could not possibly produce a verdict.
 */
async function brokenRelease(dir, files = {}) {
  const repo = path.join(dir, "standards");
  await mkdir(repo, { recursive: true });
  git(["init", "--quiet", "-b", "main"], repo);
  git(["config", "user.email", "test@example.invalid"], repo);
  git(["config", "user.name", "Seam Invariance"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  await writeFile(path.join(repo, "VERSION"), "1.0.0\n");
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repo, rel)), { recursive: true });
    await writeFile(path.join(repo, rel), content);
  }
  git(["add", "-A"], repo);
  git(["commit", "--quiet", "-m", "a release that cannot produce a verdict"], repo);
  git(["tag", "-a", "v1.0.0", "-m", "release"], repo);
  return { repo, sha: git(["rev-list", "-n", "1", "v1.0.0"], repo) };
}

/**
 * FE-12 filed dispositions under `standards`, keyed by the asking pack's contract id, and gave a
 * decision's evidence basis a `surface`. Absorbed here so the tests below keep asserting what they
 * were written to assert — that no scope-decisive path touches the evaluator seam.
 */
async function registry(at, entry, { reviewers = [REVIEWER], key = ID } = {}) {
  const filed = entry && entry.reviewedFootprint && !entry.reviewedFootprint.surface
    ? { ...entry, reviewedFootprint: { surface: SURFACE, ...entry.reviewedFootprint } }
    : entry;
  await writeFile(at, JSON.stringify({
    schemaVersion: "1.0.0",
    authorisedReviewers: reviewers,
    repositories: entry === null ? {} : { [key]: { name: NAME, standards: { [STANDARD]: filed } } },
  }, null, 2));
  return at;
}

/** The asking pack's id. Supplied by the invocation, never read out of the release under test. */
const STANDARD = "machine-learning";

// The unusable-evaluator fixture has to declare the pack the invocation asks for, or R2 refuses it
// on identity before the evaluator is ever reached and the paired case below asserts nothing about
// unusability. Pinned here rather than trusted, because the two literals sit ~60 lines apart.
test("fixture · the unusable evaluator declares the pack the invocation asks for", () => {
  const declared = JSON.parse(BROKEN["an unusable evaluator"]["standards-adapter.json"]).standard.id;
  assert.equal(declared, STANDARD,
    "a mismatched fixture id would make the unusable-evaluator cases fail on identity instead");
});

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
async function outcome({ files = {}, entry, inTarget = false, key = ID, release = {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), "seam-"));
  try {
    const { repo, sha } = await brokenRelease(dir, release);
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
      scope: { registryPath, repoId: ID, repoName: NAME, standardId: STANDARD },
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

// ===========================================================================
// Where M2 and M3 meet: one broken authority integration, two correct answers
// ===========================================================================
//
// The same three unusable releases, under the two scope dispositions that reach them:
//
//                          broken authority integration
//                                     │
//                       ┌─────────────┴─────────────┐
//                       │                           │
//                reviewed OUT_OF_SCOPE            APPLIES
//                       │                           │
//                       ▼                           ▼
//                 OUT_OF_SCOPE              ENFORCEMENT_ERROR
//               evaluator untouched          fail closed
//
// Both arms are the same invariant seen from either side. A reviewed exclusion stands on the
// reviewer's authority and needs nothing from the pinned release, so an integration defect must not
// reach it. A governed repository needs everything from the pinned release, so the identical defect
// must stop it. An implementation that got one arm right by accident gets the other wrong.

for (const [how, release] of Object.entries(BROKEN)) {
  test(`paired · a reviewed exclusion survives ${how}`, async () => {
    const r = await outcome({
      release,
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

  test(`paired · a governed repository fails closed on ${how}`, async () => {
    // In scope AND adopted, so the evaluator is genuinely required. The same defect that was
    // correctly irrelevant above is now decisive, and INV-E1 forbids it becoming a pass.
    const r = await outcome({
      release,
      files: { ...ML, "project-policy.yml": "standardVersion: '1.0.0'\n" },
      entry: current(),
    });
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR, `${how} produced ${r.state} for a governed repository`);
    assert.equal(r.passing, false);
    assert.equal(r.disposition, "in-scope", "the scope decision is still reported beside the failure");
  });
}

test("paired · the two arms disagree for every broken release, and never collapse", async () => {
  // Guards the pairing itself. If both arms ever returned the same state, one of them would have
  // stopped testing anything — and the failure mode that matters (an exclusion becoming an
  // integration error, or a governed repository passing on a release that cannot answer) would be
  // invisible.
  for (const [how, release] of Object.entries(BROKEN)) {
    const excluded = await outcome({
      release,
      entry: current({ disposition: "out-of-scope", reason: "r" }),
    });
    const governed = await outcome({
      release,
      files: { ...ML, "project-policy.yml": "standardVersion: '1.0.0'\n" },
      entry: current(),
    });
    assert.notEqual(excluded.state, governed.state, `both arms returned ${excluded.state} for ${how}`);
    assert.equal(excluded.passing, true, `${how}: a reviewed exclusion must still pass`);
    assert.equal(governed.passing, false, `${how}: a governed repository must not pass`);
  }
});
