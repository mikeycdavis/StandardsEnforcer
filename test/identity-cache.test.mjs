/**
 * The cache-hit path, exercised adversarially.
 *
 * WHY THIS FILE EXISTS. `identity-provenance.test.mjs` establishes that a cache entry is named by the
 * commit it contains and that two identities never share one. Both are properties of the moment the
 * entry is *written*. Neither says anything about the second run, which is the run that reads an entry
 * it did not create, out of a directory under `tmpdir()` that nothing has protected in between.
 *
 * FE-13 was found by reading the identity model, not by a test — and that absence is the finding. The
 * cache-hit path had no adversarial coverage at all, so a marker file was permitted to stand in for
 * step 3 of the identity model (*the materialised checkout's HEAD is that SHA*) on every run after the
 * first.
 *
 * THE PROPERTY UNDER TEST, in the owner's wording:
 *
 *   Every execution must establish that the materialised authority's current identity still matches
 *   the authority identity that was resolved and approved for that run. Cached state may avoid
 *   reacquisition, but it may never substitute for identity verification.
 *
 * Each test below therefore asserts an outcome and not a mechanism: either the call refuses, or the
 * directory it hands back is genuinely the requested commit. Repair and refusal both satisfy the
 * property; trusting the marker does not. Written this way on purpose — the remedy is chosen from
 * what the reproduction shows, and a test that named the fix in advance would be a test of the fix
 * rather than of the guarantee.
 *
 * These tests build their own git repositories and their own cache roots, so they cannot skip
 * themselves into silence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { materialise, resolveIdentity } from "../scripts/identity.mjs";

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

/**
 * A standards repository with two releases, so that "a real checkout of a different commit" is an
 * available corruption rather than a hypothetical one.
 */
