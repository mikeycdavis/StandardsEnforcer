/**
 * The governing policy is a parameter, and it never defaults across packs.
 *
 * WHAT FORCED THIS. A repository governed by more than one standards pack cannot hold one policy.
 * Every pack's `init` writes `project-policy.yml`, and their schemas are mutually incompatible —
 * verified by execution: MachineLearningStandards' own `policy.mjs` rejects Numerai's engineering
 * policy on the attestation shape, field by field. So the enforcer either learns to be told which
 * policy governs a given (repository x pack), or it hands pack B the file pack A adopted and reports
 * confidently about the wrong document. That is finding F's failure class arriving from the other
 * direction, and INV-E1 is what it violates.
 *
 * TWO GUARDS, AND THE HONEST LIMIT OF EACH.
 *
 *   R1  Where the external registry names the policy for this (repository x pack), defaulting is
 *       refused and a mismatch goes to a human. It is REGISTRY-SCOPED, not universal, because the
 *       enforcer cannot tell which pack a target's root policy belongs to — no policy file declares
 *       one. A repository with no registry entry keeps the pre-0.5.0 behaviour, and says so in
 *       `policy.source`.
 *
 *   R2  The pinned release must be the pack the invocation asked for. This is a comparison between
 *       the id the CALLER named and the id the RELEASE declares — deliberately not against the policy
 *       file, which carries no pack identity to compare with.
 *
 * The synthetic release below reports which policy it was handed, because without that "read the
 * target's policy" and "read something else" are indistinguishable from outside, and a test asserting
 * only that the run succeeded would pass in both cases.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { detectFootprint, footprintDigest, SURFACE } from "../scripts/footprint.mjs";
import { STATE } from "../scripts/states.mjs";

const TODAY = "2026-08-20";
const REVIEWER = "ml-governance@acme.example";
const ID = "github:1024871";
const NAME = "acme/numerai";
const STANDARD = "machine-learning";
const NESTED = "artifacts/standards/policies/machine-learning-policy.yml";
const ROOT_POLICY = 'standardVersion: "2.0.0"\nproject: "Numerai"\n';
const ML_POLICY = 'standardVersion: "1.5.0"\nproject: "Numerai"\n';

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

/**
 * A pack that echoes the policy path it was given.
 *
 * It reads the file as well as naming it, so a path that resolves to nothing fails here rather than
 * passing silently.
 */
const EVALUATOR = [
  'import { readFileSync } from "node:fs";',
  "let policy = null, target = null;",
  "for (const a of process.argv.slice(2)) {",
  '  if (a.startsWith("--policy=")) policy = a.slice(9);',
  '  else if (a.startsWith("--dir=")) target = a.slice(6);',
  "}",
  'const body = policy ? readFileSync(policy, "utf8") : null;',
  "process.stdout.write(JSON.stringify({",
  '  status: "COMPLIANT",',
  "  policyRead: policy,",
  "  policyBody: body === null ? null : body.trim(),",
  "  target,",
  "}));",
].join("\n");

