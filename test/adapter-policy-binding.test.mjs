/**
 * The {policy} binding, and the failure it exists to prevent.
 *
 * WHAT FORCED THIS. Finding F of `artifacts/evidence/2026-08-09-interface-inventory.md`, verified by
 * execution: `node scripts/standards.mjs check F:/Repos/HowLongUntil --json` against FinancialStandards
 * returns `"project": "FinancialStandards"`. Financial resolves an absent `--policy` to its OWN
 * project-policy.yml, so it audits the target's documents against the standards pack's policy, labels
 * the report with the standards pack's name, and exits 0. Nothing errors. That is a confident verdict
 * about the wrong thing — the INV-E1 failure class, reached without a single error being raised.
 *
 * WHY A SYNTHETIC PACK RATHER THAN FINANCIAL ITSELF. Two different questions, and this file answers
 * only the first:
 *
 *     here            does the enforcer's binding mechanism supply the target's policy, and is the
 *                     absence of that binding observably different from its presence?
 *     oracle tier     does FinancialStandards' released interface behave as finding F recorded?
 *
 * The second needs a pinned FinancialStandards checkout and belongs with the other oracle-gated
 * tests, which skip when no pack is present. The mechanism must be falsifiable without one, or the
 * binding would be untested on every machine that lacks the pack — which is every hosted runner this
 * repository has ever had.
 *
 * The synthetic pack below reproduces Financial's argv discipline exactly as read from
 * `FinancialStandards@3627c6f:scripts/standards.mjs:502-518`: `--policy` consumes the NEXT argv
 * element, `--policy=<value>` is rejected as an unknown flag, and an absent `--policy` silently
 * falls back to the pack's own policy file.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runOfficialEvaluator } from "../scripts/enforce.mjs";
import { validateAdapter, bindArguments, placeholdersFor } from "../scripts/contracts/adapter.mjs";

/**
 * A pack that behaves the way FinancialStandards behaves.
 *
 * It reports which policy it actually read, which is the whole point: without that, "passed the
 * target's policy" and "fell back to its own" are indistinguishable from the outside, and a test
 * asserting only that the run succeeded would pass in both cases.
 */
const EVALUATOR = `
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Financial's parser, in the shape it actually has: --policy takes the next element, and anything
// else beginning with -- is a hard error rather than something to interpret generously.
let policy = null;
const targets = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json") continue;
  else if (a === "--policy") policy = argv[++i];
  else if (a.startsWith("--")) { console.error("standards: unknown flag '" + a + "'"); process.exit(2); }
  else targets.push(a);
}

const command = targets.shift() ?? null;
if (command !== "check") { console.error("standards: unexpected command " + command); process.exit(2); }

// The fallback that finding F is about. No error, no warning, a confident answer about the wrong file.
const usedPolicy = policy ?? path.join(ROOT, "project-policy.yml");

console.log(JSON.stringify({
  status: "COMPLIANT",
  usedPolicy,
  subject: targets[0] ?? null,
  policyWasSupplied: policy !== null,
}));
`;

const contract = (over = {}) => ({
  schemaVersion: "1.1.0",
  standard: { id: "synthetic-financial" },
  evaluation: {
    entrypoint: "scripts/standards.mjs",
    arguments: ["check", "{target}", "--policy", "{policy}"],
  },
  result: {
    statuses: ["COMPLIANT", "NON_COMPLIANT", "NOT_EVALUATED"],
    passing: ["COMPLIANT"],
  },
  ...over,
});

async function pack(declared = contract()) {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-policy-"));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(declared));
  await writeFile(path.join(dir, "scripts", "standards.mjs"), EVALUATOR);
  // The pack's OWN policy. Its existence is what makes the fallback silent rather than an error, and
  // therefore what makes the defect reachable.
  await writeFile(path.join(dir, "project-policy.yml"), 'project: "TheStandardsPack"\n');
  return dir;
}

