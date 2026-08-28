/**
 * ST-15. A guard that examined nothing must not be able to report success.
 *
 * THE DEFECT, MEASURED BEFORE THIS EXISTED. On `main@f035ab9`, with all seven of EP-06's children
 * complete, a newly enumerated test whose subject was empty and whose assertion passed went green
 * and nothing objected — 385 tests, 355 pass, 0 fail. ST-13's enumeration even added it to the
 * authoritative surface, which is that mechanism working exactly as designed, and is what makes the
 * result damning: the repository certified a guard that examined nothing.
 *
 * WHAT WAS MISSING WAS A MECHANISM, NOT A PATTERN. Before this, `liveness` appeared in three places
 * in the repository: one comment in `test-support/source-scan.mjs` saying every caller asserts its
 * own, and two callers that actually did. A convention honoured by two files and enforced by
 * nothing. EP-06's children shut seven named holes; none of them stopped an eighth being opened by
 * the next commit.
 *
 * THIS GUARD'S SUBJECT IS THE OTHER GUARDS. It is the first check in this repository whose subject
 * is the enumerated test surface itself rather than a product behaviour, so it is also subject to
 * its own rule — it accumulates and asserts empty, and therefore must prove its own liveness, which
 * it does below.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSource, stripComments } from "../test-support/source-scan.mjs";
import { testFiles } from "../scripts/test-surface.mjs";
import {
  accumulators,
  emptyVerdicts,
  livenessAssertions,
  vacuousVerdicts,
} from "../test-support/verdict-liveness.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("liveness · every accumulator verdict in the surface proves it examined something", async () => {
  const files = testFiles(ROOT);
  assert.ok(files.length > 0, "the test surface is empty, so this scan would prove nothing");

  const scanned = [];
  const offenders = [];
  for (const file of files) {
    const src = await readSource(new URL(`../${file}`, import.meta.url));
    assert.ok(src.length > 0, `${file} read as empty, so the scan below would prove nothing`);
    const code = stripComments(src, { strings: true });
    scanned.push(file);
    for (const id of vacuousVerdicts(code)) offenders.push(`${file}: ${id}`);
  }
  assert.ok(scanned.length > 0, "no file was scanned, so this assertion establishes nothing");

  assert.deepEqual(
    offenders,
    [],
    "this test builds a collection, asserts it empty, and never proves any collection it handled " +
      "was non-empty. Emptiness there means `nothing was found` or `nothing was looked at`, and " +
      "from outside those are the same result. Assert the subject non-empty before asserting the " +
      "verdict — `assert.ok(xs.length > 0, ...)` is enough, and an exact count is stronger.",
  );
});

test("liveness · the discriminator fires on the shape it exists to catch", () => {
  const vacuous = [
    "const files = [];",
    "const offenders = [];",
    "for (const f of files) { if (bad(f)) offenders.push(f); }",
    "assert.deepEqual(offenders, []);",
  ].join("\\n");
  assert.deepEqual(vacuousVerdicts(vacuous), ["offenders"],
    "the discriminator missed an accumulator asserted empty with no liveness anywhere");

  const byLength = [
    "const hits = [];",
    "for (const f of xs) hits.push(f);",
    "assert.equal(hits.length, 0);",
  ].join("\\n");
  assert.deepEqual(vacuousVerdicts(byLength), ["hits"],
    "the `length, 0` spelling of the same verdict is not matched");
});

test("liveness · the discriminator fires on a real file, not only on a string", async () => {
  // The specimen is the exact file that was added to the live surface and observed passing on
  // `main@f035ab9` — 385 tests, 355 pass, 0 fail, nothing objecting. It is kept OUT of the
  // enumerated surface (`test/fixtures/` is not enumerated) so it can stay re-runnable without
  // reddening the suite forever. A falsifier nobody can re-run is a claim, not evidence.
  const src = await readSource(new URL("./fixtures/liveness/vacuous-guard.specimen.mjs", import.meta.url));
  assert.ok(src.length > 0, "the specimen read as empty, so this assertion would prove nothing");
  assert.deepEqual(
    vacuousVerdicts(stripComments(src, { strings: true })),
    ["offenders"],
    "the specimen that this mechanism exists to catch is not caught",
  );
});

test("liveness · the discriminator does not fire on legitimate shapes", () => {
  // A FIELD OF ONE RESULT OBJECT is not an accumulator over an iteration. `scope.test.mjs` asserts
  // `deepEqual(f.kinds, [])` about a specific detector result; there is no collection there that
  // could have been vacuously empty, and demanding a liveness assertion would be nonsense.
  assert.deepEqual(vacuousVerdicts('assert.deepEqual(f.kinds, []);'), [],
    "a field of a result object was treated as an accumulator");

  // DECLARED AND ASSERTED BUT NEVER PUSHED TO is not the shape either.
  assert.deepEqual(vacuousVerdicts('const xs = [];' + "\\n" + 'assert.deepEqual(xs, []);'), [],
    "an array that is never accumulated into was treated as a scan");

  // The three liveness spellings actually used in this repository must all be accepted.
  for (const live of [
    "assert.ok(files.length > 0, 'empty');",       // oracle-subject-identity
    "assert.ok(SOURCES.length >= 2, 'empty');",    // diagram-sync
    "assert.equal(blocks.length, 2, 'empty');",    // an exact count is stronger than a bound
  ]) {
    const code = [
      "const offenders = [];",
      "for (const f of xs) offenders.push(f);",
      live,
      "assert.deepEqual(offenders, []);",
    ].join("\\n");
    assert.deepEqual(vacuousVerdicts(code), [],
      `a legitimate liveness assertion was rejected: ${live}`);
  }
});

test("liveness · a bound that bounds nothing is not liveness", () => {
  // `>= 0` is true of every array including the empty one. Accepting it would let the defect back
  // in wearing the remedy's clothes, and an earlier draft of this discriminator did exactly that in
  // the other direction — it read the number without the operator and rejected `> 0`.
  assert.equal(livenessAssertions("assert.ok(xs.length >= 0);").size, 0,
    "`>= 0` was accepted as proof that something was examined");
  assert.equal(livenessAssertions("assert.equal(xs.length, 0);").size, 0,
    "asserting a length IS zero was accepted as proof it is not");
  assert.ok(livenessAssertions("assert.ok(xs.length > 0);").has("xs"),
    "`> 0` is the repository's most common liveness spelling and must be accepted");
  assert.ok(livenessAssertions("assert.notEqual(xs.length, 0);").has("xs"),
    "`notEqual(length, 0)` is a liveness assertion");
});

test("liveness · the discriminator's own parts are not vacuous", () => {
  // Each helper must actually find things, or every verdict above is a pass over an empty set.
  const specimen = [
    "const acc = [];",
    "for (const f of xs) acc.push(f);",
    "assert.ok(xs.length > 0);",
    "assert.deepEqual(acc, []);",
  ].join("\\n");
  assert.ok(accumulators(specimen).has("acc"), "accumulators() found no accumulator in a specimen that has one");
  assert.ok(emptyVerdicts(specimen).has("acc"), "emptyVerdicts() found no empty verdict in a specimen that has one");
  assert.ok(livenessAssertions(specimen).has("xs"), "livenessAssertions() found no liveness in a specimen that has one");
});
