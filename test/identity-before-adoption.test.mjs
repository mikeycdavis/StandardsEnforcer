/**
 * A wrong pack must be refused before its adoption vocabulary is consumed.
 *
 * THE DEFECT. 1.2 contracts let a pack declare which filenames constitute adopting it, and
 * `enforce()` loads that contract at the adoption boundary to read `adoption.policyFiles`. R2 — the
 * check that the pinned release IS the pack the invocation asked for — lives further down, inside
 * `runOfficialEvaluator`. So when scope asks for pack A and the verified release declares pack B,
 * B's marker vocabulary decided adoption before anybody asked whether B was the right pack at all.
 * If none of B's markers exists in the target, the run returned NOT_ADOPTED and R2 was never reached.
 *
 * WHY THAT IS WORSE THAN A WRONG STATE NAME. Under a confirmed in-scope disposition the message is a
 * blockable delinquency finding — "it is governed and has not adopted" — and it names a filename
 * belonging to a pack the operator never asked about. A true condition (the wrong release was
 * pinned) reported as a different, blockable one is precisely the shape FE-21 was filed against,
 * arriving through the door FE-21 opened.
 *
 * THE PROPERTY:
 *
 *     A verified release whose declared `standard.id` differs from the scoped standard is rejected
 *     as STANDARDS_IDENTITY_MISMATCH before any adoption vocabulary from that release is consumed.
 *
 * R2 IS NOT MOVED, AND MUST NOT BE. Its own comment records why it cannot travel earlier: doing so
 * would put scope resolution behind the evaluator seam, which `scope-seam-invariance.test.mjs`
 * exists to prevent. The early check added here is an ADDITIONAL gate protecting the pre-invocation
 * adoption logic; R2 stays exactly where it is as defence in depth for the seam. The control below
 * asserts R2 still fires on the path that reaches it.
 *
 * THE NEGATIVE PROPERTY IS ASSERTED, NOT INFERRED. It is not enough that the state is now
 * STANDARDS_IDENTITY_MISMATCH — that could hold while the wrong pack's vocabulary still influenced
 * something. So the same mismatch is run against three different wrong-pack vocabularies and the
 * whole result is required to be invariant under them, and to name none of their filenames.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { STATE, EXIT, exitFor } from "../scripts/states.mjs";
import { detectFootprint, footprintDigest, SURFACE } from "../scripts/footprint.mjs";

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

const ASKED = "alpha";      // the standard the invocation and the registry are about
const WRONG = "beta";       // what the pinned release actually declares itself to be
const REPO_ID = "gh:424242";
const REPO_NAME = "acme/subject";
const REVIEWER = "reviewer@example.com";

const made = [];
const mk = async (prefix) => {
  const d = await mkdtemp(path.join(tmpdir(), prefix));
  made.push(d);
  return d;
};

test.after(async () => {
  for (const d of made) await rm(d, { recursive: true, force: true });
});

/** A real, tagged standards release declaring `id` and admitting `policyFiles`. */
async function release(id, policyFiles) {
  const dir = await mk("f2-pack-");
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify({
    schemaVersion: "1.2.0",
    standard: { id },
    evaluation: {
      entrypoint: "scripts/standards.mjs",
      arguments: ["check", "{target}", "--policy", "{policy}", "--json"],
    },
    result: { statuses: ["COMPLIANT"], passing: ["COMPLIANT"] },
    adoption: { policyFiles },
  }, null, 2));
  await writeFile(path.join(dir, "scripts", "standards.mjs"),
    '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ status: "COMPLIANT" }) + "\\n");\n');
  git(["init", "--quiet", "-b", "main"], dir);
  // Configured on the repository, not passed to one command. An annotated tag needs a tagger just
  // as a commit needs a committer, and `-c` on the commit alone left `git tag -a` to fall back to a
  // global identity. The container has one — its image runs `git config --system user.name` — and a
  // hosted runner does not, so that fixture built a repository with no tag, `rev-list` returned the
  // empty string, and every arm below saw STANDARDS_IDENTITY_MISMATCH for a reason that had nothing
  // to do with the defect. The first arm therefore PASSED, on the wrong evidence, on the one surface
  // that could have said so.
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "t"], dir);
  git(["add", "-A"], dir);
  git(["commit", "--quiet", "-m", "release"], dir);
  git(["tag", "-a", "v1.0.0", "-m", "v1.0.0"], dir);

  const sha = git(["rev-list", "-n", "1", "v1.0.0"], dir).stdout.trim();
  // The fixture asserts itself. A helper that can hand back an empty identity is a helper that can
  // make a passing assertion mean nothing, and this one already did.
  assert.match(sha, /^[0-9a-f]{40}$/u,
    `the fixture did not produce a resolvable tag; rev-list returned ${JSON.stringify(sha)}`);
  return { dir, tag: "v1.0.0", sha };
}

