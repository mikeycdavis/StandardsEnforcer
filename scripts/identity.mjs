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
 *   3. the materialised checkout is that SHA — on every run, including cached ones.
 *
 * Step 3 is not redundant with step 1. Step 1 asks what the tag currently points at; step 3
 * establishes what is about to run. A tag moved between the two would fail here.
 *
 * STEP 3 RUNS EVERY TIME, AND THAT IS THE WHOLE OF FE-13. It used to run once, at population time,
 * after which the presence of a marker file was allowed to stand for it. That made the marker an
 * artifact asserting the right thing — which is precisely what the paragraph above says is not
 * evidence that the thing is true. A cache entry lives under `tmpdir()`, outside any repository, and
 * nothing protects it between runs; a tree that was this commit yesterday is not thereby this commit
 * now. Caching may avoid reacquisition. It may never substitute for verification.
 *
 * WHAT "IS THAT SHA" MEANS HERE. `rev-parse HEAD` establishes the commit and not the files: an edited
 * working tree keeps the right HEAD and runs different code, and the reproduction for FE-13 observed
 * exactly that. So the check is HEAD *and* a clean tree, which is why the completion marker was moved
 * out of the checkout — a marker inside it is itself a modification, and an invariant with a
 * permanent exception carved into it is not one.
 *
 * The source repository is never mutated. No `git worktree`, no checkout in place — the enforcer
 * reads it and clones out of it.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * Run a filesystem mutation and report its failure rather than throwing it.
 *
 * This module's contract is that a caller gets a directory that is provably an identity, or a reason
 * it is not — and an exception is a third outcome. It escapes the caller's error handling entirely
 * and, in a governance tool, an unhandled fault is exactly the shape of thing INV-E1 exists to stop
 * being mistaken for anything else. Concurrent runs sharing a cache root make these calls genuinely
 * fallible, so the discipline has to be real.
 */
function attempt(fn) {
  try {
    fn();
    return { ok: true, why: null };
  } catch (e) {
    return { ok: false, why: e?.message ?? String(e) };
  }
}

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
 * The completion marker for a cache entry, kept beside the checkout rather than inside it.
 *
 * Outside on purpose. The tree must be byte-identical to the commit for `checkoutIsExactly` to be a
 * flat assertion, and a marker written into the checkout would be a file the enforcer itself added to
 * the authority it is about to execute.
 */
function markerFor(cacheRoot, sha) {
  return path.join(cacheRoot, `${sha}.complete`);
}

/**
 * Is this directory, right now, exactly the commit it is supposed to be?
 *
 * Three questions, in the order that makes their answers distinguishable: is there a repository here
 * at all, is its HEAD the commit, and does the tree match that commit. The third is not decoration —
 * an edited file leaves HEAD untouched and changes what executes, so HEAD alone would leave the same
 * hole one level down.
 *
 * `why` names which of the three failed, because "the cached authority is not what you approved" and
 * "the cache directory is not a checkout" call for different actions.
 */
export function checkoutIsExactly(dir, sha) {
  if (!existsSync(path.join(dir, ".git"))) {
    return { ok: false, why: `${dir} is not a git checkout, so nothing there establishes an identity` };
  }
  const head = git(["rev-parse", "HEAD"], dir);
  if (!head.ok) return { ok: false, why: `the checkout's HEAD could not be read (${head.why})` };
  if (head.out !== sha) return { ok: false, why: `the checkout is at ${head.out}, not ${sha}` };

  const tree = git(["status", "--porcelain"], dir);
  if (!tree.ok) return { ok: false, why: `the checkout's working tree could not be inspected (${tree.why})` };
  if (tree.out !== "") {
    const paths = tree.out.split("\n");
    const sample = paths[0].trim();
    return {
      ok: false,
      why:
        `the checkout is at ${sha} but its working tree is not: ${paths.length} path(s) differ, ` +
        `starting with "${sample}". HEAD names a commit; it does not promise the files match it`,
    };
  }
  return { ok: true, why: null };
}