async function governed() {
  const dir = await mkdtemp(path.join(tmpdir(), "governed-policy-"));
  await writeFile(path.join(dir, "project-policy.yml"), 'project: "TheGovernedRepository"\n');
  return dir;
}

// --- the binding does what it claims -------------------------------------------------------------

test("policy · the declared binding supplies the GOVERNED repository's policy", async () => {
  const packDir = await pack();
  const targetDir = await governed();
  try {
    const r = runOfficialEvaluator(packDir, { target: targetDir, governedRoot: targetDir });
    assert.equal(r.ok, true, r.why ?? "");
    assert.equal(r.report.policyWasSupplied, true);
    assert.equal(r.report.usedPolicy, path.join(targetDir, "project-policy.yml"));
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

/**
 * THE LOAD-BEARING CASE: the evaluation subject is not the governed root.
 *
 * Every other test here uses a governed directory as both the subject and the policy's location, so
 * `{target}` and `{policy}` coincide and a resolver deriving one from the other would pass all of
 * them. FinancialStandards is the pack that breaks the coincidence — its subject is an analysis
 * document, not a repository root (finding H, preserved deliberately by this PR) — so this is the
 * case `{policy}` exists FOR. Collapse the two inputs and the pack is handed
 * `<root>/analysis.md/project-policy.yml`: a path below a regular file, which cannot exist.
 *
 * Without this case, schema 1.1.0 could spell two placeholders while the enforcer still had exactly
 * one value to fill them from, and the claim that Financial is representable would be unproven.
 */
test("policy · a subject below the governed root does not drag the policy path with it", async () => {
  const packDir = await pack();
  const rootDir = await governed();
  const subject = path.join(rootDir, "analysis.md");
  await writeFile(subject, "# analysis\n");
  try {
    const r = runOfficialEvaluator(packDir, { target: subject, governedRoot: rootDir });

    assert.equal(r.ok, true, r.why ?? "");
    assert.equal(r.report.subject, subject, "the pack must be pointed at the document, not the root");
    assert.equal(r.report.usedPolicy, path.join(rootDir, "project-policy.yml"),
      "the policy is the GOVERNED ROOT's, and does not follow the subject");

    // Named explicitly, so a reader sees the defect this excludes rather than inferring it.
    assert.notEqual(r.report.usedPolicy, path.join(subject, "project-policy.yml"),
      "deriving {policy} from {target} produces a path below a regular file");
    assert.equal(r.report.usedPolicy.includes("analysis.md"), false);
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(rootDir, { recursive: true, force: true });
  }
});

/**
 * THE FALSIFIER. Remove the binding and the same pack, unchanged, evaluates against its own policy.
 *
 * This is the test that makes the one above mean something. Without it, "usedPolicy is the target's
 * policy" could hold for reasons unrelated to the binding, and deleting `--policy {policy}` from the
 * contract would break nothing that anyone would notice.
 *
 * Note what is asserted: not that the run failed — it SUCCEEDS, with `status: COMPLIANT`, which is
 * exactly why this is dangerous. What is asserted is that the policy read is observably the wrong
 * one.
 */
test("policy · without the binding the pack silently evaluates its OWN policy, and still passes", async () => {
  const declared = contract();
  declared.evaluation.arguments = ["check", "{target}"]; // the binding, removed
  const packDir = await pack(declared);
  const targetDir = await governed();
  try {
    const r = runOfficialEvaluator(packDir, { target: targetDir, governedRoot: targetDir });

    assert.equal(r.ok, true, "the point is that nothing errors");
    assert.equal(r.report.status, "COMPLIANT", "and that the verdict looks like a pass");

    assert.equal(r.report.policyWasSupplied, false);
    assert.equal(r.report.usedPolicy, path.join(packDir, "project-policy.yml"));
    assert.notEqual(
      r.report.usedPolicy,
      path.join(targetDir, "project-policy.yml"),
      "a green verdict computed against the standards pack's own policy is finding F",
    );
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

// --- argv form is the pack's to declare, not the enforcer's to normalise -------------------------

test("policy · `--policy` and its value stay two argv elements", async () => {
  const packDir = await pack();
  const targetDir = await governed();
  try {
    const argv = bindArguments(contract(), {
      "{target}": targetDir,
      "{policy}": path.join(targetDir, "project-policy.yml"),
    });
    // Four elements, not three. Joining them into `--policy=<path>` is a form Financial's parser
    // rejects outright, so a helpful normalisation here would break the pack it was helping.
    assert.deepEqual(argv, ["check", targetDir, "--policy", path.join(targetDir, "project-policy.yml")]);
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("policy · the `=` form is rejected by the pack rather than quietly repaired", async () => {
  const declared = contract();
  declared.evaluation.arguments = ["check", "{target}", "--policy={policy}"];
  const packDir = await pack(declared);
  const targetDir = await governed();
  try {
    const r = runOfficialEvaluator(packDir, { target: targetDir, governedRoot: targetDir });
    // The enforcer substituted faithfully and the pack refused the form. Both halves matter: the
    // enforcer must not rewrite a declared argument, and a pack that cannot read it must fail loudly.
    assert.equal(r.ok, false);
    assert.match(String(r.why), /unknown flag/u);
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("policy · {target} and {policy} are not conflated", async () => {
  const packDir = await pack();
  const targetDir = await governed();
  try {
    const r = runOfficialEvaluator(packDir, { target: targetDir, governedRoot: targetDir });
    assert.equal(r.report.subject, targetDir);
    assert.notEqual(r.report.subject, r.report.usedPolicy, "the subject is not its own governing policy");
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

// --- the version gate ----------------------------------------------------------------------------

test("policy · {policy} at schemaVersion 1.0.0 is a violation, not an implicit upgrade", () => {
  const declared = contract({ schemaVersion: "1.0.0" });
  const violations = validateAdapter(declared);
  assert.ok(violations.length > 0, "1.0.0 must not silently acquire a binding it never admitted");
  assert.ok(
    violations.some((v) => /\{policy\}/u.test(v) && /1\.1\.0/u.test(v)),
    `the violation should name the version that would admit it; got: ${JSON.stringify(violations)}`,
  );
});

test("policy · a 1.1.0 declaration using {policy} conforms", () => {
  assert.deepEqual(validateAdapter(contract()), []);
});

test("policy · an unrecognised schemaVersion admits nothing", () => {
  // Not "admits everything" and not "admits 1.1.0's set". An enforcer that does not know a version
  // cannot know what its placeholders mean, and guessing is the behaviour the const was there to stop.
  assert.deepEqual([...placeholdersFor("2.0.0")], []);
  const violations = validateAdapter(contract({ schemaVersion: "2.0.0" }));
  assert.ok(violations.some((v) => /schemaVersion/u.test(v) || /must be one of/u.test(v)));
});

test("policy · an admitted placeholder with no supplied value raises rather than passing through", () => {
  // The defect this guards is in THIS repository, not in a pack: adding a placeholder to the version
  // table and forgetting to bind it would send the literal text to the pack's CLI, which is precisely
  // the confident-wrong-answer path.
  assert.throws(
    () => bindArguments(contract(), { "{target}": "/somewhere" }),
    (e) => /\{policy\}/u.test(e.message) && /supplied no value/u.test(e.message),
  );
});

test("policy · substitution does not re-expand a substituted value", () => {
  // A target path containing the literal characters {policy} must not become the policy path. Chained
  // replaceAll calls fail this; a single pass does not.
  const argv = bindArguments(contract(), { "{target}": "/tmp/{policy}", "{policy}": "/tmp/real-policy.yml" });
  assert.deepEqual(argv, ["check", "/tmp/{policy}", "--policy", "/tmp/real-policy.yml"]);
});
