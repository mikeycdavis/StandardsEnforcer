/**
 * Provenance: an identity is exact, and nothing is read out of a checkout that failed verification.
 *
 * WHAT THIS FILE IS NOT. Tag kinds — annotated versus lightweight, and the tag-object SHA that looks
 * exactly like an answer — are locked in `identity-tags.test.mjs`, which owns that ground completely.
 * Two files asserting one behaviour is how two files come to disagree about it, so this one asserts
 * what that one does not: the surrounding refusals, and the ordering ADR 0005 depends on.
 *
 * The ordering is the load-bearing part. ADR 0005 puts the adapter inside the identity chain rather
 * than beside it — the contract is read from the verified checkout and nowhere else. That guarantee
 * is only worth anything if a failed identity produces no checkout to read from in the first place,
 * which is asserted here rather than assumed by the code that will rely on it.
 *
 * These tests build their own git repositories. They depend on no sibling repository, so they cannot
 * skip themselves into silence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { verifyTagResolvesTo, resolveIdentity } from "../scripts/identity.mjs";

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

async function released(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "provenance-"));
  try {
    git(["init", "--quiet", "-b", "main"], dir);
    git(["config", "user.email", "test@example.invalid"], dir);
    git(["config", "user.name", "Provenance Test"], dir);
    git(["config", "commit.gpgsign", "false"], dir);
    await writeFile(path.join(dir, "VERSION"), "1.0.0\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "the released commit"], dir);
    git(["tag", "-a", "v1.0.0", "-m", "annotated release"], dir);
    return await fn({
      dir,
      commit: git(["rev-parse", "HEAD"], dir),
      tagObject: git(["rev-parse", "v1.0.0"], dir),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withCache(fn) {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "provenance-cache-"));
  try {
    return await fn(cacheRoot);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

// ===========================================================================
// An identity is exact or it is nothing
// ===========================================================================

test("an abbreviated SHA is not an identity", async () => {
  await released(({ dir, commit }) => {
    const r = verifyTagResolvesTo(dir, "v1.0.0", commit.slice(0, 12));
    assert.equal(r.ok, false);
    assert.match(r.why, /40-character/);
  });
});

test("a tag that does not exist reports git's own reason, not a generic one", async () => {
  // "the tag does not exist" and "this is not a repository" lead to different actions, and reporting
  // the second as the first tells an operator something untrue.
  await released(({ dir, commit }) => {
    const r = verifyTagResolvesTo(dir, "v9.9.9", commit);
    assert.equal(r.ok, false);
    assert.match(r.why, /v9\.9\.9/);
  });
});

test("an ordinary mismatch is not misdiagnosed as the tag-object mistake", async () => {
  // The tailored diagnosis must be earned by the tag object actually matching. An unrelated wrong
  // SHA told "you used the tag object" sends a reader hunting for a mistake they did not make, which
  // is worse than the plain mismatch it replaced.
  await released(({ dir }) => {
    const { why } = verifyTagResolvesTo(dir, "v1.0.0", "0".repeat(40));
    assert.doesNotMatch(why, /annotated tag object/);
    assert.match(why, /resolves to/);
  });
});

// ===========================================================================
// ADR 0005 — bytes verified are bytes executed, and nothing else is readable
// ===========================================================================

test("the cache entry is named by the commit it contains", async () => {
  // Content-addressing is what makes "this adapter came from the verified release" checkable rather
  // than trusted: an entry cannot belong to another identity, because its name is what it holds.
  await released(async ({ dir, commit }) => {
    await withCache((cacheRoot) => {
      const r = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: commit, cacheRoot });
      assert.equal(r.ok, true, r.why ?? "");
      assert.equal(path.basename(r.dir), commit);
      assert.equal(git(["rev-parse", "HEAD"], r.dir), commit,
        "the tree about to be executed must be the commit that was verified");
    });
  });
});

test("a failed identity materialises nothing, so there is no checkout to read an adapter from", async () => {
  // ADR 0005 reads the contract only from a verified checkout. That is only a guarantee if a failed
  // identity leaves no checkout at all — otherwise "verified" degrades into "present".
  await released(async ({ dir, tagObject }) => {
    await withCache((cacheRoot) => {
      const r = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: tagObject, cacheRoot });
      assert.equal(r.ok, false);
      assert.equal(r.dir, null, "no checkout may exist for an identity that failed verification");
      assert.deepEqual(readdirSync(cacheRoot), [], "nothing was materialised, so nothing can be read");
    });
  });
});

test("two identities never share a cache entry", async () => {
  // The ninth hostile provenance case in ADR 0005: an adapter cached for one standards version must
  // not be reachable when another identity resolves.
  await released(async ({ dir, commit }) => {
    await withCache(async (cacheRoot) => {
      const first = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: commit, cacheRoot });
      assert.equal(first.ok, true, first.why ?? "");

      await writeFile(path.join(dir, "VERSION"), "1.0.1\n");
      git(["add", "-A"], dir);
      git(["commit", "--quiet", "-m", "a later release"], dir);
      git(["tag", "-a", "v1.0.1", "-m", "the next one"], dir);
      const later = git(["rev-list", "-n", "1", "v1.0.1"], dir);

      const second = resolveIdentity({ repo: dir, tag: "v1.0.1", sha: later, cacheRoot });
      assert.equal(second.ok, true, second.why ?? "");
      assert.notEqual(second.dir, first.dir, "a second identity reused the first identity's tree");
      assert.deepEqual(readdirSync(cacheRoot).sort(), [commit, later].sort());
    });
  });
});
