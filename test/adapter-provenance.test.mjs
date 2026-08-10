/**
 * ADR 0005, made executable. All nine hostile cases.
 *
 *     The governed repository supplies evidence; the pinned standards release supplies authority.
 *     No artifact controlled by the governed repository may redefine how that authority is invoked
 *     or how its result is interpreted.
 *
 * Phase 3 implemented the mechanism — `loadAdapter` takes a resolved directory and derives the path
 * itself, so there is no parameter to substitute. That is an argument about the code's shape. These
 * are the attacks, run.
 *
 * The distinction matters because "there is no adapterPath parameter" is a claim about one function,
 * and the property that must hold is about the whole chain: identity, materialisation, cache,
 * entrypoint resolution and invocation. A forged adapter in the target does not need a parameter to
 * be read; it needs only a code path that looks in the wrong place once.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { enforce } from "../scripts/enforce.mjs";
import { STATE } from "../scripts/states.mjs";

const CACHE = path.join(tmpdir(), "enforcer-provenance-cache");

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

const contract = (over = {}) => ({
  schemaVersion: "1.0.0",
  standard: { id: "genuine" },
  evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["judge", "--dir={target}", "--json"] },
  result: { statuses: ["REAL_PASS", "REAL_FAIL"], passing: ["REAL_PASS"] },
  ...over,
});

/** An evaluator that announces which tree it came from, so a substitution cannot hide. */
const evaluator = (marker, status) =>
  `process.stdout.write(JSON.stringify({ status: ${JSON.stringify(status)}, ranFrom: ${JSON.stringify(marker)} }) + "\\n");\n`;

async function commitAll(dir, message, tag) {
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", message], dir);
  if (tag) git(["tag", tag], dir);
}

/** A genuine pack: contract and evaluator committed and tagged. */
async function genuinePack({ status = "REAL_FAIL", declared = contract() } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-genuine-"));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(declared));
  await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("genuine", status));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "t"], dir);
  await commitAll(dir, "genuine release", "v1.0.0");
  return { dir, tag: "v1.0.0", sha: git(["rev-list", "-n", "1", "v1.0.0"], dir) };
}

async function governedTarget(extra = async () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "governed-"));
  await writeFile(path.join(dir, "project-policy.yml"), 'standardVersion: "1.0.0"\nproject: "t"\nexceptions: []\n');
  await extra(dir);
  return dir;
}

const run = (pack, target, over = {}) =>
  enforce({ target, standardsRepo: pack.dir, tag: pack.tag, sha: pack.sha, cacheRoot: CACHE, ...over });

/**
 * Can this platform create a symlink at all?
 *
 * Probed against a throwaway file rather than inferred from `process.platform`, because the answer
 * depends on privilege and developer mode rather than on the OS name — Windows can do it, given
 * either. Kept separate from the fixture so that "the platform cannot" and "the fixture broke" are
 * distinguishable, and only the first is allowed to skip.
 */