/** A real, tagged, resolvable release declaring `standardId`. */
async function release(dir, { standardId = STANDARD } = {}) {
  const repo = path.join(dir, "standards");
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  git(["init", "--quiet", "-b", "main"], repo);
  git(["config", "user.email", "test@example.invalid"], repo);
  git(["config", "user.name", "Policy Path"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  await writeFile(path.join(repo, "VERSION"), "1.0.0\n");
  await writeFile(
    path.join(repo, "standards-adapter.json"),
    JSON.stringify(
      {
        schemaVersion: "1.1.0",
        standard: { id: standardId },
        evaluation: {
          entrypoint: "scripts/standards.mjs",
          arguments: ["evaluate", "--dir={target}", "--policy={policy}", "--json"],
        },
        result: { statuses: ["COMPLIANT", "NON_COMPLIANT"], passing: ["COMPLIANT"] },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(repo, "scripts/standards.mjs"), EVALUATOR);
  git(["add", "-A"], repo);
  git(["commit", "--quiet", "-m", "a release that reports the policy it read"], repo);
  git(["tag", "-a", "v1.0.0", "-m", "release"], repo);
  return { repo, sha: git(["rev-list", "-n", "1", "v1.0.0"], repo) };
}

const decision = (over = {}) => ({
  disposition: "in-scope",
  reviewedBy: REVIEWER,
  reviewedAt: "2026-08-01",
  reason: "Trains and evaluates predictive models.",
  evidence: ["phases/phase4/crypto/train-crypto.py"],
  revisitWhen: ["training leaves this repository"],
  expiresAt: null,
  ...over,
});

/**
 * One run, with everything the seven cases vary.
 *
 * `entry: undefined` means no registry at all — the pre-0.5.0 single-pack shape, and the baseline the
 * compatibility cases are measured against.
 */
async function run({
  policy,
  entry,
  policies = {},
  rootPolicy = ROOT_POLICY,
  standardId = STANDARD,
  ask = STANDARD,
  // A SECOND pack recorded in scope for the same repository. `null` keeps the single-pack shape every
  // case above uses; a string files an in-scope disposition under that id, which is what makes this
  // repository multi-pack governed and what cases 8 and 9 turn on.
  alsoGoverns = null,
  // Transforms the resolved --policy path just before it is handed to enforce(), so a case can
  // present a path that names the same file in a different spelling. Only 5b uses it.
  mangle = null,
}) {
  const dir = await mkdtemp(path.join(tmpdir(), "policypath-"));
  try {
    const { repo, sha } = await release(dir, { standardId });
    const target = path.join(dir, "target");
    await mkdir(target, { recursive: true });
    if (rootPolicy !== null) await writeFile(path.join(target, "project-policy.yml"), rootPolicy);
    for (const [rel, body] of Object.entries(policies)) {
      await mkdir(path.dirname(path.join(target, rel)), { recursive: true });
      await writeFile(path.join(target, rel), body);
    }

    let scope;
    if (entry !== undefined) {
      // The basis has to describe the target as it actually is, or every case collapses into
      // SCOPE_REVIEW_REQUIRED for staleness and proves nothing about policy resolution.
      const kinds = detectFootprint(target).kinds;
      const filed =
        entry === null
          ? null
          : decision({ reviewedFootprint: { surface: SURFACE, kinds, digest: footprintDigest(kinds) }, ...entry });
      const registryPath = path.join(dir, "scope-registry.json");
      await writeFile(
        registryPath,
        JSON.stringify(
          {
            schemaVersion: "1.0.0",
            authorisedReviewers: [REVIEWER],
            repositories:
              filed === null
                ? {}
                : {
                    [ID]: {
                      name: NAME,
                      standards: {
                        [STANDARD]: filed,
                        // The second pack's disposition needs no policyPath of its own for these
                        // cases: what is under test is the disposition the invocation asks about.
                        ...(alsoGoverns ? { [alsoGoverns]: decision({ reviewedFootprint: filed.reviewedFootprint }) } : {}),
                      },
                    },
                  },
          },
          null,
          2,
        ),
      );
      scope = { registryPath, repoId: ID, repoName: NAME, standardId: ask };
    }

    return await enforce({
      target,
      standardsRepo: repo,
      tag: "v1.0.0",
      sha,
      cacheRoot: path.join(dir, "cache"),
      ...(scope ? { scope } : {}),
      ...(policy === undefined
        ? {}
        : { policy: mangle ? mangle(path.join(target, policy)) : path.join(target, policy) }),
      today: TODAY,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// 1-2 · compatibility: the default still resolves, and an explicit path wins
// ===========================================================================

test("1 · no --policy resolves the root default, and records that it defaulted", async () => {
  const r = await run({});
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.passing, true);
  assert.equal(r.policy.source, "default");
  assert.equal(path.basename(r.policy.path), "project-policy.yml");
  // The pack was handed the same path the enforcer resolved — not a second one that happened to agree.
  assert.equal(r.report.policyRead, r.policy.path);
  assert.match(r.report.policyBody, /project: "Numerai"/);
});

test("2 · an explicit --policy at a nested path is the one evaluated", async () => {
  const r = await run({ policy: NESTED, policies: { [NESTED]: ML_POLICY } });
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.policy.source, "explicit");
  assert.equal(r.policy.path, r.report.policyRead);
  // Decisive: the ROOT policy exists and was not read. Without asserting the body, this case would
  // pass against a target that only ever had one file.
  assert.match(r.report.policyBody, /standardVersion: "1\.5\.0"/);
  assert.doesNotMatch(r.report.policyBody, /2\.0\.0/);
});

// ===========================================================================
// 3 · a named policy that is absent is adoption-absent, never non-compliance
// ===========================================================================

test("3 · --policy naming a missing file is NOT_ADOPTED, and names the path it looked for", async () => {
  const r = await run({ policy: NESTED });
  assert.equal(r.state, STATE.NOT_ADOPTED);
  assert.equal(r.passing, false);
  // INV-E1's other edge: an absence must not become a verdict in either direction.
  assert.equal(r.report, undefined);
  assert.equal(r.policy.source, "explicit");
  assert.equal(r.policy.digest, null);
  assert.match(r.detail, /machine-learning-policy\.yml/);
  assert.doesNotMatch(r.detail, /contains no project-policy\.yml/);
});

// ===========================================================================
// 4-5 · R1 · the registry names the policy, so defaulting is refused
// ===========================================================================

test("4 · R1 · a registry-named policy with no --policy is ENFORCEMENT_ERROR", async () => {
  const r = await run({ entry: { policyPath: NESTED }, policies: { [NESTED]: ML_POLICY } });
  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
  assert.equal(r.passing, false);
  assert.equal(r.report, undefined, "nothing may be evaluated once the policy is in doubt");
  assert.match(r.detail, /no --policy was supplied/);
  // The whole point of the message: say what it would otherwise have read.
  assert.match(r.detail, /project-policy\.yml/);
});

test("5 · R1 · a --policy the registry does not name is SCOPE_REVIEW_REQUIRED", async () => {
  const other = "artifacts/standards/policies/prediction-policy.yml";
  const r = await run({
    entry: { policyPath: NESTED },
    policy: other,
    policies: { [NESTED]: ML_POLICY, [other]: 'standardVersion: "1.1.0"\n' },
  });
  assert.equal(r.state, STATE.SCOPE_REVIEW_REQUIRED);
  assert.equal(r.passing, false);
  assert.equal(r.report, undefined);
  assert.equal(r.scope.policyConflict, true);
});

// ===========================================================================
// 6 · R2 · the release must be the pack the invocation asked for
// ===========================================================================

test("6 · R2 · a release declaring another pack is STANDARDS_IDENTITY_MISMATCH", async () => {
  const r = await run({
    entry: { policyPath: NESTED },
    policy: NESTED,
    policies: { [NESTED]: ML_POLICY },
    standardId: "betting",
  });
  assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH);
  assert.equal(r.passing, false);
  assert.equal(r.report, undefined, "the wrong pack must not get to answer at all");
  assert.match(r.detail, /asked for "machine-learning"/);
  assert.match(r.detail, /declares itself "betting"/);
});

// ===========================================================================
// 7 · the digest identifies the bytes that were evaluated
// ===========================================================================

test("7 · the recorded digest is the sha256 of the policy actually read", async () => {
  const r = await run({ policy: NESTED, policies: { [NESTED]: ML_POLICY } });
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.policy.digest, "sha256:" + createHash("sha256").update(Buffer.from(ML_POLICY)).digest("hex"));

  // Two policies at the same path with different bytes must not be indistinguishable in evidence.
  // Compared by trailing path rather than in full: each run gets its own scratch root, so the
  // absolute prefixes differ by construction and asserting on them would test the fixture.
  const revised = await run({ policy: NESTED, policies: { [NESTED]: ML_POLICY + "# a later revision\n" } });
  const tail = (p) => p.split(path.sep).slice(-4).join("/");
  assert.equal(tail(revised.policy.path), tail(r.policy.path));
  assert.notEqual(revised.policy.digest, r.policy.digest);
});

// ===========================================================================
// 8-9 · the precondition R1 created, and the boundary of what closes it
// ===========================================================================

/**
 * REVIEW FOUND THIS, NOT THE PLAN. R1 refuses to default only where a disposition names `policyPath`.
 * Where none is named it keeps the pre-0.5.0 behaviour — so the guard against evaluating one pack's
 * repository through another pack's policy was optional, and optional in precisely the configuration
 * that needs it. R2 does not cover the gap: it compares the id the invocation named against the id
 * the release declares, and both are correct here. The policy is the only wrong thing, and no policy
 * file carries a pack identity to check it against.
 *
 * `scope.mjs` closes it from the registry side, on a count of in-scope dispositions rather than any
 * list of packs. These two cases are the property and its boundary, written down together so the
 * boundary is a stated limit rather than an undiscovered hole.
 */

test("8 · multi-pack governed with no registry policyPath requires review, and never evaluates", async () => {
  const r = await run({ entry: {}, alsoGoverns: "betting", policy: NESTED, policies: { [NESTED]: ML_POLICY } });

  assert.equal(r.state, STATE.SCOPE_REVIEW_REQUIRED);
  assert.equal(r.passing, false);
  // INV-E1: the unresolvable case must not acquire a verdict on the way out, in either direction.
  assert.equal(r.report, undefined, "no pack may answer while it is unknown which policy governs");
  assert.match(r.detail, /in scope for 2 standards packs/u);
  assert.match(r.detail, /names no policyPath/u);
  // Pins WHICH review fired. Asserting only the state would pass on any unrelated review-required —
  // a stale basis, an unauthorised reviewer — and prove nothing about the policy requirement.
  assert.equal(r.scope.policyPathRequired, true);
  assert.equal(r.scope.governing, 2);
});

test("8b · the same repository with the policyPath supplied evaluates normally", async () => {
  // The paired positive. Without it, case 8 is also satisfied by a build that refuses every
  // multi-pack repository outright, which would be a broken enforcer passing its own guard test.
  const r = await run({
    entry: { policyPath: NESTED },
    alsoGoverns: "betting",
    policy: NESTED,
    policies: { [NESTED]: ML_POLICY },
  });
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.policy.source, "explicit");
  assert.match(r.report.policyBody, /standardVersion: "1\.5\.0"/u);
});

test("9 · LIMIT · single-pack governed, an explicit wrong policy is still evaluated", async () => {
  // Asserted so the residual is recorded rather than assumed absent. With ONE pack in scope there is
  // no second policy to be confused with: the operator named a file, and the only pack governing this
  // repository was evaluated against the file the operator named. That is an instruction, not a
  // mix-up, and `policy.source: "explicit"` is what a caller wanting a stricter rule checks.
  //
  // This case turns into a refusal the moment a second pack is recorded in scope — which is case 8,
  // and is the whole reason the trigger is a count.
  const r = await run({ entry: {}, policy: NESTED, policies: { [NESTED]: ML_POLICY } });
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.policy.source, "explicit");
  assert.equal(r.report.policyRead, r.policy.path);
});

// ===========================================================================
// 5b · R1 compares files, not spellings
// ===========================================================================

test("5b · a differently-spelled path naming the registry's policy is not a conflict", async (t) => {
  // REVIEW FOUND THIS. R1 compared resolved strings with `===`, and on Windows `path.resolve`
  // normalises separators while preserving the drive-letter case it was handed. A registry entry
  // resolved against `F:\\Repos\\...` and an invocation given `f:/repos/...` are one file and compared
  // unequal — sending a reviewer to arbitrate a governance conflict between two identical paths.
  //
  // Windows-only by nature: the fix folds case on win32 only, because NTFS is case-insensitive by
  // default and POSIX is not, and folding everywhere would make two genuinely different Linux files
  // compare equal. Skipped rather than silently passing elsewhere, so a green run on Linux is never
  // read as evidence this was exercised.
  if (process.platform !== "win32") {
    t.skip("drive-letter case folding is win32-only; case 5b was NOT exercised on this platform");
    return;
  }
  const r = await run({
    entry: { policyPath: NESTED },
    policy: NESTED,
    policies: { [NESTED]: ML_POLICY },
    // Same file, spelled the way a shell or a CI variable often produces it.
    mangle: (p) => (p[0].toLowerCase() + p.slice(1)).replace(/\\/gu, "/"),
  });
  assert.equal(r.state, STATE.EVALUATED, "a spelling difference is not a governance conflict");
  assert.equal(r.policy.source, "explicit");
  assert.match(r.report.policyBody, /standardVersion: "1\.5\.0"/u);
});
