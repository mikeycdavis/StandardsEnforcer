/**
 * A declared adoption marker must be something that can actually be read as a policy.
 *
 * THE PROPOSITION.
 *
 *     Adoption is decided by looking for a filename. `existsSync` answers a question about a NAME,
 *     not about a FILE — it is equally true of a directory, a FIFO, a device node and a socket. So
 *     the enforcer accepted a directory named `project-policy.yml` as adoption, walked past the
 *     guard that was supposed to prove the policy existed, and then read it: `readFileSync` on a
 *     directory throws `EISDIR`, uncaught, out of `enforce()` itself.
 *
 * WHY A THROW IS THE WORST OF THE AVAILABLE OUTCOMES. `enforce()` has one construction point for
 * every result — `result()` — which is where INV-E1 lives and where the recorded-decision
 * requirement is enforced. An exception is the one way out of the function that goes around it.
 * Nothing downstream receives a state, a detail, an exit code or an envelope; the caller gets a
 * stack trace naming `readFileSync`, which says nothing about standards, adoption, or which
 * repository was being enforced. The enforcer's own vocabulary exists precisely so that "this could
 * not be established" is a thing it can SAY, and here it could not say it.
 *
 * WHY OBSTRUCTION IS NOT ABSENCE, AND THIS IS THE LOAD-BEARING DESIGN CHOICE. It is tempting to
 * make the presence filter require a regular file and stop there — a directory then simply is not a
 * marker, and the run reports `NOT_ADOPTED`. That is wrong, and it is wrong in the exact shape this
 * repository has now paid for twice. `NOT_ADOPTED` asserts a fact: *there is nothing here*. Under a
 * recorded in-scope disposition it is blockable, and it instructs an operator to create a file that
 * already exists as a name. Something IS there and the enforcer cannot read it — that is an
 * unestablished condition, and INV-E1 says an unestablished condition is reported as itself.
 *
 *     nothing at the declared names        absence      -> NOT_ADOPTED
 *     a name occupied by a non-file        obstruction  -> ENFORCEMENT_ERROR
 *     a regular file that cannot be read   obstruction  -> ENFORCEMENT_ERROR
 *
 * THE SECOND ROUTE MATTERS TOO. Discovery is not the only way a path reaches the digest: an explicit
 * `--policy` skips the marker filter entirely. Fixing only the filter would leave the identical
 * crash on the sibling path, so the read itself is guarded as well. The filter decides what counts
 * as adoption; the guarded read decides that no path, however it arrived, can leave `enforce()`
 * through an exception.
 *
 * WHAT THIS FILE DOES NOT TOUCH. Which filenames a pack may declare (`adoption.policyFiles`, and
 * `test/adoption-marker.test.mjs` owns it), and how `render()` describes the policy it chose. The
 * latter is a live, separately adjudicated defect and is deliberately not repaired here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { STATE, EXIT, exitFor } from "../scripts/states.mjs";

const STANDARD = "machine-learning";
const POLICY_BODY = 'standardVersion: "1.5.0"\nproject: "Numerai"\n';

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

const EVALUATOR = [
  'import { readFileSync } from "node:fs";',
  "let policy = null;",
  'for (const a of process.argv.slice(2)) if (a.startsWith("--policy=")) policy = a.slice(9);',
  'const body = policy ? readFileSync(policy, "utf8") : null;',
  'process.stdout.write(JSON.stringify({ status: "COMPLIANT", policyRead: policy,',
  "  policyBody: body === null ? null : body.trim() }));",
].join("\n");

async function release(dir, policyFiles) {
  const repo = path.join(dir, "standards");
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  git(["init", "--quiet", "-b", "main"], repo);
  // Configured on the repository rather than passed to one command: an annotated tag needs a tagger
  // just as a commit needs a committer, and a hosted runner has no ambient git identity to fall back
  // on. A fixture that silently produces no tag is a fixture that makes every assertion vacuous.
  git(["config", "user.email", "test@example.invalid"], repo);
  git(["config", "user.name", "Marker Usability"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  await writeFile(path.join(repo, "VERSION"), "1.0.0\n");
  await writeFile(path.join(repo, "standards-adapter.json"), JSON.stringify({
    schemaVersion: "1.2.0",
    standard: { id: STANDARD },
    evaluation: { entrypoint: "scripts/standards.mjs",
      arguments: ["evaluate", "--dir={target}", "--policy={policy}", "--json"] },
    result: { statuses: ["COMPLIANT", "NON_COMPLIANT"], passing: ["COMPLIANT"] },
    adoption: { policyFiles },
  }, null, 2));
  await writeFile(path.join(repo, "scripts/standards.mjs"), EVALUATOR);
  git(["add", "-A"], repo);
  git(["commit", "--quiet", "-m", "a release that reports the policy it read"], repo);
  git(["tag", "-a", "v1.0.0", "-m", "release"], repo);
  const sha = git(["rev-list", "-n", "1", "v1.0.0"], repo);
  assert.match(sha, /^[0-9a-f]{40}$/u,
    `the fixture did not produce a resolvable tag; rev-list returned ${JSON.stringify(sha)}`);
  return { repo, sha };
}

/**
 * Build a target from a layout description and enforce against it.
 *
 * `layout` maps a name in the target to `"file"`, `"dir"`, or `"unreadable"`. Nothing else about the
 * run varies: no registry, no gate, and `--policy` only where a case is explicitly about that route.
 */
