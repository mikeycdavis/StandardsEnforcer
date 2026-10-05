#!/usr/bin/env node
/**
 * The dependency posture check.
 *
 * WHAT REPLACED WHAT. Until ADR 0010 this repository had no dependencies at all, and `ci/checks.sh`
 * asserted that absence in a stage called `no-install-invariant`. The absence was the guarantee:
 * an install is a second thing that can differ between the machine that reviewed a release and the
 * machine that runs it, and a repository with nothing to install has nothing that can differ.
 *
 * ST-16 required a real JavaScript parser, so that guarantee is gone and cannot be recovered. This
 * check is the weaker property that replaces it, and the weakening is deliberate and recorded
 * rather than quietly absorbed:
 *
 *   before   there is no install, so no install can differ
 *   after    there is an install, and it is pinned, hashed and reproducible — or the build fails
 *
 * That is a procedural guarantee where there used to be a structural one. It depends on the
 * registry and on `npm ci` behaving. It is not as good. It is what taking a dependency costs, and
 * the honest thing is to say so here rather than to describe the replacement as equivalent.
 *
 * The old stage's own failure message said: "add the install step here and to the Dockerfile, and
 * record the decision — do not delete this check." This file is that instruction carried out.
 *
 * ST-17: AN EMPTY SUBJECT IS A CLAIM, NOT A DEFAULT. The stage names a subject — the declared
 * dependencies — and an earlier version read it from `package.json` and, finding none, reported the
 * invariant "vacuously true" and exited 0. That is correct for a repository that genuinely declares
 * nothing, and it is also exactly what happens when the check cannot FIND the declarations (a
 * rename, a move to workspaces, a different manifest key): nothing distinguished "no dependencies"
 * from "could not find the dependencies". Arm B of the EP-06 parent falsification certified a tree
 * with an unpinned dependency that way.
 *
 * So an empty set must now be established, by two things that do not share a failure mode with the
 * reader of `package.json`:
 *
 *   1. the committed lockfile must agree that there is nothing to install — its root entry declares
 *      no dependencies and it records no installed package. A lockfile that records any is evidence
 *      that the manifest reader looked in the wrong place, and the check FAILS naming what it saw;
 *   2. `--require` (ENFORCER_REQUIRE_DEPENDENCIES=1), the environment's own claim that this
 *      repository has dependencies, makes absence a failure outright — the same shape as
 *      ENFORCER_REQUIRE_CREDENTIAL_HYGIENE. Nothing in it is a count of anything.
 *
 * What survives is the honest vacuous case, reported as NOT_EXERCISED, the repository's existing
 * word for "the property was not examined here", rather than as a pass.
 *
 *     node ci/dependency-posture.mjs [--require] [--outcome-file=<path>] [<root>]
 *
 * Exits 0 when the posture holds, 1 when it does not. Prints one line per finding. The outcome
 * (ESTABLISHED, NOT_EXERCISED or FAILED) is written to --outcome-file for the CI result document.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** What the stage established, as distinct from whether it ran. */
export const OUTCOME = {
  ESTABLISHED: "ESTABLISHED",
  NOT_EXERCISED: "NOT_EXERCISED",
  FAILED: "FAILED",
};

/**
 * Decide whether an EMPTY declared-dependency set is genuine. Pure, so it is testable without a
 * process. `lock` is the parsed lockfile, `null` when none is committed, or `undefined` when it is
 * committed but could not be read.
 *
 * Returns { outcome, why, seen } where `seen` lists what contradicted the emptiness.
 */
export function establishEmptySubject({ lock, require }) {
  if (require) {
    return {
      outcome: OUTCOME.FAILED,
      why: "ENFORCER_REQUIRE_DEPENDENCIES=1: this environment claims the repository has dependencies, but none were found in package.json",
      seen: [],
    };
  }
  if (lock === undefined) {
    return { outcome: OUTCOME.FAILED, why: "package.json declares no dependencies but package-lock.json could not be read to corroborate that", seen: [] };
  }
  if (lock === null) {
    return { outcome: OUTCOME.NOT_EXERCISED, why: "package.json declares no dependencies and no lockfile is committed", seen: [] };
  }
  const seen = [];
  const root = lock.packages?.[""] ?? {};
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(root[key] ?? {})) seen.push(`lockfile root declares ${key}.${name}`);
  }
  for (const key of Object.keys(lock.packages ?? {})) {
    if (key !== "") seen.push(`lockfile records installed package "${key}"`);
  }
  for (const name of Object.keys(lock.dependencies ?? {})) seen.push(`lockfile (v1) records dependency "${name}"`);
  if (seen.length > 0) {
    return {
      outcome: OUTCOME.FAILED,
      why: "package.json declares no dependencies but package-lock.json says there is something to install — the declarations were not found, not absent",
      seen,
    };
  }
  return {
    outcome: OUTCOME.NOT_EXERCISED,
    why: "package.json declares no dependencies and package-lock.json records nothing to install — nothing to pin, so the invariant was not exercised",
    seen: [],
  };
}

