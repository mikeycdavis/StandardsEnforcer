/**
 * Adoption is decided by a filename, and the filename is this enforcer's alone (FE-21).
 *
 * WHAT FORCED THIS. `enforce()` decides adoption by `existsSync(<target>/project-policy.yml)`. A
 * standards authority that admits a second spelling therefore has repositories this enforcer calls
 * unadopted while the authority itself calls them governed. FinancialStandards is the measured case:
 * its `init` treats `project-policy.yml` AND `project-policy.yaml` as adoption markers, and its
 * `check` places no filename restriction on `--policy` at all, so a `.yaml` policy is fully
 * evaluable there.
 *
 * WHY IT IS A FALSE NEGATIVE AND NOT A SPELLING WRINKLE. Adoption runs BEFORE the authority is ever
 * invoked, so the authority never gets to contradict the diagnosis. Under a recorded IN_SCOPE
 * disposition the message is blockable — "governed and has not adopted" — against a repository that
 * adopted correctly. That is INV-E1 inverted: not an unknown reported as success, but a satisfied
 * condition reported as delinquency.
 *
 * WHAT THIS FILE DOES NOT DECIDE. Whose marker set it is. FE-21 leaves that open deliberately, and
 * these cases are written so that they do not answer it: they assert the OUTCOME for a
 * `.yaml`-only repository, never the mechanism that produces it. A remedy that reads the set from a
 * per-pack contract and a remedy that states the set as the enforcer's own both satisfy this file,
 * which is the point — the specimen must not smuggle in the design decision.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { enforce } from "../scripts/enforce.mjs";
import { STATE } from "../scripts/states.mjs";

const STANDARD = "machine-learning";
const POLICY_BODY = 'standardVersion: "1.5.0"\nproject: "Numerai"\n';

function git(args, cwd) {
  const r = spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

/** A pack that reports the policy path it was handed, so "reached the authority" is observable. */
const EVALUATOR = [
  'import { readFileSync } from "node:fs";',
  "let policy = null;",
  'for (const a of process.argv.slice(2)) if (a.startsWith("--policy=")) policy = a.slice(9);',
  'const body = policy ? readFileSync(policy, "utf8") : null;',
  'process.stdout.write(JSON.stringify({ status: "COMPLIANT", policyRead: policy,',
  "  policyBody: body === null ? null : body.trim() }));",
].join("\n");