function symlinksAvailable() {
  const probe = fs.mkdtempSync(path.join(tmpdir(), "symlink-probe-"));
  try {
    fs.writeFileSync(path.join(probe, "a"), "x");
    fs.symlinkSync(path.join(probe, "a"), path.join(probe, "b"));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

async function withPackAndTarget(fn, targetExtra) {
  const pack = await genuinePack();
  const target = await governedTarget(targetExtra);
  try {
    return await fn(pack, target);
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1–3. Nothing the governed side controls may be read as authority.
// ---------------------------------------------------------------------------

test("1 · a forged adapter in the target, declaring failure to be passing, is ignored", async () => {
  const r = await withPackAndTarget(
    (pack, target) => run(pack, target),
    async (dir) => {
      // The most valuable forgery available: keep the real vocabulary and invert what passes.
      await writeFile(
        path.join(dir, "standards-adapter.json"),
        JSON.stringify(contract({ result: { statuses: ["REAL_PASS", "REAL_FAIL"], passing: ["REAL_FAIL"] } })),
      );
    },
  );
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.authority.status, "REAL_FAIL");
  assert.equal(r.passing, false, "the target's own file decided whether the target passes");
});

test("2 · a forged adapter in the target pointing at a fake evaluator is ignored", async () => {
  const r = await withPackAndTarget(
    (pack, target) => run(pack, target),
    async (dir) => {
      await mkdir(path.join(dir, "scripts"), { recursive: true });
      await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("forged", "REAL_PASS"));
      await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(contract()));
    },
  );
  assert.equal(r.report.ranFrom, "genuine", "the evaluator came from the governed repository");
  assert.equal(r.passing, false);
});

test("3 · an adapter in the target's parent directory is ignored", async () => {
  // The workspace case: a file one level up, where a path built by joining upward would find it.
  const pack = await genuinePack();
  const workspace = await mkdtemp(path.join(tmpdir(), "workspace-"));
  try {
    await writeFile(
      path.join(workspace, "standards-adapter.json"),
      JSON.stringify(contract({ result: { statuses: ["REAL_PASS", "REAL_FAIL"], passing: ["REAL_FAIL"] } })),
    );
    const target = path.join(workspace, "project");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "project-policy.yml"), 'standardVersion: "1.0.0"\nproject: "t"\nexceptions: []\n');
    const r = await run(pack, target);
    assert.equal(r.passing, false);
    assert.equal(r.authority.status, "REAL_FAIL");
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4–5. The right repository is not enough; it must be the right point in time.
// ---------------------------------------------------------------------------

test("4 · a pinned tag without a contract does not fall back to main, which has one", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-latecontract-"));
  const target = await governedTarget();
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("genuine", "REAL_PASS"));
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    await commitAll(dir, "release without a contract", "v1.0.0");
    const sha = git(["rev-list", "-n", "1", "v1.0.0"], dir);

    // main acquires the contract afterwards. The pinned tag must not benefit from it.
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(contract()));
    await commitAll(dir, "declare how this pack is invoked");

    const r = await enforce({ target, standardsRepo: dir, tag: "v1.0.0", sha, cacheRoot: CACHE });
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(r.passing, false);
    assert.match(r.detail, /standards-adapter\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("5 · a contract at another tag of the same repository cannot influence the pinned one", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-twotags-"));
  const target = await governedTarget();
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(contract()));
    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("v1", "REAL_FAIL"));
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    await commitAll(dir, "v1", "v1.0.0");
    const v1 = git(["rev-list", "-n", "1", "v1.0.0"], dir);

    // v2 inverts the passing set and changes the evaluator. Pinning v1 must see none of it.
    await writeFile(
      path.join(dir, "standards-adapter.json"),
      JSON.stringify(contract({ result: { statuses: ["REAL_PASS", "REAL_FAIL"], passing: ["REAL_FAIL"] } })),
    );
    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("v2", "REAL_FAIL"));
    await commitAll(dir, "v2", "v2.0.0");

    const r = await enforce({ target, standardsRepo: dir, tag: "v1.0.0", sha: v1, cacheRoot: CACHE });
    assert.equal(r.report.ranFrom, "v1", "a later tag's evaluator ran");
    assert.equal(r.authority.status, "REAL_FAIL");
    assert.equal(r.passing, false, "a later tag's passing set was applied to an earlier release");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. Identity is established before anything is read out of the checkout.
// ---------------------------------------------------------------------------

test("6 · a SHA disagreeing with the tag fails identity before any adapter is loaded", async () => {
  await withPackAndTarget(async (pack, target) => {
    const r = await run(pack, target, { sha: "0".repeat(40) });
    assert.equal(r.state, STATE.STANDARDS_IDENTITY_MISMATCH);
    assert.equal(r.passing, false);
    // The ordering claim, made checkable: nothing from the checkout appears in the result, because
    // nothing from the checkout was read.
    assert.equal(r.report, undefined, "a report exists, so an evaluator ran despite a failed identity");
    assert.equal(r.authority, undefined, "an authority was recorded despite a failed identity");
  });
});

// ---------------------------------------------------------------------------
// 7. The entrypoint cannot leave the verified tree.
// ---------------------------------------------------------------------------

