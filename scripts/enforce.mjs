#!/usr/bin/env node
/**
 * StandardsEnforcer — run the official standards implementation and report what it said.
 *
 * THE CLAIM, and nothing wider:
 *
 *   M1  Given a repository and an immutable (standards repository, release tag, commit SHA)
 *       identity, StandardsEnforcer executes the official standards implementation and reports its
 *       result without independently recreating or reinterpreting the standards.
 *
 *   M2  For a repository already adopted, it determines whether enforcement of that release is
 *       rooted outside changes the governed pull request controls, and produces no verdict where it
 *       is not.
 *
 *   M3  Every repository in the governed population has an explicit scope disposition, and the
 *       absence or staleness of that disposition is visible. Automated detection may require review;
 *       it cannot make the disposition.
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
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { resolveIdentity } from "./identity.mjs";
import { assessGate } from "./gate.mjs";
import { detectFootprint } from "./footprint.mjs";
import { resolveScope, OUTCOME } from "./scope.mjs";
import { githubPlatform } from "./platform/github.mjs";
import { STATE, PASSING, REQUIRES_RECORDED_DECISION, exitFor } from "./states.mjs";
import { readAdapter, bindArguments, AdapterContractError, ADAPTER_FILENAME } from "./contracts/adapter.mjs";

const PLATFORMS = { github: githubPlatform };

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CACHE = path.join(tmpdir(), "standards-enforcer-cache");
export const SCHEMA_VERSION = "0.4.0";

/** The file whose presence is adoption. Absence is not non-compliance; it is a different state. */
const POLICY_FILE = "project-policy.yml";

// ---------------------------------------------------------------------------
// The one place the standards system is invoked.
// ---------------------------------------------------------------------------

/**
 * Load the invocation contract from a verified checkout.
 *
 * THE SIGNATURE IS THE POINT. It takes the resolved checkout directory and derives the path itself.
 * There is no `adapterPath` parameter and no way for a caller to supply one, because the contract
 * must come from the identity-verified release and from nowhere else — not the governed target, not
 * project policy, not a workspace override, not an environment variable, not a cached newer copy
 * (ADR 0005). A parameter would be a mechanism for substituting another location, and a mechanism
 * that exists is a mechanism that gets used.
 *
 * NO FALLBACK, OF ANY KIND. If the pinned release has no contract, that is an integration failure.
 * The enforcer does not search `main`, another tag, or a central registry, because a contract from a
 * different point in time describes a different evaluator.
 */
