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

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { enforce } from "../scripts/enforce.mjs";
import { oracleAt, oracleSubject } from "../test-support/oracle.mjs";
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

/**
 * The one shape where a host path as `target` is NOT a subject, and why it is exempt.
 *
 * `enforce({ ...identity(), sha: "0".repeat(40), target: MLS })` fails identity resolution before
 * anything is evaluated, so the target's bytes are never read. That is asserted below by execution
 * — the same call answers identically over the oracle checkout and over an empty directory, in
 * state, in the absence of a report, and in the message — rather than assumed from the shape.
 *
 * SCOPED TO THE SENTINEL, AND FAIL-CLOSED. Only a call declaring the unresolvable all-zero SHA on
 * the same line is exempt. Give that call a sha that resolves and it evaluates the target for real,
 * the exemption stops applying, and the guard fires. Split it across lines and the guard also fires
 * — a prohibition that has to guess is better wrong in the direction that asks a human.
 */
const UNRESOLVABLE_SENTINEL = 'sha: "0".repeat(40)';

const lineContaining = (code, index) => {
  const from = code.lastIndexOf("\n", index) + 1;
  const to = code.indexOf("\n", index);
  return code.slice(from, to === -1 ? code.length : to);
};

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
      for (const m of code.matchAll(re)) {
        if (lineContaining(code, m.index).includes(UNRESOLVABLE_SENTINEL)) continue;
        hits.push({ alias, text: m[0] });
      }
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

  // THE EXEMPTION, PROVED IN BOTH DIRECTIONS. It must swallow the identity-mismatch call and
  // nothing adjacent to it, or it is a hole rather than a boundary.
  //
  // Each specimen carries the lines that MAKE `MLS` the host path. Without them the alias is
  // never derived, the scan finds nothing, and all four assertions below would agree with the
  // matcher for a reason that has nothing to do with the exemption — the vacuous shape this file
  // exists to refuse, reached while testing the guard against vacuity. Caught by that happening.
  const withAliases = (line) =>
    hostTreeAsSubject(['const ORACLE = oracleAt(TAG);', 'const MLS = ORACLE.repo;', line].join("\n"))
      .map((h) => h.text);

  assert.deepEqual(
    withAliases('const r = await enforce({ ...identity(), sha: "0".repeat(40), target: MLS });'),
    [],
    "the identity-mismatch call is exempt: it evaluates no target bytes, proved by execution below",
  );
  assert.deepEqual(
    withAliases('const r = await enforce({ ...identity(), target: MLS });'),
    ["target: MLS"],
    "without the sentinel the exemption must not apply, or it swallows the defect it was carved around",
  );
  assert.deepEqual(
    withAliases('const r = await enforce({ ...identity(), sha: SHA, target: MLS });'),
    ["target: MLS"],
    "a sha that RESOLVES evaluates the target for real, so that call is never exempt",
  );
  assert.deepEqual(
    withAliases('await enforce({ ...identity(),\n  sha: "0".repeat(40),\n  target: MLS });'),
    ["target: MLS"],
    "split across lines the guard must fire rather than guess — fail-closed, not fail-quiet",
  );

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


// ===========================================================================
// The behavioural half — the scan above says nobody WROTE the defect; these say
// the subject is actually frozen when the code RUNS.
//
// A source scan cannot see a shared cache entry. Measured on the design this file
// originally shipped with — subject and authority both resolved through one
// `cacheRoot`, and `materialise` keys an entry by SHA alone — a mutation to the
// subject was REPAIRED by the authority's own verification before any assertion
// could observe it. The scan stayed green throughout. These falsifiers are what
// distinguishes "the subject is frozen" from "the subject is never read".
// ===========================================================================

const TAG = "v1.6.0";
const ORACLE = oracleAt(TAG);
const MLS = ORACLE.repo;
const SHA = ORACLE.sha;
const NEEDS_ORACLE = { skip: ORACLE.skip };

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

/**
 * A mutable working tree over the oracle's history — what `ORACLE_REPO` is, without being it.
 *
 * These tests never write to `ORACLE_REPO`. It is a real checkout belonging to whoever configured
 * it, and a suite that edits it to prove a point has done the thing it is complaining about. A
 * clone detached onto the same commit is the same kind of object, so mutating the clone
 * demonstrates exactly what mutating the host would — deterministically, rather than by racing a
 * concurrent edit.
 */
function hostCheckout() {
  const dir = mkdtempSync(path.join(tmpdir(), "st14-host-"));
  const cloned = git(["clone", "--quiet", "--no-hardlinks", MLS, dir]);
  assert.equal(cloned.status, 0, `the stand-in host could not be cloned: ${cloned.stderr}`);
  const detached = git(["checkout", "--detach", "--quiet", SHA], dir);
  assert.equal(detached.status, 0, `the stand-in host could not be detached onto ${SHA}: ${detached.stderr}`);
  return dir;
}

const cacheRoot = () => mkdtempSync(path.join(tmpdir(), "st14-subject-cache-"));

