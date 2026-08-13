/**
 * The reviewed surface, and what makes a determination stop being current.
 *
 * [ADR 0007](../artifacts/adr/0007-the-review-surface-is-the-whole-repository.md), made executable.
 * Paired-mutation discipline throughout: for each guard, construct the defect and assert the guard
 * fires — and, where the design had a fork, assert the **other** branch too, because a mechanism that
 * invalidates on everything is as useless as one that invalidates on nothing.
 *
 * The two arms that justify the whole slice existing:
 *
 *   C-A FALSIFIER   the signal-kind set is IDENTICAL while tracked content materially changes.
 *                   The old model reads current. The new one must read stale, and this is the
 *                   single reason kind-only staleness was not enough.
 *
 *   INVERSE CONTROL only irrelevant content inside an explicit exclusion changes, and no new signal
 *                   appears there. The determination must stay CURRENT — proof the new mechanism did
 *                   not collapse back into whole-repository churn, which is the failure mode that
 *                   trains reviewers to re-paste without looking.
 *
 * These build real git repositories. The digest reads the index, so a fixture that did not commit is
 * a fixture that measured nothing.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { reviewSurface, proposeSurface, compareSurface, RESOLVER_VERSION, SURFACE_DISPOSITION } from "../scripts/digest.mjs";
import { compileGlob, compileExclusions, GlobError } from "../scripts/glob.mjs";
import { trackedFiles, GitFactsError } from "../scripts/gitfacts.mjs";
import { resolveScope, OUTCOME } from "../scripts/scope.mjs";
import { detectFootprint, footprintDigest, SURFACE } from "../scripts/footprint.mjs";

const TODAY = "2026-08-13";
const REVIEWER = "scope-reviewer";
const ID = "R_repo_1";
const STANDARD = "machine-learning";

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return (r.stdout || "").trim();
}

async function repo(fn, { init = async () => {} } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "surface-repo-"));
  try {
    git(["init", "--quiet", "-b", "main"], dir);
    git(["config", "user.email", "t@example.invalid"], dir);
    git(["config", "user.name", "surface"], dir);
    git(["config", "commit.gpgsign", "false"], dir);
    await init(dir);
    git(["add", "-A"], dir);
    git(["commit", "--quiet", "-m", "initial"], dir);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const commit = (dir, message = "change") => {
  git(["add", "-A"], dir);
  git(["commit", "--quiet", "-m", message], dir);
};

/** An ordinary repository with an ML character, so the footprint is non-empty and stable. */
async function ordinary(dir) {
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "vendor"), { recursive: true });
  await mkdir(path.join(dir, "thirdparty"), { recursive: true });
  await writeFile(path.join(dir, "README.md"), "# fixture\n");
  await writeFile(path.join(dir, "src/train.py"), "import torch\n\nmodel.fit(x, y)\n");
  await writeFile(path.join(dir, "vendor/legacy.js"), "// vendored\n");
}

/** A registry whose single entry carries whatever basis the test wants. */
async function registryAt(dir, over = {}) {
  const surface = over.reviewedSurface;
  const footprint = over.reviewedFootprint;
  const doc = {
    authorisedReviewers: [REVIEWER],
    repositories: {
      [ID]: {
        name: "acme/moneyball",
        standards: {
          [STANDARD]: {
            disposition: "in-scope",
            reviewedBy: REVIEWER,
            reviewedAt: "2026-08-01",
            reason: "the repository trains models",
            reviewedFootprint: footprint,
            reviewedSurface: surface,
          },
        },
      },
    },
  };
  const file = path.join(await mkdtemp(path.join(tmpdir(), "surface-registry-")), "registry.json");
  await writeFile(file, JSON.stringify(doc, null, 2));
  return file;
}

/** Resolve with the real resolver bound to `dir`, exactly as enforce.mjs binds it. */
function resolve(registryPath, dir, footprints) {
  return resolveScope({
    registryPath,
    repoId: ID,
    repoName: "acme/moneyball",
    standardId: STANDARD,
    footprints,
    observeSurface: (exclusions) => reviewSurface(dir, exclusions),
    today: TODAY,
  });
}

function footprintOf(dir) {
  const f = detectFootprint(dir);
  return {
    observed: { [f.surface]: { kinds: f.kinds, digest: f.digest, signals: f.signals } },
    basis: { surface: f.surface, kinds: f.kinds, digest: f.digest },
    kinds: f.kinds,
  };
}

// ===========================================================================
// Glob semantics. An unsupported construct is a hard error, never a non-match.
// ===========================================================================

