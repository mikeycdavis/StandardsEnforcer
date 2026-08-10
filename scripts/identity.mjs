/**
 * Standards identity: which implementation actually ran.
 *
 * WHY THIS EXISTS. A project policy that says `standardVersion: "1.4.0"` is a claim, and a git tag
 * is mutable. Nothing in that string establishes that the evaluator which produced a verdict is the
 * one that was reviewed and released. MachineLearningStandards spent four releases learning that an
 * artifact asserting the right thing is not evidence that the thing is true, and this is the same
 * defect one layer out.
 *
 * So an identity here is a triple — repository, release tag, immutable commit SHA — and all three
 * must resolve consistently before anything executes:
 *
 *   1. the tag exists in the standards repository and resolves to the stated SHA;
 *   2. a tree is materialised at that SHA, in a cache keyed by the SHA;
 *   3. the materialised checkout's HEAD is that SHA.
 *
 * Step 3 is not redundant with step 1. Step 1 asks what the tag currently points at; step 3
 * establishes what is about to run. A tag moved between the two would fail here.
 *
 * The source repository is never mutated. No `git worktree`, no checkout in place — the enforcer
 * reads it and clones out of it.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const FULL_SHA = /^[0-9a-f]{40}$/;

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { ok: false, why: `git could not be run (${r.error.message})` };
  if (r.status !== 0) {
    const reason = (r.stderr || "").trim().split("\n")[0] || `git exited ${r.status}`;
    return { ok: false, why: reason };
  }
  return { ok: true, out: (r.stdout || "").trim() };
}

/**
 * Does the tag in this repository resolve to exactly the stated commit?
 *
 * Returns `{ ok, resolved, why }`. `why` names git's own reason where git declined, because
 * "the tag does not exist" and "this is not a repository" lead to different actions and reporting
 * the second as the first tells an operator something untrue.
 */
export function verifyTagResolvesTo(repo, tag, sha) {
  if (!FULL_SHA.test(sha ?? "")) {
    return { ok: false, resolved: null, why: `"${sha}" is not a full 40-character commit SHA; an abbreviation is not an identity` };
  }
  if (!existsSync(path.join(repo, ".git"))) {
    return { ok: false, resolved: null, why: `${repo} is not a git repository` };
  }
  // rev-list -n 1 dereferences an annotated tag to the commit it points at, which is what a
  // release identity means. `rev-parse <tag>` would return the tag object's own SHA.
  const resolved = git(["rev-list", "-n", "1", tag], repo);
  if (!resolved.ok) return { ok: false, resolved: null, why: `tag ${tag}: ${resolved.why}` };
  if (resolved.out !== sha) {
    // One mismatch is common enough, and diagnosable enough, to name: the declared SHA is the
    // annotated TAG OBJECT rather than the commit. `git rev-parse v1.4.0` returns it and looks
    // entirely like an answer, and every tagged pack in the C0 inventory was recorded that way.
    // Saying "these do not match" is true and costs an afternoon; saying which mistake it is costs
    // a sentence. The tag object is provenance about the tag, not the identity of what runs.
    const tagObject = git(["rev-parse", tag], repo);
    if (tagObject.ok && tagObject.out === sha) {
      return {
        ok: false,
        resolved: resolved.out,
        why:
          `tag ${tag} resolves to ${resolved.out}, and the declared identity ${sha} is that tag's annotated tag ` +
          "object rather than the commit it points at. The tag object records who tagged and when; it is not the " +
          `identity of the implementation being executed. Use ${resolved.out}`,
      };
    }
    return {
      ok: false,
      resolved: resolved.out,
      why: `tag ${tag} resolves to ${resolved.out}, and the declared identity says ${sha}`,
    };
  }
  return { ok: true, resolved: resolved.out, why: null };
}

/**
 * Materialise the standards implementation at a SHA, in a cache keyed by that SHA.
 *
 * Content-addressed on purpose: two runs naming the same SHA get the same tree, and a cache entry
 * cannot be stale, because its name is what it contains. A partially written entry is removed and
 * rebuilt rather than reused, since a truncated checkout would run a subset of the implementation
 * and report a verdict from it.
 */
export function materialise(repo, sha, cacheRoot) {
  const dest = path.join(cacheRoot, sha);
  const marker = path.join(dest, ".enforcer-complete");

  if (existsSync(marker)) return { ok: true, dir: dest, cached: true, why: null };
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(cacheRoot, { recursive: true });

  const cloned = git(["clone", "--quiet", "--no-checkout", "--no-hardlinks", repo, dest]);
  if (!cloned.ok) return { ok: false, dir: null, cached: false, why: `clone failed: ${cloned.why}` };

  // Detach onto the SHA rather than the tag. What runs is decided by the commit, so that a tag
  // moved between verification and execution cannot change what executes.
  const checkedOut = git(["checkout", "--detach", "--quiet", sha], dest);
  if (!checkedOut.ok) {
    rmSync(dest, { recursive: true, force: true });
    return { ok: false, dir: null, cached: false, why: `checkout ${sha} failed: ${checkedOut.why}` };
  }

  const head = git(["rev-parse", "HEAD"], dest);
  if (!head.ok || head.out !== sha) {
    rmSync(dest, { recursive: true, force: true });
    return { ok: false, dir: null, cached: false, why: `the materialised checkout is at ${head.out ?? "an unknown commit"}, not ${sha}` };
  }

  spawnSync(process.execPath, ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(sha)})`], { windowsHide: true });
  if (!existsSync(marker)) return { ok: false, dir: null, cached: false, why: "the cache entry could not be marked complete" };
  return { ok: true, dir: dest, cached: false, why: null };
}

/**
 * Resolve a declared identity into a directory that is provably that identity, or a reason it is
 * not. There is no third outcome, and in particular no "close enough".
 */
export function resolveIdentity({ repo, tag, sha, cacheRoot }) {
  const verified = verifyTagResolvesTo(repo, tag, sha);
  if (!verified.ok) return { ok: false, dir: null, why: verified.why, resolved: verified.resolved };

  const built = materialise(repo, sha, cacheRoot);
  if (!built.ok) return { ok: false, dir: null, why: built.why, resolved: verified.resolved };

  return { ok: true, dir: built.dir, cached: built.cached, why: null, resolved: sha };
}
