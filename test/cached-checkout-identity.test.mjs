/**
 * A cached standards checkout may be reused only when the bytes that can influence execution are
 * exactly the bytes established by the approved commit identity.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT ASSERTS BEFORE ANY FIX. `checkoutIsExactly` is the predicate
 * `materialise` uses to decide whether a cached checkout may be **executed**. It asks three things:
 * the directory is a git checkout, its HEAD is the approved commit, and `git status --porcelain`
 * reports nothing. The third is the one that matters here, and it is weaker than it reads:
 *
 *     git status --porcelain   honours .gitignore
 *     → bytes written to an ignored path are invisible to it
 *     → the predicate returns ok, and the enforcer executes a tree it has not established
 *
 * That is a false-green path in the identity model rather than an untidiness. The whole point of the
 * third check — stated in this function's own comment — is that "an edited file leaves HEAD untouched
 * and changes what executes, so HEAD alone would leave the same hole one level down." An ignored file
 * leaves both HEAD and `--porcelain` untouched and changes what executes. It is the same hole, one
 * level further down.
 *
 * THE EXECUTE BIT IS THE WRONG AXIS, AND THIS FILE IS DELIBERATE ABOUT IT. The tempting framing is
 * "ignored *executable* files". For a Node pack that framing is simply wrong: `node_modules/x/index.js`
 * carries no execute permission and is still loaded and run by `require`/`import`. Nothing about the
 * POSIX mode bit separates a file that influences execution from one that does not — the separating
 * property is whether the path lies on a code-loading route.
 *
 *     node_modules/**            influences execution   (module resolution reaches it)
 *     artifacts/local-ci/*.log   inert on its face      (nothing loads it)
 *
 * The first case is what the guarantee is about, and it is what the falsifier below forces. The second
 * is recorded rather than decided — see the characterisation test at the end, which asserts today's
 * behaviour and says in as many words that it is not yet a decision. The remedy should be as broad as
 * the evidence requires and no broader; defaulting to "`git status --ignored` must be empty" would be
 * choosing convenience over the guarantee, and would reject a checkout for a log file nothing reads.
 *
 * NO ORACLE IS NEEDED. Every fixture here is a local git repository this file creates, so these tests
 * run in every environment rather than being gated on the authoritative oracle. That is deliberate:
 * the property is about the cache, not about any particular standards release.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { checkoutIsExactly, materialise } from "../scripts/identity.mjs";

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  return (r.stdout ?? "").trim();
}

/**
 * An origin repository shaped like a standards pack: an entrypoint, a manifest, and a `.gitignore`
 * naming the two paths this repository's own packs ignore.
 */
async function originRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-origin-"));
  git(["init", "--quiet", "--initial-branch=main"], dir);
  git(["config", "user.email", "fixture@example.invalid"], dir);
  git(["config", "user.name", "Cached Checkout Fixture"], dir);
  git(["config", "commit.gpgsign", "false"], dir);

  await writeFile(path.join(dir, ".gitignore"), "node_modules/\nartifacts/local-ci/\n");
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "fixture-pack", version: "1.0.0" }, null, 2));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "scripts", "standards.mjs"), "export const verdict = 'COMPLIANT';\n");

  git(["add", ".gitignore", "package.json", "scripts/standards.mjs"], dir);
  git(["commit", "--quiet", "-m", "the approved release"], dir);
  return { dir, sha: git(["rev-parse", "HEAD"], dir) };
}

/** A materialised cache entry for `origin`, exactly as the enforcer would produce one. */
async function cached(origin) {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "enforcer-cache-"));
  const m = materialise(origin.dir, origin.sha, cacheRoot);
  assert.equal(m.ok, true, `the fixture cache entry must materialise: ${m.why}`);
  assert.equal(m.cached, false, "the first materialise builds rather than reuses");
  return { cacheRoot, dir: m.dir };
}

async function scratch(fn) {
  const made = [];
  const keep = async (p) => { made.push(p); return p; };
  try {
    await fn(keep);
  } finally {
    for (const p of made) await rm(p, { recursive: true, force: true });
  }
}

// --- the falsifier ------------------------------------------------------------------------------

test("cached checkout · ignored bytes on a code-loading path must invalidate reuse", async () => {
  await scratch(async (keep) => {
    const origin = await originRepo();
    await keep(origin.dir);
    const entry = await cached(origin);
    await keep(entry.cacheRoot);

    // Anti-vacuity. If the entry did not verify on the way in, "does not verify on the way out"
    // would be measuring the fixture rather than the planted bytes.
    const before = checkoutIsExactly(entry.dir, origin.sha);
    assert.equal(before.ok, true, `the cache entry must verify before anything is planted: ${before.why}`);

    // Bytes that execute. No execute permission is set, and none is needed: module resolution reaches
    // this path, so `import`/`require` inside the pack would load it.
    await mkdir(path.join(entry.dir, "node_modules", "hijack"), { recursive: true });
    await writeFile(
      path.join(entry.dir, "node_modules", "hijack", "index.js"),
      "process.env.OWNED = '1';\nexport default () => 'this did not come from the approved commit';\n",
    );

    // `git status --porcelain` still reports nothing, which is precisely the defect: the evidence the
    // predicate consults cannot see the change.
    assert.equal(git(["status", "--porcelain"], entry.dir), "",
      "the fixture is only meaningful while the planted bytes are invisible to a plain porcelain status");

    const after = checkoutIsExactly(entry.dir, origin.sha);
    assert.equal(after.ok, false,
      "a checkout carrying bytes on a code-loading path that the approved commit did not establish " +
      "is not that commit, and must not be certified as it");

    // And the consequence that actually matters: the enforcer must not go on to execute it.
    const reuse = materialise(origin.dir, origin.sha, entry.cacheRoot);
    assert.notEqual(reuse.cached, true,
      "the cache entry must not be reused once its executable surface stopped matching the identity");
  });
});