/** A governed repository holding exactly one marker, plus enough evidence to have a footprint. */
async function subject(markerName) {
  const dir = await mk("f2-subject-");
  await writeFile(path.join(dir, markerName), "project: Subject\n");
  await writeFile(path.join(dir, "train.py"), "import sklearn\nm.fit(X, y)\n");
  return dir;
}

/** A current, non-stale in-scope disposition for ASKED, written where the subject cannot reach it. */
async function registryFor(targetDir) {
  const outside = await mk("f2-registry-");
  const file = path.join(outside, "scope-registry.json");
  const kinds = detectFootprint(targetDir).kinds;
  await writeFile(file, JSON.stringify({
    schemaVersion: "1.0.0",
    authorisedReviewers: [REVIEWER],
    repositories: {
      [REPO_ID]: {
        name: REPO_NAME,
        standards: {
          [ASKED]: {
            disposition: "in-scope",
            reviewedBy: REVIEWER,
            reviewedAt: "2026-08-01",
            reason: "Handles money.",
            evidence: ["train.py"],
            revisitWhen: ["it stops"],
            reviewedFootprint: { surface: SURFACE, kinds, digest: footprintDigest(kinds) },
            expiresAt: null,
          },
        },
      },
    },
  }, null, 2));
  return file;
}

async function run(pack, target) {
  return enforce({
    target,
    standardsRepo: pack.dir,
    tag: pack.tag,
    sha: pack.sha,
    cacheRoot: await mk("f2-cache-"),
    scope: { registryPath: await registryFor(target), repoId: REPO_ID, repoName: REPO_NAME, standardId: ASKED },
  });
}

// ---------------------------------------------------------------------------
// The defect: the wrong pack's markers decided adoption before identity was asked.
// ---------------------------------------------------------------------------

test("identity · a wrong pack is refused before its adoption vocabulary decides anything", async () => {
  const pack = await release(WRONG, ["beta-policy.yml"]);
  const target = await subject("project-policy.yml");   // holds ASKED's marker, not WRONG's

  const r = await run(pack, target);

  assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH,
    "a release declaring the wrong pack was consumed for its marker vocabulary and the run reported " +
    `${r.state} instead of refusing on identity`);
  assert.equal(r.passing, false);
  assert.equal(exitFor(r.state), EXIT.NOT_ENFORCEABLE);
  assert.notEqual(r.state, STATE.NOT_ADOPTED,
    "NOT_ADOPTED is a blockable delinquency finding, and this repository has adopted correctly");
});

test("identity · the refusal names both ids, so the operator is told what actually happened", async () => {
  const pack = await release(WRONG, ["beta-policy.yml"]);
  const r = await run(pack, await subject("project-policy.yml"));

  assert.match(r.detail, new RegExp(`"${ASKED}"`, "u"), "the id the invocation asked for");
  assert.match(r.detail, new RegExp(`"${WRONG}"`, "u"), "and the id the release declares");
  assert.doesNotMatch(r.detail, /has not adopted|contains no/u,
    "a wrong-release run must not be described to the operator as an adoption failure");
});

// ---------------------------------------------------------------------------
// The negative property, asserted rather than inferred from the state alone.
// ---------------------------------------------------------------------------

test("identity · the wrong pack's declared markers cannot influence the result at all", async () => {
  // Three vocabularies, deliberately chosen so that a leak would be visible in a different way each
  // time: one the subject does not hold, one it DOES hold, and two-that-are-both-absent, which is the
  // input to the ambiguity refusal. If any of this reached the decision, these would not agree.
  const vocabularies = [
    ["beta-policy.yml"],
    ["project-policy.yml"],
    ["beta-one.yml", "beta-two.yml"],
  ];

  const results = [];
  for (const policyFiles of vocabularies) {
    const pack = await release(WRONG, policyFiles);
    results.push(await run(pack, await subject("project-policy.yml")));
  }

  for (const r of results) {
    assert.equal(r.state, results[0].state, "the outcome varied with the wrong pack's vocabulary");
    assert.equal(r.detail, results[0].detail, "the message varied with the wrong pack's vocabulary");
    assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH);
  }

  // And nothing the wrong pack named may appear anywhere in the payload the operator reads.
  const serialised = JSON.stringify(results);
  for (const name of ["beta-policy.yml", "beta-one.yml", "beta-two.yml"]) {
    assert.ok(!serialised.includes(name),
      `the result mentions ${name}, a filename declared by a release that was refused on identity`);
  }
});