/**
 * Edit something the official evaluator actually consumes.
 *
 * MachineLearningStandards declares every domain rule not-applicable in its own policy, which is
 * why the recorded verdict is NOT_EVALUATED over an applicable set of zero. Making one rule
 * applicable again moves that denominator, so the mutation is observable in the report rather than
 * merely present on disk.
 */
function mutateSubject(dir) {
  const policy = path.join(dir, "project-policy.yml");
  const before = readFileSync(policy, "utf8");
  assert.ok(
    before.includes("status: not-applicable"),
    "the mutation's anchor is gone; this fixture no longer edits what it claims to",
  );
  writeFileSync(policy, before.replace("status: not-applicable", "status: applicable"));
}

const applicableOf = (r) => r.report?.denominator?.applicable;

test("fixture · the mutation these tests rely on is observable in the result", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const before = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: host });
    assert.equal(applicableOf(before), 0, "the recorded starting point is an applicable set of zero");

    mutateSubject(host);

    const after = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: host });
    assert.equal(applicableOf(after), 1, "the edit must change the reported evidence, or every test below passes vacuously");
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · editing the host checkout does not change what an oracle assertion evaluated", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");

    const before = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    // The host moves underneath, exactly as a concurrent checkout or edit would move it.
    mutateSubject(host);

    const after = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    assert.equal(
      applicableOf(after),
      applicableOf(before),
      "the result moved when the host checkout was edited, so the subject was the host and not a fixed identity",
    );
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · the identity is established, not assumed from a directory existing", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");
    assert.equal(subject.frozen, true, "a subject that is not frozen may not be reported as one");
    assert.equal(subject.sha, SHA, "the subject must name the commit whose bytes it holds");

    // Checkable from the directory itself rather than from what the helper returned.
    const head = git(["rev-parse", "HEAD"], subject.dir);
    assert.equal(head.status, 0, "the materialised subject is not a git checkout, so its identity cannot be established");
    assert.equal(head.stdout.trim(), SHA, "the materialised subject is not at the commit it claims");

    const dirty = git(["status", "--porcelain"], subject.dir);
    assert.equal(dirty.stdout.trim(), "", "the materialised subject has uncommitted content, so its bytes are not the commit's");

    assert.notEqual(path.resolve(subject.dir), path.resolve(host), "the subject must not be the host checkout itself");
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · mutating the frozen subject DOES change the result — the fixture is live", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, SHA, cache);
    assert.equal(subject.ok, true, subject.why ?? "the subject could not be materialised");

    const before = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    // THE FALSIFIER THAT FOUND THE SHARED-CACHE DEFECT. If edits to the subject were also invisible,
    // "unchanged by a host edit" would prove nothing — it would mean the evaluator reads no bytes at
    // all, or that the authority's own materialisation is repairing the subject between the two
    // calls. Both were true of the design this file originally shipped with.
    mutateSubject(subject.dir);

    const after = await enforce({ standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: cache, target: subject.dir });

    assert.notEqual(
      applicableOf(after),
      applicableOf(before),
      "editing the subject changed nothing, so the frozen-subject assertions above are vacuous — " +
        "check that the subject is not sharing a cache entry with the authority",
    );
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("subject · an unmaterialisable identity fails rather than falling back to the host", NEEDS_ORACLE, async () => {
  const host = hostCheckout();
  const cache = cacheRoot();
  try {
    const subject = oracleSubject(host, "0".repeat(40), cache);

    assert.equal(subject.ok, false, "a subject that could not be materialised must not report success");
    assert.notEqual(
      subject.dir === null ? null : path.resolve(subject.dir),
      path.resolve(host),
      "materialisation failed back onto the host working tree, which is the defect wearing a helper",
    );
    assert.ok(subject.why, "a refusal must say what could not be established");
  } finally {
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("boundary · an identity mismatch consumes no subject bytes at all", NEEDS_ORACLE, async () => {
  const cache = cacheRoot();
  const empty = mkdtempSync(path.join(tmpdir(), "st14-empty-"));
  const host = hostCheckout();
  try {
    // `enforce.test.mjs` passes the oracle as `target` under a SHA that cannot resolve, and the scan
    // above exempts exactly that shape. This is what entitles it to: if the bytes are never read,
    // the target is not a subject and freezing it would be an edit made to satisfy a sentence.
    const shape = { standardsRepo: MLS, tag: TAG, sha: "0".repeat(40), cacheRoot: cache };

    const overHost = await enforce({ ...shape, target: host });
    const overEmpty = await enforce({ ...shape, target: empty });

    assert.equal(overHost.state, overEmpty.state, "the state depended on the target's content");
    assert.equal(overHost.report, undefined, "nothing was evaluated, so there is no report to depend on anything");
    assert.equal(overEmpty.report, undefined, "nothing was evaluated, so there is no report to depend on anything");

    // The strongest form: two targets whose contents share nothing produce the same answer, so the
    // answer cannot be a function of either one's bytes.
    assert.deepEqual(overHost.detail, overEmpty.detail, "the message differed by target content");
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(host, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});