async function release(dir, { schemaVersion = "1.2.0", adoption, initMarkers = null } = {}) {
  const repo = path.join(dir, "standards");
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  git(["init", "--quiet", "-b", "main"], repo);
  git(["config", "user.email", "test@example.invalid"], repo);
  git(["config", "user.name", "Adoption Marker"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  await writeFile(path.join(repo, "VERSION"), "1.0.0\n");
  await writeFile(path.join(repo, "standards-adapter.json"), JSON.stringify({
    schemaVersion,
    standard: { id: STANDARD },
    evaluation: { entrypoint: "scripts/standards.mjs",
      arguments: ["evaluate", "--dir={target}", "--policy={policy}", "--json"] },
    result: { statuses: ["COMPLIANT", "NON_COMPLIANT"], passing: ["COMPLIANT"] },
    ...(adoption === undefined ? {} : { adoption }),
  }, null, 2));
  // A DECOY, and the whole point of case 6. This is the shape of the private implementation FE-21
  // was tempted to read: the pack's own `init` naming a marker set the published contract does not.
  // Discovery must not see it.
  if (initMarkers) {
    await writeFile(path.join(repo, "scripts/init.mjs"),
      `const POLICY_MARKERS = ${JSON.stringify(initMarkers)};
export default POLICY_MARKERS;
`);
  }
  await writeFile(path.join(repo, "scripts/standards.mjs"), EVALUATOR);
  git(["add", "-A"], repo);
  git(["commit", "--quiet", "-m", "a release that reports the policy it read"], repo);
  git(["tag", "-a", "v1.0.0", "-m", "release"], repo);
  return { repo, sha: git(["rev-list", "-n", "1", "v1.0.0"], repo) };
}

/**
 * One run against a target holding exactly the named policy files and nothing else.
 *
 * No registry and no `--policy`: this is the bare discovery path, which is the only path where the
 * marker set decides anything. Where the registry names a policy or the caller passes one, the
 * filename was never in question.
 */
async function run(files, packOptions = {}, explicitPolicy = null) {
  const dir = await mkdtemp(path.join(tmpdir(), "adoption-marker-"));
  try {
    const { repo, sha } = await release(dir, packOptions);
    const target = path.join(dir, "target");
    await mkdir(target, { recursive: true });
    for (const name of files) await writeFile(path.join(target, name), POLICY_BODY);
    return await enforce({
      target, standardsRepo: repo, tag: "v1.0.0", sha,
      cacheRoot: path.join(dir, "cache"),
      ...(explicitPolicy ? { policy: path.join(target, explicitPolicy) } : {}),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- Legacy Enforcer compatibility: what a pre-1.2.0 contract keeps, and what it does not gain ---

const LEGACY = { schemaVersion: "1.1.0" };
const DECLARES_BOTH = { adoption: { policyFiles: ["project-policy.yml", "project-policy.yaml"] } };
const DECLARES_YAML = { adoption: { policyFiles: ["project-policy.yaml"] } };

test("legacy · a pre-1.2.0 contract keeps project-policy.yml, because that is what it shipped under", async () => {
  const r = await run(["project-policy.yml"], LEGACY);
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.report.policyRead, r.policy.path);
  assert.match(r.policy.path, /project-policy\.yml$/u);
});

test("legacy · a pre-1.2.0 contract does NOT gain .yaml, and the cost is the point", async () => {
  const r = await run(["project-policy.yaml"], LEGACY);
  assert.equal(
    r.state, STATE.NOT_ADOPTED,
    "the legacy set is this enforcer's own history, not a claim about any pack. A contract that " +
    "cannot say anything about adoption must not have a second spelling inferred for it — that " +
    "would make the consumer authoritative over what adoption of this pack means",
  );
});

// --- The declaration doing its work ---

test("adoption · a contract declaring project-policy.yaml makes it adopted", async () => {
  const r = await run(["project-policy.yaml"], DECLARES_YAML);
  assert.notEqual(r.state, STATE.NOT_ADOPTED, `declared .yaml must be discovered. Got: ${r.detail ?? ""}`);
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.report.policyRead, r.policy.path,
    "the policy whose presence established adoption must be the exact policy handed to the authority");
  assert.match(r.policy.path, /project-policy\.yaml$/u);
});

test("adoption · the declared set is the whole set — .yml still works where the pack admits it", async () => {
  const r = await run(["project-policy.yml"], DECLARES_BOTH);
  assert.equal(r.state, STATE.EVALUATED);
  assert.match(r.policy.path, /project-policy\.yml$/u);
});

// --- Mutation: remove the declaration and the specimen must go red again ---

test("adoption · deleting the declaration makes the .yaml specimen fail again", async () => {
  const declared = await run(["project-policy.yaml"], DECLARES_YAML);
  assert.equal(declared.state, STATE.EVALUATED, "guard: the declared case must be green first");
  const withdrawn = await run(["project-policy.yaml"], {});
  assert.equal(
    withdrawn.state, STATE.NOT_ADOPTED,
    "with the adoption block withdrawn the enforcer must fall back to the legacy set and refuse " +
    "again. If this stays green, .yaml is being discovered by something other than the declaration",
  );
});

// --- Known-negative: the boundary must stay a boundary ---

test("adoption · an unsupported filename is still NOT_ADOPTED", async () => {
  const r = await run(["standards-policy.yml"], DECLARES_BOTH);
  assert.equal(
    r.state, STATE.NOT_ADOPTED,
    "a declared set is finite and exact; a filename no pack admits is not adoption, and treating " +
    "it as such would trade a false negative for a false positive",
  );
});

test("discovery · a pack's private init.mjs is not a declaration, and must not be read", async () => {
  const r = await run(["project-policy.yaml"], {
    schemaVersion: "1.1.0",
    initMarkers: ["project-policy.yml", "project-policy.yaml"],
  });
  assert.equal(
    r.state, STATE.NOT_ADOPTED,
    "this pack's private implementation names .yaml and its published contract does not. Discovery " +
    "reads the contract. If this goes green, the enforcer is deriving adoption from implementation " +
    "code the pack never published as its interface — which is the substitution FE-21 was opened to refuse",
  );
});

// --- Ambiguity: fail toward the existing configuration-error state, never an arbitrary pick ---

test("ambiguity · two admitted markers with no precedence is ENFORCEMENT_ERROR, not a choice", async () => {
  const r = await run(["project-policy.yml", "project-policy.yaml"], DECLARES_BOTH);
  assert.equal(
    r.state, STATE.ENFORCEMENT_ERROR,
    "order in policyFiles is not precedence, so there is no declared answer to which governs. " +
    "Picking one by position would manufacture an answer the contract does not contain",
  );
  assert.match(r.detail, /project-policy\.yml/u);
  assert.match(r.detail, /project-policy\.yaml/u);
  assert.match(r.detail, /precedence/u);
});

test("ambiguity · --policy resolves it, because the caller named the file", async () => {
  const r = await run(["project-policy.yml", "project-policy.yaml"], DECLARES_BOTH, "project-policy.yaml");
  assert.equal(r.state, STATE.EVALUATED, "an explicit invocation was never ambiguous");
  assert.match(r.policy.path, /project-policy\.yaml$/u);
  assert.equal(r.policy.source, "explicit");
});

// --- Contract shape: fail closed, never partially interpreted ---

test("contract · an adoption block below 1.2.0 is rejected, not silently dropped", async () => {
  const r = await run(["project-policy.yaml"], { schemaVersion: "1.1.0", ...DECLARES_YAML });
  assert.notEqual(
    r.state, STATE.EVALUATED,
    "a declaration at a version that does not admit it must not be honoured; honouring it would " +
    "retroactively widen what 1.1.0 means for every contract already released under it",
  );
  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
  assert.match(r.detail, /1\.2\.0/u, "the rejection must name the version that would admit it");
});
