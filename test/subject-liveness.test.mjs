/**
 * ST-16. The standing mechanism: no assurance verdict in the authoritative surface may be derived
 * from a collection this repository never proved had elements.
 *
 * ST-15 asked what the VERDICT looked like and recognised one shape. This asks what the test
 * CONSUMED, which is the question the acceptance property actually poses. The three shapes ST-16 was
 * filed for — a filter-derived verdict, assertions only inside the iteration, and an `every`
 * predicate — have nothing in common at the verdict end, and everything in common at the subject end.
 *
 * WHAT THIS DOES NOT DO. It does not close the shape space, and no number of attack rounds can show
 * that it has. `fixtures/escapes/` holds one specimen per shape known NOT to be rejected, and
 * `KNOWN_ESCAPES` below is the list of them. It holds exactly one: a verdict written with a foreign
 * assertion library, which reaches its verdict through neither `node:assert` nor `throw` and so is
 * invisible to the mechanism. The dialect test below is its compensating control, not its closure.
 *
 * The list is a CLAIM, checked against the directory in both directions, so the gap cannot change
 * size without the suite saying so. What has actually been attacked — nine adversarial rounds, and
 * what each one found — is recorded in `artifacts/evidence/2026-08-28-subject-liveness.md`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../test-support/source-scan.mjs";
import { vacuousSubjects, rootSubject, blockAt, receiverBefore } from "../test-support/subject-liveness.mjs";
import { testFiles } from "../scripts/test-surface.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FIXTURES = path.join(HERE, "fixtures", "subject-liveness");

/** Read as the mechanism reads: comments and string bodies blanked, so a specimen held as data
 *  cannot satisfy a rule about what a file asserts. ST-15 shipped that hole and had to repair it. */
const scan = (file) => stripComments(fs.readFileSync(file, "utf8"), { strings: true });

const fixtures = (kind) => {
  const dir = path.join(FIXTURES, kind);
  const names = fs.readdirSync(dir).filter((n) => n.endsWith(".mjs")).sort();
  assert.ok(names.length > 0, `no ${kind} specimens were found, so the cases below would prove nothing`);
  return names.map((n) => [n, path.join(dir, n)]);
};

/**
 * The shapes ST-16 is known NOT to reject, as filenames in `fixtures/escapes/`.
 *
 * `ternary.mjs` and `join-empty.mjs` were the first round's residue and are now in `caught/`. What
 * remains is the foreign-dialect shape, which is a limit of what this mechanism READS rather than a
 * sink it failed to recognise. The test below compares this list against the directory, so a new
 * escape has to be recorded here to be added and a closed one has to be moved out; the gap cannot
 * change size in either direction without the suite saying so.
 */
const KNOWN_ESCAPES = ["foreign-assert.mjs"];

test("subject · every consumed collection in the surface was proven to have elements", () => {
  const files = testFiles(ROOT);
  assert.ok(files.length > 0, "the authoritative surface is empty, so this guard would examine nothing");

  const offenders = [];
  const scanned = [];
  for (const file of files) {
    const code = scan(file);
    assert.ok(code.length > 0, `${file} scanned to nothing`);
    scanned.push(file);
    for (const subject of vacuousSubjects(code)) {
      offenders.push(`${path.relative(ROOT, file).split(path.sep).join("/")}: ${subject}`);
    }
  }
  assert.equal(scanned.length, files.length, "a file in the surface was not scanned");

  assert.deepEqual(
    offenders,
    [],
    "a test derives a verdict from a collection it never proved was non-empty. If the collection " +
      "is discovered at runtime, assert its length before the verdict; if it is a literal in the " +
      "file, it is already exempt and this is a defect in the discriminator.",
  );
});

test("subject · the mechanism fires on every shape it claims to catch", () => {
  const missed = [];
  for (const [name, file] of fixtures("caught")) {
    if (vacuousSubjects(scan(file)).length === 0) missed.push(name);
  }
  assert.deepEqual(missed, [], "a specimen the mechanism claims to catch escaped it");
});

test("subject · the shapes it does not catch are recorded, not forgotten", () => {
  // Asserting the gap rather than describing it, in both directions. `entries` is asserted non-empty
  // first because the directory carries a README: without that, an escapes/ deleted wholesale would
  // make this test pass by examining nothing — the very defect ST-16 exists to reject, in the test
  // that polices ST-16's own residue.
  const entries = fs.readdirSync(path.join(FIXTURES, "escapes"));
  assert.ok(entries.length > 0, "fixtures/escapes/ is empty of everything, including its README");

  const specimens = entries.filter((n) => n.endsWith(".mjs")).sort();
  assert.deepEqual(
    specimens,
    KNOWN_ESCAPES,
    "the escape corpus and KNOWN_ESCAPES disagree. Adding a newly found escape means adding both; " +
      "closing one means moving the specimen into caught/ and removing it from the list. Either way " +
      "the change belongs in ST-16's record.",
  );

  const nowCaught = specimens.filter((n) => vacuousSubjects(scan(path.join(FIXTURES, "escapes", n))).length > 0);
  assert.deepEqual(
    nowCaught,
    [],
    "a known-uncaught shape is now caught. That is good news: move the specimen into caught/ and " +
      "record the closure against ST-16.",
  );
});

