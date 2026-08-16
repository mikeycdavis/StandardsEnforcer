/**
 * The adapter conformance boundary.
 *
 * WHAT THIS IS FOR. Until this module existed, `schemas/standards-adapter.schema.json` was a document
 * nothing executed. Its `additionalProperties: false`, its `schemaVersion` const, its entrypoint
 * pattern and its `contains: {"const": "{target}"}` were all doing no work, because no code anywhere
 * validated a declaration against it. A schema nobody runs is a description of an intention.
 *
 * WHO RUNS IT, AND WHY BOTH. The same semantics answer two different questions, and neither
 * substitutes for the other:
 *
 *     pack CI          Does the adapter I am about to release conform to the protocol?
 *     enforcer load    Does the adapter I just obtained from this verified release conform,
 *                      before I trust it?
 *
 * The first is producer assurance and can be skipped, disabled, or simply predate the rule. The
 * second is consumer defence and runs every time. A pack having validated its declaration last
 * Tuesday is not evidence about the bytes the enforcer just read out of a checkout.
 *
 * WHERE THE SEMANTICS LIVE. Here, once. StandardsEnforcer owns the protocol and its validation;
 * packs own declarations conforming to it. Eight hand-written interpretations of the same rules in
 * eight repositories would recreate the drift problem this module exists to close.
 *
 * WHAT IS HERE THAT IS NOT IN THE SCHEMA. Only what JSON Schema cannot express. Each of the three
 * checks below is a cross-field or path-safety property, and each is written here rather than being
 * approximated by a regex in the schema — an approximation in the schema would be a constraint that
 * looks enforced and is not, which is the condition this whole module is a response to.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./jsonschema.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The one schema. Resolved from this module's own location, never from a caller-supplied path. */
export const SCHEMA_PATH = path.join(HERE, "..", "..", "schemas", "standards-adapter.schema.json");

/** The filename a pack publishes. Named once so the enforcer and pack CI cannot disagree about it. */
export const ADAPTER_FILENAME = "standards-adapter.json";

/**
 * Substitutions the enforcer performs, per schema version. A placeholder outside the set its version
 * admits is a hard violation rather than a value passed through literally: `--policy={policy}` in a
 * contract the enforcer does not implement would reach the pack's CLI as the eleven characters
 * `{policy}`, and a pack that treats an unreadable policy path as "no policy" would then evaluate
 * against the wrong one and answer confidently.
 *
 * WHY THIS IS KEYED BY VERSION rather than being one growing list. Adding a placeholder to a flat set
 * would silently widen what 1.0.0 means: a declaration released months ago as 1.0.0 would begin to be
 * read as permitting a binding no enforcer of its era could perform. The version a pack stamped is a
 * statement about which enforcers can read it, and that statement has to keep holding after this file
 * changes. So 1.0.0 admits exactly what it always admitted, and a pack needing {policy} must say
 * 1.1.0 — thereby declaring itself unreadable to older enforcers, which is the truthful outcome
 * because they cannot perform the binding and would otherwise silently drop it.
 *
 * The flat `PLACEHOLDERS` export is deliberately removed rather than aliased to 1.0.0's set. A caller
 * asking for a version-independent list is asking a question that no longer has one answer, and
 * answering it with 1.0.0's set would be right only until it was not.
 */
export const PLACEHOLDERS_BY_VERSION = Object.freeze({
  "1.0.0": Object.freeze(["{target}"]),
  "1.1.0": Object.freeze(["{target}", "{policy}"]),
});

/** The versions this enforcer implements. Anything else is rejected, never partially interpreted. */
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(Object.keys(PLACEHOLDERS_BY_VERSION));

/**
 * What a declaration at this version may use.
 *
 * An unrecognised version yields an empty set, so every placeholder in the declaration is reported.
 * The schema has already rejected the version itself; reporting the bindings as well tells the author
 * what that version would have had to admit, rather than leaving them one error at a time.
 */
export function placeholdersFor(schemaVersion) {
  return PLACEHOLDERS_BY_VERSION[schemaVersion] ?? [];
}