test("7a · an entrypoint escaping the checkout is rejected", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-escape-"));
  const target = await governedTarget();
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(
      path.join(dir, "standards-adapter.json"),
      JSON.stringify(contract({ evaluation: { entrypoint: "../outside.mjs", arguments: ["judge", "{target}"] } })),
    );
    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("genuine", "REAL_PASS"));
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    await commitAll(dir, "escaping entrypoint", "v1.0.0");
    const r = await enforce({
      target, standardsRepo: dir, tag: "v1.0.0",
      sha: git(["rev-list", "-n", "1", "v1.0.0"], dir), cacheRoot: CACHE,
    });
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(r.passing, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("7b · a symlinked entrypoint pointing outside the checkout does not execute foreign bytes", async (t) => {
  // The case a static path check cannot see, because a path can be entirely well-formed and still
  // resolve elsewhere.
  //
  // Symlink creation requires privilege on Windows and fails EPERM on an ordinary account. Where it
  // is unavailable this reports SKIPPED rather than returning green: a provenance control that was
  // never exercised must not read as one that held. That is the same false-green shape this whole
  // repository exists to refuse, and a vacuous pass here would be the most embarrassing possible
  // place to allow it.
  const outside = await mkdtemp(path.join(tmpdir(), "outside-"));
  const dir = await mkdtemp(path.join(tmpdir(), "pack-symlink-"));
  const target = await governedTarget();
  try {
    await writeFile(path.join(outside, "evil.mjs"), evaluator("outside", "REAL_PASS"));
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    // Capability is probed separately from the fixture, because only one of the two earns a skip.
    // A platform that cannot create symlinks at all leaves this case unverified, and says so. A
    // platform that CAN, but where this fixture then fails, is a broken test and must go red — a
    // skip there would let a real regression hide behind a permission story.
    if (!symlinksAvailable()) {
      t.skip(
        "symlinks unavailable on this platform; case 7b was NOT exercised. " +
          "Run this suite where symlinks can be created before treating symlink escape as established.",
      );
      return;
    }
    await symlink(path.join(outside, "evil.mjs"), path.join(dir, "scripts", "standards.mjs"));
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(contract()));
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    await commitAll(dir, "symlinked entrypoint", "v1.0.0");

    const r = await enforce({
      target, standardsRepo: dir, tag: "v1.0.0",
      sha: git(["rev-list", "-n", "1", "v1.0.0"], dir), cacheRoot: CACHE,
    });
    // Materialisation clones the tagged tree, so the symlink either fails to resolve or is
    // reconstituted inside the cache. Either way the outside bytes must not have run.
    assert.notEqual(r.report?.ranFrom, "outside", "bytes from outside the verified checkout executed");
  } finally {
    await rm(outside, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8–9. The cache is keyed by identity, and holds what the identity contained.
// ---------------------------------------------------------------------------

test("8 · the adapter that is executed is the one the verified commit contains", async () => {
  await withPackAndTarget(async (pack, target) => {
    const first = await run(pack, target);
    assert.equal(first.state, STATE.EVALUATED);

    // Mutate the source repository's working tree after materialisation. The pinned commit is
    // unchanged, so a re-run must produce the same bytes — the cache is content-addressed by SHA and
    // the working tree is not part of the identity.
    await writeFile(
      path.join(pack.dir, "standards-adapter.json"),
      JSON.stringify(contract({ result: { statuses: ["REAL_PASS", "REAL_FAIL"], passing: ["REAL_FAIL"] } })),
    );
    await writeFile(path.join(pack.dir, "scripts", "standards.mjs"), evaluator("mutated", "REAL_FAIL"));

    const second = await run(pack, target);
    assert.equal(second.report.ranFrom, "genuine", "a working-tree edit changed what a pinned run executed");
    assert.equal(second.passing, first.passing);
  });
});

test("9 · two identities never share a materialisation, so one cannot serve the other", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-twoversions-"));
  const target = await governedTarget();
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(contract()));
    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("v1", "REAL_PASS"));
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    await commitAll(dir, "v1", "v1.0.0");
    const v1 = git(["rev-list", "-n", "1", "v1.0.0"], dir);

    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("v2", "REAL_FAIL"));
    await commitAll(dir, "v2", "v2.0.0");
    const v2 = git(["rev-list", "-n", "1", "v2.0.0"], dir);

    // v1 first, so its materialisation is warm when v2 is asked for.
    const a = await enforce({ target, standardsRepo: dir, tag: "v1.0.0", sha: v1, cacheRoot: CACHE });
    const b = await enforce({ target, standardsRepo: dir, tag: "v2.0.0", sha: v2, cacheRoot: CACHE });
    assert.equal(a.report.ranFrom, "v1");
    assert.equal(b.report.ranFrom, "v2", "the warm cache from another identity served this run");
    assert.notEqual(a.passing, b.passing);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});
