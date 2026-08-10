/**
 * The GitHub adapter. Everything platform-specific lives behind `requiredChecks`.
 *
 * Two sources answer the same question and both are read, because a repository may be governed by
 * either and an enforcer that knew about only one would report a real gate as missing:
 *
 *   rulesets            — organisation or repository scoped, the current mechanism
 *   branch protection   — classic, still widely in use
 *
 * Normalised to one shape: `{ context, appId, source, enforcement }`. The adapter does not decide
 * whether a gate is adequate — that is scripts/gate.mjs, so the Azure DevOps adapter later changes
 * no enforcement semantics.
 *
 * Access is through the `gh` CLI rather than a hand-rolled HTTP client, so authentication is the
 * operator's existing one and this repository stores no credentials. Where `gh` is absent or
 * unauthenticated the adapter says so and the caller treats it as an unknown, never as an absence.
 */

import { spawnSync } from "node:child_process";

function gh(args) {
  const r = spawnSync("gh", args, { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) return { ok: false, why: `gh could not be run (${r.error.message}); the GitHub CLI is how this adapter reaches the API` };
  if (r.status !== 0) {
    const reason = (r.stderr || "").trim().split("\n").filter(Boolean).pop() || `gh exited ${r.status}`;
    return { ok: false, why: reason, status: r.status };
  }
  try {
    return { ok: true, data: JSON.parse(r.stdout || "null") };
  } catch {
    return { ok: false, why: "gh returned output that is not JSON" };
  }
}

/** Rulesets that apply to a branch, including ones inherited from the organisation. */
function fromRulesets(repo, branch) {
  const list = gh(["api", `repos/${repo}/rules/branches/${encodeURIComponent(branch)}`]);
  if (!list.ok) return list;

  const checks = [];
  for (const rule of list.data ?? []) {
    if (rule.type !== "required_status_checks") continue;
    const source = (rule.ruleset_source_type ?? "").toLowerCase() === "organization" ? "organization" : "repository";
    for (const c of rule.parameters?.required_status_checks ?? []) {
      checks.push({
        context: c.context,
        // Absent integration_id means the requirement matches on name alone, which is the
        // spoofable case gate.mjs refuses.
        appId: c.integration_id ?? null,
        source,
        // This endpoint returns only rules that are actively enforced. A ruleset in evaluate mode
        // does not appear here, which is the behaviour we want and is asserted by the adapter test.
        enforcement: "active",
      });
    }
  }
  return { ok: true, checks };
}

/** Classic branch protection, for repositories not yet on rulesets. */
function fromBranchProtection(repo, branch) {
  const p = gh(["api", `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`]);
  if (!p.ok) {
    // 404 here means "no classic protection", which is a real answer rather than a failure.
    if (/not found|404/i.test(p.why ?? "")) return { ok: true, checks: [] };
    return p;
  }
  const checks = [];
  for (const c of p.data?.required_status_checks?.checks ?? []) {
    checks.push({ context: c.context, appId: c.app_id ?? null, source: "repository", enforcement: "active" });
  }
  return { ok: true, checks };
}

export function githubPlatform() {
  return {
    name: "github",
    requiredChecks(repo, branch) {
      const rulesets = fromRulesets(repo, branch);
      const classic = fromBranchProtection(repo, branch);

      // Both must answer. One source failing while the other returns an empty list would look
      // exactly like "nothing is required", and reporting an unknown as an absence is the failure
      // this whole family of repositories exists to prevent.
      if (!rulesets.ok) return { ok: false, why: `rulesets: ${rulesets.why}` };
      if (!classic.ok) return { ok: false, why: `branch protection: ${classic.why}` };

      return { ok: true, checks: [...rulesets.checks, ...classic.checks] };
    },
  };
}
