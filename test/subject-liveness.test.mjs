/**
 * ST-16. The standing mechanism: no assurance verdict in the authoritative surface may be derived
 * from a collection this repository never proved had elements.
 *
 * ST-15 asked what the VERDICT looked like and recognised one shape. This asks what the test
 * CONSUMED, which is the question the acceptance property actually poses. The three shapes ST-16 was
 * filed for — a filter-derived verdict, assertions only inside the iteration, and an `every`
 * predicate — have nothing in common at the verdict end, and everything in common at the subject end.
 *
 * ROUND THREE ADDS THE PREMISE. Reading a verdict at all assumes a language it is written in, and
 * round two guarded that assumption by asking whether each surface file imports `node:assert`. That
 * question is too weak: a file may import `node:assert`, assert with it, AND reach its verdict
 * through something else entirely. `fixtures/unsupported/` holds three such files, each of which
 * passes the old guard and escapes the liveness rules.
 *
 * The question that closes is not "does this file use the dialect" but "can this file reach a
 * verdict through anything the mechanism cannot read". `test-support/verdict-language.mjs` answers
 * it by enumerating what a call can root at — an import, a declaration, a parameter, a language
 * global — and reporting everything else. An unreadable verdict form makes the file UNSUPPORTED, and
 * an unsupported file is an OFFENDER, never a skip: declining to analyse what it cannot read would
 * be this guard committing the exact defect it exists to reject.
 *
 * WHAT THIS STILL DOES NOT DO. It does not close the shape space, and no number of attack rounds can
 * show that it has. `fixtures/escapes/` holds one specimen per shape known NOT to be rejected, and
 * `KNOWN_ESCAPES` below is the list of them, compared against the directory in both directions so
 * the gap cannot change size without the suite saying so. What has actually been attacked is
 * recorded in `artifacts/evidence/`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../test-support/source-scan.mjs";
import { vacuousSubjects, rootSubject, blockAt, receiverBefore } from "../test-support/subject-liveness.mjs";
import { unsupportedReasons, verdictReachingImports } from "../test-support/verdict-language.mjs";
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

/** A module as the analysers need it: RAW for import specifiers, stripped for code. */
const moduleAt = (file) => {
  const raw = fs.readFileSync(file, "utf8");
  return { raw, src: stripComments(raw, { strings: true }), path: file };
};

/** Load a relative specifier against the module that wrote it, or null if it cannot be read. */
const load = (spec, fromPath) => {
  try {
    return moduleAt(path.resolve(path.dirname(fromPath), spec));
  } catch {
    return null;
  }
};

/** Everything wrong with one file: the verdict forms it cannot be read through, then its subjects. */
const offencesIn = (file) => {
  const mod = moduleAt(file);
  const { names, unresolved } = verdictReachingImports(mod, { load });
  return [
    ...unsupportedReasons(mod.raw, mod.src).map((r) => `UNSUPPORTED ${r}`),
    ...unresolved.map((r) => `UNSUPPORTED ${r}`),
    ...vacuousSubjects(mod.src, names).map((v) => `VACUOUS ${v}`),
  ];
};

/**
 * The verdict forms the enforced dialect actually admits in this surface, as `assert.<name>`.
 *
 * This is the PREMISE made explicit. It is a claim about the repository, checked against the
 * repository in both directions by the test below: a form used here and missing from this list, or
 * listed here and used nowhere, both fail. Measured on 2026-08-28 as 1,025 assertion calls across
 * the 36 enumerated files.
 *
 * `strictEqual` and `deepStrictEqual` are deliberately absent: every file imports
 * `node:assert/strict`, under which `equal` IS `strictEqual`, so listing them would be describing a
 * dialect this surface does not write.
 */
const ADMITTED_ASSERTIONS = [
  "deepEqual", "doesNotMatch", "doesNotThrow", "equal", "fail", "match", "notDeepEqual", "notEqual",
  "ok", "throws",
];