export function loadAdapter(standardsDir) {
  const file = path.join(standardsDir, ADAPTER_FILENAME);
  const contract = readAdapter(file); // throws AdapterContractError; validated against the schema
  const declared = contract.evaluation.entrypoint;
  const entrypoint = path.resolve(standardsDir, declared);

  // HALF ONE — LEXICAL. Catches `../../etc/passwd` without the named file having to exist, which is
  // what lets a release declaring an escape be refused even when it ships nothing at that path.
  if (!isInside(standardsDir, entrypoint)) {
    throw new AdapterContractError(
      `${declared} resolves outside the verified checkout, to ${entrypoint}`,
      [path.relative(standardsDir, entrypoint)],
    );
  }

  // HALF TWO — FILESYSTEM-RESOLVED. A path can be entirely well-formed lexically and still land
  // somewhere else, because *any* segment of it may be a link. So this resolves the whole path
  // rather than inspecting the final component: a symlinked parent directory escapes just as
  // effectively as a symlinked file, and checking only the filename would miss it.
  //
  // `path.resolve` cannot establish this. It is a string operation and never touches the
  // filesystem. This comment previously claimed the resolved half was performed here; it was not,
  // and case 7b of adapter-provenance.test.mjs executed foreign bytes for as long as that was
  // true. The claim and the code are now the same claim.
  //
  // The root is canonicalised too, and that is not belt-and-braces: on macOS the temporary
  // directories these checkouts live in are reached through a link (`/tmp` -> `/private/tmp`), so
  // comparing a canonical entrypoint against a lexical root would report every ordinary entrypoint
  // as an escape.
  let realRoot;
  try {
    realRoot = realpathSync(standardsDir);
  } catch (e) {
    throw new AdapterContractError(
      `the verified checkout at ${standardsDir} could not be resolved (${e.code ?? e.message}), so ` +
        `nothing can be established as being inside it`,
      [declared],
    );
  }

  let realEntrypoint;
  try {
    realEntrypoint = realpathSync(entrypoint);
  } catch (e) {
    if (e.code === "ENOENT" && !isSymbolicLink(entrypoint)) {
      // Simply absent — no link involved, nothing unresolved. Not an escape, and a different
      // operator problem: `runOfficialEvaluator` reports it as "the contract names X, which is not
      // in the pinned release". Preserved deliberately, because collapsing the two would send a
      // reader to the wrong fix.
      return { contract, entrypoint };
    }
    // A link that is present and does not resolve. Refused by name rather than allowed to fall
    // through as absence: where it would have pointed is *unknown*, and INV-E1 does not permit an
    // unknown enforcement condition to be treated as an acceptable one.
    throw new AdapterContractError(
      `${declared} is a link that does not resolve (${e.code ?? e.message}), so the bytes it names ` +
        `cannot be established as part of the verified checkout`,
      [declared],
    );
  }

  if (!isInside(realRoot, realEntrypoint)) {
    throw new AdapterContractError(
      `${declared} resolves through the filesystem to ${realEntrypoint}, which is outside the ` +
        `verified checkout at ${realRoot}. The bytes verified are the bytes executed, and a link ` +
        `that leaves the verified tree breaks that on its own`,
      [declared],
    );
  }

  // The canonical path is what gets returned, so the path that is spawned is the exact path whose
  // containment was established — rather than one that would traverse the links a second time.
  return { contract, entrypoint: realEntrypoint };
}

/**
 * Is `candidate` a path strictly inside `root`?
 *
 * Separator-aware, and deliberately not a string prefix: `/pack` is a prefix of `/packages/evil`,
 * and a `..foo` directory begins with `..` while escaping nothing. Both are the kind of near-miss
 * that makes a containment check look present and behave absent.
 *
 * Both arguments must already be canonical where the caller cares about links — comparing a
 * canonical path against a lexical one answers a question about neither.
 */
function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  if (rel === "") return false; // the root is not a file inside itself
  if (path.isAbsolute(rel)) return false; // a different root, or a different drive on Windows
  return rel !== ".." && !rel.startsWith(`..${path.sep}`);
}

/** Does a link exist at this path, whether or not it resolves? `existsSync` follows links and cannot say. */
function isSymbolicLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Invoke the evaluator exactly as the pinned release declares, and return its report verbatim.
 *
 * `report` is the evaluator's own JSON, unmodified. The enforcer adds context beside it and never
 * inside it — a reader must be able to tell what the authority said from what the enforcer added.
 *
 * NO PROBING. The declared argv is run once. A failure is a failure; the enforcer does not try
 * `validate` because `evaluate` failed, because a subcommand that happens to succeed may be
 * answering a different question — `check` exists in two packs and means something else in both.
 */
export function runOfficialEvaluator(standardsDir, target) {
  let loaded;
  try {
    loaded = loadAdapter(standardsDir);
  } catch (e) {
    return { ok: false, why: e.message, exitCode: null, report: null, contract: null };
  }
  const { contract, entrypoint } = loaded;
  if (!existsSync(entrypoint)) {
    return {
      ok: false,
      why: `the contract names ${contract.evaluation.entrypoint}, which is not in the pinned release`,
      exitCode: null,
      report: null,
      contract,
    };
  }
  // {policy} is the GOVERNED repository's policy, never the pack's own. FinancialStandards resolves an
  // absent `--policy` to its own project-policy.yml and reports confidently against it (finding F,
  // artifacts/evidence/2026-08-09-interface-inventory.md), so a pack declaring this binding is saying
  // "evaluate the subject against the subject's policy" — the only reading under which its verdict is
  // about the target at all.
  //
  // Derived here from `target` and POLICY_FILE rather than passed in, so the path a contract is given
  // and the path `enforce` reads for adoption below cannot drift into being two different files.
  let argv;
  try {
    argv = bindArguments(contract, { "{target}": target, "{policy}": path.join(target, POLICY_FILE) });
  } catch (e) {
    return { ok: false, why: e.message, exitCode: null, report: null, contract };
  }
  const r = spawnSync(process.execPath, [entrypoint, ...argv], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) {
    return { ok: false, why: `the evaluator could not be run (${r.error.message})`, exitCode: null, report: null, contract };
  }
  if (!r.stdout || !r.stdout.trim()) {
    const reason = (r.stderr || "").trim().split("\n")[0] || `the evaluator exited ${r.status} and printed nothing`;
    return { ok: false, why: reason, exitCode: r.status, report: null, contract };
  }
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    return { ok: false, why: "the evaluator did not return JSON", exitCode: r.status, report: null, contract };
  }
  return { ok: true, why: null, exitCode: r.status, report, contract };
}

