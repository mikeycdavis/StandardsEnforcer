/**
 * The cache under concurrent use by independent processes.
 *
 * The falsifier for [FE-15](../artifacts/backlog/items/FE-15.md), written against
 * [ADR 0006](../artifacts/adr/0006-the-cache-is-shared-and-coordination-is-not-authority.md) and
 * before any remedy exists.
 *
 * WHY THREE ARMS, AND WHY NOT ALL THREE ARE EXPECTED RED. Only Arm 1 is the defect. Arms 2 and 3 are
 * negative controls: they pin guarantees the product *already* has, so that a fix for Arm 1 cannot
 * quietly buy determinism by giving them up. Forcing all three red would have meant weakening the
 * code to manufacture a failure, and a falsifier that damages the thing it measures is measuring
 * itself.
 *
 *   Arm 1  same identity, two processes   the race                     — the defect
 *   Arm 2  a tampered verified entry      coordination is not trust    — control on ADR 0006 rule 5
 *   Arm 3  two different identities       no global serialisation      — control on granularity
 *
 * The remedy has to turn Arm 1 green while leaving Arms 2 and 3 green. A lock that made Arm 1 pass by
 * letting its holder skip re-verification would break Arm 2, which is `.enforcer-complete` returning
 * under a new name. A lock taken over the whole cache would break Arm 3.
 *
 * Every assertion is about an OUTCOME, never a mechanism. Neither locking nor any other coordination
 * strategy is named, because the remedy is chosen from what the reproduction shows — and a test that
 * named the fix in advance would be a test of the fix rather than of the guarantee.
 *
 * These tests build their own git repositories and their own cache roots, so they cannot skip
 * themselves into silence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { materialise } from "../scripts/identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "test-support", "materialise-once.mjs");

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

/** Two real releases, so "a different identity" is an available fixture rather than a hypothetical. */
async function twoReleases(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "fe15-authority-"));
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "fe15-cache-"));
  try {
    git(["init", "--quiet", "-b", "main"], dir);
    git(["config", "user.email", "test@example.invalid"], dir);
    git(["config", "user.name", "FE-15"], dir);
    git(["config", "commit.gpgsign", "false"], dir);

    await writeFile(path.join(dir, "VERSION"), "1.0.0\n");
    await writeFile(path.join(dir, "payload.txt"), "the approved bytes\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "first release"], dir);
    git(["tag", "-a", "v1.0.0", "-m", "first"], dir);

    await writeFile(path.join(dir, "VERSION"), "2.0.0\n");
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "second release"], dir);
    git(["tag", "-a", "v2.0.0", "-m", "second"], dir);

    return await fn({
      dir,
      cacheRoot,
      first: git(["rev-list", "-n", "1", "v1.0.0"], dir),
      second: git(["rev-list", "-n", "1", "v2.0.0"], dir),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

/** Run `materialise()` in a separate process, released at a shared wall-clock instant. */
function materialiseInChildProcess(repo, sha, cacheRoot, barrier) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, repo, sha, cacheRoot, String(barrier)], {
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`runner exited ${code}: ${err || "(no stderr)"}`));
      try {
        resolve(JSON.parse(out.trim()));
      } catch (e) {
        reject(new Error(`runner printed no result (${e.message}): ${out}${err}`));
      }
    });
  });
}

/** Is this directory, right now, that commit — asked from outside the module under test. */
function directoryIsCommit(dir, sha) {
  if (!existsSync(path.join(dir, ".git"))) return false;
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: dir, windowsHide: true });
  const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8", cwd: dir, windowsHide: true });
  return head.status === 0 && (head.stdout || "").trim() === sha
    && status.status === 0 && (status.stdout || "").trim() === "";
}

const RELEASE_DELAY_MS = 400;

// ===========================================================================
// Arm 1 — the defect. Two processes, one shared root, one release identity.
// ===========================================================================