test("identity · adoption is not even attempted, so a subject with no marker at all reads the same", async () => {
  // The strongest form. With no marker present under ANY vocabulary, the pre-remedy code had its
  // clearest run at NOT_ADOPTED. Identity must still win.
  const pack = await release(WRONG, ["beta-policy.yml"]);
  const bare = await mk("f2-bare-");
  await writeFile(path.join(bare, "train.py"), "import sklearn\nm.fit(X, y)\n");

  const r = await run(pack, bare);

  assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH);
  assert.equal(r.governed, undefined,
    "a run refused on identity has not established anything about whether the subject adopted");
});

// ---------------------------------------------------------------------------
// The control: R2 is not moved, and still fires on the path that reaches it.
// ---------------------------------------------------------------------------

test("identity · R2 still refuses at the seam when adoption succeeds — defence in depth, not a move", async () => {
  const pack = await release(WRONG, ["beta-policy.yml"]);
  const target = await subject("beta-policy.yml");   // the wrong pack's own marker IS present

  const r = await run(pack, target);

  assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH,
    "the early gate must not have displaced R2's own refusal on the path that reaches the seam");
  assert.match(r.detail, /pinned release declares itself/u,
    "this is R2's wording, which is the evidence that the seam check is still live");
});

// ---------------------------------------------------------------------------
// The right pack must be entirely unaffected.
// ---------------------------------------------------------------------------

test("identity · a matching pack still reaches adoption and is unaffected", async () => {
  const pack = await release(ASKED, ["project-policy.yml"]);
  const r = await run(pack, await subject("project-policy.yml"));

  assert.equal(r.state, STATE.EVALUATED,
    "the gate refused a release whose id agrees with the scoped standard");
  assert.equal(r.authority.status, "COMPLIANT");
});

test("identity · an unscoped run is unaffected, because there is no id to disagree with", async () => {
  // No `scope`, so `scope.standardId` is undefined. The gate must be silent rather than refusing
  // every release for failing to match nothing.
  const pack = await release(WRONG, ["project-policy.yml"]);
  const target = await subject("project-policy.yml");

  const r = await enforce({
    target, standardsRepo: pack.dir, tag: pack.tag, sha: pack.sha, cacheRoot: await mk("f2-cache-"),
  });

  assert.equal(r.state, STATE.EVALUATED,
    "with nothing asked for, no release can be the wrong one");
});

// ---------------------------------------------------------------------------
// The arrangement is recorded where a future reader will look, not only here.
//
// A defence that no document depicts is a defence somebody eventually deletes as an accident. Two
// gates asking the same question is exactly the shape that invites that deletion, so the reason both
// exist has to survive outside this file. These assertions are cheap and they are the only thing
// standing between "R2 is redundant now" and a silently reopened defect.
// ---------------------------------------------------------------------------

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const slurp = (rel) => readFileSync(path.join(REPO, rel), "utf8").replace(/\r\n/gu, "\n");

test("identity · the two-gate arrangement is a recorded decision, not a local comment", () => {
  const adr = slurp("artifacts/adr/0005-adapter-provenance.md");

  assert.match(adr, /adoption vocabulary must share one verified release identity/u,
    "ADR 0005's invariant does not cover adoption vocabulary, so nothing durable says the release " +
    "must be the right pack before that vocabulary is read");
  assert.match(adr, /R2 is not superseded and MUST NOT be moved/u,
    "ADR 0005 does not record that R2 stays at the evaluator seam; without it, the early gate " +
    "reads as a replacement and R2 reads as dead weight");
});

test("identity · both gate sites point at that decision", () => {
  const src = slurp("scripts/enforce.mjs");
  const citations = src.match(/ADR 0005 \(amendment, 2026-08-26\)/gu) ?? [];

  assert.equal(citations.length, 2,
    `expected both the early gate and R2 to cite the amendment, found ${citations.length}. A gate ` +
    "whose reason lives only in the diff is a gate the next reader deletes");
});

test("identity · the canonical sequence depicts both gates", () => {
  const mmd = slurp("docs/architecture-sequence.mmd");

  assert.match(mmd, /before one byte of its adoption vocabulary is read/u,
    "the canonical sequence does not show the early identity gate");
  assert.match(mmd, /R2 — the same identity question/u,
    "the canonical sequence does not show R2 at the evaluator seam");
});
