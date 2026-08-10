/**
 * ADR 0001, made mechanical: orchestrate the standards, never reimplement them.
 *
 * The enforcer's executable source may not contain a pack's identity, a pack's native status
 * vocabulary, or a pack's evidence fields. Each of those is a way of knowing something about a
 * standards pack that the pack is supposed to tell us, and each has a specific failure it prevents.
 *
 * THE EVIDENCE FIELDS ARE HERE BECAUSE OF A NEAR MISS. MachineLearningStandards v1.4.1 returned
 * COMPLIANT on a run with `denominator.scored: 0` of 46 applicable rules, and the enforcer would have
 * called it a pass. The obvious fix was for the enforcer to read `scored` — and it was the wrong fix.
 * Today `scored > 0`; tomorrow a pack needs `notEvaluated == 0`, or a minimum coverage, or a
 * different denominator entirely, and the enforcer has become a second compliance engine with a
 * per-pack rule table nobody voted for.
 *
 * The defect was repaired in the authority instead (MachineLearningStandards v1.5.0), which required
 * no enforcer change at all. This test is what stops that remedy being quietly undone: without it,
 * someone can reintroduce pack-specific interpretation a field at a time, each addition looking
 * locally reasonable, without ever editing the contract or the ADR.
 *
 * WHAT IS SCANNED. `scripts/**` only — the executable surface. Not tests, which must name statuses to
 * assert on them, and not artifacts, which must name them to explain them. Comments are stripped
 * before scanning, so this file's own reasoning can be written down in the modules it constrains.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "scripts");

/** Every .mjs under scripts/, which is the whole executable surface. */
function sources(dir = SOURCE, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, found);
    else if (entry.name.endsWith(".mjs")) found.push(full);
  }
  return found;
}

/**
 * Strip comments so the prohibition constrains behaviour rather than vocabulary.
 *
 * A module must be able to explain why it does not read `denominator.scored` without that explanation
 * being the violation. Naive but sufficient: these files contain no regex literal or string that
 * would be mangled in a way affecting the tokens below.
 */
function code(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/^\s*\/\/.*$/gmu, " ")
    .replace(/\s\/\/.*$/gmu, " ");
}

const FILES = sources();

test("there is an executable surface to constrain", () => {
  assert.ok(FILES.length >= 5, `expected the enforcer's scripts/ to hold modules, found ${FILES.length}`);
});

/**
 * Pack identity. `switch (packId)` in any form is the thing the adapter contract exists to avoid, and
 * a single `if (standard.id === "betting")` is how a protocol becomes a lookup table.
 */
const PACK_IDS = [
  "betting",
  "machine-learning",
  "mathematics",
  "innovation",
  "financial",
  "engineering",
  "prediction",
  "health",
];

/**
 * Native status vocabularies. These belong to the packs; the enforcer carries whatever it is given,
 * verbatim, and decides only membership of the pack-declared passing set. Note the enforcer's OWN
 * states — OUT_OF_SCOPE, ENFORCEMENT_ERROR and the rest — are deliberately absent from this list.
 */
const NATIVE_STATUSES = [
  "COMPLIANT",
  "COMPLIANT_WITH_EXCEPTIONS",
  "NON_COMPLIANT",
  "NOT_EVALUATED",
  "BLOCKED_BY_INVARIANT",
  "SUPPORTED",
  "SUPPORTED_WITH_EXCEPTIONS",
  "INSUFFICIENTLY_SUPPORTED",
];

/**
 * Pack evidence fields. Reading any of these is reading a pack's internal reasoning about how much it
 * established — which is the pack's own question, answered by the status it returns.
 */
const EVIDENCE_FIELDS = [
  "denominator",
  "scored",
  "notEvaluated",
  "applicable",
  "insufficientEvidence",
  "frameworkCoverage",
  "evidenceRequests",
  "manualReview",
];

/**
 * `assurance` and `score` are deliberately NOT on that list, and the omission is a real gap rather
 * than an oversight worth hiding.
 *
 * `assurance` collides: `footprint.mjs` uses it for the enforcer's own confidence in a scope scan
 * ("partial" when a tree could not be fully read), which is the enforcer's question about its own
 * work and nothing to do with a pack's assurance buckets. `score` is a common enough English word to
 * appear in unrelated identifiers. Banning either would produce a guard that fires on correct code,
 * and a guard that fires on correct code is deleted rather than obeyed.
 *
 * The consequence is that `nativeResult.assurance` or `nativeResult.score` would slip past this test.
 * What catches those instead is the positive assertion in the verdict path: passing is decided by
 * membership of the pack-declared passing set and by nothing else. The list above holds the tokens
 * that are unambiguous, which includes every field the MachineLearning near-miss would have tempted
 * someone to read.
 */

/** Quoted, or reached as a property. Prose in a stripped comment cannot match either. */
function occurrences(text, token) {
  const quoted = new RegExp(`["'\`]${token}["'\`]`, "u");
  const property = new RegExp(`[.\\[]\\s*["'\`]?${token}\\b`, "u");
  return quoted.test(text) || property.test(text);
}