// --- the neighbours, pinned so the remedy cannot overcorrect --------------------------------------

test("cached checkout · an untouched entry is still accepted and still reused", async () => {
  await scratch(async (keep) => {
    const origin = await originRepo();
    await keep(origin.dir);
    const entry = await cached(origin);
    await keep(entry.cacheRoot);

    assert.equal(checkoutIsExactly(entry.dir, origin.sha).ok, true,
      "an unmodified checkout of the approved commit must verify, or the remedy has broken the cache");

    const reuse = materialise(origin.dir, origin.sha, entry.cacheRoot);
    assert.equal(reuse.ok, true, reuse.why);
    assert.equal(reuse.cached, true, "a clean entry must still be reused rather than rebuilt every run");
  });
});

test("cached checkout · a tracked modification at the same HEAD is still rejected", async () => {
  await scratch(async (keep) => {
    const origin = await originRepo();
    await keep(origin.dir);
    const entry = await cached(origin);
    await keep(entry.cacheRoot);

    await writeFile(path.join(entry.dir, "scripts", "standards.mjs"), "export const verdict = 'ALWAYS_PASS';\n");

    assert.equal(git(["rev-parse", "HEAD"], entry.dir), origin.sha, "HEAD is deliberately unchanged");
    const r = checkoutIsExactly(entry.dir, origin.sha);
    assert.equal(r.ok, false, "an edited tracked file changes what executes while HEAD stays put");
    assert.match(r.why, /working tree/u, `the reason must name the tree, not the commit: ${r.why}`);
  });
});

test("cached checkout · a marker without an exact checkout does not license reuse", async () => {
  await scratch(async (keep) => {
    const origin = await originRepo();
    await keep(origin.dir);
    const entry = await cached(origin);
    await keep(entry.cacheRoot);

    // The completion marker is left exactly where `materialise` wrote it. Only the checkout moves.
    git(["checkout", "--detach", "--quiet", "HEAD~0"], entry.dir);
    await writeFile(path.join(entry.dir, "package.json"), JSON.stringify({ name: "fixture-pack", version: "9.9.9" }));

    const reuse = materialise(origin.dir, origin.sha, entry.cacheRoot);
    assert.notEqual(reuse.cached, true,
      "a marker records that a build finished, never that the checkout is still what was approved");
    assert.equal(reuse.ok, true, `the entry must be rebuilt rather than refused outright: ${reuse.why}`);
    assert.notEqual(reuse.repaired, null, "the repair must say what was wrong rather than repairing silently");
  });
});

test("cached checkout · the rebuilt entry is verified by the same predicate, not trusted", async () => {
  await scratch(async (keep) => {
    const origin = await originRepo();
    await keep(origin.dir);
    const entry = await cached(origin);
    await keep(entry.cacheRoot);

    await writeFile(path.join(entry.dir, "package.json"), '{"name":"tampered"}');
    const rebuilt = materialise(origin.dir, origin.sha, entry.cacheRoot);
    assert.equal(rebuilt.ok, true, rebuilt.why);
    assert.equal(rebuilt.cached, false, "a rejected entry is rebuilt");

    // Reconstruction is not self-certifying: the rebuilt tree must satisfy the same predicate a
    // cached one does, and the assertion is made here rather than assumed from `ok`.
    assert.equal(checkoutIsExactly(rebuilt.dir, origin.sha).ok, true,
      "the rebuilt checkout must satisfy the identity predicate itself");
    assert.equal(git(["rev-parse", "HEAD"], rebuilt.dir), origin.sha);
  });
});

// --- the boundary this file records rather than decides -------------------------------------------

/**
 * CHARACTERISATION, NOT A DECISION. An ignored file that lies on no code-loading route — a local-CI
 * log — is accepted today, because `--porcelain` cannot see it. Whether the remedy should also reject
 * this is genuinely open, and the guarantee does not settle it on its own:
 *
 *   reject it    the checkout is then byte-identical to the approved commit under any reading, and
 *                nobody has to adjudicate which paths are "inert" as the pack's layout changes
 *   accept it    a standards pack that writes its own logs inside its checkout would otherwise
 *                invalidate its own cache entry on every run, and the enforcer would rebuild
 *                perpetually while nothing about execution had changed
 *
 * This test asserts the CURRENT behaviour so the decision is visible when it is made rather than
 * drifting in behind the executable fix. If the remedy broadens to cover inert ignored paths, this
 * test SHOULD fail, and its failure is the prompt to record why — not a regression to route around.
 */
test("cached checkout · an inert ignored artifact is accepted today, and that is not yet a decision", async () => {
  await scratch(async (keep) => {
    const origin = await originRepo();
    await keep(origin.dir);
    const entry = await cached(origin);
    await keep(entry.cacheRoot);

    await mkdir(path.join(entry.dir, "artifacts", "local-ci"), { recursive: true });
    await writeFile(path.join(entry.dir, "artifacts", "local-ci", "run.log"), "stage: environment\nok\n");

    assert.equal(checkoutIsExactly(entry.dir, origin.sha).ok, true,
      "recording today's behaviour: an ignored path with nothing loading it does not invalidate reuse");
  });
});
