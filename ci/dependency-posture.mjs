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
 * Exits 0 when the posture holds, 1 when it does not. Prints one line per finding.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.argv[2] ?? process.cwd();
const say = (s) => process.stdout.write(`${s}\n`);

let failed = false;
const fail = (msg) => {
  say(`FAIL  ${msg}`);
  failed = true;
};

// An exact version, and nothing else. Not `^8.18.0`, not `~8.18.0`, not `8.x`, not `>=8`, not a
// tarball URL, not a git ref, not `latest`. Each of those makes the installed tree a function of
// when you installed rather than of what the commit says, which is the property being defended.
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const pkgPath = resolve(root, "package.json");
const lockPath = resolve(root, "package-lock.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const names = Object.keys(declared);

// --- 1. a declared dependency requires a committed lockfile ---------------------------------------
// Without one, `npm ci` cannot run and `npm install` resolves against the registry's present tense.
if (names.length === 0) {
  say("package.json declares no dependencies — the pinned-install invariant is vacuously true");
  say("this repository had no dependencies before ADR 0010; if that is again the case, say so there");
  process.exit(0);
}

if (!existsSync(lockPath)) {
  fail(`package.json declares ${names.length} dependencies but package-lock.json is not committed.`);
  say("      Without a lockfile there is no reproducible install and `npm ci` cannot run.");
  process.exit(1);
}

// --- 2. every declared specifier is an exact version ----------------------------------------------
for (const [name, spec] of Object.entries(declared)) {
  if (!EXACT.test(spec)) {
    fail(`dependency "${name}" is declared as "${spec}", which is not an exact version.`);
    say("      A range makes the installed tree depend on when it was installed. Pin it exactly.");
  }
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));

// --- 3. the lockfile carries integrity metadata ----------------------------------------------------
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

// --- 4. the lockfile agrees with package.json ------------------------------------------------------
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

// --- 5. node_modules/ is installed, never committed -------------------------------------------------
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

if (failed) process.exit(1);

say(`${names.length} dependency(ies), every one pinned to an exact version`);
say("package-lock.json is committed, integrity-pinned, and agrees with package.json");
say("the install is reproducible — a weaker guarantee than having no install (ADR 0010)");
process.exit(0);
