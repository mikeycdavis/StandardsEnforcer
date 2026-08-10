/**
 * The conformance boundary, tested where it bites.
 *
 * `artifacts/evidence/2026-08-09-adapter-conformance-boundary.md` found that the schema existed, the
 * declarations existed, and nothing validated one against the other — so `additionalProperties: false`
 * and the `schemaVersion` const were decorative. These tests exist to keep that from being true again.
 *
 * Every mutation below is derived from CONFORMING by changing one thing, so a test that fails names
 * exactly the property that broke. The mutations are hostile rather than typo-shaped: each is
 * something a plausible pack author or a plausible attacker would actually write.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  validateAdapter,
  assertAdapterConforms,
  readAdapter,
  AdapterContractError,
  SCHEMA_PATH,
  PLACEHOLDERS,
} from "../scripts/contracts/adapter.mjs";
import { validate, assertSchemaSupported, SchemaError } from "../scripts/contracts/jsonschema.mjs";

/**
 * BettingStandards v1.0.1's real declaration, verbatim.
 *
 * Deliberately the positional-target pack rather than a synthetic minimum: the heterogeneity that
 * makes this protocol necessary should be present in the baseline the mutations start from.
 */
const CONFORMING = {
  $schema: "https://standards-enforcer/schemas/standards-adapter.schema.json",
  schemaVersion: "1.0.0",
  standard: { id: "betting" },
  evaluation: {
    entrypoint: "scripts/standards.mjs",
    arguments: ["validate", "{target}", "--json"],
  },
  result: {
    statuses: [
      "COMPLIANT",
      "COMPLIANT_WITH_EXCEPTIONS",
      "NON_COMPLIANT",
      "NOT_EVALUATED",
      "BLOCKED_BY_INVARIANT",
    ],
    passing: ["COMPLIANT", "COMPLIANT_WITH_EXCEPTIONS"],
  },
};

/** Deep-clone the baseline and apply one mutation to it. */
function mutate(fn) {
  const copy = JSON.parse(JSON.stringify(CONFORMING));
  fn(copy);
  return copy;
}

test("the released declaration conforms", () => {
  assert.deepEqual(validateAdapter(CONFORMING), []);
});

test("the MachineLearning shape conforms too, and it is a different shape", () => {
  // Betting takes its target positionally; MachineLearning takes --dir=. Both must pass the same
  // boundary with no special-casing of standard.id anywhere, or the protocol is not a protocol.
  const ml = mutate((d) => {
    d.standard.id = "machine-learning";
    d.evaluation.arguments = ["evaluate", "--dir={target}", "--json"];
  });
  assert.deepEqual(validateAdapter(ml), []);
  assert.notDeepEqual(ml.evaluation.arguments, CONFORMING.evaluation.arguments);
});

test("the schema this repository ships is fully enforceable", () => {
  // If someone adds a keyword to the schema without teaching the evaluator, this fails here rather
  // than silently under-validating every contract in the portfolio.
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  assert.doesNotThrow(() => assertSchemaSupported(schema));
});

test("an unimplemented keyword throws instead of being ignored", () => {
  // The property the whole approach rests on. A validator that skips what it does not understand
  // reports conformance for a document it never fully checked.
  assert.throws(
    () => validate({ a: 1 }, { type: "object", properties: { a: { oneOf: [{ type: "string" }] } } }),
    (e) => e instanceof SchemaError && /oneOf/u.test(e.message),
  );
});

test("$absentByDesign is recognised as an annotation, not tolerated by a permissive default", () => {
  // It must pass; and the reason it passes must be that it is named, which the previous test proves
  // by showing an unnamed keyword does not.
  assert.doesNotThrow(() => assertSchemaSupported({ type: "object", $absentByDesign: { why: "prose" } }));
});

/**
 * The hostile mutations. Each names the defect it plants and the substring the report must contain,
 * so a violation message degrading into something unactionable fails the test.
 */