/**
 * The shapes ST-16 is known NOT to reject, as filenames in `fixtures/escapes/`.
 *
 * `foreign-assert.mjs` was the residue after round two and is gone from this list: it now lives in
 * `fixtures/unsupported/`, because the mechanism rejects the FILE rather than reading the shape.
 * Rejection is a weaker and more honest thing than catching, and the tests below say which is which.
 *
 * Round twelve found six, run against a mechanism it did not modify. Round thirteen closed five of
 * them and they now live in `caught/`: four to a data-flow model of attribution, and
 * `optional-subject.mjs` to admitting `?.` in the subject grammar, which six other rules in the same
 * mechanism already read.
 *
 * ONE REMAINS, AND IT IS NOT THE FAULT IT WAS FILED AS. Round twelve recorded all six as attribution
 * failures. Measurement says `symbol-iterator.mjs` is not one: its consumption IS found and its
 * subject IS `box`. It escapes because `staticallyNonEmpty` counts an object literal's own members as
 * proof the collection is non-empty. That is sound for an array literal, whose members are its
 * elements, and unsound for an object consumed by `for-of`, where `Symbol.iterator` decides what is
 * yielded — here, from `files`, which may be empty. A false PROOF OF LIVENESS, not a lost name.
 *
 * It is left open rather than patched here because closing it changes what counts as evidence of
 * liveness, and `Object.entries({ ... })` is a legitimate case where the member count IS the proof.
 * Separating the two is its own work with its own falsifier, not a line in this change.
 *
 * ROUND FIFTEEN closed round fourteen's seven aliasing shapes, and they are now in `caught/`. It did
 * it by inverting the flow question rather than by adding an edge per hop: an expression CARRIES a
 * checker unless every mention of a carrier is a call whose result is data. The set of ways a value
 * can travel is open; the set of ways it stops is closed and has one member.
 *
 * `await-subject.mjs` remains, and like `symbol-iterator.mjs` it is deliberately out of scope for the
 * flow work: the subject grammar does not admit `await`, so the loop is never a consumption at all.
 * Both are recorded as their own faults rather than folded into the analysis that does not cover them.
 *
 * ROUND SIXTEEN then ran twenty new shapes against what round fifteen left behind, unmodified during
 * the round, and found **three**. They are recorded here rather than patched, because patching them
 * would make round sixteen stop counting and the next round would have to establish everything again:
 *
 *   `member-assign.mjs`   `o.c = chk` — a carrier assigned to a MEMBER PATH, which the binder scan
 *                         skips deliberately so member paths are not read as declarations. The flow
 *                         family, and the one of the three the same analysis could close.
 *   `proto-call.mjs`      `Array.prototype.forEach.call(files, chk)` — consumption grammar.
 *   `concat-literal.mjs`  `[].concat(files)` — subject grammar, same family as `await-subject.mjs`.
 *
 * **Five escapes, down from nine, and none of the five is an aliasing shape.** Every corpus was run
 * against the previous mechanism as well as this one: round fourteen escaped 11 there and 0 here,
 * round sixteen 5 there and 3 here, and nothing caught before escapes now.
 */
const KNOWN_ESCAPES = [
  "await-subject.mjs",
  "concat-literal.mjs",
  "member-assign.mjs",
  "proto-call.mjs",
  "symbol-iterator.mjs",
];

test("subject · every consumed collection in the surface was proven to have elements", () => {
  const files = testFiles(ROOT);
  assert.ok(files.length > 0, "the authoritative surface is empty, so this guard would examine nothing");

  const offenders = [];
  const scanned = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const found = offencesIn(file);
    scanned.push(file);
    for (const o of found) offenders.push(`${rel}: ${o}`);
  }
  assert.equal(scanned.length, files.length, "a file in the surface was not scanned");

  assert.deepEqual(
    offenders,
    [],
    "VACUOUS means a test derives a verdict from a collection it never proved was non-empty: assert " +
      "its length before the verdict, or, if it is a literal in the file, this is a defect in the " +
      "discriminator. UNSUPPORTED means the file can reach a verdict through something the mechanism " +
      "cannot read, so its loops were never analysed at all — that is a rejection of the FILE, and " +
      "the fix is to write the verdict in the enforced dialect or to extend the mechanism and record " +
      "it against ST-16. It is never resolved by exempting the file.",
  );
});

