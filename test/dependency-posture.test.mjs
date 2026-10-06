/**
 * A CI stage that examined nothing must not be able to report success (ST-17).
 *
 * THE SHAPE THIS GUARDS. `ci/dependency-posture.mjs` used to read `package.json`, find no
 * dependencies, say "vacuously true" and exit 0. That is correct for a repository that declares
 * nothing — and it is also what happens when the check merely cannot FIND the declarations (a key
 * renamed, a manifest restructured). The EP-06 parent falsification, Arm B, renamed
 * `dependencies`/`devDependencies` and the authoritative route passed a tree with an unpinned
 * dependency in it.
 *
 * THESE TESTS DRIVE THE PROGRAM, NOT THE FUNCTION. Arm B passed through the executable, so the
 * known-positive case runs the executable against a tree built in Arm B's shape. A unit test of the
 * decision function alone would stay green if the program stopped calling it.
 *
 * Known-positive and known-negative both: a check that never fires and a check that always fires
 * are indistinguishable from a green suite. The honest empty repository must stay green and must
 * say it was NOT_EXERCISED, not that it passed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OUTCOME, establishEmptySubject } from "../ci/dependency-posture.mjs";
import { readSource } from "../test-support/source-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = path.join(ROOT, "ci", "dependency-posture.mjs");

const INTEGRITY = "sha512-AAAA";
const lockWith = (version, extra = {}) => ({
  name: "fixture",
  lockfileVersion: 3,
  packages: {
    "": { name: "fixture", dependencies: { acorn: version } },
    "node_modules/acorn": { version, resolved: `https://registry.invalid/acorn-${version}.tgz`, integrity: INTEGRITY },
  },
  ...extra,
});
const EMPTY_LOCK = { name: "fixture", lockfileVersion: 3, packages: { "": { name: "fixture" } } };

/** Build a throwaway tree, run the real program against it, return what it said and decided. */
async function runOn({ pkg, lock, lockText, require = false }, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-deppost-"));
  try {
    await writeFile(path.join(dir, "package.json"), JSON.stringify(pkg));
    if (lockText !== undefined) await writeFile(path.join(dir, "package-lock.json"), lockText);
    else if (lock !== undefined) await writeFile(path.join(dir, "package-lock.json"), JSON.stringify(lock));
    const outcomeFile = path.join(dir, "outcome.txt");
    const args = [MODULE, ...(require ? ["--require"] : []), `--outcome-file=${outcomeFile}`, dir];
    const r = spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true });
    let outcome = null;
    try { outcome = (await readFile(outcomeFile, "utf8")).trim(); } catch { /* not written */ }
    return await fn({ status: r.status, out: r.stdout + r.stderr, outcome, dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- known-positive: Arm B ---------------------------------------------------------------------

test("Arm B · a manifest whose dependency keys were renamed is FAILED, not vacuously true", async () => {
  // package.json no longer says `dependencies`, yet the lockfile still installs acorn.
  await runOn({ pkg: { name: "fixture", deps: { acorn: "^8.18.0" } }, lock: lockWith("8.18.0") }, ({ status, out, outcome }) => {
    assert.equal(status, 1, `the check must refuse a tree whose declarations it could not find:\n${out}`);
    assert.equal(outcome, OUTCOME.FAILED);
    assert.match(out, /acorn/u, "the failure must name what contradicted the empty set");
    assert.doesNotMatch(out, /vacuously true/u, "the old pass wording must not survive");
  });
});

test("Arm B · the same renamed manifest is refused whichever dependency kind went missing", async () => {
  const lock = { ...EMPTY_LOCK, packages: { ...EMPTY_LOCK.packages, "node_modules/left-pad": { version: "1.3.0", resolved: "https://registry.invalid/lp.tgz", integrity: INTEGRITY } } };
  await runOn({ pkg: { name: "fixture", devDeps: { "left-pad": "1.3.0" } }, lock }, ({ status, outcome, out }) => {
    assert.equal(status, 1, out);
    assert.equal(outcome, OUTCOME.FAILED);
    assert.match(out, /left-pad/u);
  });
});

test("Arm B · this repository's own manifest, with its dependency keys renamed, is refused", async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(ROOT, "package-lock.json"), "utf8"));
  assert.ok(Object.keys(pkg.dependencies ?? {}).length > 0, "the precondition: the real manifest declares a dependency");
  const renamed = { ...pkg, deps: pkg.dependencies, devDeps: pkg.devDependencies };
  delete renamed.dependencies;
  delete renamed.devDependencies;
  await runOn({ pkg: renamed, lock }, ({ status, outcome, out }) => {
    assert.equal(status, 1, out);
    assert.equal(outcome, OUTCOME.FAILED);
  });
});