test("subject · the assertion dialect the mechanism assumes is the one the surface uses", () => {
  // The compensating control for the single known escape. The mechanism reads verdicts written with
  // `node:assert` or `throw`; a foreign assertion library reaches a verdict through neither and its
  // loops read as data shaping. That assumption is currently true of every file in the surface, and
  // this is what keeps it true — adopting another library fails here rather than silently widening
  // `fixtures/escapes/`. It is a guard on the assumption, NOT a closure of the gap.
  const files = testFiles(ROOT);
  assert.ok(files.length > 0, "the authoritative surface is empty, so this guard would examine nothing");

  const foreign = files
    .filter((f) => !/from\s+"node:assert/u.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"));

  assert.deepEqual(
    foreign,
    [],
    "a file in the authoritative surface does not import node:assert. The subject-liveness mechanism " +
      "cannot read verdicts written in another library's dialect, so this file's loops would be " +
      "invisible to it. Either keep the dialect, or extend the mechanism and record it against ST-16.",
  );
});

test("subject · the three shapes ST-16 was filed for are each rejected", () => {
  for (const shape of ["probe-filter", "probe-inloop", "probe-every"]) {
    const found = vacuousSubjects(scan(path.join(FIXTURES, "caught", `${shape}.mjs`)));
    assert.ok(found.length > 0, `${shape} — the shape this story exists to reject — was accepted`);
  }
});

test("subject · a proof of liveness is accepted, in each form an honest test uses", () => {
  const live = [
    'const files = discover(); assert.ok(files.length > 0); for (const f of files) { assert.ok(f); }',
    'const s = discover(); assert.ok(s.size > 0); for (const x of s) { assert.ok(x); }',
    'const P = discover(); assert.deepEqual([...P].sort(), ["OUT_OF_SCOPE"]); for (const s of P) { assert.ok(s); }',
    'const T = { a: 1 }; for (const [k, v] of Object.entries(T)) { assert.ok(k, v); }',
    'const rows = [1, 2]; for (const r of rows) { assert.ok(r); }',
    'assert.ok(items.some((i) => i.ok));',
    'for (const c of a.controls) c.source = "rulesets";',
    // Liveness proved AFTER the loop. The rule is file-level, and an author who asserts the bound at
    // the end of the test has proved exactly as much as one who asserts it at the start. This was
    // written as an attack specimen in round eight and reclassified when it turned out to be honest.
    'const files = discover(); for (const f of files) assert.ok(ok(f)); assert.ok(files.length > 0);',
    // A verdict list iterated to build a message: `findings` empty is the SUCCESS, and its subject
    // `RECORDS` is proven above it.
    'const RECORDS = read(); assert.ok(RECORDS.length > 0); const findings = check(RECORDS); const out = []; for (const f of findings) out.push(f.kind); assert.deepEqual(out, []);',
    // `notEqual(x.length, 0)` is a lower bound written as a refusal. Also written as an attack
    // specimen and reclassified: it proves exactly what `assert.ok(x.length > 0)` proves.
    'const files = discover(); assert.notEqual(files.length, 0); for (const f of files) assert.ok(ok(f));',
  ];
  for (const code of live) {
    assert.deepEqual(vacuousSubjects(code), [], `an honest shape was flagged: ${code}`);
  }
});

test("subject · the mechanism's own liveness is asserted, not assumed", () => {
  // ST-11's requirement for any structural guard: fire on a planted violation, stay silent on the
  // remedy. Verified against a real file rather than only a string, because ST-15's equivalent test
  // passed while the mechanism could not see itself.
  const planted = path.join(FIXTURES, "caught", "probe-filter.mjs");
  assert.ok(vacuousSubjects(scan(planted)).length > 0, "the guard did not fire on a planted violation");

  const remedied = scan(planted).replace(
    "const offenders = files.filter",
    "assert.ok(files.length > 0);\n  const offenders = files.filter",
  );
  assert.notEqual(remedied, scan(planted), "the remedy did not apply, so its silence proves nothing");
  assert.deepEqual(vacuousSubjects(remedied), [], "the guard still fired after the violation was remedied");
});

test("subject · the mechanism's own parts are not vacuous", () => {
  assert.equal(rootSubject("files.map((f) => f.x).filter(Boolean)"), "files");
  assert.equal(rootSubject("Object.entries(TABLE)"), "Object.entries(TABLE)");
  assert.equal(blockAt("for (const x of y) go(x); after();", 18).trim(), "go(x);");
  assert.equal(blockAt("if (a) { b(); }", 6).trim(), "b();");
  const chain = "assert.ok(files.map((f) => g(f)).every(Boolean))";
  assert.equal(receiverBefore(chain, chain.indexOf(".every(")), "files.map((f) => g(f))");
});
