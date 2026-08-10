/**
 * Tag kinds, locked permanently.
 *
 * A lightweight tag is a ref pointing straight at a commit; `rev-parse` and `rev-list -n 1` agree.
 * An **annotated** tag is an object of its own — tagger, date, message — and `rev-parse` returns
 * *that object's* SHA, not the commit's. Both look like a 40-character hex answer to "what does this
 * tag resolve to", and only one of them is the identity of the implementation that runs.
 *
 * This is not hypothetical. Every tagged pack in the C-track interface inventory was recorded with
 * its tag-object SHA under a column headed "SHA" — MachineLearningStandards as `4860e34` where
 * `v1.4.0` is the commit `6bfd078`, and the same for five others. An identity triple built from that
 * table produces STANDARDS_IDENTITY_MISMATCH for every pack.
 *
 * The system caught it, which is the point of having the check. These fixtures make sure it always
 * does, for both tag kinds, built with real git rather than with recorded strings — a fixture that
 * cannot itself be wrong about what git does.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { verifyTagResolvesTo, resolveIdentity } from "../scripts/identity.mjs";

const git = (args, cwd) => {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return (r.stdout || "").trim();
};

/**
 * A repository with one commit carrying both a lightweight and an annotated tag on it.
 *
 * Same commit deliberately, so the only variable between the two cases is the tag kind.
 */
async function taggedRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-tags-"));
  try {
    git(["init", "--quiet", "-b", "main"], dir);
    git(["config", "user.email", "t@example.invalid"], dir);
    git(["config", "user.name", "T"], dir);
    git(["config", "commit.gpgsign", "false"], dir);
    git(["config", "tag.gpgsign", "false"], dir);
    await writeFile(path.join(dir, "VERSION"), "1.0.0\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "release"], dir);
    const commit = git(["rev-parse", "HEAD"], dir);

    git(["tag", "light-v1.0.0"], dir);
    git(["tag", "-a", "v1.0.0", "-m", "Release 1.0.0"], dir);

    const tagObject = git(["rev-parse", "v1.0.0"], dir);
    const lightObject = git(["rev-parse", "light-v1.0.0"], dir);
    return await fn({ dir, commit, tagObject, lightObject });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("tags · an annotated tag's object SHA is not the commit, and the fixture proves it", async () => {
  await taggedRepo(({ commit, tagObject, lightObject }) => {
    assert.notEqual(tagObject, commit, "an annotated tag must be an object of its own for this suite to mean anything");
    assert.equal(lightObject, commit, "a lightweight tag is the commit");
  });
});

test("tags · an annotated tag verifies against the commit it points at", async () => {
  await taggedRepo(({ dir, commit }) => {
    const r = verifyTagResolvesTo(dir, "v1.0.0", commit);
    assert.equal(r.ok, true, r.why);
    assert.equal(r.resolved, commit);
  });
});

test("tags · the annotated tag OBJECT is refused, and the message says which mistake it is", async () => {
  await taggedRepo(({ dir, commit, tagObject }) => {
    const r = verifyTagResolvesTo(dir, "v1.0.0", tagObject);
    assert.equal(r.ok, false, "the tag object is not the identity of what runs");
    assert.equal(r.resolved, commit, "the report must still name the commit the caller should have used");
    assert.match(r.why, /annotated tag object/);
    assert.match(r.why, new RegExp(commit));
  });
});

test("tags · a lightweight tag verifies, and both kinds resolve to the same commit", async () => {
  await taggedRepo(({ dir, commit }) => {
    const light = verifyTagResolvesTo(dir, "light-v1.0.0", commit);
    const annotated = verifyTagResolvesTo(dir, "v1.0.0", commit);
    assert.equal(light.ok, true, light.why);
    assert.equal(annotated.ok, true, annotated.why);
    assert.equal(light.resolved, annotated.resolved,
      "the tag kind is a property of the tag, never of the identity it establishes");
  });
});

test("tags · an identity built from an annotated tag materialises the commit", async () => {
  await taggedRepo(async ({ dir, commit }) => {
    const cache = await mkdtemp(path.join(tmpdir(), "enforcer-tags-cache-"));
    try {
      const id = resolveIdentity({ repo: dir, tag: "v1.0.0", sha: commit, cacheRoot: cache });
      assert.equal(id.ok, true, id.why);
      assert.equal(git(["rev-parse", "HEAD"], id.dir), commit,
        "what was materialised is the commit, not anything the tag object could have redirected");
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });
});

test("tags · a moved tag is caught even when the old commit is still reachable", async () => {
  // The reason step 1 and step 3 are both checked. A tag that moves between release and enforcement
  // is the mutable-identity problem the triple exists to close.
  await taggedRepo(async ({ dir, commit }) => {
    await writeFile(path.join(dir, "VERSION"), "1.0.1\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "sneak"], dir);
    git(["tag", "-f", "-a", "v1.0.0", "-m", "moved"], dir);

    const r = verifyTagResolvesTo(dir, "v1.0.0", commit);
    assert.equal(r.ok, false);
    assert.match(r.why, /resolves to/);
    assert.notEqual(r.resolved, commit);
  });
});