/**
 * Materialise the standards implementation at a SHA, in a cache keyed by that SHA.
 *
 * Content-addressed on purpose: two runs naming the same SHA get the same tree, and a cache entry
 * cannot be stale, because its name is what it contains. A partially written entry is removed and
 * rebuilt rather than reused, since a truncated checkout would run a subset of the implementation
 * and report a verdict from it.
 *
 * A cache hit is a candidate, never a conclusion. The entry is verified before it is handed back, and
 * an entry that fails is discarded and rebuilt from the source repository rather than reported as a
 * failure: the identity is what must hold, and re-establishing it is not the same as excusing it. The
 * rebuild is verified by the identical check, so repair cannot become its own soft path — if the
 * fresh checkout does not verify either, nothing is returned.
 *
 * `repaired` carries the reason a hit was rejected, so a discarded cache entry is reportable rather
 * than silent. Content-addressing means a rejected entry is always evidence of something: the name
 * could not have gone stale on its own.
 */
export function materialise(repo, sha, cacheRoot) {
  const dest = path.join(cacheRoot, sha);
  const marker = markerFor(cacheRoot, sha);
  let repaired = null;

  if (existsSync(marker) && existsSync(dest)) {
    const current = checkoutIsExactly(dest, sha);
    if (current.ok) return { ok: true, dir: dest, cached: true, repaired: null, why: null };
    repaired = current.why;
  }

  // Build somewhere else and swap it in. A rejected entry may be in use by a concurrent run, and
  // deleting the directory another process is executing from would replace one false green with an
  // outright fault. Staging is per-process, so two runs repairing the same identity cannot collide
  // mid-clone.
  const staging = path.join(cacheRoot, `.staging-${sha}-${process.pid}`);
  const swept = attempt(() => {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(cacheRoot, { recursive: true });
  });
  if (!swept.ok) return { ok: false, dir: null, cached: false, repaired, why: `the cache could not be prepared: ${swept.why}` };

  try {
    const cloned = git(["clone", "--quiet", "--no-checkout", "--no-hardlinks", repo, staging]);
    if (!cloned.ok) return { ok: false, dir: null, cached: false, repaired, why: `clone failed: ${cloned.why}` };

    // Detach onto the SHA rather than the tag. What runs is decided by the commit, so that a tag
    // moved between verification and execution cannot change what executes.
    const checkedOut = git(["checkout", "--detach", "--quiet", sha], staging);
    if (!checkedOut.ok) return { ok: false, dir: null, cached: false, repaired, why: `checkout ${sha} failed: ${checkedOut.why}` };

    const fresh = checkoutIsExactly(staging, sha);
    if (!fresh.ok) return { ok: false, dir: null, cached: false, repaired, why: `the materialised checkout failed verification: ${fresh.why}` };

    const published = attempt(() => {
      rmSync(marker, { force: true });
      rmSync(dest, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      renameSync(staging, dest);
    });
    if (!published.ok) {
      // Losing the swap is not automatically a failure: another run may have published a good entry
      // for this identity in the meantime. That entry is checked exactly as any other would be —
      // deferring to it without verification would be the original defect wearing a different hat.
      const rival = existsSync(dest) ? checkoutIsExactly(dest, sha) : { ok: false, why: published.why };
      if (!rival.ok) {
        return { ok: false, dir: null, cached: false, repaired, why: `the verified checkout could not be published: ${published.why}` };
      }
      return { ok: true, dir: dest, cached: true, repaired, why: null };
    }

    spawnSync(process.execPath, ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(sha)})`], { windowsHide: true });
    if (!existsSync(marker)) return { ok: false, dir: null, cached: false, repaired, why: "the cache entry could not be marked complete" };
    return { ok: true, dir: dest, cached: false, repaired, why: null };
  } finally {
    attempt(() => rmSync(staging, { recursive: true, force: true }));
  }
}

/**
 * Resolve a declared identity into a directory that is provably that identity, or a reason it is
 * not. There is no third outcome, and in particular no "close enough".
 */
export function resolveIdentity({ repo, tag, sha, cacheRoot }) {
  const verified = verifyTagResolvesTo(repo, tag, sha);
  if (!verified.ok) return { ok: false, dir: null, why: verified.why, resolved: verified.resolved };

  const built = materialise(repo, sha, cacheRoot);
  if (!built.ok) return { ok: false, dir: null, why: built.why, resolved: verified.resolved, repaired: built.repaired };

  return { ok: true, dir: built.dir, cached: built.cached, repaired: built.repaired, why: null, resolved: sha };
}