test("glob · the supported subset matches what a reviewer would expect", () => {
  assert.equal(compileGlob("vendor/**").test("vendor/a/b.js"), true);
  assert.equal(compileGlob("vendor/**").test("vendor/a.js"), true);
  assert.equal(compileGlob("vendor/").test("vendor/a/b.js"), true, "a trailing slash must mean the tree");
  assert.equal(compileGlob("vendor/**").test("vendored/a.js"), false);
  assert.equal(compileGlob("*.md").test("README.md"), true);
  assert.equal(compileGlob("*.md").test("docs/README.md"), false, "* must not cross a path separator");
  assert.equal(compileGlob("**/*.md").test("docs/a/README.md"), true);
  assert.equal(compileGlob("src/?.js").test("src/a.js"), true);
  assert.equal(compileGlob("src/?.js").test("src/ab.js"), false);
  assert.equal(compileGlob("src/[a-c].js").test("src/b.js"), true);
  assert.equal(compileGlob("src/[a-c].js").test("src/d.js"), false);
  assert.equal(compileGlob("src/[!a].js").test("src/b.js"), true);
});

test("glob · an unsupported construct refuses to compile rather than matching nothing", () => {
  // THE POINT OF THE WHOLE MODULE. `src/{a,b}/**` under a matcher without brace expansion matches no
  // files, so the exclusion silently covers nothing, the surface is silently WIDER than the reviewer
  // believed, and the digest is a valid digest of the wrong thing. Every failure of this kind reads
  // as success.
  for (const bad of ["src/{a,b}/**", "!src/**", "+(a|b)/**", "/absolute/**", "../escape/**", "a/**b", "src/[abc", "src/[]", "a\\b"]) {
    assert.throws(() => compileGlob(bad), GlobError, `${bad} compiled instead of being refused`);
  }
});

test("glob · an exclusion with no reason is refused", () => {
  assert.throws(() => compileExclusions([{ path: "vendor/**" }]), GlobError);
  assert.throws(() => compileExclusions([{ path: "vendor/**", reason: "  " }]), GlobError);
  assert.throws(
    () => compileExclusions([{ path: "vendor/**", reason: "a" }, { path: "vendor/**", reason: "b" }]),
    GlobError,
    "a duplicated exclusion makes the report ambiguous about which reason narrowed the surface",
  );
});

// ===========================================================================
// Git facts. Zero is never inferred.
// ===========================================================================