/**
 * The M1 hardcoding, pinned as a baseline rather than waived.
 *
 * `states.mjs` currently enumerates five pack-native statuses in `STATE`, keeps them in
 * `VERDICT_STATES`, and hardcodes in `exitFor` that COMPLIANT means a merge may proceed. That is
 * precisely the knowledge this file forbids, and it is precisely what Phase 3 exists to remove — so
 * asserting an empty list today would mean either deleting the guard or writing a false one.
 *
 * Instead the known violations are enumerated. The guard therefore bites immediately in the
 * direction that matters: a native status appearing in a NEW file, or a new status appearing in an
 * old one, fails now. And Phase 3 is complete exactly when this list can be emptied, which makes the
 * milestone's finish line executable rather than a matter of opinion.
 *
 * Do not add to this list. Adding to it is the regression it exists to detect.
 */
const KNOWN_M1_HARDCODING = [
  "scripts/states.mjs names COMPLIANT",
  "scripts/states.mjs names COMPLIANT_WITH_EXCEPTIONS",
  "scripts/states.mjs names NON_COMPLIANT",
  "scripts/states.mjs names NOT_EVALUATED",
  "scripts/states.mjs names BLOCKED_BY_INVARIANT",
];

function scan(tokens) {
  const violations = [];
  for (const file of FILES) {
    const text = code(file);
    for (const token of tokens) {
      if (occurrences(text, token)) {
        violations.push(`${path.relative(ROOT, file).replaceAll("\\", "/")} names ${token}`);
      }
    }
  }
  return violations.sort();
}

for (const [label, tokens] of [
  ["a pack's identity", PACK_IDS],
  ["a pack's evidence field", EVIDENCE_FIELDS],
]) {
  test(`no executable source names ${label}`, () => {
    const violations = scan(tokens);
    assert.deepEqual(
      violations,
      [],
      `ADR 0001 forbids the enforcer knowing this. Ask the pack instead:\n  ${violations.join("\n  ")}`,
    );
  });
}

test("no executable source names a pack's native status, beyond the pinned M1 hardcoding", () => {
  const violations = scan(NATIVE_STATUSES);
  assert.deepEqual(
    violations,
    [...KNOWN_M1_HARDCODING].sort(),
    "a pack's native status vocabulary appeared somewhere new. The M1 hardcoding in states.mjs is " +
      "known and is Phase 3's to remove; anything else is a fresh violation of ADR 0001.",
  );
});

test("Phase 3 is not silently complete: the baseline still describes reality", () => {
  // If states.mjs is rewritten and this list is not emptied, the test above would keep passing while
  // asserting something untrue. This is the assertion that notices.
  const violations = scan(NATIVE_STATUSES);
  assert.ok(
    violations.length > 0,
    "no native statuses remain in scripts/ — Phase 3 has landed. Empty KNOWN_M1_HARDCODING and " +
      "delete this test; the guard above becomes an unconditional prohibition.",
  );
});

test("the guard bites: a planted violation of each kind is caught", () => {
  // Without this, the three tests above pass for a repository containing no source at all, or a
  // regex that silently matches nothing. Each planted line is the shape a real regression takes.
  const planted = [
    `if (standard.id === "betting") return special();`,
    `if (report.status === "COMPLIANT") return pass();`,
    `if (report.denominator.scored === 0) return fail();`,
    `const n = report["notEvaluated"];`,
  ];
  const all = [...PACK_IDS, ...NATIVE_STATUSES, ...EVIDENCE_FIELDS];
  for (const line of planted) {
    assert.ok(
      all.some((token) => occurrences(line, token)),
      `this guard would not have caught: ${line}`,
    );
  }
});

test("the guard does not bite on the enforcer's own vocabulary", () => {
  // The complement, and the reason the prohibition is a list rather than a heuristic. If these
  // matched, the enforcer could not name its own states and the guard would be deleted within a week.
  const own = [
    `const OUT_OF_SCOPE = "OUT_OF_SCOPE";`,
    `if (state === "ENFORCEMENT_ERROR") return 2;`,
    `return { state: "SCOPE_REVIEW_REQUIRED" };`,
    `const passing = contract.result.passing.includes(status);`,
  ];
  const all = [...PACK_IDS, ...NATIVE_STATUSES, ...EVIDENCE_FIELDS];
  for (const line of own) {
    assert.ok(
      !all.some((token) => occurrences(line, token)),
      `the guard wrongly rejects the enforcer's own vocabulary: ${line}`,
    );
  }
});

test("comments may explain the prohibition without violating it", () => {
  const explained = `/* We never read denominator.scored — see ADR 0001. */\nconst x = 1;`;
  assert.ok(!occurrences(code_of(explained), "scored"));
  function code_of(text) {
    return text.replace(/\/\*[\s\S]*?\*\//gu, " ");
  }
});
