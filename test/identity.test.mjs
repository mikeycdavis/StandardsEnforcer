/**
 * Release identity is the commit, not the tag object.
 *
 * WHY THIS FILE EXISTS. `git rev-parse v1.0.0` on an annotated tag returns the **tag object's** SHA.
 * `git rev-list -n 1 v1.0.0` returns the **commit** it points at. Two different 40-character hex
 * strings for one release, both stable, both plausible, and only one of them is what a release
 * identity means.
 *
 * The mistake has been made twice independently in this project: the M2 Phase 0 inventory recorded
 * tag-object SHAs for all six tagged packs, and the adapter lineage review found the same defect from
 * the other direction. Both times it was caught by reading. Twice is enough — it becomes executable
 * here, because the third time nobody may be reading.
 *
 * These tests build their own git repositories in a scratch directory. They depend on no sibling
 * repository, so they cannot skip themselves into silence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { verifyTagResolvesTo, resolveIdentity } from "../scripts/identity.mjs";

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

/**
 * A repository with one commit carrying both an annotated and a lightweight tag, so the two forms
 * are compared against the same commit rather than against two different histories.
 */
async function repoWithTags(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "identity-"));
  try {
    git(["init", "--quiet", "-b", "main"], dir);
    git(["config", "user.email", "test@example.invalid"], dir);
    git(["config", "user.name", "Identity Test"], dir);
    git(["config", "commit.gpgsign", "false"], dir);
    await writeFile(path.join(dir, "VERSION"), "1.0.0\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "the released commit"], dir);

    const commit = git(["rev-parse", "HEAD"], dir);
    git(["tag", "-a", "v1.0.0", "-m", "annotated release"], dir);
    git(["tag", "v1.0.0-lightweight"], dir);

    return await fn({
      dir,
      commit,
      annotatedTagObject: git(["rev-parse", "v1.0.0"], dir),
      lightweightRef: git(["rev-parse", "v1.0.0-lightweight"], dir),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// The regression itself
// ===========================================================================

test("an annotated tag has two SHAs, and they are genuinely different", async () => {
  // If this ever fails the rest of the file proves nothing, so it is asserted rather than assumed.
  await repoWithTags(({ commit, annotatedTagObject }) => {
    assert.notEqual(annotatedTagObject, commit,
      "an annotated tag object must not equal its commit, or this whole class of error is untestable");
  });
});

test("identity is the commit the tag dereferences to", async () => {
  await repoWithTags(({ dir, commit }) => {
    const r = verifyTagResolvesTo(dir, "v1.0.0", commit);
    assert.equal(r.ok, true, r.why ?? "");
    assert.equal(r.resolved, commit);
  });
});

test("the annotated tag object's own SHA is REJECTED as an identity", async () => {
  // The defect, executable. A configuration recording `git rev-parse <tag>` must fail here rather
  // than resolve to something that then runs.
  await repoWithTags(({ dir, commit, annotatedTagObject }) => {
    const r = verifyTagResolvesTo(dir, "v1.0.0", annotatedTagObject);
    assert.equal(r.ok, false, "a tag-object SHA was accepted as a release identity");
    assert.equal(r.resolved, commit, "the failure must report the commit actually reached");
  });
});

test("the tag-object mistake is named, not merely reported as a mismatch", async () => {
  // A bare "these two SHAs differ" is true and costs an afternoon, because both strings look equally
  // like an answer. This mistake has been made twice here, so the diagnosis is part of the contract
  // rather than a nicety, and the message must carry the commit to use instead.
  await repoWithTags(({ dir, commit, annotatedTagObject }) => {
    const { why } = verifyTagResolvesTo(dir, "v1.0.0", annotatedTagObject);
    assert.match(why, /annotated tag object/, "the specific mistake is not named");
    assert.ok(why.includes(commit), "the diagnosis must name the commit to use instead");
  });
});

test("a mismatch that is NOT the tag-object mistake is not misdiagnosed as one", async () => {
  // The tailored message must be earned by the tag object actually matching. An unrelated wrong SHA
  // told "you used the tag object" would send a reader looking for a mistake they did not make.
  await repoWithTags(({ dir }) => {
    const { why } = verifyTagResolvesTo(dir, "v1.0.0", "0".repeat(40));
    assert.doesNotMatch(why, /annotated tag object/);
    assert.match(why, /resolves to/);
  });
});

test("a lightweight tag resolves to the same commit, and is equally acceptable", async () => {
  // Stated as a decision in ADR 0005: the identity is the commit, and how git stores the label
  // pointing at it is a storage detail. Both forms are supported on purpose, not by oversight.
  await repoWithTags(({ dir, commit, lightweightRef }) => {
    assert.equal(lightweightRef, commit, "a lightweight tag points straight at the commit");
    const r = verifyTagResolvesTo(dir, "v1.0.0-lightweight", commit);
    assert.equal(r.ok, true, r.why ?? "");
    assert.equal(r.resolved, commit);
  });
});

test("both tag forms of one commit yield one identity", async () => {
  await repoWithTags(({ dir, commit }) => {
    const annotated = verifyTagResolvesTo(dir, "v1.0.0", commit);
    const lightweight = verifyTagResolvesTo(dir, "v1.0.0-lightweight", commit);
    assert.equal(annotated.resolved, lightweight.resolved,
      "the tag form must not change which commit a release identity names");
  });
});

// ===========================================================================
// The surrounding refusals — an identity is exact or it is nothing
// ===========================================================================

test("an abbreviated SHA is not an identity", async () => {
  await repoWithTags(({ dir, commit }) => {
    const r = verifyTagResolvesTo(dir, "v1.0.0", commit.slice(0, 12));
    assert.equal(r.ok, false);
    assert.match(r.why, /40-character/);
  });
});

test("a tag that does not exist reports git's reason, not a generic one", async () => {
  await repoWithTags(({ dir, commit }) => {
    const r = verifyTagResolvesTo(dir, "v9.9.9", commit);
    assert.equal(r.ok, false);
    assert.match(r.why, /v9\.9\.9/);
  });
});

test("a moved tag fails rather than silently naming the new commit", async () => {
  // The reason the SHA is in the triple at all. A tag is mutable; the identity is not.
  await repoWithTags(async ({ dir, commit }) => {
    await writeFile(path.join(dir, "VERSION"), "1.0.1\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "a commit the release never contained"], dir);
    git(["tag", "-f", "-a", "v1.0.0", "-m", "moved"], dir);

    const moved = git(["rev-list", "-n", "1", "v1.0.0"], dir);
    assert.notEqual(moved, commit, "the tag must actually have moved for this to test anything");

    const r = verifyTagResolvesTo(dir, "v1.0.0", commit);
    assert.equal(r.ok, false, "a moved tag was accepted against the original identity");
    assert.equal(r.resolved, moved);
  });
});

// ===========================================================================
// ADR 0005 — what is materialised is what was verified
// ===========================================================================

test("the materialised checkout is the identified commit, and is detached from the tag", async () => {
  await repoWithTags(async ({ dir, commit }) => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), "identity-cache-"));
    try {
      const r = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: commit, cacheRoot });
      assert.equal(r.ok, true, r.why ?? "");
      assert.equal(git(["rev-parse", "HEAD"], r.dir), commit,
        "the tree about to be executed must be the commit that was verified");
      // ADR 0005: bytes verified are bytes executed. The cache is keyed by the SHA, so an entry
      // cannot belong to another identity.
      assert.equal(path.basename(r.dir), commit,
        "the cache entry is named by what it contains, so it cannot be stale or cross-identity");
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });
});

test("resolution refuses before materialising when the identity does not verify", async () => {
  // ADR 0005 orders the chain: identity failure occurs BEFORE anything is read out of a checkout,
  // including the adapter. Nothing may be materialised for an identity that was never established.
  await repoWithTags(async ({ dir, annotatedTagObject }) => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), "identity-cache-"));
    try {
      const r = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: annotatedTagObject, cacheRoot });
      assert.equal(r.ok, false);
      assert.equal(r.dir, null, "no checkout may exist for an identity that failed verification");
      const { readdirSync } = await import("node:fs");
      assert.deepEqual(readdirSync(cacheRoot), [], "nothing was materialised, so nothing can be read");
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });
});