test("gitfacts · an empty listing over a non-empty directory is refused, not reported as empty", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "surface-notrepo-"));
  try {
    await writeFile(path.join(dir, "a.txt"), "content\n");
    // Not a repository at all — the same observable shape as the dubious-ownership fatal, a corrupt
    // index, or a partial clone. An empty surface digests to a constant and matches itself forever.
    assert.throws(() => trackedFiles(dir), GitFactsError);
    const r = reviewSurface(dir, []);
    assert.equal(r.ok, false);
    assert.equal(r.code, "NO_REPOSITORY");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("gitfacts · digests are stable over touching every file, and cover the index not the tree", async () => {
  await repo(async (dir) => {
    const before = reviewSurface(dir, []);
    assert.equal(before.ok, true);

    // Rewrite every file with identical content. Timestamps move; tracked content does not.
    await writeFile(path.join(dir, "README.md"), "# fixture\n");
    await writeFile(path.join(dir, "src/train.py"), "import torch\n\nmodel.fit(x, y)\n");
    const after = reviewSurface(dir, []);

    assert.equal(after.contentDigest, before.contentDigest, "a digest that moves when nothing changed is churn");
    assert.equal(after.surfaceDigest, before.surfaceDigest);
  }, { init: ordinary });
});

test("gitfacts · a dirty tree is reported and refuses to produce a determination", async () => {
  await repo(async (dir) => {
    await writeFile(path.join(dir, "uncommitted.txt"), "not in the index\n");

    const observed = reviewSurface(dir, []);
    assert.equal(observed.ok, true, "an unreadable repository and a dirty one are different findings");
    assert.equal(observed.reproducible, false);
    assert.deepEqual(observed.untracked, ["uncommitted.txt"]);

    const proposed = proposeSurface(dir, []);
    assert.equal(proposed.ok, false);
    assert.equal(proposed.code, "NOT_REPRODUCIBLE",
      "an attestation over a dirty tree describes content the reviewer did not see");
  }, { init: ordinary });
});

test("gitfacts · reviewing nothing is not attestable", async () => {
  await repo(async (dir) => {
    const proposed = proposeSurface(dir, [{ path: "**", reason: "everything, which is the shape of a bad review" }]);
    assert.equal(proposed.ok, false);
    assert.equal(proposed.code, "EMPTY_SURFACE");
  }, { init: ordinary });
});

// ===========================================================================
// The exclusion fork — both branches, because this is the design decision that
// was explicitly adjudicated rather than fallen into.
// ===========================================================================

test("exclusion, arm 1 · content growth inside an excluded tree does NOT invalidate", async () => {
  await repo(async (dir) => {
    const exclusions = [{ path: "vendor/**", reason: "third-party code this project does not author" }];
    const before = reviewSurface(dir, exclusions);

    // A lot of growth, deliberately. If size alone invalidated, generated and vendored trees would
    // return every cell in the portfolio to review on every commit, and a review that fires for no
    // reason stops being a review.
    for (let i = 0; i < 25; i++) await writeFile(path.join(dir, `vendor/gen-${i}.js`), `// generated ${i}\n`);
    commit(dir, "vendor churn");
    const after = reviewSurface(dir, exclusions);

    assert.equal(after.contentDigest, before.contentDigest, "excluded content churn invalidated the determination");
    assert.equal(after.surfaceDigest, before.surfaceDigest);
    assert.equal(after.exclusions[0].matched, 26, "the exclusion's match count must be reported even when it does not invalidate");
  }, { init: ordinary });
});

test("exclusion, arm 2 · a signal appearing inside an excluded tree DOES return the cell for review", async () => {
  await repo(async (dir) => {
    // `thirdparty/**`, NOT `vendor/**`. `footprint.mjs` skips a fixed list of directory names --
    // vendor, node_modules, dist, build, .next, site-packages and more -- so discovery cannot see
    // into them at all. An exclusion naming one of those has no bound on it whatsoever, which is
    // pinned separately below. This arm proves the mechanism where the mechanism can run.
    const exclusions = [{ path: "thirdparty/**", reason: "third-party code this project does not author" }];
    const proposed = proposeSurface(dir, exclusions);
    assert.equal(proposed.ok, true);

    const fpBefore = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fpBefore.basis });
    assert.equal(resolve(registryPath, dir, fpBefore.observed).outcome, OUTCOME.IN_SCOPE, "the fixture did not start current");

    // First-party ML work growing inside the blind spot. Neither digest can see it — that is the hole
    // ADR 0007 accepted — so discovery's one privilege is the only thing standing here.
    await writeFile(path.join(dir, "thirdparty/secret_model.py"), "import sklearn\n\nclf.fit(x, y)\n");
    commit(dir, "a model inside the excluded tree");

    const fpAfter = footprintOf(dir);
    const r = resolve(registryPath, dir, fpAfter.observed);

    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED,
      "a signal landed outside the reviewed surface and the determination stayed current");
    assert.ok(r.detail.signalOutsideSurface, "the finding must name the path and the exclusion that hid it");
    assert.equal(r.detail.signalOutsideSurface.exclusion, "thirdparty/**");
  }, { init: ordinary });
});

test("exclusion, arm 2b · a signal inside a directory DISCOVERY skips is not caught, and that is the real bound", async () => {
  await repo(async (dir) => {
    // NOT A BUG BEING RATIFIED — A LIMIT BEING MEASURED. ADR 0007's first bound says discovery scans
    // the whole repository including excluded paths, and that is only true of paths discovery scans.
    // `footprint.mjs` has skipped a fixed list of directory names since before this slice existed:
    // vendor, node_modules, dist, build, .next, site-packages, __pycache__ and others. Those are
    // precisely the names a reviewer reaches for when writing an exclusion.
    //
    // So an exclusion naming one of them has NO bound on it at all: not content, and not signals. The
    // arm above proves the mechanism works where discovery can see; this one records where it cannot,
    // so the gap is a measured property rather than a surprise found later by someone trusting the
    // ADR's wording.
    const exclusions = [{ path: "vendor/**", reason: "third-party code, and a name discovery skips" }];
    const proposed = proposeSurface(dir, exclusions);
    const fpBefore = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fpBefore.basis });
    assert.equal(resolve(registryPath, dir, fpBefore.observed).outcome, OUTCOME.IN_SCOPE);

    await writeFile(path.join(dir, "vendor/secret_model.py"), "import sklearn\n\nclf.fit(x, y)\n");
    commit(dir, "a model inside a skipped, excluded tree");

    const fpAfter = footprintOf(dir);
    assert.deepEqual(fpAfter.kinds, fpBefore.kinds, "discovery saw into a directory it is documented to skip");

    const r = resolve(registryPath, dir, fpAfter.observed);
    assert.equal(r.outcome, OUTCOME.IN_SCOPE,
      "if this ever becomes review-required, discovery's skip list changed and ADR 0007's bound 1 " +
      "became stronger — update the ADR, do not weaken this test");
  }, { init: ordinary });
});