/** Run the check. Returns { exitCode, outcome, lines }; performs no output itself. */
export function run({ root, require = false }) {
  const lines = [];
  const say = (s) => lines.push(s);
  let failed = false;
  const fail = (msg) => {
    say(`FAIL  ${msg}`);
    failed = true;
  };
  const done = (outcome) => ({ exitCode: failed || outcome === OUTCOME.FAILED ? 1 : 0, outcome: failed ? OUTCOME.FAILED : outcome, lines });

  // An exact version, and nothing else. Not `^8.18.0`, not `~8.18.0`, not `8.x`, not `>=8`, not a
  // tarball URL, not a git ref, not `latest`. Each of those makes the installed tree a function of
  // when you installed rather than of what the commit says, which is the property being defended.
  const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  const pkgPath = resolve(root, "package.json");
  const lockPath = resolve(root, "package-lock.json");

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const names = Object.keys(declared);

  // --- 1. a declared dependency requires a committed lockfile -------------------------------------
  // Without one, `npm ci` cannot run and `npm install` resolves against the registry's present tense.
  //
  // An EMPTY set is not assumed to be genuine. See establishEmptySubject and the header: absence of
  // declarations is only a pass when something independent of this reader of package.json agrees.
  if (names.length === 0) {
    let lock = null;
    if (existsSync(lockPath)) {
      try {
        lock = JSON.parse(readFileSync(lockPath, "utf8"));
      } catch {
        lock = undefined;
      }
    }
    const verdict = establishEmptySubject({ lock, require });
    if (verdict.outcome === OUTCOME.FAILED) {
      fail(verdict.why);
      for (const s of verdict.seen) say(`      ${s}`);
      say("      An empty dependency set is a claim that needs evidence; this one has none.");
      return done(OUTCOME.FAILED);
    }
    say(`${verdict.why}`);
    say("pinned-install invariant  NOT_EXERCISED — there was no dependency to examine");
    say("this repository had no dependencies before ADR 0010; if that is again the case, say so there");
    return done(OUTCOME.NOT_EXERCISED);
  }

  if (!existsSync(lockPath)) {
    fail(`package.json declares ${names.length} dependencies but package-lock.json is not committed.`);
    say("      Without a lockfile there is no reproducible install and `npm ci` cannot run.");
    return done(OUTCOME.FAILED);
  }

  // --- 2. every declared specifier is an exact version --------------------------------------------
  for (const [name, spec] of Object.entries(declared)) {
    if (!EXACT.test(spec)) {
      fail(`dependency "${name}" is declared as "${spec}", which is not an exact version.`);
      say("      A range makes the installed tree depend on when it was installed. Pin it exactly.");
    }
  }

  const lock = JSON.parse(readFileSync(lockPath, "utf8"));

  // --- 3. the lockfile carries integrity metadata --------------------------------------------------
  // lockfileVersion 1 has no `packages` map and no per-package integrity, so pinning it proves the
  // version but not the bytes.
  if (!(lock.lockfileVersion >= 2) || !lock.packages) {
    fail(`package-lock.json is lockfileVersion ${lock.lockfileVersion}, which carries no integrity map.`);
    say("      Regenerate it with npm 7 or later so every package is hash-pinned.");
  } else {
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path === "" || entry.link) continue; // the root project, and workspace links, resolve locally
      if (!entry.resolved || !entry.integrity) {
        fail(`lockfile entry "${path}" has no ${entry.resolved ? "integrity" : "resolved URL"}.`);
        say("      Every installed package must be pinned to bytes, not just to a version.");
      }
    }
  }

  // --- 4. the lockfile agrees with package.json ----------------------------------------------------
  // `npm ci` refuses an out-of-sync pair, so this duplicates it on purpose: the duplicate names the
  // specific disagreement, where npm names the pair. Both run; neither is trusted to be the only one.
  for (const [name, spec] of Object.entries(declared)) {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry) {
      fail(`"${name}" is declared in package.json but has no entry in package-lock.json.`);
    } else if (entry.version !== spec) {
      fail(`"${name}" is declared as ${spec} but locked at ${entry.version}.`);
      say("      package.json and package-lock.json disagree; `npm ci` would refuse this tree.");
    }
  }

  // --- 5. node_modules/ is installed, never committed ----------------------------------------------
  // The old check asserted node_modules/ was absent. It cannot any more: after `npm ci` it is
  // legitimately present, and asserting its absence here would only prove the install had not run yet.
  // The property that still matters is that it is not IN THE COMMIT.
  //
  // The container source arrives via `git archive` and carries no git metadata, so this is reported as
  // NOT_EXERCISED there rather than as a pass it did not earn — the same distinction the credential
  // hygiene stage draws, and for the same reason. The archive is built from tracked files only, so a
  // committed node_modules/ would be caught by this check wherever git metadata does exist.
  let tracked = null;
  try {
    tracked = execFileSync("git", ["-C", root, "ls-files", "node_modules"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    tracked = null; // no git metadata here
  }

  if (tracked === null) {
    say("node_modules/ committed-state  NOT_EXERCISED — no git metadata in this tree");
  } else if (tracked !== "") {
    const n = tracked.split("\n").length;
    fail(`node_modules/ is committed: ${n} tracked file(s) under it.`);
    say("      Dependencies are installed from the lockfile, never vendored into the commit.");
  } else {
    say("node_modules/ is not tracked by git — installed from the lockfile, not committed");
  }

  if (failed) return done(OUTCOME.FAILED);

  say(`${names.length} dependency(ies), every one pinned to an exact version`);
  say("package-lock.json is committed, integrity-pinned, and agrees with package.json");
  say("the install is reproducible — a weaker guarantee than having no install (ADR 0010)");
  return done(OUTCOME.ESTABLISHED);
}

// Only when run as a program, so the test can import the decision without executing a check.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const require = args.includes("--require");
  const outcomeArg = args.find((a) => a.startsWith("--outcome-file="));
  const positional = args.filter((a) => !a.startsWith("--"));
  const result = run({ root: positional[0] ?? process.cwd(), require });
  for (const l of result.lines) process.stdout.write(`${l}
`);
  if (outcomeArg) writeFileSync(outcomeArg.slice("--outcome-file=".length), `${result.outcome}
`);
  process.exit(result.exitCode);
}
