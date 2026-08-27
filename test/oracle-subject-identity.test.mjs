/**
 * ST-14. The subject of an oracle-dependent assertion must be identified bytes, not a host path.
 *
 * WHAT THIS GUARDS. `ENFORCER_ORACLE_REPO` names a working tree on the machine running the suite.
 * The authority half of the oracle chain never trusts it — the tag is resolved to a SHA, the SHA is
 * verified, and a checkout is materialised from the object database and re-verified before use, so
 * no byte of that working tree reaches the executed evaluator. The subject half had no such
 * discipline: three assertions passed `ORACLE_REPO` itself in as the governed repository, and the
 * evaluator read that tree off disk.
 *
 * WHY THAT IS THIS EPIC'S PROBLEM AND NOT TIDINESS. Measured before this guard existed, against a
 * clone of the oracle pinned at v1.6.0, with ONE uncommitted edit to `project-policy.yml` and HEAD
 * never moving:
 *
 *     target: ORACLE_REPO      report.standardVersion  "9.9.9"   <- a value in no commit
 *     target: materialised     report.standardVersion  "1.0.0"   <- the committed bytes
 *
 * Both runs reported `standards.verified: true` and `standards.sha: eda15a2…`. The first is
 * evidence claiming an immutable identity for a result that came from a mutable tree — the exact
 * shape this repository exists to refuse, inside the suite that certifies it. A second mutation
 * (emptying `applicability`) turned the same call into ENFORCEMENT_ERROR, so the failure is
 * available in both the silent and the loud direction.
 *
 * WHAT THIS DOES NOT CLAIM. That any particular historical run was wrong. The finding is about the
 * consumption path — that host edits *can* reach the result — established by construction rather
 * than by catching one.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSource, stripComments } from "../test-support/source-scan.mjs";
import { testFiles } from "../scripts/test-surface.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * The expressions that carry the raw `ENFORCER_ORACLE_REPO` path.
 *
 * These are DERIVED from each file rather than listed, because a list only ever names the spellings
 * that existed when it was written. `const subjectRoot = ORACLE.repo` is an ordinary refactor, and
 * against a fixed list it reinstates the whole defect while leaving this guard green — which is the
 * vacuous-guard shape the suite this file belongs to exists to refuse.
 *
 * The roots are the environment variable and the name `test-support/oracle.mjs` exports for it.
 * `oracleAt(...)` returns an object whose `repo` field is that same path, so any binding holding one
 * is a root too, and `ORACLE` is included by name so a specimen can be checked without calling it.
 */
const ORACLE_ENV = "process.env.ENFORCER_ORACLE_REPO";

function oracleAliases(code) {
  const holders = new Set(["ORACLE"]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*oracleAt\s*\(/gu)) {
    holders.add(m[1]);
  }

  const tainted = new Set([ORACLE_ENV, "ORACLE_REPO"]);
  for (const h of holders) tainted.add(`${h}.repo`);

  // A fixpoint, because aliasing chains: `const MLS = ORACLE.repo`, then `const subject = MLS`.
  for (let changed = true; changed; ) {
    changed = false;
    const add = (name) => {
      if (name && !tainted.has(name)) {
        tainted.add(name);
        changed = true;
      }
    };
    // `const NAME = <an expression already known to be the host path>`
    for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/gu)) {
      if (tainted.has(m[2].trim().replace(/[;,]$/u, ""))) add(m[1]);
    }
    // `const { repo } = ORACLE`, and `const { repo: NAME } = ORACLE`
    for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*([A-Za-z_$][\w$]*)/gu)) {
      if (!holders.has(m[2])) continue;
      for (const part of m[1].split(",")) {
        const [key, alias] = part.split(":").map((piece) => piece.trim());
        if (key === "repo") add(alias || key);
      }
    }
  }
  return tainted;
}

const escapeForRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** `target:` bound to one of those expressions, or a path joined onto one. */
function hostTreeAsSubject(code) {
  const hits = [];
  for (const alias of oracleAliases(code)) {
    const a = escapeForRegExp(alias);
    // `target: MLS` — the subject IS the host tree.
    const asTarget = new RegExp(`target:\\s*${a}\\b`, "gu");
    // `path.join(MLS, …)` — a path built from the host tree, which is the same defect with a
    // filename on the end. `policyPath: path.join(MLS, "project-policy.yml")` is the live instance.
    const asJoin = new RegExp(`path\\.join\\(\\s*${a}\\s*,`, "gu");
    for (const re of [asTarget, asJoin]) {
      for (const m of code.matchAll(re)) hits.push({ alias, text: m[0] });
    }
  }
  return hits;
}