// ===========================================================================
// Staleness of the reviewed surface itself.
// ===========================================================================

test("a tracked file added inside the reviewed surface is stale", async () => {
  await repo(async (dir) => {
    const proposed = proposeSurface(dir, []);
    const fp = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fp.basis });
    assert.equal(resolve(registryPath, dir, fp.observed).outcome, OUTCOME.IN_SCOPE);

    await writeFile(path.join(dir, "src/predict.py"), "import torch\n");
    commit(dir, "a new tracked file");

    const r = resolve(registryPath, dir, footprintOf(dir).observed);
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.stale, true);
    assert.equal(r.detail.surface.contentChanged, true);
  }, { init: ordinary });
});

test("widening an exclusion after the review is stale, and distinguishable from content change", async () => {
  await repo(async (dir) => {
    const proposed = proposeSurface(dir, [{ path: "vendor/**", reason: "third-party" }]);
    const fp = footprintOf(dir);

    // The determination is re-recorded with a WIDER exclusion than it was reviewed under, while its
    // recorded digests stay as they were. This is the under-declaration attack: narrow the surface
    // after the fact and keep the paperwork.
    const registryPath = await registryAt(dir, {
      reviewedSurface: { ...proposed.reviewedSurface, exclusions: [{ path: "vendor/**", reason: "third-party" }, { path: "src/**", reason: "widened later" }] },
      reviewedFootprint: fp.basis,
    });

    const r = resolve(registryPath, dir, fp.observed);
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.surface.surfaceChanged, true,
      "widening the agreement must be reported as the agreement changing, not as the repository changing");
    assert.notEqual(r.detail.surface.contentChanged, true);
  }, { init: ordinary });
});

test("a resolver version bump invalidates every prior attestation, on purpose", async () => {
  await repo(async (dir) => {
    const observed = reviewSurface(dir, []);
    const recorded = { resolverVersion: RESOLVER_VERSION - 1, surfaceDigest: observed.surfaceDigest, contentDigest: observed.contentDigest, exclusions: [] };

    const cmp = compareSurface(recorded, observed);
    assert.equal(cmp.disposition, SURFACE_DISPOSITION.STALE);
    assert.equal(cmp.resolverChanged, true,
      "a version bump reported as a digest mismatch would be true and useless");
  }, { init: ordinary });
});

// ===========================================================================
// Undetermined. The forbidden shortcut, asserted directly.
// ===========================================================================

test("an uncomputable current surface is undetermined, never a match", async () => {
  await repo(async (dir) => {
    const observed = reviewSurface(dir, []);
    const recorded = { resolverVersion: RESOLVER_VERSION, surfaceDigest: observed.surfaceDigest, contentDigest: observed.contentDigest, exclusions: [] };

    // The packs write `if (current && current !== recorded)`, so an uncomputable digest is falsy and
    // reads as a match. Every shape of "could not compute" is driven through here.
    for (const unreadable of [null, undefined, { ok: false, why: "git failed" }, { ok: false, code: "DISCOVERY_INCONSISTENT", why: "empty over non-empty" }]) {
      const cmp = compareSurface(recorded, unreadable);
      assert.equal(cmp.disposition, SURFACE_DISPOSITION.UNDETERMINED,
        `an uncomputable surface (${JSON.stringify(unreadable)}) was not treated as undetermined`);
    }
  }, { init: ordinary });
});

test("undetermined reaches review-required through the real resolver, and says so distinctly", async () => {
  await repo(async (dir) => {
    const proposed = proposeSurface(dir, []);
    const fp = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fp.basis });

    const r = resolveScope({
      registryPath,
      repoId: ID,
      repoName: "acme/moneyball",
      standardId: STANDARD,
      footprints: fp.observed,
      observeSurface: () => { throw new Error("git is not available here"); },
      today: TODAY,
    });

    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.undetermined, true);
    assert.notEqual(r.detail.stale, true,
      "a broken toolchain reported as ordinary drift hides the thing that needs fixing");
  }, { init: ordinary });
});