test("an empty manifest beside a lockfile that cannot be read is FAILED, never a pass", async () => {
  await runOn({ pkg: { name: "fixture" }, lockText: "{ not json" }, ({ status, outcome }) => {
    assert.equal(status, 1);
    assert.equal(outcome, OUTCOME.FAILED);
  });
});

// --- the environment's claim -------------------------------------------------------------------

test("--require: an empty dependency set is FAILED even when the lockfile also records nothing", async () => {
  await runOn({ pkg: { name: "fixture" }, lock: EMPTY_LOCK, require: true }, ({ status, outcome, out }) => {
    assert.equal(status, 1, out);
    assert.equal(outcome, OUTCOME.FAILED);
    assert.match(out, /ENFORCER_REQUIRE_DEPENDENCIES/u);
  });
});

test("--require: an empty dependency set is FAILED when there is no lockfile at all", async () => {
  await runOn({ pkg: { name: "fixture" }, require: true }, ({ status, outcome }) => {
    assert.equal(status, 1);
    assert.equal(outcome, OUTCOME.FAILED);
  });
});

test("--require does not break a repository that does declare a pinned dependency", async () => {
  await runOn({ pkg: { name: "fixture", dependencies: { acorn: "8.18.0" } }, lock: lockWith("8.18.0"), require: true }, ({ status, outcome, out }) => {
    assert.equal(status, 0, out);
    assert.equal(outcome, OUTCOME.ESTABLISHED);
  });
});

// --- known-negative: the honest vacuous case stays green, and says what it is -----------------

test("a repository that truly declares nothing still passes, as NOT_EXERCISED", async () => {
  await runOn({ pkg: { name: "fixture" }, lock: EMPTY_LOCK }, ({ status, outcome, out }) => {
    assert.equal(status, 0, out);
    assert.equal(outcome, OUTCOME.NOT_EXERCISED, "an empty subject is not 'established'");
    assert.match(out, /NOT_EXERCISED/u, "the printed result must be distinguishable from a real pass");
  });
});

test("an empty manifest with NO lockfile is FAILED: nothing independent corroborates the empty set (#107 Codex P2)", async () => {
  // The shape of the review finding: the dependency keys became unreadable AND the lockfile was
  // deleted or renamed. Without --require this used to exit 0 as NOT_EXERCISED on no evidence at all.
  await runOn({ pkg: { name: "fixture" } }, ({ status, outcome, out }) => {
    assert.equal(status, 1, `an empty set with no lockfile must not pass:
${out}`);
    assert.equal(outcome, OUTCOME.FAILED);
    assert.match(out, /no lockfile is committed/u, "the failure must say what was missing");
  });
});

test("Arm B + lockfile deleted · renamed dependency keys beside a missing lockfile is FAILED without --require", async () => {
  await runOn({ pkg: { name: "fixture", deps: { acorn: "^8.18.0" } } }, ({ status, outcome }) => {
    assert.equal(status, 1);
    assert.equal(outcome, OUTCOME.FAILED);
  });
});

test("establishEmptySubject · a missing lockfile (null) is FAILED whether or not --require is set", () => {
  for (const require of [false, true]) {
    const v = establishEmptySubject({ lock: null, require });
    assert.equal(v.outcome, OUTCOME.FAILED, `lock=null require=${require}`);
  }
});