test("subject · no oracle-dependent assertion takes the host oracle path as its subject", async () => {
  // THE GUARD'S OWN LIVENESS, asserted before anything it guards. A scan whose file list came back
  // empty, or whose comment stripping removed the code, would report success having examined
  // nothing — which is the ST-11 defect, and this guard is not entitled to repeat it.
  const files = testFiles(ROOT);
  assert.ok(files.length > 0, "the test surface is empty, so this scan would prove nothing");

  const scanned = [];
  const offenders = [];
  for (const file of files) {
    if (file === "test/oracle-subject-identity.test.mjs") continue; // this file names them to forbid them
    const src = await readSource(new URL(`../${file}`, import.meta.url));
    assert.ok(src.length > 0, `${file} read as empty, so the scan below would prove nothing`);
    // SCANNED AS CODE, NOT AS TEXT. Every suite here is entitled to explain in a comment why it
    // does not take the host tree as a subject, without the explanation being the violation.
    const code = stripComments(src);
    scanned.push(file);
    for (const hit of hostTreeAsSubject(code)) offenders.push(`${file}: ${hit.text}`);
  }

  assert.ok(scanned.length > 0, "no file was scanned, so this assertion establishes nothing");

  assert.deepEqual(
    offenders,
    [],
    "an oracle-dependent assertion is reading the host working tree as its subject. Materialise it " +
      "at the pinned commit by the route the authority already uses (`resolveIdentity(...).dir`) " +
      "rather than passing `ENFORCER_ORACLE_REPO` in directly — otherwise the evidence names an " +
      "immutable identity for bytes that were not it.",
  );
});

test("subject · the guard can see a violation, so its silence means something", async () => {
  // A prohibition that cannot demonstrate a positive is indistinguishable from a broken matcher.
  // The first four shapes were live in `test/enforce.test.mjs` before this item. The rest are
  // refactors that a fixed list of spellings would wave through while the defect came straight
  // back — which is why the aliases are derived from the code instead of enumerated.
  const specimen = [
    'const ORACLE = oracleAt(TAG);',
    'const MLS = ORACLE.repo;',
    'const r = await enforce({ ...identity(), target: MLS });',
    'const d = runOfficialEvaluator(id.dir, { target: MLS, policyPath: path.join(MLS, "p.yml") });',
    'await enforce({ ...identity(), target: ORACLE_REPO });',
    'await enforce({ ...identity(), target: ORACLE.repo });',
    // renamed — the exact refactor a hardcoded list misses
    'const subjectRoot = ORACLE.repo;',
    'await enforce({ ...identity(), target: subjectRoot });',
    // destructured, plain and renamed
    'const { repo } = ORACLE;',
    'await enforce({ ...identity(), target: repo });',
    'const { repo: hostTree } = ORACLE;',
    'await enforce({ ...identity(), target: hostTree });',
    // aliased through a chain, so one hop is not the limit
    'const hop = MLS;',
    'const further = hop;',
    'await enforce({ ...identity(), target: further });',
    // and the environment variable read straight through
    'await enforce({ ...identity(), target: process.env.ENFORCER_ORACLE_REPO });',
  ].join("\n");

  const found = hostTreeAsSubject(specimen).map((h) => h.text);
  const required = [
    "target: MLS",
    "path.join(MLS,",
    "target: ORACLE_REPO",
    "target: ORACLE.repo",
    "target: subjectRoot",
    "target: repo",
    "target: hostTree",
    "target: further",
    "target: process.env.ENFORCER_ORACLE_REPO",
  ];
  for (const shape of required) {
    assert.ok(found.includes(shape),
      `the matcher missed \`${shape}\`, so a refactor to that shape would restore the defect ` +
      `silently. Found: ${JSON.stringify(found)}`);
  }

  // And that it does not fire on the remedy, or this guard forbids its own fix.
  assert.deepEqual(hostTreeAsSubject('await enforce({ ...identity(), target: id.dir });'), []);
  // Nor on a materialised checkout that merely passed THROUGH the host path to get there.
  assert.deepEqual(
    hostTreeAsSubject([
      'const ORACLE = oracleAt(TAG);',
      'const MLS = ORACLE.repo;',
      'const subject = resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE }).dir;',
      'await enforce({ ...identity(), target: subject });',
    ].join("\n")),
    [],
    "the repair materialises from the host path; treating that as a violation would forbid the fix",
  );
});