test("arm 1 · two processes materialising the same identity both complete, and neither invalidates the other", async () => {
  await twoReleases(async ({ dir, cacheRoot, first }) => {
    // Repair pressure, deliberately induced. Both processes will find an entry that exists and does
    // not verify, so both must rebuild it — which is precisely the window FE-13 narrowed and
    // explicitly did not close: "there is no cross-process lock. Two runs can still repair the same
    // identity concurrently."
    const seeded = materialise(dir, first, cacheRoot);
    assert.equal(seeded.ok, true, "the fixture could not be seeded");
    await writeFile(path.join(cacheRoot, first, "payload.txt"), "tampered before the race\n");

    const barrier = Date.now() + RELEASE_DELAY_MS;
    const [a, b] = await Promise.all([
      materialiseInChildProcess(dir, first, cacheRoot, barrier),
      materialiseInChildProcess(dir, first, cacheRoot, barrier),
    ]);

    // The property, stated as an outcome. Repair and refusal are both acceptable ways to be correct
    // about a broken entry -- but neither process may be made to fail BY THE OTHER. Two processes
    // asking for the same valid release must both get it.
    const failures = [a, b].filter((r) => !r.ok).map((r) => r.why);
    assert.deepEqual(
      failures, [],
      "a process was defeated by a concurrent one materialising the same identity:\n  " +
        failures.join("\n  "),
    );

    for (const r of [a, b]) {
      assert.equal(r.dir, path.join(cacheRoot, first));
      assert.equal(directoryIsCommit(r.dir, first), true,
        "a process was handed a directory that is not the requested commit");
    }
  });
});

// ===========================================================================
// Arm 2 — negative control. Coordination must never stand in for verification.
// ===========================================================================

test("arm 2 · a tampered entry is not trusted, however the entry came to be there", async () => {
  await twoReleases(async ({ dir, cacheRoot, first }) => {
    const built = materialise(dir, first, cacheRoot);
    assert.equal(built.ok, true);
    assert.equal(directoryIsCommit(built.dir, first), true, "the fixture did not start out valid");

    // Tamper AFTER a successful materialisation and after any coordination it held has been
    // released -- the exact case a future lock could be argued to make unnecessary. Re-entry goes
    // through the ordinary path; nothing here reaches inside it.
    await writeFile(path.join(cacheRoot, first, "payload.txt"), "not the approved bytes\n");

    const again = materialise(dir, first, cacheRoot);

    // Refusal and repair both satisfy the property. Returning the tampered tree does not, and
    // neither does returning `cached: true` for a directory that no longer verifies.
    if (again.ok) {
      assert.equal(directoryIsCommit(again.dir, first), true,
        "a tampered entry was handed back as though it were the requested commit");
      assert.notEqual(again.cached, true,
        "a directory that no longer verified was served as a cache hit");
    } else {
      assert.ok(again.why, "a refusal must say why");
    }
  });
});

test("arm 2b · the same holds for a real checkout of a different commit", async () => {
  await twoReleases(async ({ dir, cacheRoot, first, second }) => {
    const built = materialise(dir, first, cacheRoot);
    assert.equal(built.ok, true);

    // Not corruption -- a valid repository at the wrong identity, which is the failure a
    // content-addressed name is supposed to make impossible and a marker file cannot detect.
    git(["checkout", "--detach", "--quiet", second], built.dir);
    assert.equal(directoryIsCommit(built.dir, first), false, "the fixture was not actually moved");

    const again = materialise(dir, first, cacheRoot);
    if (again.ok) {
      assert.equal(directoryIsCommit(again.dir, first), true,
        "an entry at a different commit was served for the requested identity");
    }
  });
});

// ===========================================================================
// Arm 3 — negative control. Granularity: unrelated releases must not serialise.
// ===========================================================================

test("arm 3 · two different identities materialise concurrently, not one after the other", async () => {
  await twoReleases(async ({ dir, cacheRoot, first, second }) => {
    const barrier = Date.now() + RELEASE_DELAY_MS;
    const [a, b] = await Promise.all([
      materialiseInChildProcess(dir, first, cacheRoot, barrier),
      materialiseInChildProcess(dir, second, cacheRoot, barrier),
    ]);

    assert.equal(a.ok, true, `first release failed: ${a.why}`);
    assert.equal(b.ok, true, `second release failed: ${b.why}`);
    assert.equal(directoryIsCommit(a.dir, first), true);
    assert.equal(directoryIsCommit(b.dir, second), true);
    assert.notEqual(a.dir, b.dir, "two identities shared a materialisation");

    // Both succeeding is not enough: a global lock would also produce two successes, one after the
    // other. Overlap is what distinguishes per-identity coordination from serialising the cache, and
    // it is asserted here so that a future remedy cannot buy Arm 1 by taking the whole root.
    const overlap = Math.min(a.finishedAt, b.finishedAt) - Math.max(a.startedAt, b.startedAt);
    assert.ok(overlap > 0,
      `unrelated releases did not materialise concurrently (overlap ${overlap}ms) — ` +
        "coordination appears to be global rather than per identity");
  });
});