async function run(layout, { policyFiles = ["project-policy.yml"], explicitPolicy = null } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "marker-usability-"));

  // EXACTLY the paths this fixture made unreadable, so teardown restores those and nothing else.
  // The first version chmod'd `target/project-policy.yml` unconditionally, which on the case where
  // that name is a DIRECTORY set it to 0o600 — readable, writable, and not traversable — so the
  // recursive delete failed EACCES. Windows ignores the mode and stayed green; Linux CI did not.
  // That is the capability-dependent surface doing its job, and it is the second time on this line
  // of work that a fixture, not a remedy, was the thing the container caught.
  const restore = [];
  try {
    const { repo, sha } = await release(dir, policyFiles);
    const target = path.join(dir, "target");
    await mkdir(target, { recursive: true });
    for (const [name, kind] of Object.entries(layout)) {
      const p = path.join(target, name);
      if (kind === "dir") {
        await mkdir(p, { recursive: true });
        // Not empty, because an empty directory is the easy case. A directory with a plausible
        // policy inside it is what an operator actually produces by mistake, and it must not
        // become readable by accident of some future implementation walking into it.
        await writeFile(path.join(p, "policy.yml"), POLICY_BODY);
      } else {
        await writeFile(p, POLICY_BODY);
        if (kind === "unreadable") {
          await chmod(p, 0o000);
          restore.push(p);
        }
      }
    }

    // The call is isolated so that what `enforce()` did can never be confused with what the fixture
    // did around it. The first version wrapped the whole helper, and a teardown EACCES was therefore
    // reported as "enforce() threw EACCES" — an accusation against the subject for a fault in the
    // harness, which is exactly the kind of evidence that sends someone to rewrite working code.
    try {
      return { result: await enforce({
        target, standardsRepo: repo, tag: "v1.0.0", sha,
        cacheRoot: path.join(dir, "cache"),
        ...(explicitPolicy ? { policy: path.join(target, explicitPolicy) } : {}),
      }) };
    } catch (e) {
      return { threw: e };
    }
  } finally {
    for (const p of restore) {
      try { await chmod(p, 0o600); } catch { /* the case may have removed it */ }
    }
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Run one case and return the result, failing the test where `enforce()` threw.
 *
 * A fixture or teardown failure propagates as ITSELF — it is not caught here and not attributed to
 * `enforce()`.
 */
async function settle(...args) {
  const outcome = await run(...args);
  if (outcome.threw) {
    const e = outcome.threw;
    assert.fail(
      `enforce() threw ${e.code ?? e.name}: ${e.message}\n` +
      "An exception leaves the function around result(), which is where INV-E1 and the " +
      "recorded-decision requirement live. Every outcome must arrive as a state.");
  }
  return outcome.result;
}

// ---------------------------------------------------------------------------
// A name occupied by a directory.
// ---------------------------------------------------------------------------

test("usability · a directory occupying the sole declared marker is an enforcement error, not a crash", async () => {
  const r = await settle({ "project-policy.yml": "dir" });

  assert.equal(r.state, STATE.ENFORCEMENT_ERROR,
    "a name the enforcer cannot read as a policy was resolved to some other state");
  assert.equal(r.passing, false, "an unreadable policy must never carry a passing result");
  assert.equal(exitFor(r), EXIT.NOT_ENFORCEABLE,
    "the process must exit as not-enforceable, which is what a gate reads");
});

test("usability · the operator is told which path is the problem and what is wrong with it", async () => {
  const r = await settle({ "project-policy.yml": "dir" });

  assert.match(r.detail, /project-policy\.yml/u,
    "the detail does not name the marker, so nobody can act on it");
  assert.match(r.detail, /directory|not a (regular )?file/iu,
    "the detail does not say what is wrong; 'could not be read' alone sends a reader to permissions");
});

test("usability · obstruction is NOT reported as absence", async () => {
  const r = await settle({ "project-policy.yml": "dir" });

  assert.notEqual(r.state, STATE.NOT_ADOPTED,
    "a name that IS occupied was reported as nothing being there. Under a recorded in-scope " +
    "disposition that is a blockable delinquency finding telling an operator to create a file " +
    "whose name is already taken");
  assert.doesNotMatch(r.detail, /has not adopted|contains no/u,
    "the detail asserts absence about a repository where the marker name is occupied");
});

test("usability · an obstructed marker that is not the first declared is still not absence", async () => {
  // THE CASE THAT ISOLATES THE CANDIDATE SET, and it took a falsifier to find it. Where the
  // obstructed name happens to be the FIRST declared marker, the default path falls on it anyway and
  // the read guard downstream catches it — so a lone directory proves nothing about the filter. Here
  // the first declared marker is genuinely absent and the SECOND is the directory. Drop the
  // obstruction from the candidate set without reporting it and the run defaults to the absent name
  // and announces `NOT_ADOPTED` about a tree where a declared marker is occupied.
  const r = await settle(
    { "project-policy.yaml": "dir" },
    { policyFiles: ["project-policy.yml", "project-policy.yaml"] });

  assert.equal(r.state, STATE.ENFORCEMENT_ERROR,
    "an obstructed marker was quietly dropped and the run reported on the absent one instead");
  assert.match(r.detail, /project-policy\.yaml/u, "the obstructed name is not reported");
  assert.doesNotMatch(r.detail, /has not adopted|contains no/u);
});

// ---------------------------------------------------------------------------
// The explicit `--policy` route reaches the same read by a different door.
// ---------------------------------------------------------------------------

test("usability · --policy naming a directory is an enforcement error, not a crash", async () => {
  // Discovery is bypassed entirely here: the marker filter never sees this path. Repairing only the
  // filter would leave the identical uncaught EISDIR on this route.
  const r = await settle({ "project-policy.yml": "dir" }, { explicitPolicy: "project-policy.yml" });

  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
  assert.match(r.detail, /project-policy\.yml/u, "the named path is not reported back");
  assert.match(r.detail, /directory|not a (regular )?file/iu,
    "the caller is told the read failed but not that the path is a directory. Catching the " +
    "exception is enough to keep the invariant; it is not enough to tell an operator where to " +
    "look, and 'could not be read' sends them to permissions");
  assert.equal(r.passing, false);
});

// ---------------------------------------------------------------------------
// A regular file that genuinely cannot be read.
//
// Probed rather than assumed. Windows does not honour a 0o000 mode, and a container running as root
// reads the file regardless — in both cases the case cannot be established, and saying so is more
// honest than a green tick over an assertion that never ran.
// ---------------------------------------------------------------------------

const UNREADABLE_UNSUPPORTED = (() => {
  const d = mkdtempSync(path.join(tmpdir(), "marker-probe-"));
  const f = path.join(d, "probe");
  try {
    writeFileSync(f, "x");
    chmodSync(f, 0o000);
    readFileSync(f);
    return "this platform or user reads a 0o000 file anyway — Windows ignores the mode and root " +
      "bypasses it — so an unreadable regular file cannot be created here. NOT simulated.";
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") return false;
    return `the probe could not establish an unreadable file: ${e?.code ?? e?.message}`;
  } finally {
    try { chmodSync(f, 0o600); } catch { /* best effort */ }
    rmSync(d, { recursive: true, force: true });
  }
})();

test("usability · a marker that exists but cannot be read is an enforcement error",
  { skip: UNREADABLE_UNSUPPORTED }, async () => {
    const r = await settle({ "project-policy.yml": "unreadable" });

    assert.equal(r.state, STATE.ENFORCEMENT_ERROR,
      "a policy the enforcer was refused permission to read produced some other state");
    assert.notEqual(r.state, STATE.NOT_ADOPTED, "a permission failure is not an absence");
    assert.match(r.detail, /project-policy\.yml/u);
  });

// ---------------------------------------------------------------------------
// AN UNREADABLE REGULAR FILE IS AN UNRESOLVED CANDIDATE, NOT AN OBSTRUCTION.
//
// The first version of this change treated every occupied-but-unusable name alike, and concluded
// that one readable policy beside one obstructed name still evaluates. For a DIRECTORY that holds:
// a directory cannot itself be the governing policy document, so it was never a competitor and
// excluding it invents nothing.
//
// It does not hold for an unreadable REGULAR FILE. That file has exactly the shape a governing
// policy has. Whether it is one is unknown — its bytes were never read — and the contract declares
// no precedence among the names, so choosing the readable one is not selection but manufacture: the
// run would report a verdict against one policy while a second candidate of unknown content sat
// beside it under a name the pack itself admits.
//
// INV-E1, applied one notch more precisely than before: unreadable is UNKNOWN, and an unknown may
// not be converted into a uniquely selected policy.
// ---------------------------------------------------------------------------

test("ambiguity · a readable marker beside an unreadable one cannot be resolved",
  { skip: UNREADABLE_UNSUPPORTED }, async () => {
    const r = await settle(
      { "project-policy.yml": "unreadable", "project-policy.yaml": "file" },
      { policyFiles: ["project-policy.yml", "project-policy.yaml"] });

    assert.notEqual(r.state, STATE.EVALUATED,
      "the run evaluated the readable marker while a second declared name held a regular file " +
      "whose bytes are unknown. With no declared precedence that is manufactured certainty, not " +
      "resolution");
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.match(r.detail, /project-policy\.yml/u, "the unresolved candidate is not named");
    assert.equal(r.passing, false);
  });

test("ambiguity · the converse ordering refuses identically, so position decides nothing",
  { skip: UNREADABLE_UNSUPPORTED }, async () => {
    // Same declaration order, opposite readability. If the two disagree, the answer is being decided
    // by where a name sits in `policyFiles` — which the contract explicitly says is not precedence.
    const first = await settle(
      { "project-policy.yml": "unreadable", "project-policy.yaml": "file" },
      { policyFiles: ["project-policy.yml", "project-policy.yaml"] });
    const second = await settle(
      { "project-policy.yml": "file", "project-policy.yaml": "unreadable" },
      { policyFiles: ["project-policy.yml", "project-policy.yaml"] });

    // Asserted absolutely as well as equally. `first.state === second.state` is satisfied when both
    // are EVALUATED, which is precisely the defect, so equality alone would pass against it.
    assert.equal(first.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(second.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(first.state, second.state,
      "the outcome changed with which declared position held the unreadable file");
    assert.match(second.detail, /project-policy\.yaml/u,
      "the unresolved candidate is not named when it is the second declared marker");
  });

test("ambiguity · the refusal says the bytes are unknown, not that the file is missing",
  { skip: UNREADABLE_UNSUPPORTED }, async () => {
    const r = await settle(
      { "project-policy.yml": "unreadable", "project-policy.yaml": "file" },
      { policyFiles: ["project-policy.yml", "project-policy.yaml"] });

    assert.doesNotMatch(r.detail, /has not adopted|contains no/u,
      "an unreadable file was described as absence");
    assert.match(r.detail, /precedence|which one governs|cannot be established|unknown/iu,
      "the detail does not explain that the obstacle is an unresolved second candidate, which is " +
      "what tells an operator to fix the permissions rather than delete a file");
  });

// ---------------------------------------------------------------------------
// Controls. The remedy must narrow what counts as a marker without breaking anything that already
// worked, and without turning every unusual tree into an error.
// ---------------------------------------------------------------------------

test("control · absence is still absence", async () => {
  const r = await settle({});

  assert.equal(r.state, STATE.NOT_ADOPTED,
    "obstruction handling swallowed the genuine no-policy case, which is the only case " +
    "NOT_ADOPTED exists for");
});

test("control · an ordinary policy file is still adoption", async () => {
  const r = await settle({ "project-policy.yml": "file" });

  assert.equal(r.state, STATE.EVALUATED, "the remedy made a perfectly ordinary repository unusable");
  assert.equal(r.report.policyBody, POLICY_BODY.trim(),
    "the evaluator was handed the policy whose presence established adoption");
});

test("control · one real marker beside a DIRECTORY at a sibling name still evaluates", async () => {
  // Two declared markers, one occupied by a directory. Exactly one is a policy, so there is nothing
  // to arbitrate: the ambiguity refusal is for two CANDIDATES, and a directory cannot itself be a
  // governing policy document. This is the boundary the unreadable-file arms above sit on the other
  // side of — a directory is excluded on what it IS, an unreadable file only on what could not be
  // read, and only the first is knowable without reading it.
  const r = await settle(
    { "project-policy.yml": "dir", "project-policy.yaml": "file" },
    { policyFiles: ["project-policy.yml", "project-policy.yaml"] });

  assert.equal(r.state, STATE.EVALUATED,
    "a directory sharing a declared name was counted as a competing candidate, so a repository " +
    "with exactly one policy was refused for ambiguity");
  assert.match(r.report.policyRead, /project-policy\.yaml$/u,
    "the run did not evaluate the one marker that is actually a policy");
});

test("control · two real markers are still ambiguous, because that rule is untouched", async () => {
  const r = await settle(
    { "project-policy.yml": "file", "project-policy.yaml": "file" },
    { policyFiles: ["project-policy.yml", "project-policy.yaml"] });

  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
  assert.match(r.detail, /precedence/u,
    "the ambiguity refusal lost its reason, which suggests it is now being reached by the " +
    "obstruction path rather than its own");
});
