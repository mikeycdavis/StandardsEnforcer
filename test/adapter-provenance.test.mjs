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
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { enforce } from "../scripts/enforce.mjs";
import { STATE } from "../scripts/states.mjs";
import { symlinkSkip } from "../test-support/capabilities.mjs";

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

// The symlink capability probe and its skip wording moved to test-support/capabilities.mjs (ST-08).
// Four cases below shared one local copy of each; they now share one module, and the same probe
// answers the requirement guard in test/capability-required.test.mjs. Under
// ENFORCER_REQUIRE_SYMLINKS=1 an environment that cannot create symlinks fails that guard rather
// than skipping these four quietly — which is what a run claiming to have exercised link
// containment must do.

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
    const unexercised = symlinkSkip("7b");
    if (unexercised) {
      t.skip(unexercised);
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
// 7c–7g. The rest of the link surface.
//
// Case 7b above establishes that a symlinked entrypoint pointing outside must not execute. It was
// the only link case, and for as long as it could only run where symlinks can be created, it was
// also the only one nobody had ever seen run — it first executed under the containerised Linux
// pipeline, and failed. See artifacts/evidence/2026-08-16-entrypoint-link-containment.md.
//
// These are the cases a fix for it can plausibly get wrong in each direction: refusing something
// legitimate, or permitting an escape that does not look like 7b. A containment check that only
// inspects the final path component passes 7b and fails 7e.
// ---------------------------------------------------------------------------

/** Build, commit and tag a pack whose `scripts/` contents the caller arranges. */
async function packWithScripts(arrange, { declared = contract() } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-links-"));
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(declared));
  await arrange(dir);
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "t"], dir);
  await commitAll(dir, "pack", "v1.0.0");
  return { dir, tag: "v1.0.0", sha: git(["rev-list", "-n", "1", "v1.0.0"], dir) };
}

test("7c · an entrypoint physically inside the checkout still runs", async () => {
  // The regression guard for 7b's fix. Containment that refuses everything is not containment, and
  // the failure mode of a hastily tightened path check is that ordinary releases stop working —
  // which then gets "fixed" by loosening it back past where it started.
  const pack = await packWithScripts(async (dir) => {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluator("genuine", "REAL_PASS"));
  });
  const target = await governedTarget();
  try {
    const r = await run(pack, target);
    assert.equal(r.state, STATE.EVALUATED);
    assert.equal(r.report?.ranFrom, "genuine", "an ordinary in-checkout entrypoint must still execute");
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("7d · a chain of links that stays inside the checkout runs", async (t) => {
  // Containment is a property of where the path *lands*, not of how many hops it took. Refusing a
  // link merely for being a link would be a different rule, and one real packs would trip over.
  const unexercised = symlinkSkip("7d");
  if (unexercised) {
    t.skip(unexercised);
    return;
  }
  const pack = await packWithScripts(async (dir) => {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "scripts", "impl.mjs"), evaluator("genuine", "REAL_PASS"));
    // Relative, so the chain survives being cloned into the cache under a different absolute path.
    // An absolute link back to this fixture would resolve outside the materialised checkout and be
    // refused — correctly, and for a different reason than the one under test here.
    await symlink("impl.mjs", path.join(dir, "scripts", "hop.mjs"));
    await symlink("hop.mjs", path.join(dir, "scripts", "standards.mjs"));
  });
  const target = await governedTarget();
  try {
    const r = await run(pack, target);
    assert.equal(r.state, STATE.EVALUATED);
    assert.equal(r.report?.ranFrom, "genuine", "a link chain landing inside the checkout must run");
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("7e · a symlinked parent directory escapes just as effectively, and is refused", async (t) => {
  // The case that separates "resolve the whole path" from "check the filename". Here every path
  // component the contract names is ordinary; it is `scripts/` itself that leaves the checkout.
  const unexercised = symlinkSkip("7e");
  if (unexercised) {
    t.skip(unexercised);
    return;
  }
  const outside = await mkdtemp(path.join(tmpdir(), "outside-dir-"));
  const target = await governedTarget();
  let pack;
  try {
    await writeFile(path.join(outside, "standards.mjs"), evaluator("outside", "REAL_PASS"));
    pack = await packWithScripts(async (dir) => {
      await symlink(outside, path.join(dir, "scripts"), "dir");
    });

    const r = await run(pack, target);
    assert.notEqual(r.report?.ranFrom, "outside", "bytes from outside the verified checkout executed");
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR, "an escape must be an enforcement error, not a verdict");
    assert.equal(r.passing, false);
  } finally {
    if (pack) await rm(pack.dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("7f · a link that does not resolve is refused explicitly, not treated as absence", async (t) => {
  // Where it would have pointed is unknown. INV-E1 does not permit an unknown enforcement condition
  // to become an acceptable one, and the two conditions send an operator to different fixes: a
  // missing file is a packaging mistake, a dangling link is a release that cannot be trusted to
  // name its own evaluator.
  const unexercised = symlinkSkip("7f");
  if (unexercised) {
    t.skip(unexercised);
    return;
  }
  const pack = await packWithScripts(async (dir) => {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await symlink("nowhere.mjs", path.join(dir, "scripts", "standards.mjs"));
  });
  const target = await governedTarget();
  try {
    const r = await run(pack, target);
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(r.passing, false);
    assert.match(
      String(r.detail),
      /does not resolve/,
      "the refusal must name the unresolved link rather than report the file as missing",
    );
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("7g · an entrypoint that is simply absent still reports as absent", async () => {
  // The other side of 7f. Adding link handling must not reclassify an ordinary missing file, or the
  // message an operator gets stops matching what they have to fix.
  const pack = await packWithScripts(async (dir) => {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "scripts", "something-else.mjs"), evaluator("genuine", "REAL_PASS"));
  });
  const target = await governedTarget();
  try {
    const r = await run(pack, target);
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.match(String(r.detail), /not in the pinned release/);
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
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
