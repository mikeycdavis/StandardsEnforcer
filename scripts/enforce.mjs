#!/usr/bin/env node
/**
 * StandardsEnforcer — run the official standards implementation and report what it said.
 *
 * THE M1 CLAIM, and nothing wider:
 *
 *     Given a repository and an immutable (standards repository, release tag, commit SHA) identity,
 *     StandardsEnforcer executes the official standards implementation and reports its result
 *     without independently recreating or reinterpreting the standards.
 *
 * The second half is the constraint that shapes every line below. This program contains no rule, no
 * detector, no applicability logic and no scoring. It verifies an identity, decides whether the
 * target has adopted, invokes the official evaluator, and passes the verdict through. Where it is
 * tempted to interpret — what counts as adoption, what an exit code means — the interpretation is
 * about *enforcement*, never about a standard.
 *
 *     INV-E1 — never convert an unknown, missing, unverifiable, or failed enforcement condition
 *     into a successful compliance result.
 *
 * Zero dependencies. Node 18 or later. Nothing to install, because an install step is a second
 * thing that can differ between the machine that reviewed a release and the machine that runs it.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { resolveIdentity } from "./identity.mjs";
import { STATE, VERDICT_STATES, PASSING, exitFor } from "./states.mjs";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CACHE = path.join(tmpdir(), "standards-enforcer-cache");
export const SCHEMA_VERSION = "0.1.0";

/** The file whose presence is adoption. Absence is not non-compliance; it is a different state. */
const POLICY_FILE = "project-policy.yml";

// ---------------------------------------------------------------------------
// The one place the standards system is invoked.
// ---------------------------------------------------------------------------

/**
 * Run the official evaluator out of a verified checkout and return its report verbatim.
 *
 * `report` is the evaluator's own JSON, unmodified. The enforcer adds context beside it and never
 * inside it — the same discipline MachineLearningStandards applies to coverage, and for the same
 * reason: a reader must be able to tell what the standards said from what the enforcer added.
 */
export function runOfficialEvaluator(standardsDir, target) {
  const cli = path.join(standardsDir, "scripts", "standards.mjs");
  if (!existsSync(cli)) {
    return { ok: false, why: `the materialised standards release has no scripts/standards.mjs`, exitCode: null, report: null };
  }
  const r = spawnSync(process.execPath, [cli, "evaluate", `--dir=${target}`, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) return { ok: false, why: `the evaluator could not be run (${r.error.message})`, exitCode: null, report: null };
  if (!r.stdout || !r.stdout.trim()) {
    const reason = (r.stderr || "").trim().split("\n")[0] || `the evaluator exited ${r.status} and printed nothing`;
    return { ok: false, why: reason, exitCode: r.status, report: null };
  }
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    return { ok: false, why: "the evaluator did not return JSON", exitCode: r.status, report: null };
  }
  return { ok: true, why: null, exitCode: r.status, report };
}

// ---------------------------------------------------------------------------
// Enforcement.
// ---------------------------------------------------------------------------

function result(state, detail, extra = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    state,
    passing: PASSING.has(state),
    isStandardsVerdict: VERDICT_STATES.has(state),
    detail,
    ...extra,
  };
}

/**
 * Enforce one standards identity against one target repository.
 *
 * The order is deliberate and each step can only produce a non-passing state:
 *
 *   identity → adoption → official evaluation → pass-through
 *
 * Identity comes first because running an unverified implementation and then discovering it was
 * the wrong one would mean a verdict already exists, and a verdict that exists gets quoted.
 */