/**
 * Bind a validated contract's declared argv, substituting each admitted placeholder.
 *
 * Substitution lives here rather than in the enforcer because which placeholders exist is protocol,
 * and the protocol has one home. Spelling `{policy}` in two modules is how the enforcer ends up
 * substituting a binding the contract layer does not admit, or admitting one it cannot substitute.
 *
 * ONE PASS, NOT A CHAIN. Chained `replaceAll` calls re-read their own output, so a target path
 * containing the literal characters `{policy}` would be expanded by the next call in the chain. A
 * single regex pass consumes each placeholder exactly once and never revisits a substituted value.
 * Contrived as that input is, the chain form is wrong in a way that only shows up on a path nobody
 * would think to test, and the single pass costs nothing.
 *
 * A MISSING BINDING RAISES. If a version admits a placeholder the caller supplied no value for, that
 * is a defect in this repository, not a fact about the pack — and the failure mode it would otherwise
 * produce is the one this module exists to prevent: the placeholder reaching the pack's CLI as
 * literal text, where a pack that reads an unusable path as "not specified" answers confidently
 * against its own default.
 */
export function bindArguments(contract, values) {
  const admitted = placeholdersFor(contract?.schemaVersion);

  const unbound = admitted.filter((placeholder) => values?.[placeholder] === undefined);
  if (unbound.length > 0) {
    throw new AdapterContractError(
      `the enforcer admits ${unbound.join(", ")} at schemaVersion ` +
        `${JSON.stringify(contract?.schemaVersion)} but supplied no value for it. A placeholder that ` +
        `is admitted and unbound would be passed to the pack literally.`,
      unbound,
    );
  }

  const args = contract?.evaluation?.arguments ?? [];
  if (admitted.length === 0) return [...args];

  const pattern = new RegExp(admitted.map((p) => p.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")).join("|"), "gu");
  return args.map((argument) => argument.replace(pattern, (found) => values[found]));
}

const PLACEHOLDER_PATTERN = /\{[^}]*\}/gu;

export class AdapterContractError extends Error {
  constructor(message, violations) {
    super(message);
    this.name = "AdapterContractError";
    this.violations = violations;
  }
}

let cachedSchema = null;

function schema() {
  if (cachedSchema === null) cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  return cachedSchema;
}

/**
 * Is a declared entrypoint confined to the pack's own checkout?
 *
 * The schema's pattern rejects an absolute POSIX path and any backslash, which is necessary and not
 * sufficient: `../../../etc/passwd` matches that pattern happily. Containment is a property of the
 * path's segments, so it is decided by looking at the segments.
 *
 * This is the static half. Phase 3 performs the resolved half at load time — that the entrypoint,
 * once joined to the verified checkout and fully resolved, is still inside it — because a static
 * check cannot know about a symlink. Both halves are required; neither is sufficient.
 */
function entrypointViolations(entrypoint) {
  const out = [];
  if (typeof entrypoint !== "string" || entrypoint.length === 0) return out; // the schema said so already
  if (path.isAbsolute(entrypoint) || /^[a-zA-Z]:/u.test(entrypoint)) {
    out.push(
      `$.evaluation.entrypoint must be relative to the pack's checkout, and ${JSON.stringify(entrypoint)} ` +
        `is absolute. An absolute entrypoint is an instruction to execute something outside the ` +
        `release whose identity was verified.`,
    );
  }
  const segments = entrypoint.split(/[/\\]/u);
  if (segments.includes("..")) {
    out.push(
      `$.evaluation.entrypoint must stay inside the pack's checkout, and ${JSON.stringify(entrypoint)} ` +
        `escapes it with "..". The bytes verified are the bytes executed; a path that leaves the ` +
        `verified tree breaks that on its own.`,
    );
  }
  return out;
}

/**
 * Check a parsed adapter declaration against the protocol.
 *
 * Returns every violation as a string, in a stable order; an empty array means it conforms. Returning
 * rather than throwing is what lets pack CI print all of them at once, and lets the enforcer decide
 * for itself that any violation at all is `ENFORCEMENT_ERROR`.
 */
export function validateAdapter(declaration) {
  const violations = validate(declaration, schema());

  // Everything below reads fields the schema has just checked the shape of. Where the schema already
  // reported a violation for a field, the semantic check on it is skipped rather than restated.
  const evaluation = declaration?.evaluation;
  const result = declaration?.result;

  if (typeof evaluation?.entrypoint === "string") {
    violations.push(...entrypointViolations(evaluation.entrypoint));
  }

  // Read from the declaration, not from the newest version this enforcer knows. A contract stamped
  // 1.0.0 is held to 1.0.0's bindings even though 1.1.0 exists, so that publishing a new version here
  // cannot change the meaning of a declaration a pack already released.
  const declaredVersion = declaration?.schemaVersion;
  const allowed = placeholdersFor(declaredVersion);

  if (Array.isArray(evaluation?.arguments)) {
    evaluation.arguments.forEach((argument, i) => {
      if (typeof argument !== "string") return;
      for (const found of argument.match(PLACEHOLDER_PATTERN) ?? []) {
        if (!allowed.includes(found)) {
          const admittedBy = Object.entries(PLACEHOLDERS_BY_VERSION)
            .filter(([, set]) => set.includes(found))
            .map(([version]) => version);

          violations.push(
            `$.evaluation.arguments[${i}] uses the placeholder ${found}, which the enforcer does not ` +
              `substitute at schemaVersion ${JSON.stringify(declaredVersion)}. It would be passed to ` +
              `the pack literally. Admitted here: ${allowed.length > 0 ? allowed.join(", ") : "(none)"}.` +
              // Naming the version that would admit it turns "rejected" into an instruction. Without
              // this, a pack author's next move is to guess, and the likely guess — deleting the
              // binding — is the failure the binding exists to prevent.
              (admittedBy.length > 0
                ? ` ${found} is admitted from schemaVersion ${admittedBy.join(", ")}; declaring that ` +
                  `version is the fix, and it correctly makes this contract unreadable to enforcers ` +
                  `that predate the binding rather than letting them drop it.`
                : ""),
          );
        }
      }
    });
  }

  // `passing` must be a subset of `statuses`. JSON Schema cannot say this, and it is the check that
  // stops a pack declaring a pass on a status it never claims to emit — a typo in `passing` would
  // otherwise be inert until the day the pack emitted the value it meant to type, and then it would
  // be a silent pass on an undeclared status.
  if (Array.isArray(result?.statuses) && Array.isArray(result?.passing)) {
    const statuses = new Set(result.statuses);
    result.passing.forEach((status, i) => {
      if (!statuses.has(status)) {
        violations.push(
          `$.result.passing[${i}] is ${JSON.stringify(status)}, which is not in $.result.statuses. ` +
            `The passing set is a subset of the declared vocabulary; a status the pack does not ` +
            `declare it can emit cannot be one it passes on.`,
        );
      }
    });
  }

  return violations;
}

/** `validateAdapter`, as an assertion. Fails closed: any violation at all raises. */
export function assertAdapterConforms(declaration, source = ADAPTER_FILENAME) {
  const violations = validateAdapter(declaration);
  if (violations.length > 0) {
    throw new AdapterContractError(
      `${source} does not conform to the standards adapter contract:\n  - ${violations.join("\n  - ")}`,
      violations,
    );
  }
  return declaration;
}

/**
 * Read, parse and validate a declaration from a file.
 *
 * A parse failure is reported as a contract violation rather than thrown as a `SyntaxError`, because
 * to every caller "this file is not JSON" and "this JSON is not an adapter" are the same event: the
 * pack did not publish a usable contract.
 */
export function readAdapter(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (cause) {
    throw new AdapterContractError(`${file} could not be read: ${cause.message}`, [cause.message]);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new AdapterContractError(`${file} is not parseable JSON: ${cause.message}`, [cause.message]);
  }
  return assertAdapterConforms(parsed, file);
}