test("subject · the enforced dialect is the one the surface actually writes", () => {
  // The premise, checked in both directions. A verdict form used here but unlisted means the
  // mechanism has been reasoning about a dialect the surface has outgrown; a form listed but unused
  // means the list is describing an imagined repository. Neither is allowed to pass quietly.
  const files = testFiles(ROOT);
  assert.ok(files.length > 0, "the authoritative surface is empty, so this guard would examine nothing");

  const used = new Set();
  for (const file of files) {
    for (const m of moduleAt(file).src.matchAll(/\bassert\.(\w+)\s*\(/gu)) used.add(m[1]);
  }
  assert.ok(used.size > 0, "no assertion call was found anywhere in the surface, so this compares nothing");

  assert.deepEqual(
    [...used].sort(),
    ADMITTED_ASSERTIONS,
    "the assertion vocabulary of the surface and ADMITTED_ASSERTIONS disagree. Adding a form to the " +
      "surface means proving the mechanism reads it — see the closure test below — and listing it here.",
  );
});

test("subject · no admitted assertion form is a sink a derived collection escapes through", () => {
  // Step three of the closure: every form the dialect admits either REFUTES emptiness or leaves the
  // derivation flagged. There is no third outcome in which a form is simply not handled, because
  // `refutesEmptiness` exempts a closed set and everything else falls through to `derived-assert`.
  //
  // The probe is uniform on purpose. A per-form specimen would prove the mechanism handles the
  // specimens someone thought to write; running the SAME non-refuting derivation through every
  // admitted form proves the property is about the form set, not about the examples.
  // The expected value must be one that does NOT refute emptiness, or the probe measures the
  // exemption instead of the sink. `[]` is that value for most forms — and its exact opposite for
  // the negated ones, where `notEqual(xs, [])` is a lower bound and a perfectly good proof of
  // liveness. Written uniformly, this test reported `notEqual` and `notDeepEqual` as fail-open sinks
  // when the mechanism was right and the probe was wrong.
  const nonRefuting = (name) => (/^not/u.test(name) ? "[1]" : "[]");
  const missed = [];
  for (const name of ADMITTED_ASSERTIONS) {
    const code = `const files = discover(); assert.${name}(files.filter((f) => bad(f)), ${nonRefuting(name)});`;
    if (vacuousSubjects(code).length === 0) missed.push(name);
  }
  assert.deepEqual(
    missed,
    [],
    "an admitted assertion form let a collection reach a passing verdict without being examined. " +
      "That is a fail-OPEN sink, which is the defect the assertion-shape inversion exists to remove.",
  );
});

test("subject · a verdict form outside the recognised language is rejected, not skipped", () => {
  // The falsification. Each specimen is written so the ROUND TWO guard passes — it imports
  // node:assert and asserts with it — and so the liveness rules cannot see its verdict. Both halves
  // are asserted here: if a specimen stopped escaping the liveness rules, this test would still pass
  // while proving nothing about the language check, so the escape is asserted too.
  const dir = path.join(FIXTURES, "unsupported");
  const specimens = fs.readdirSync(dir).filter((n) => n.endsWith(".mjs")).sort();
  assert.deepEqual(
    specimens,
    ["aliased-assert.mjs", "foreign-assert.mjs", "unknown-wrapper.mjs"],
    "the falsifier corpus changed. Each of these is a distinct way to reach a verdict the mechanism " +
      "cannot read — a foreign library, an unknown wrapper, and the dialect itself under another name.",
  );

  const notEscaping = [];
  const notRejected = [];
  for (const name of specimens) {
    const mod = moduleAt(path.join(dir, name));
    assert.ok(/node:assert/u.test(mod.raw), `${name} must import node:assert, or it falsifies nothing`);
    if (vacuousSubjects(mod.src).length > 0) notEscaping.push(name);
    if (unsupportedReasons(mod.raw, mod.src).length === 0) notRejected.push(name);
  }
  assert.deepEqual(
    notEscaping,
    [],
    "a falsifier is now caught by the liveness rules themselves. That is good news, but it means this " +
      "specimen no longer demonstrates the language boundary: move it to caught/ and write a new one.",
  );
  assert.deepEqual(
    notRejected,
    [],
    "a file whose verdict form the mechanism cannot read was accepted. The required behaviour is to " +
      "fail closed and reject the file, never to treat it as not applicable.",
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

  // Checked with the WHOLE mechanism — liveness rules and language rejection together — because
  // either one catching a specimen means the gap has closed and the record must move with it.
  const nowCaught = specimens.filter((n) => offencesIn(path.join(FIXTURES, "escapes", n)).length > 0);
  assert.deepEqual(
    nowCaught,
    [],
    "a known-uncaught shape is now caught. That is good news: move the specimen into caught/ and " +
      "record the closure against ST-16.",
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