export async function enforce({ target, standardsRepo, tag, sha, cacheRoot = DEFAULT_CACHE }) {
  if (!target || !existsSync(target)) {
    return result(STATE.ENFORCEMENT_ERROR, `the target ${target ?? "(none given)"} does not exist`);
  }

  const identity = resolveIdentity({ repo: standardsRepo, tag, sha, cacheRoot });
  if (!identity.ok) {
    // A declared identity that does not resolve is not an error to retry past. It means nobody can
    // say which standards ran, and a verdict from an unidentified implementation is worth nothing.
    return result(STATE.STANDARDS_IDENTITY_MISMATCH, identity.why, {
      standards: { repo: standardsRepo, tag, declaredSha: sha, resolvedSha: identity.resolved },
    });
  }

  const standards = {
    repo: standardsRepo,
    tag,
    sha,
    verified: true,
    materialisedAt: identity.dir,
    fromCache: identity.cached ?? false,
  };

  const policyPath = path.join(target, POLICY_FILE);
  if (!existsSync(policyPath)) {
    // Adoption is observable; whether this repository OUGHT to have adopted is not, and answering
    // it needs applicability detection and a scope registry that do not exist yet. Reporting
    // NOT_ADOPTED rather than guessing keeps the two apart — see ADR 0002.
    return result(STATE.NOT_ADOPTED, `${target} contains no ${POLICY_FILE}, so no standards version governs it`, { standards });
  }

  const run = runOfficialEvaluator(identity.dir, target);
  if (!run.ok) {
    return result(STATE.ENFORCEMENT_ERROR, run.why, { standards });
  }

  const verdict = run.report.status;
  if (!VERDICT_STATES.has(verdict)) {
    // The evaluator returned a status this enforcer does not know. That is an unknown, and INV-E1
    // says an unknown is not a pass — even when the unknown looks reassuring.
    return result(STATE.ENFORCEMENT_ERROR,
      `the standards release returned the status "${verdict}", which this enforcer does not recognise`,
      { standards, standardsExitCode: run.exitCode, report: run.report });
  }

  return result(verdict, describe(run.report), {
    standards,
    standardsExitCode: run.exitCode,
    // Verbatim. The enforcer reports what the standards said; it does not summarise it into a
    // shape of its own, because a summary is a second definition.
    report: run.report,
  });
}

/**
 * One line of context beside the verdict, read out of the report rather than derived from it.
 *
 * The first draft asked whether the status was BLOCKED_BY_INVARIANT before deciding whether a score
 * was meaningful — which is a MachineLearningStandards rule ("blocked means unscored"), restated
 * here where it would go stale the moment that rule changed. The structural test in
 * test/enforce.test.mjs caught it. Reading `report.score` and saying what is there needs no opinion
 * about why it is null.
 */
function describe(report) {
  const s = report.summary ?? {};
  return `${report.project ?? "project"}: ${report.status}, ` +
    `score ${report.score === null || report.score === undefined ? "not computed" : report.score + "%"}, ` +
    `${s.passed ?? 0} passed / ${s.failed ?? 0} failed / ${s.skipped ?? 0} skipped`;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { target: null, standardsRepo: null, tag: null, sha: null, json: false, cacheRoot: DEFAULT_CACHE };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a.startsWith("--target=")) args.target = path.resolve(a.slice(9));
    else if (a.startsWith("--standards=")) args.standardsRepo = path.resolve(a.slice(12));
    else if (a.startsWith("--tag=")) args.tag = a.slice(6);
    else if (a.startsWith("--sha=")) args.sha = a.slice(6);
    else if (a.startsWith("--cache=")) args.cacheRoot = path.resolve(a.slice(8));
    else if (!a.startsWith("--") && !args.target) args.target = path.resolve(a);
    else return { error: `unrecognised argument: ${a}` };
  }
  for (const [k, flag] of [["standardsRepo", "--standards"], ["tag", "--tag"], ["sha", "--sha"]]) {
    if (!args[k]) return { error: `${flag} is required; an identity is a repository, a tag and a commit SHA` };
  }
  if (!args.target) return { error: "a target repository is required" };
  return { args };
}

function render(r) {
  const out = [`Enforcement: ${r.state}`, `  ${r.detail}`];
  if (r.standards) {
    out.push("");
    out.push(`  Standards: ${r.standards.tag} @ ${(r.standards.sha ?? r.standards.declaredSha ?? "").slice(0, 12)}` +
      (r.standards.verified ? "  (identity verified)" : "  (identity NOT verified)"));
    out.push(`             ${r.standards.repo}`);
  }
  out.push("");
  out.push(r.passing
    ? "  The standards accepted this repository. That is what the standards examined, not everything."
    : "  Not a passing state. A merge gated on this enforcer must not proceed.");
  if (!r.isStandardsVerdict && r.state !== STATE.ENFORCEMENT_ERROR) {
    out.push("  This is an enforcement state, not a verdict: the standards reached no conclusion here.");
  }
  return out.join("\n") + "\n";
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(
      `enforce: ${parsed.error}\n\n` +
        "  node scripts/enforce.mjs --target=<repo> --standards=<standards-repo> --tag=<tag> --sha=<40-hex> [--json]\n",
    );
    return exitFor(STATE.ENFORCEMENT_ERROR);
  }
  const r = await enforce(parsed.args);
  process.stdout.write(parsed.args.json ? JSON.stringify(r, null, 2) + "\n" : render(r));
  return exitFor(r.state);
}

if (process.argv[1]?.endsWith("enforce.mjs")) {
  main().then((code) => process.exit(code));
}