// ---------------------------------------------------------------------------
// Enforcement.
// ---------------------------------------------------------------------------

/**
 * @param passing  Supplied only for `EVALUATED`, where it comes from the pack's declared passing set.
 *                 Every other state derives it from `PASSING`, which is a closed enumeration of
 *                 enforcement states — so a state nobody listed cannot pass by omission.
 */
function result(state, detail, extra = {}, passing = PASSING.has(state)) {
  // A passing state that is not a verdict is legitimate only when a named human decided it. Checked
  // here, at the single point every result is constructed, so no future branch can reach the passing
  // set through an absence — see REQUIRES_RECORDED_DECISION in states.mjs.
  if (REQUIRES_RECORDED_DECISION.has(state)) {
    const d = extra.scope?.decision;
    if (!d?.reviewedBy || !d?.reviewedAt || !d?.reason) {
      return result(STATE.SCOPE_REVIEW_REQUIRED,
        `${state} was reached without a complete recorded decision, which makes it an absence rather than an exclusion`,
        { ...extra, scope: { ...(extra.scope ?? {}), incomplete: true } });
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    state,
    passing,
    isStandardsVerdict: state === STATE.EVALUATED,
    detail,
    ...extra,
    // Authoritative only when the enforcement root verified. A passing verdict from an advisory run
    // says the standards accepted the repository; it does not say the repository could not have
    // avoided being asked.
    //
    // Scope authority is deliberately NOT folded in here. A verified enforcement root makes the
    // check unavoidable; it says nothing about how certain a partial ML detector is, and letting
    // scope inherit gate authority would be exactly that inference.
    authoritative: extra.gate?.rooted === true,
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
export async function enforce({
  target, standardsRepo, tag, sha, cacheRoot = DEFAULT_CACHE,
  // Enforcement root. When `gate` is supplied the run is authoritative only if the root verifies;
  // without it the run is advisory and says so, because an enforcer that stayed silent about not
  // having checked would let an advisory invocation be mistaken for a gate.
  gate = null, platform = null,
  // Scope. When `scope` is supplied the repository's disposition is resolved against an externally
  // held registry before anything is evaluated; without it scope is unchecked and NOT_ADOPTED keeps
  // its weaker M2 meaning — "no policy here" rather than "governed, and not adopted".
  scope = null, today = new Date().toISOString().slice(0, 10),
}) {
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

  // The enforcement root, before the verdict.
  //
  // Order matters and this is the whole point of M2. A verdict produced by a run nobody required
  // is a verdict the governed pull request could have avoided, and once a verdict exists it gets
  // quoted. Establish that the check is required from outside the PR's reach, or report that it is
  // not and produce no verdict at all.
  let gateReport = { checked: false, rooted: false, note: "No enforcement root was checked. This run is advisory: a merge must not be gated on it." };
  if (gate) {
    const impl = platform ?? (PLATFORMS[gate.platform] ? PLATFORMS[gate.platform]() : null);
    if (!impl) {
      return result(STATE.ENFORCEMENT_ERROR, `no adapter for platform "${gate.platform}"`, { standards });
    }
    const assessed = assessGate(impl, gate);
    if (assessed.verdict === "missing") {
      return result(STATE.GATE_MISSING, assessed.why, { standards, gate: { checked: true, rooted: false, ...assessed.detail } });
    }
    if (assessed.verdict === "invalid") {
      return result(STATE.GATE_CONFIG_INVALID, assessed.why, { standards, gate: { checked: true, rooted: false, ...assessed.detail } });
    }
    gateReport = { checked: true, rooted: true, ...assessed.detail };
  }

  // Scope, before adoption, because scope is what gives NOT_ADOPTED its meaning.
  //
  // Detection runs first and decides nothing: it exists so that a recorded decision can be shown to
  // have gone stale. The disposition itself comes only from the registry — see scope.mjs.
  let scopeReport = { checked: false, disposition: null, note: "No scope registry was configured. Whether these standards govern this repository is unreviewed here." };
  if (scope) {
    // WHICH AUTHORITY IS ASKING COMES FROM THE INVOCATION, NOT FROM THE RELEASE, and the reason is a
    // property this repository already paid for. Reading `standard.id` out of the pinned release's
    // adapter looks stricter — the pack naming itself — but it puts scope resolution behind the
    // evaluator seam, and `scope-seam-invariance.test.mjs` exists to assert that a reviewed exclusion
    // survives a release whose adapter is malformed, absent or unusable. A human decided this
    // standard does not govern this repository; a broken contract is not new information about that
    // decision, and must not convert it into an error.
    //
    // The trusted workflow supplies `--standard`, alongside the registry path and repository identity
    // it already supplies. The enforcer keeps no list of pack ids and validates nothing about this one
    // beyond its presence: an unknown id simply has no disposition on file, which is review-required.
    const footprint = detectFootprint(target);
    // Every evidence surface this run observed, keyed by surface name. One detector exists today; the
    // map is the shape because a decision's basis names the surface it was reviewed against, and an
    // unobserved surface has to be answerable with "cannot determine" rather than with a guess.
    const footprints = { [footprint.surface]: { kinds: footprint.kinds, digest: footprint.digest } };
    const resolved = resolveScope({ ...scope, target, footprints, today });
    const detection = { surface: footprint.surface, kinds: footprint.kinds, signals: footprint.signals, assurance: footprint.assurance, note: footprint.note };

    if (resolved.outcome === OUTCOME.REGISTRY_INVALID) {
      return result(STATE.SCOPE_REGISTRY_INVALID, resolved.why, { standards, gate: gateReport, scope: { checked: true, disposition: null, detection, ...resolved.detail } });
    }
    if (resolved.outcome === OUTCOME.REVIEW_REQUIRED) {
      // Everything unresolved lands here: unreviewed, self-asserted, undated, unreasoned, expired,
      // basis-less, and stale. All of them are questions for a human, and none of them is a pass.
      return result(STATE.SCOPE_REVIEW_REQUIRED, resolved.why, { standards, gate: gateReport, scope: { checked: true, disposition: null, detection, ...resolved.detail } });
    }

    scopeReport = { checked: true, disposition: resolved.outcome, detection, ...resolved.detail };
    if (resolved.outcome === OUTCOME.OUT_OF_SCOPE) {
      return result(STATE.OUT_OF_SCOPE,
        `an authorised reviewer recorded ${scope.repoName ?? scope.repoId} as out of scope for these standards: ${resolved.detail.decision.reason}`,
        { standards, gate: gateReport, scope: scopeReport });
    }
  }

  const policyPath = path.join(target, POLICY_FILE);
  if (!existsSync(policyPath)) {
    // Before M3 this could only mean "no policy file here". With a confirmed in-scope disposition it
    // means something stronger and blockable: the authoritative registry says this repository is
    // governed, and adoption is absent. The two are reported differently because they are different
    // findings with different owners — see ADR 0004.
    const governed = scopeReport.disposition === OUTCOME.IN_SCOPE;
    return result(STATE.NOT_ADOPTED,
      governed
        ? `${scope.repoName ?? scope.repoId} is recorded in scope for these standards by ${scopeReport.decision.reviewedBy} ` +
          `on ${scopeReport.decision.reviewedAt}, and contains no ${POLICY_FILE}: it is governed and has not adopted`
        : `${target} contains no ${POLICY_FILE}, so no standards version governs it`,
      { standards, gate: gateReport, scope: scopeReport, governed });
  }

  const run = runOfficialEvaluator(identity.dir, target);
  if (!run.ok) {
    return result(STATE.ENFORCEMENT_ERROR, run.why, { standards, gate: gateReport, scope: scopeReport });
  }

  const status = run.report?.status;
  if (typeof status !== "string" || !run.contract.result.statuses.includes(status)) {
    // The evaluator returned a status its own contract does not declare. That is an unknown, and
    // INV-E1 says an unknown is not a pass — even when the unknown looks reassuring. Note the test
    // is membership of THIS release's declared vocabulary, not of any list held here.
    return result(STATE.ENFORCEMENT_ERROR,
      `the standards release returned the status ${JSON.stringify(status)}, which its own contract does not declare`,
      { standards, gate: gateReport, scope: scopeReport, standardsExitCode: run.exitCode, report: run.report });
  }

  // The whole of the enforcer's opinion about the verdict: is this status in the set the pack itself
  // declared passing. No other field of the report is consulted — not a score, not a summary count,
  // not a denominator — and test/authority-boundary.test.mjs is what keeps that true.
  const passing = run.contract.result.passing.includes(status);

  return result(STATE.EVALUATED, describe(status, passing), {
    standards,
    gate: gateReport,
    scope: scopeReport,
    standardsExitCode: run.exitCode,
    // The native answer, kept as data rather than promoted into the enforcer's state machine.
    authority: { standard: run.contract.standard.id, status },
    // Verbatim. The enforcer reports what the standards said; it does not summarise it into a
    // shape of its own, because a summary is a second definition.
    report: run.report,
  }, passing);
}

/**
 * One line of context beside the verdict.
 *
 * It reads the status and the pack's own passing set, and nothing else. An earlier version printed
 * the project name, the score and the passed/failed/skipped counts — which was a summary of a pack's
 * evidence assembled here, and MathematicsStandards is the reason it is gone: it reports `score: 97`
 * with 52 rules "passed" beside a status of NOT_EVALUATED. Any line quoting that number would be
 * quoting the most convincing false green available, in the enforcer's own voice.
 *
 * The full native report is still carried verbatim beside this line. Summarising it here would be a
 * second definition of what the pack said.
 */
function describe(status, passing) {
  return `the authority reported ${JSON.stringify(status)}, which its own contract ` +
    `${passing ? "declares passing" : "does not declare passing"}`;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { target: null, standardsRepo: null, tag: null, sha: null, json: false, cacheRoot: DEFAULT_CACHE, gate: null, scope: null };
  const g = {};
  const s = {};
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a.startsWith("--target=")) args.target = path.resolve(a.slice(9));
    else if (a.startsWith("--standards=")) args.standardsRepo = path.resolve(a.slice(12));
    else if (a.startsWith("--tag=")) args.tag = a.slice(6);
    else if (a.startsWith("--sha=")) args.sha = a.slice(6);
    else if (a.startsWith("--cache=")) args.cacheRoot = path.resolve(a.slice(8));
    else if (a.startsWith("--platform=")) g.platform = a.slice(11);
    else if (a.startsWith("--gate-repo=")) g.repo = a.slice(12);
    else if (a.startsWith("--gate-branch=")) g.branch = a.slice(14);
    else if (a.startsWith("--gate-check=")) g.expectedCheck = a.slice(13);
    else if (a.startsWith("--trusted-workflow=")) g.trustedWorkflowRef = a.slice(19);
    else if (a === "--require-organisation-root") g.requireOrganisationRoot = true;
    else if (a.startsWith("--scope-registry=")) s.registryPath = path.resolve(a.slice(17));
    else if (a.startsWith("--repo-id=")) s.repoId = a.slice(10);
    else if (a.startsWith("--repo-name=")) s.repoName = a.slice(12);
    else if (a.startsWith("--standard=")) s.standardId = a.slice(11);
    else if (!a.startsWith("--") && !args.target) args.target = path.resolve(a);
    else return { error: `unrecognised argument: ${a}` };
  }
  for (const [k, flag] of [["standardsRepo", "--standards"], ["tag", "--tag"], ["sha", "--sha"]]) {
    if (!args[k]) return { error: `${flag} is required; an identity is a repository, a tag and a commit SHA` };
  }
  if (!args.target) return { error: "a target repository is required" };
  if (Object.keys(g).length > 0) {
    for (const [k, flag] of [["platform", "--platform"], ["repo", "--gate-repo"], ["branch", "--gate-branch"], ["expectedCheck", "--gate-check"]]) {
      if (!g[k]) return { error: `${flag} is required once any gate option is given; a half-configured gate is not a gate` };
    }
    args.gate = g;
  }
  if (Object.keys(s).length > 0) {
    // Same discipline as the gate. Scope resolved against a registry with no repository identity, or
    // an identity with no registry, is not a scope check — it is half of one, and half of a control
    // reads like the whole of one in a log.
    for (const [k, flag] of [["registryPath", "--scope-registry"], ["repoId", "--repo-id"], ["standardId", "--standard"]]) {
      if (!s[k]) return { error: `${flag} is required once any scope option is given; a half-configured scope check is not a scope check` };
    }
    args.scope = s;
  }
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
  if (r.gate) {
    out.push("");
    out.push(r.gate.checked
      ? `  Enforcement root: ${r.gate.rooted ? `verified (${(r.gate.rootedAt ?? []).join(", ") || "unknown"})` : "NOT verified"}`
      : "  Enforcement root: not checked");
    if (r.gate.note) out.push(`                    ${r.gate.note}`);
  }
  if (r.scope) {
    out.push("");
    out.push(`  Scope: ${r.scope.checked ? (r.scope.disposition ?? "unresolved — review required") : "not checked"}`);
    if (r.scope.decision?.reviewedBy) {
      // When the disposition did not resolve there IS a decision on file, and printing it plainly
      // would read as though it still applied. Say which it is.
      out.push(r.scope.disposition
        ? `         recorded by ${r.scope.decision.reviewedBy} on ${r.scope.decision.reviewedAt}`
        : `         the decision on file (${r.scope.decision.disposition}, ${r.scope.decision.reviewedBy}, ` +
          `${r.scope.decision.reviewedAt}) does not currently hold`);
    }
    if (r.scope.note) out.push(`         ${r.scope.note}`);
    if (r.scope.detection) {
      out.push(`         Detected: ${r.scope.detection.kinds.length ? r.scope.detection.kinds.join(", ") : "no ML evidence"}` +
        ` (assurance: ${r.scope.detection.assurance})`);
    }
  }
  out.push("");
  if (r.state === STATE.OUT_OF_SCOPE) {
    // The one passing state that is not a verdict. It must never read as though the standards looked
    // at this repository and were satisfied.
    out.push("  These standards do not govern this repository, by recorded human decision.");
    out.push("  Nothing was evaluated. This is an exclusion, not a pass.");
    out.push(`  It stands on ${r.scope?.standsOn ?? "a recorded review"}.`);
  } else {
    out.push(r.passing
      ? "  The standards accepted this repository. That is what the standards examined, not everything."
      : "  Not a passing state. A merge gated on this enforcer must not proceed.");
  }
  if (r.passing && r.authoritative === false) {
    out.push("  ADVISORY: no enforcement root was verified, so this result does not establish that");
    out.push("  the repository could not have avoided being asked.");
  }
  if (!r.isStandardsVerdict && r.state !== STATE.ENFORCEMENT_ERROR && r.state !== STATE.OUT_OF_SCOPE) {
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
    return exitFor(STATE.ENFORCEMENT_ERROR, false);
  }
  const r = await enforce(parsed.args);
  process.stdout.write(parsed.args.json ? JSON.stringify(r, null, 2) + "\n" : render(r));
  return exitFor(r.state, r.passing);
}

if (process.argv[1]?.endsWith("enforce.mjs")) {
  main().then((code) => process.exit(code));
}
