/**
 * M1: one immutable standards release governing one repository through an external enforcer,
 * without changing the meaning of its verdict.
 *
 * The oracle is not "can the enforcer run MachineLearningStandards". It is whether, given the same
 * target and the same release, the enforcer reproduces the official result **without inventing
 * another route to it** — so the fidelity tests compare the enforcer's payload against a direct
 * invocation of the official CLI, field by field.
 *
 * These tests need the MachineLearningStandards repository on disk with its `v1.4.0` tag. Where it
 * is absent they skip loudly rather than passing quietly, because a suite that goes green when its
 * subject is missing is the failure this whole family of repositories exists to prevent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { enforce, runOfficialEvaluator } from "../scripts/enforce.mjs";
import { STATE, PASSING, REQUIRES_RECORDED_DECISION, REACHABLE, exitFor, EXIT } from "../scripts/states.mjs";
import { verifyTagResolvesTo, resolveIdentity } from "../scripts/identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MLS = "F:/Repos/MachineLearningStandards";
const TAG = "v1.5.0";
const CACHE = path.join(tmpdir(), "standards-enforcer-test-cache");

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

const MLS_AVAILABLE = existsSync(path.join(MLS, ".git")) && git(["rev-list", "-n", "1", TAG], MLS).status === 0;
const SHA = MLS_AVAILABLE ? git(["rev-list", "-n", "1", TAG], MLS).stdout.trim() : null;

async function scratch(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const identity = () => ({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });

// ===========================================================================
// INV-E1 — no unknown becomes a pass
// ===========================================================================

test("INV-E1 · every state outside the passing set exits non-zero", () => {
  for (const state of Object.values(STATE)) {
    const code = exitFor(state);
    if (PASSING.has(state)) assert.equal(code, EXIT.OK, `${state} should be a pass`);
    else assert.notEqual(code, EXIT.OK, `${state} exits 0, which converts a non-pass into a merge`);
  }
});

test("INV-E1 · an unrecognised state is not a pass", () => {
  // A state added later without a decision about its exit code must not default to success.
  assert.notEqual(exitFor("SOMETHING_ADDED_LATER"), EXIT.OK);
  assert.notEqual(exitFor(undefined), EXIT.OK);
});

test("INV-E1 · the passing set is closed, and every member is a verdict or a recorded decision", () => {
  // Written as "exactly two states, both standards verdicts" through M2. M3 widened it to three by
  // adding OUT_OF_SCOPE, and this guard fired — correctly, on a real change. Relocking it rather
  // than loosening it: the enumeration is still exact, and the second clause is now the bound. A
  // passing state must either be something the standards said, or a decision a named human made.
  // Nothing can join this set by being an absence, which is the whole content of INV-E1.
  // 0.4.0 narrowed it back to one. The two standards verdicts left, because a verdict is no longer
  // an enforcer state at all: EVALUATED passes only when the pack's own contract says the status it
  // returned is passing, which is a fact about that release rather than a name enumerable here.
  // What remains is the bound — every member must be a decision a named human made.
  assert.deepEqual([...PASSING].sort(), ["OUT_OF_SCOPE"]);
  for (const s of PASSING) {
    assert.ok(REQUIRES_RECORDED_DECISION.has(s),
      `${s} may not pass without being a decision someone is accountable for`);
  }
  assert.deepEqual([...REQUIRES_RECORDED_DECISION], ["OUT_OF_SCOPE"]);
  assert.equal(PASSING.has(STATE.EVALUATED), false,
    "EVALUATED must not pass by being listed; it passes only by the pack's declared set");
});

test("the process projection is three codes, and none of them interprets a standard", () => {
  // Through 0.3.0 this asserted that MachineLearningStandards' four exit codes travelled through
  // unaltered — COMPLIANT 0, NON_COMPLIANT 1, NOT_EVALUATED 2, BLOCKED_BY_INVARIANT 3. That read as
  // fidelity and was the opposite: knowing that NOT_EVALUATED means "no conclusion" and
  // BLOCKED_BY_INVARIANT means "stop" is knowing what a pack's verdict MEANS, which is exactly what
  // ADR 0001 forbids. Moving the strings out of states.mjs while keeping that mapping would have
  // been cosmetic.
  //
  // `1` is "an authoritative evaluation completed and did not establish passing" — deliberately NOT
  // "non-compliant". A pack's NOT_EVALUATED lands here without this enforcer calling it a failure.
  assert.equal(exitFor(STATE.EVALUATED, true), EXIT.OK);
  assert.equal(exitFor(STATE.EVALUATED, false), EXIT.NOT_PASSING);

  // 4 is reserved for the enforcer's own inability to establish enforcement.
  assert.equal(exitFor(STATE.NOT_ADOPTED), EXIT.NOT_ENFORCEABLE);
  assert.equal(exitFor(STATE.STANDARDS_IDENTITY_MISMATCH), EXIT.NOT_ENFORCEABLE);
  assert.equal(exitFor(STATE.ENFORCEMENT_ERROR), EXIT.NOT_ENFORCEABLE);

  assert.deepEqual(Object.values(EXIT).sort(), [0, 1, 4]);
});

test("no native status can reach exit 2 or 3 by any route", () => {
  // The compatibility assertion for a deliberately breaking change. Those codes are gone, and no
  // spelling of a pack's vocabulary may resurrect them.
  const spellings = ["COMPLIANT", "NOT_EVALUATED", "BLOCKED_BY_INVARIANT", "SUPPORTED", "BANANA"];
  for (const s of [...spellings, ...Object.values(STATE), undefined, null]) {
    for (const passing of [true, false]) {
      assert.ok([0, 1, 4].includes(exitFor(s, passing)), `${s} produced an exit code outside 0/1/4`);
    }
  }
});

test("the states the implementation cannot reach are declared, not faked", () => {
  const unreachable = Object.values(STATE).filter((s) => !REACHABLE.has(s));
  // Two entries through M2; M3 made the scope states reachable and left one.
  assert.deepEqual(unreachable.sort(), ["BYPASS_USED"],
    "the vocabulary is the contract; the implementation is not, and the gap is data rather than a comment");
});

// ===========================================================================
// Identity
// ===========================================================================

test("identity · an abbreviated SHA is not an identity", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, () => {
  const short = verifyTagResolvesTo(MLS, TAG, SHA.slice(0, 12));
  assert.equal(short.ok, false);
  assert.match(short.why, /full 40-character/);
});

test("identity · a tag pointing somewhere else is a mismatch, and the report names both", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, () => {
  const wrong = "0".repeat(40);
  const v = verifyTagResolvesTo(MLS, TAG, wrong);
  assert.equal(v.ok, false);
  assert.equal(v.resolved, SHA, "the reader is told what the tag actually resolves to");
  assert.match(v.why, new RegExp(SHA));
});

test("identity · a declared identity that does not resolve produces no verdict at all", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  const r = await enforce({ ...identity(), sha: "0".repeat(40), target: MLS });
  assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH);
  assert.equal(r.passing, false);
  assert.equal(r.report, undefined, "nothing was evaluated, so there is no verdict to quote");
  assert.equal(exitFor(r.state), EXIT.NOT_ENFORCEABLE);
});

test("identity · what runs is the SHA, and the materialised checkout proves it", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, () => {
  const r = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
  assert.equal(r.ok, true);
  assert.equal(git(["rev-parse", "HEAD"], r.dir).stdout.trim(), SHA);
  assert.ok(r.dir.endsWith(SHA), "the cache is keyed by content, so an entry cannot be stale");
});

test("identity · a non-repository is refused with git's own reason", async () => {
  await scratch(async (dir) => {
    const v = verifyTagResolvesTo(dir, "v1.4.0", "0".repeat(40));
    assert.equal(v.ok, false);
    assert.ok(v.why.length > 0);
  });
});

// ===========================================================================
// Adoption
// ===========================================================================

test("adoption · a repository with no policy is NOT_ADOPTED, which is not non-compliance", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  await scratch(async (dir) => {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src/train.py"), "import sklearn\n");
    const r = await enforce({ ...identity(), target: dir });
    assert.equal(r.state, STATE.NOT_ADOPTED);
    assert.equal(r.passing, false, "not adopting must never be the cheap way past the gate");
    assert.equal(r.isStandardsVerdict, false, "the standards reached no conclusion here");
    assert.equal(exitFor(r.state), EXIT.NOT_ENFORCEABLE);
  });
});

test("adoption · NOT_ADOPTED does not claim the repository should have adopted", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  // Whether a repository is in scope needs applicability detection and a human scope confirmation,
  // neither of which exists in M1. The enforcer reports what it observed and no more.
  await scratch(async (dir) => {
    await writeFile(path.join(dir, "README.md"), "# not machine learning at all\n");
    const r = await enforce({ ...identity(), target: dir });
    assert.equal(r.state, STATE.NOT_ADOPTED);
    assert.doesNotMatch(r.detail, /should|must|required to adopt/i);
  });
});

// ===========================================================================
// The oracle: reproduce the official result, by the official route
// ===========================================================================

test("oracle · MachineLearningStandards under its own v1.4.0 reproduces the recorded verdict", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  const r = await enforce({ ...identity(), target: MLS });
  // At v1.4.0 this asserted COMPLIANT. v1.5.0 repaired the false green, and this repository declares
  // every domain rule not-applicable — so the honest official result is now NOT_EVALUATED, which its
  // contract does not declare passing. The enforcer reports that without knowing what the word means.
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.authority.status, "NOT_EVALUATED");
  assert.equal(r.passing, false);
  assert.equal(r.standards.verified, true);
  assert.equal(r.standards.sha, SHA);
});

test("oracle · the enforcer's payload IS the official evaluator's output, not a recomputation", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  // The M1 claim's second half, tested directly. Run the official CLI out of the verified checkout,
  // then run the enforcer, and require the reports to agree field by field. Anything the enforcer
  // computed for itself would show up here as a difference.
  const id = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
  const direct = runOfficialEvaluator(id.dir, MLS);
  const viaEnforcer = await enforce({ ...identity(), target: MLS });

  assert.equal(direct.ok, true);
  assert.equal(viaEnforcer.report.status, direct.report.status);
  assert.equal(viaEnforcer.report.score, direct.report.score);
  assert.equal(viaEnforcer.report.schemaVersion, direct.report.schemaVersion);
  assert.equal(viaEnforcer.report.standardVersion, direct.report.standardVersion);
  assert.deepEqual(viaEnforcer.report.results, direct.report.results);
  assert.deepEqual(viaEnforcer.report.summary, direct.report.summary);
  assert.deepEqual(viaEnforcer.report.frameworkCoverage, direct.report.frameworkCoverage);
  assert.equal(viaEnforcer.standardsExitCode, direct.exitCode,
    "the standards system's own exit code travels with its verdict");
});

test("oracle · a non-compliant target reports non-compliant, with the official numbers", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  await scratch(async (dir) => {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src/train.py"), "import sklearn\nSEED = 1\n");
    await writeFile(path.join(dir, "requirements.txt"), "scikit-learn>=1.5\n");
    await writeFile(path.join(dir, "project-policy.yml"), 'standardVersion: "1.0.0"\nproject: "t"\nexceptions: []\n');

    const r = await enforce({ ...identity(), target: dir });
    assert.equal(r.state, STATE.EVALUATED);
    assert.equal(r.authority.status, "NON_COMPLIANT");
    assert.equal(r.passing, false);
    assert.equal(exitFor(r.state, r.passing), EXIT.NOT_PASSING);

    const id = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
    const direct = runOfficialEvaluator(id.dir, dir);
    assert.deepEqual(r.report.results, direct.report.results);
  });
});

test("the enforcer contains no rule, no detector, and no scoring of its own", async () => {
  // Structural, and deliberately blunt. The moment this repository can decide a compliance question
  // on its own, it has become a second MachineLearningStandards with none of the review behind it.
  const { readFile } = await import("node:fs/promises");
  for (const f of ["scripts/enforce.mjs", "scripts/identity.mjs", "scripts/states.mjs"]) {
    const text = await readFile(path.join(ROOT, f), "utf8");
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // `score\s*=(?!=)` is an assignment, which would mean the enforcer computed one. A comparison
    // against `report.score` is reading what the standards produced and is exactly what this
    // repository is for. The first version of this pattern did not distinguish them and reported
    // `report.score === null` as a violation — a false positive in a guard, which is worth fixing
    // precisely rather than relaxing, because the guard had already caught a real defect: an
    // earlier draft re-derived "blocked means unscored" here instead of reading the value.
    for (const forbidden of [/\bscore\s*=(?!=)/, /\bruleId\b\s*[:=]\s*["']/, /leakage\./, /reproducibility\./]) {
      assert.doesNotMatch(code, forbidden, `${f} looks like it is deciding a standards question`);
    }
  }
});

test("oracle · the specimen that found the false green does not pass, and no ML field is consulted", { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  // The exact hostile shape: a governed target with no ML work in it. Against v1.4.1 this pack
  // returned COMPLIANT with denominator.scored 0 of 46 applicable, and the enforcer would have
  // called it a pass. The defect was repaired in the authority, so this passes now because
  // MachineLearningStandards tells the truth — not because the enforcer learned to check a counter.
  //
  // The proof that no counter is checked is structural and lives in test/authority-boundary.test.mjs,
  // which forbids scored, notEvaluated, applicable and denominator appearing in scripts/ at all.
  // This test is the behavioural half.
  await scratch(async (dir) => {
    await writeFile(path.join(dir, "README.md"), "# a governed project with no ML in it\n");
    await writeFile(path.join(dir, "project-policy.yml"), 'standardVersion: "1.0.0"\nproject: "hostile"\nexceptions: []\n');

    const r = await enforce({ ...identity(), target: dir });
    assert.equal(r.state, STATE.EVALUATED, "the authority ran and answered");
    assert.equal(r.passing, false, "a run that established nothing must not pass");
    assert.equal(r.authority.status, "NOT_EVALUATED");
    assert.equal(exitFor(r.state, r.passing), EXIT.NOT_PASSING);

    // The enforcer's own words carry no interpretation of what NOT_EVALUATED means.
    assert.match(r.detail, /does not declare passing/);

    // And the pack's evidence is still there, untouched, for a human who wants it.
    assert.equal(r.report.denominator.scored, 0);
    assert.equal(r.report.denominator.applicable, 46);
  });
});
