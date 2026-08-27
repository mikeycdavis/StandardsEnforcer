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
 * The identifiers this repository's suites bind the raw `ENFORCER_ORACLE_REPO` path to.
 *
 * `ORACLE.repo` is the value itself; `MLS` and `ORACLE_REPO` are the two names it is currently
 * given. Listed rather than pattern-matched, so a new alias is a deliberate addition here instead
 * of something a regex silently accepts.
 */
const HOST_PATH_ALIASES = ["MLS", "ORACLE_REPO", "ORACLE.repo"];

/** `target:` bound to one of those aliases, or a path joined onto one. */
function hostTreeAsSubject(code) {
  const hits = [];
  for (const alias of HOST_PATH_ALIASES) {
    const a = alias.replace(".", "\\.");
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
  // These are the four shapes that were live in `test/enforce.test.mjs` before this item.
  const specimen = [
    'const r = await enforce({ ...identity(), target: MLS });',
    'const d = runOfficialEvaluator(id.dir, { target: MLS, policyPath: path.join(MLS, "p.yml") });',
    'await enforce({ ...identity(), target: ORACLE_REPO });',
    'await enforce({ ...identity(), target: ORACLE.repo });',
  ].join("\n");

  const found = hostTreeAsSubject(specimen).map((h) => h.text);
  assert.ok(found.length >= 5, `the matcher missed a known violation shape: ${JSON.stringify(found)}`);
  assert.ok(found.includes("target: MLS"), "the plain `target: MLS` form is not matched");
  assert.ok(found.includes("path.join(MLS,"), "the joined-path form is not matched");
  assert.ok(found.includes("target: ORACLE_REPO"), "the ORACLE_REPO alias is not matched");
  assert.ok(found.includes("target: ORACLE.repo"), "the ORACLE.repo alias is not matched");

  // And that it does not fire on the remedy, or this guard forbids its own fix.
  assert.deepEqual(hostTreeAsSubject('await enforce({ ...identity(), target: id.dir });'), []);
});