async function twoReleases(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "cache-authority-"));
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "cache-root-"));
  try {
    git(["init", "--quiet", "-b", "main"], dir);
    git(["config", "user.email", "test@example.invalid"], dir);
    git(["config", "user.name", "Cache Test"], dir);
    git(["config", "commit.gpgsign", "false"], dir);

    await writeFile(path.join(dir, "VERSION"), "1.0.0\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "the approved release"], dir);
    git(["tag", "-a", "v1.0.0", "-m", "approved"], dir);

    await writeFile(path.join(dir, "VERSION"), "1.0.1\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "some other release"], dir);
    git(["tag", "-a", "v1.0.1", "-m", "not the one approved"], dir);

    return await fn({
      dir,
      cacheRoot,
      approved: git(["rev-list", "-n", "1", "v1.0.0"], dir),
      other: git(["rev-list", "-n", "1", "v1.0.1"], dir),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

/**
 * The single assertion every case below shares.
 *
 * A result is acceptable when it refuses, or when the tree it points at really is the requested
 * commit. It is unacceptable when it reports success for a directory that is not that commit — which
 * is the false green, stated once here so no individual case can weaken it by restating it loosely.
 */
function identityEstablishedOrRefused(result, sha, what) {
  if (result.ok === false) return;
  assert.ok(result.dir, `${what}: reported success with no directory`);
  assert.ok(
    existsSync(path.join(result.dir, ".git")),
    `${what}: reported success for a directory that is not a checkout, so no identity can be established from it`,
  );
  assert.equal(
    git(["rev-parse", "HEAD"], result.dir),
    sha,
    `${what}: reported success for a tree that is not the approved authority`,
  );
}

// ===========================================================================
// Case 1 — wrong HEAD: a real checkout of a different commit
// ===========================================================================

test("a cached tree moved to a different commit is not accepted on the strength of its marker", async () => {
  // The sharpest form of the defect. The cache entry is a valid git checkout, the marker is intact and
  // truthful about what was verified once, and the directory name is still the approved SHA — and the
  // bytes about to be executed are a different release entirely.
  await twoReleases(async ({ dir, cacheRoot, approved, other }) => {
    const first = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    assert.equal(first.ok, true, first.why ?? "");
    assert.equal(first.cached, false, "the first run should have populated the cache");

    // Between runs. Nothing protects a directory under tmpdir().
    git(["checkout", "--detach", "--quiet", other], first.dir);
    assert.equal(git(["rev-parse", "HEAD"], first.dir), other, "the reproduction did not take");

    const second = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    identityEstablishedOrRefused(second, approved, "cache hit over a moved HEAD");
  });
});

test("the working tree of a cached checkout may not diverge from the commit it claims", async () => {
  // HEAD alone establishes the commit, not that the files match it. An edited working tree keeps the
  // right HEAD and executes different code, so `rev-parse HEAD` is necessary and is not sufficient.
  await twoReleases(async ({ dir, cacheRoot, approved }) => {
    const first = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    assert.equal(first.ok, true, first.why ?? "");

    await writeFile(path.join(first.dir, "VERSION"), "9.9.9-tampered\n");

    const second = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    if (second.ok) {
      // Compared on content, not on bytes: `core.autocrlf` may rewrite line endings on checkout, and
      // a test that failed on that would be reporting the platform rather than the guarantee.
      const restored = await readFile(path.join(second.dir, "VERSION"), "utf8");
      assert.equal(
        restored.trim(),
        "1.0.0",
        "a cache hit handed back a working tree that does not match the commit it claims to be",
      );
    }
  });
});

// ===========================================================================
// Case 2 — marker metadata that is absent, empty, or lying
// ===========================================================================

test("a marker naming a different SHA than the entry it marks is not evidence", async () => {
  // NOTE ON WHAT THE REPRODUCTION SHOWED. This case and the next one PASSED against the unfixed
  // implementation, and that is the finding, not a gap in the cases. The marker's content was never
  // read, so corrupting it changed nothing — the tree was still the approved commit and the property
  // held. That is what ruled out the obvious-looking remedy of making the marker load-bearing: it
  // would have replaced a marker asserting the tree was verified with a marker asserting it more
  // carefully. They are kept because the property must hold regardless of what the marker says.
  await twoReleases(async ({ dir, cacheRoot, approved, other }) => {
    const first = materialise(dir, approved, cacheRoot);
    assert.equal(first.ok, true, first.why ?? "");

    await writeFile(path.join(cacheRoot, `${approved}.complete`), other);

    const second = materialise(dir, approved, cacheRoot);
    identityEstablishedOrRefused(second, approved, "marker naming another identity");
  });
});

test("an empty marker is not evidence", async () => {
  // Truncation is the ordinary way a marker goes wrong without anyone attacking anything: an
  // interrupted write, a full disk, a killed process.
  await twoReleases(async ({ dir, cacheRoot, approved }) => {
    const first = materialise(dir, approved, cacheRoot);
    assert.equal(first.ok, true, first.why ?? "");

    await writeFile(path.join(cacheRoot, `${approved}.complete`), "");

    const second = materialise(dir, approved, cacheRoot);
    identityEstablishedOrRefused(second, approved, "empty marker");
  });
});

test("the completion marker is not written into the tree it certifies", async () => {
  // The verification is "HEAD is the commit AND the tree matches it". A marker inside the checkout
  // would be a permanent exception carved into that second clause, and an invariant with a standing
  // exception is not one — so the marker lives beside the entry, and the entry stays clean.
  await twoReleases(async ({ dir, cacheRoot, approved }) => {
    const first = materialise(dir, approved, cacheRoot);
    assert.equal(first.ok, true, first.why ?? "");

    assert.equal(
      git(["status", "--porcelain"], first.dir),
      "",
      "the materialised authority contains a file the enforcer put there",
    );
    assert.ok(existsSync(path.join(cacheRoot, `${approved}.complete`)), "the entry was never marked complete");
  });
});

test("an untracked file added to a cached checkout is not tolerated", async () => {
  // The tree check has to catch additions, not only edits. An added file is how a checkout acquires
  // something the commit never contained while every tracked file still matches.
  await twoReleases(async ({ dir, cacheRoot, approved }) => {
    const first = materialise(dir, approved, cacheRoot);
    assert.equal(first.ok, true, first.why ?? "");

    await writeFile(path.join(first.dir, "extra.mjs"), "// not in the release\n");

    const second = materialise(dir, approved, cacheRoot);
    identityEstablishedOrRefused(second, approved, "untracked addition");
    assert.equal(existsSync(path.join(second.dir, "extra.mjs")), false, "the addition survived into the tree handed back");
  });
});

// ===========================================================================
// Repair is re-establishment, not excusal
// ===========================================================================

test("a rejected cache entry is reported, not silently rebuilt", async () => {
  // Content-addressing means a rejected entry is always evidence of something: the directory name
  // could not have gone stale by itself. Discarding it quietly would destroy the only trace.
  await twoReleases(async ({ dir, cacheRoot, approved, other }) => {
    const first = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    assert.equal(first.ok, true, first.why ?? "");
    assert.equal(first.repaired, null, "a clean first run has nothing to repair");

    git(["checkout", "--detach", "--quiet", other], first.dir);

    const second = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    assert.equal(second.ok, true, second.why ?? "");
    assert.ok(second.repaired, "a discarded cache entry left no trace in the result");
    assert.match(second.repaired, new RegExp(other), "the report does not say what the entry actually was");
  });
});

test("repair is verified by the same check, so it cannot become the soft path", async () => {
  // If a rebuild were trusted merely because it is fresh, the hole would reopen one step along. The
  // rebuilt tree goes through `checkoutIsExactly` exactly as the cache hit does.
  await twoReleases(async ({ dir, cacheRoot, approved }) => {
    const first = materialise(dir, approved, cacheRoot);
    assert.equal(first.ok, true, first.why ?? "");

    rmSync(path.join(first.dir, ".git"), { recursive: true, force: true });

    const second = materialise(dir, approved, cacheRoot);
    assert.equal(second.ok, true, second.why ?? "");
    assert.equal(second.cached, false, "a repaired entry must not report itself as a cache hit");
    assert.equal(git(["rev-parse", "HEAD"], second.dir), approved);
    assert.equal(git(["status", "--porcelain"], second.dir), "");
  });
});

// ===========================================================================
// Case 3 — present, superficially well-formed, and proving nothing
// ===========================================================================

test("a marked directory that is not a checkout at all establishes no identity", async () => {
  // The general case the first two are instances of. The entry exists, it is named for the approved
  // SHA, and it carries a complete marker — and there is no repository there to ask.
  await twoReleases(async ({ dir, cacheRoot, approved }) => {
    const first = materialise(dir, approved, cacheRoot);
    assert.equal(first.ok, true, first.why ?? "");

    rmSync(path.join(first.dir, ".git"), { recursive: true, force: true });
    assert.ok(existsSync(path.join(cacheRoot, `${approved}.complete`)), "the marker must survive for this to be the case under test");

    const second = materialise(dir, approved, cacheRoot);
    identityEstablishedOrRefused(second, approved, "marked directory with no repository");
  });
});

test("a cache entry belonging to another run's authority is not reachable by marker alone", async () => {
  // The acceptance property names *the authority resolved and approved for that run*. A tree that is
  // internally consistent — a genuine checkout, correct marker, HEAD matching its own contents — still
  // fails the property if it is not the identity this run approved.
  await twoReleases(async ({ dir, cacheRoot, approved, other }) => {
    const foreign = materialise(dir, other, cacheRoot);
    assert.equal(foreign.ok, true, foreign.why ?? "");

    // Same bytes, filed under the approved SHA's name: a cache poisoned without corrupting anything.
    const impostor = path.join(cacheRoot, approved);
    spawnSync("git", ["clone", "--quiet", "--no-hardlinks", foreign.dir, impostor], { windowsHide: true });
    git(["checkout", "--detach", "--quiet", other], impostor);
    await writeFile(path.join(impostor, ".enforcer-complete"), approved);

    const second = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: approved, cacheRoot });
    identityEstablishedOrRefused(second, approved, "entry filed under another identity's name");
  });
});