test("a determination with no recorded surface is undetermined — no back-filled digests", async () => {
  await repo(async (dir) => {
    const fp = footprintOf(dir);
    // A pre-ADR-0007 determination: footprint basis only. It cannot be silently upgraded by computing
    // a digest today, because that would assert somebody looked at this content on the review date.
    const registryPath = await registryAt(dir, { reviewedSurface: null, reviewedFootprint: fp.basis });

    const r = resolve(registryPath, dir, fp.observed);
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.undetermined, true);
  }, { init: ordinary });
});

// ===========================================================================
// C-A. The reason this slice exists.
// ===========================================================================

test("C-A falsifier · identical signal kinds, materially changed content, and the review is stale", async () => {
  await repo(async (dir) => {
    const proposed = proposeSurface(dir, []);
    const fpBefore = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fpBefore.basis });
    assert.equal(resolve(registryPath, dir, fpBefore.observed).outcome, OUTCOME.IN_SCOPE);

    // A great deal of new first-party ML code, of exactly the kinds already present. The tenth model
    // file where one already existed. Under kind-only staleness this repository has not changed at
    // all — which is the whole of C-A.
    for (let i = 0; i < 8; i++) {
      await writeFile(path.join(dir, `src/model_${i}.py`), `import torch\n\n# variant ${i}\nmodel.fit(x, y)\n`);
    }
    commit(dir, "eight more models, no new kind of evidence");

    const fpAfter = footprintOf(dir);

    // The premise of the arm, asserted rather than assumed. If this ever stops holding, the test is
    // no longer measuring what it claims to.
    assert.deepEqual(fpAfter.kinds, fpBefore.kinds, "the fixture changed the KIND set, so it is not the C-A case");
    assert.equal(footprintDigest(fpAfter.kinds), fpBefore.basis.digest,
      "the footprint digest moved, so the old model would have caught this and the arm proves nothing");

    const r = resolve(registryPath, dir, fpAfter.observed);
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED,
      "the kind set was unchanged and the content was not — this is the exact case kind-only staleness misses");
    assert.equal(r.detail.surface.contentChanged, true);
  }, { init: ordinary });
});

test("inverse control · irrelevant churn inside an exclusion leaves the determination current", async () => {
  await repo(async (dir) => {
    const exclusions = [{ path: "vendor/**", reason: "third-party code this project does not author" }];
    const proposed = proposeSurface(dir, exclusions);
    const fpBefore = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fpBefore.basis });

    // Real, substantial, and carrying no signal. If this invalidates, the mechanism has collapsed
    // back into whole-repository churn and the exclusion means nothing.
    for (let i = 0; i < 40; i++) await writeFile(path.join(dir, `vendor/chunk-${i}.js`), `module.exports = ${i};\n`);
    await appendFile(path.join(dir, "vendor/legacy.js"), "// more vendored text\n");
    commit(dir, "substantial vendored churn, no signals");

    const r = resolve(registryPath, dir, footprintOf(dir).observed);
    assert.equal(r.outcome, OUTCOME.IN_SCOPE,
      "excluded churn returned the cell for review, so the exclusion does not exclude anything");
    assert.equal(r.detail.surface.disposition, SURFACE_DISPOSITION.CURRENT);
    assert.equal(r.detail.surface.exclusions[0].matched, 41,
      "growth inside the exclusion must still be visible to a human even though it does not invalidate");
  }, { init: ordinary });
});

// ===========================================================================
// The boundary: discovery still cannot decide anything.
// ===========================================================================

test("discovery still cannot make a disposition, however its output is mutated", async () => {
  await repo(async (dir) => {
    const proposed = proposeSurface(dir, []);
    const fp = footprintOf(dir);
    const registryPath = await registryAt(dir, { reviewedSurface: proposed.reviewedSurface, reviewedFootprint: fp.basis });

    // Arbitrary detection output, including output claiming an applicability answer. The only state
    // reachable from a signal remains review-required, and nothing here can produce out-of-scope.
    for (const mutated of [
      { [SURFACE]: { kinds: [], digest: footprintDigest([]), signals: [] } },
      { [SURFACE]: { kinds: fp.kinds, digest: fp.basis.digest, signals: [{ kind: "invented", evidence: ["src/train.py"], applicable: false }] } },
      {},
    ]) {
      const r = resolve(registryPath, dir, mutated);
      assert.notEqual(r.outcome, OUTCOME.OUT_OF_SCOPE, "detection output produced an exclusion");
      assert.ok(
        r.outcome === OUTCOME.IN_SCOPE || r.outcome === OUTCOME.REVIEW_REQUIRED,
        `detection output reached ${r.outcome}`,
      );
    }
  }, { init: ordinary });
});