const MUTATIONS = {
  "an invented top-level key": [(d) => (d.evaluatuion = d.evaluation), "not a property"],
  "an invented nested key": [(d) => (d.result.passingStatuses = ["COMPLIANT"]), "not a property"],
  "a schemaVersion the enforcer does not implement": [
    (d) => (d.schemaVersion = "1.1.0"),
    "must be exactly",
  ],
  "no schemaVersion at all": [(d) => delete d.schemaVersion, "required and absent"],
  "no arguments": [(d) => delete d.evaluation.arguments, "required and absent"],
  "an empty argument vector": [(d) => (d.evaluation.arguments = []), "at least 1 item"],
  "arguments that never name the target": [
    (d) => (d.evaluation.arguments = ["validate", "--json"]),
    "must contain an item matching",
  ],
  "a placeholder the enforcer does not substitute": [
    (d) => d.evaluation.arguments.push("--policy={policy}"),
    "does not substitute",
  ],
  "an absolute entrypoint": [(d) => (d.evaluation.entrypoint = "/usr/bin/evil.mjs"), "is absolute"],
  "a Windows-absolute entrypoint": [(d) => (d.evaluation.entrypoint = "C:/evil.mjs"), "is absolute"],
  "an entrypoint escaping the checkout": [
    (d) => (d.evaluation.entrypoint = "../../../evil.mjs"),
    "escapes it",
  ],
  "an entrypoint escaping mid-path": [
    (d) => (d.evaluation.entrypoint = "scripts/../../evil.mjs"),
    "escapes it",
  ],
  "a passing status outside the declared vocabulary": [
    (d) => d.result.passing.push("COMPLAINT"),
    "not in $.result.statuses",
  ],
  "an empty status vocabulary": [(d) => (d.result.statuses = []), "at least 1 item"],
  "a repeated status": [(d) => d.result.statuses.push("COMPLIANT"), "must not repeat"],
  "a standard id that is not an identifier": [(d) => (d.standard.id = "Betting Standards"), "must match"],
  "arguments given as a string": [(d) => (d.evaluation.arguments = "validate {target}"), "must be array"],
  "a status vocabulary of numbers": [(d) => (d.result.statuses = [1, 2]), "must be string"],
};

for (const [name, [apply, expected]] of Object.entries(MUTATIONS)) {
  test(`MUTATION: ${name} is rejected`, () => {
    const violations = validateAdapter(mutate(apply));
    assert.ok(violations.length > 0, `${name} was accepted`);
    assert.ok(
      violations.some((v) => v.includes(expected)),
      `expected a violation containing ${JSON.stringify(expected)}, got:\n${violations.join("\n")}`,
    );
  });
}

test("every mutation is rejected, and the baseline is not — so rejection is not the default", () => {
  // Guards the shape of the table above. A validator that rejected everything would pass every
  // mutation test while being useless, and this is the assertion that distinguishes the two.
  assert.deepEqual(validateAdapter(CONFORMING), []);
  for (const [name, [apply]] of Object.entries(MUTATIONS)) {
    assert.ok(validateAdapter(mutate(apply)).length > 0, `${name} was accepted`);
  }
});

test("violations accumulate rather than stopping at the first", () => {
  const many = mutate((d) => {
    d.evaluation.entrypoint = "/absolute.mjs";
    d.result.passing.push("NOT_A_STATUS");
    d.invented = true;
  });
  assert.ok(validateAdapter(many).length >= 3);
});

test("assertAdapterConforms fails closed and carries the violations", () => {
  const broken = mutate((d) => delete d.result);
  assert.throws(
    () => assertAdapterConforms(broken),
    (e) => e instanceof AdapterContractError && e.violations.length > 0,
  );
  assert.equal(assertAdapterConforms(CONFORMING), CONFORMING);
});

test("an unparseable declaration is a contract failure, not a SyntaxError", () => {
  // To a caller, "this file is not JSON" and "this JSON is not an adapter" are the same event.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-conformance-"));
  const file = path.join(dir, "standards-adapter.json");
  fs.writeFileSync(file, "{ this is not json");
  assert.throws(
    () => readAdapter(file),
    (e) => e instanceof AdapterContractError && /not parseable JSON/u.test(e.message),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a missing declaration is a contract failure too", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-conformance-"));
  assert.throws(
    () => readAdapter(path.join(dir, "standards-adapter.json")),
    (e) => e instanceof AdapterContractError && /could not be read/u.test(e.message),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the known placeholder set is exactly {target}", () => {
  // Pinned rather than derived. Adding a placeholder makes every contract using it unreadable to
  // every enforcer built before it, which is a schemaVersion change and should be hard to do quietly.
  assert.deepEqual([...PLACEHOLDERS], ["{target}"]);
});