test("a pinned, locked dependency is ESTABLISHED", async () => {
  await runOn({ pkg: { name: "fixture", dependencies: { acorn: "8.18.0" } }, lock: lockWith("8.18.0") }, ({ status, outcome, out }) => {
    assert.equal(status, 0, out);
    assert.equal(outcome, OUTCOME.ESTABLISHED);
  });
});

test("the repository's real tree is ESTABLISHED, not NOT_EXERCISED", () => {
  const r = spawnSync(process.execPath, [MODULE, ROOT], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /every one pinned to an exact version/u);
});

// --- Arm A, the control: the pre-existing guards still fire ------------------------------------

test("Arm A · an unpinned dependency is still FAILED", async () => {
  await runOn({ pkg: { name: "fixture", dependencies: { acorn: "^8.18.0" } }, lock: lockWith("8.18.0") }, ({ status, outcome, out }) => {
    assert.equal(status, 1);
    assert.equal(outcome, OUTCOME.FAILED);
    assert.match(out, /not an exact version/u);
  });
});

test("a declared dependency with no lockfile is still FAILED", async () => {
  await runOn({ pkg: { name: "fixture", dependencies: { acorn: "8.18.0" } } }, ({ status, outcome }) => {
    assert.equal(status, 1);
    assert.equal(outcome, OUTCOME.FAILED);
  });
});

// --- the decision itself ----------------------------------------------------------------------

test("establishEmptySubject · every lockfile signal of an install contradicts an empty manifest", () => {
  const cases = {
    "root dependencies": { packages: { "": { dependencies: { a: "1.0.0" } } } },
    "root devDependencies": { packages: { "": { devDependencies: { a: "1.0.0" } } } },
    "root optionalDependencies": { packages: { "": { optionalDependencies: { a: "1.0.0" } } } },
    "root peerDependencies": { packages: { "": { peerDependencies: { a: "1.0.0" } } } },
    "an installed package": { packages: { "": {}, "node_modules/a": { version: "1.0.0" } } },
    "a v1 dependency map": { lockfileVersion: 1, dependencies: { a: { version: "1.0.0" } } },
  };
  for (const [name, lock] of Object.entries(cases)) {
    const v = establishEmptySubject({ lock, require: false });
    assert.equal(v.outcome, OUTCOME.FAILED, `${name} must contradict an empty manifest`);
    assert.ok(v.seen.length > 0, `${name} must be named`);
  }
});

// --- wiring: the stage, the environment, the result document ----------------------------------

test("checks · the stage consults the requirement and records its outcome in the result document", async () => {
  const src = await readSource(new URL("../ci/checks.sh", import.meta.url));
  const start = src.indexOf('stage "pinned-install-invariant"');
  const end = src.indexOf('stage "oracle-readiness"');
  assert.ok(start > 0 && end > start, "the pinned-install stage could not be located in ci/checks.sh");
  const region = src.slice(start, end);
  assert.match(region, /ENFORCER_REQUIRE_DEPENDENCIES/u, "the stage must consult the environment's claim");
  assert.match(region, /--require/u);
  assert.match(region, /--outcome-file=/u, "the stage must read the outcome the module decided");
  assert.match(src, /"dependencyPosture":/u, "latest.json must say what the stage established, not only that it ran");
  assert.match(src, /Dependency posture: \$DEPENDENCY_OUTCOME/u, "the printed result must carry it too");
});

test("compose.ci.yml · container CI claims the repository has dependencies", async () => {
  const yml = await readSource(new URL("../compose.ci.yml", import.meta.url));
  assert.match(yml, /^\s*ENFORCER_REQUIRE_DEPENDENCIES:\s*"1"/mu,
    "without the claim, the container route can pass the pinned-install stage on an empty dependency set");
});

test("workflow · hosted CI claims the repository has dependencies", async () => {
  const yml = await readSource(new URL("../.github/workflows/ci.yml", import.meta.url));
  const step = yml.slice(yml.indexOf("Run the authoritative check list"));
  assert.ok(step.length > 0 && step.includes("ci/checks.sh"), "the step that runs the check list could not be located");
  assert.match(step, /^\s*ENFORCER_REQUIRE_DEPENDENCIES:\s*'1'/mu);
});
