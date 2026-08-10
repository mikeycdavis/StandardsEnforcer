/**
 * A JSON Schema evaluator covering exactly the keywords `schemas/standards-adapter.schema.json` uses,
 * and refusing to run against anything else.
 *
 * WHY THIS EXISTS RATHER THAN A HAND-WRITTEN CHECKLIST. The schema file is the single definition of
 * what a valid adapter contract is. A hand-written validator standing beside it is a second
 * definition, and the drift between them is silent — the schema says one thing, the code enforces
 * another, and nothing reports the disagreement. So the schema is executed. (Adopted from
 * StandardsOrchestrator's `scripts/jsonschema.mjs`; see
 * `artifacts/evidence/2026-08-10-orchestrator-reconciliation.md`, A1.)
 *
 * The strictness that makes it worth having: AN UNSUPPORTED KEYWORD THROWS rather than being ignored.
 * A validator that silently skips a constraint it does not implement reports conformance for a
 * document it never fully checked, which is a false green wearing a validator's clothes. If the
 * adapter schema later grows `oneOf`, this module fails loudly until someone implements it.
 *
 * That strictness has a cost, paid deliberately: `$absentByDesign` is a custom annotation this
 * repository's schema carries at its root, documenting the fields no pack forced. It is prose, not a
 * constraint. It is listed in ANNOTATIONS explicitly rather than tolerated by a permissive default,
 * because a permissive default is the exact behaviour this module exists to refuse.
 */

/**
 * Keywords that constrain a document. Every one is implemented in `check()` below; the two lists are
 * kept in step by `assertSchemaSupported`, which walks the schema and throws on anything absent here.
 */
const SUPPORTED = new Set([
  "type",
  "required",
  "properties",
  "additionalProperties",
  "pattern",
  "const",
  "enum",
  "minLength",
  "items",
  "minItems",
  "uniqueItems",
  "contains",
]);

/**
 * Keywords that carry no constraint and are skipped by design.
 *
 * `$schema`/`$id`/`title`/`description` are standard annotations. `$absentByDesign` is this
 * repository's own, and it is named here rather than matched by a `^\$` prefix rule: a prefix rule
 * would silently admit `$ref`, which is a real constraint that this module does not implement.
 */
const ANNOTATIONS = new Set(["$schema", "$id", "title", "description", "$absentByDesign"]);

export class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "SchemaError";
  }
}

/**
 * Walk a schema and throw on any keyword this module cannot enforce.
 *
 * Called before validation, never after: discovering an unimplemented keyword by having quietly
 * ignored it is the failure mode, so the check happens while there is still nothing to report.
 */
export function assertSchemaSupported(schema, where = "$") {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new SchemaError(`${where} is not a schema object`);
  }
  for (const keyword of Object.keys(schema)) {
    if (ANNOTATIONS.has(keyword)) continue;
    if (!SUPPORTED.has(keyword)) {
      throw new SchemaError(
        `${where} uses the JSON Schema keyword ${JSON.stringify(keyword)}, which this evaluator does ` +
          `not implement. Implement it rather than removing it from the schema — an unenforced ` +
          `constraint is worse than an absent one, because the schema still claims it.`,
      );
    }
  }
  if (schema.properties !== undefined) {
    for (const [name, sub] of Object.entries(schema.properties)) {
      assertSchemaSupported(sub, `${where}.${name}`);
    }
  }
  if (schema.items !== undefined) assertSchemaSupported(schema.items, `${where}[]`);
  if (schema.contains !== undefined) assertSchemaSupported(schema.contains, `${where}[contains]`);
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties === "object") {
    assertSchemaSupported(schema.additionalProperties, `${where}.*`);
  }
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function check(value, schema, where, violations) {
  if (schema.type !== undefined) {
    const actual = typeOf(value);
    const expected = schema.type === "integer" ? "number" : schema.type;
    if (actual !== expected) {
      violations.push(`${where} must be ${schema.type}, got ${actual}`);
      // Every keyword below assumes the type held. Continuing would produce a cascade of violations
      // that all restate this one, burying it.
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    violations.push(`${where} must be exactly ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    violations.push(`${where} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      violations.push(`${where} must be at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      violations.push(`${where} must match ${schema.pattern}, got ${JSON.stringify(value)}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      violations.push(`${where} must have at least ${schema.minItems} item(s), got ${value.length}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) violations.push(`${where} must not repeat ${key}`);
        seen.add(key);
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => check(item, schema.items, `${where}[${i}]`, violations));
    }
    if (schema.contains !== undefined) {
      const found = value.some((item) => {
        const inner = [];
        check(item, schema.contains, `${where}[]`, inner);
        return inner.length === 0;
      });
      if (!found) {
        violations.push(
          `${where} must contain an item matching ${JSON.stringify(schema.contains)}, and none does`,
        );
      }
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value, name)) violations.push(`${where}.${name} is required and absent`);
    }
    const declared = new Set(Object.keys(schema.properties ?? {}));
    if (schema.additionalProperties === false) {
      for (const name of Object.keys(value)) {
        if (!declared.has(name)) {
          violations.push(
            `${where}.${name} is not a property this contract may carry. A misspelled or invented ` +
              `key is not additive: the enforcer would ignore it while the pack believed it took effect.`,
          );
        }
      }
    }
    for (const [name, sub] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, name)) check(value[name], sub, `${where}.${name}`, violations);
    }
  }
}

/**
 * Validate a document against a schema. Returns every violation found, as strings, in document order.
 * An empty array means the document conforms.
 *
 * Violations accumulate rather than short-circuiting: a pack fixing one key at a time, learning of the
 * next only after another release, is a worse experience than being told all of them at once.
 */
export function validate(document, schema) {
  assertSchemaSupported(schema);
  const violations = [];
  check(document, schema, "$", violations);
  return violations;
}
