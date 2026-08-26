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

async function release(dir) {
  const repo = path.join(dir, "standards");
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  git(["init", "--quiet", "-b", "main"], repo);
  git(["config", "user.email", "test@example.invalid"], repo);
  git(["config", "user.name", "Adoption Marker"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  await writeFile(path.join(repo, "VERSION"), "1.0.0\n");
  await writeFile(path.join(repo, "standards-adapter.json"), JSON.stringify({
    schemaVersion: "1.1.0",
    standard: { id: STANDARD },
    evaluation: { entrypoint: "scripts/standards.mjs",
      arguments: ["evaluate", "--dir={target}", "--policy={policy}", "--json"] },
    result: { statuses: ["COMPLIANT", "NON_COMPLIANT"], passing: ["COMPLIANT"] },
  }, null, 2));
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
async function run(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "adoption-marker-"));
  try {
    const { repo, sha } = await release(dir);
    const target = path.join(dir, "target");
    await mkdir(target, { recursive: true });
    for (const name of files) await writeFile(path.join(target, name), POLICY_BODY);
    return await enforce({
      target, standardsRepo: repo, tag: "v1.0.0", sha,
      cacheRoot: path.join(dir, "cache"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- Known-positive: the spelling that already worked must keep working ---

test("adoption · project-policy.yml is adopted, and is handed to the authority", async () => {
  const r = await run(["project-policy.yml"]);
  assert.notEqual(r.state, STATE.NOT_ADOPTED, `.yml must remain adopted, got: ${r.why ?? ""}`);
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.report.policyRead, r.policy.path,
    "the policy whose presence established adoption must be the exact policy handed to the authority");
  assert.match(r.policy.path, /project-policy\.yml$/u);
});

// --- The specimen: the defect, stated as the outcome and not as a mechanism ---

test("adoption · a policy the authority admits is not reported unadopted", async () => {
  const r = await run(["project-policy.yaml"]);
  assert.notEqual(
    r.state, STATE.NOT_ADOPTED,
    "a repository whose only policy is project-policy.yaml has adopted — FinancialStandards' own " +
    `init says so — and must reach the authority rather than being refused here. Got: ${r.why ?? ""}`,
  );
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.report.policyRead, r.policy.path,
    "the policy whose presence established adoption must be the exact policy handed to the authority");
  assert.match(r.policy.path, /project-policy\.yaml$/u);
});

// --- Known-negative: the boundary must stay a boundary ---

test("adoption · an unsupported filename is still NOT_ADOPTED", async () => {
  const r = await run(["standards-policy.yml"]);
  assert.equal(
    r.state, STATE.NOT_ADOPTED,
    "widening the marker set must not widen it to anything policy-shaped; a filename no authority " +
    "admits is not adoption, and treating it as such would trade a false negative for a false positive",
  );
});
