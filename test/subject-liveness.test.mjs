/**
 * ST-16. The standing mechanism: no assurance verdict in the authoritative surface may be derived
 * from a collection this repository never proved had elements.
 *
 * ST-15 asked what the VERDICT looked like and recognised one shape. This asks what the test
 * CONSUMED, which is the question the acceptance property actually poses. The three shapes ST-16 was
 * filed for — a filter-derived verdict, assertions only inside the iteration, and an `every`
 * predicate — have nothing in common at the verdict end, and everything in common at the subject end.
 *
 * WHAT THIS DOES NOT DO. It does not close the shape space. Two specimens in `fixtures/escapes/`
 * still pass, and they are kept as executable record rather than described in prose: if a later
 * change catches one, the test below fails and says so, so the gap cannot quietly change size in
 * either direction. ST-16 stays open on exactly that residue.
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
  // Asserting the gap rather than describing it. Closing one of these should be a deliberate act
  // that updates ST-16, not a silent improvement nobody records — and equally, the gap must not
  // widen without the suite noticing.
  const caught = [];
  for (const [name, file] of fixtures("escapes")) {
    if (vacuousSubjects(scan(file)).length > 0) caught.push(name);
  }
  assert.deepEqual(
    caught,
    [],
    "a known-uncaught shape is now caught. That is good news: move the specimen into caught/ and " +
      "record it against ST-16, whose remaining gap is exactly this directory.",
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
