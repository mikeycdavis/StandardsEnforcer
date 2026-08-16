/**
 * The enforcement root: is this repository's standards check required from somewhere the governed
 * pull request cannot reach?
 *
 * M1 established that the enforcer reproduces the authoritative verdict. This asks the next
 * question, which is whether the governed project can avoid that verdict — and the answer turns on
 * four semantics that are easy to get wrong in ways that look fine.
 *
 * 1. A GATE IS A REQUIRED CHECK, NOT A WORKFLOW FILE.
 *    `.github/workflows/standards.yml` existing establishes nothing. A perfectly good workflow that
 *    nobody requires is missing enforcement, and the workflow file is inside the PR's own tree, so
 *    treating its presence as the gate would make the gate deletable by the thing it gates.
 *
 * 2. A REQUIRED CHECK MATCHED BY NAME ALONE IS SPOOFABLE.
 *    GitHub matches required status checks by context string. A pull request can add a workflow of
 *    its own that emits a check with the same name and passes it. The requirement must therefore be
 *    bound to the app that may satisfy it — `integration_id` on a ruleset, `app_id` on classic
 *    branch protection. A name-only requirement is a configuration defect, not a gate.
 *
 * 3. THE TRUSTED IMPLEMENTATION MUST ITSELF BE PINNED.
 *    A reusable workflow referenced as `@main` moves the mutable-root problem one repository
 *    outward: whoever can push to that branch decides what every governed repository runs. The same
 *    argument that makes a standards identity a tag-plus-SHA applies here, and for the same reason.
 *
 * 4. A BYPASS IS AN EVENT, NOT A VERDICT.
 *    An authorised administrative bypass does not retroactively make a failed evaluation pass. It
 *    is recorded and reported separately. `BYPASS_USED` exists in the vocabulary for that and is
 *    deliberately unreachable until there is a source for the data — see states.mjs.
 *
 * Platform access is injected. Everything here is semantics, so it is testable against recorded
 * shapes without a network, and the Azure DevOps adapter later changes none of it.
 */

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * The GitHub Actions app.
 *
 * Binding a required check to this app was M2's mitigation for name-spoofing, and M4 established
 * against a live repository that it does not work. Every workflow in a repository runs as this app —
 * including one a pull request adds — so a requirement bound to it is satisfied by the pull request's
 * own green tick, exactly as though it had been bound to nothing. The observed result was
 * `mergeable: MERGEABLE, mergeStateStatus: CLEAN` on a pull request that had deleted the enforcement
 * and replaced it with `run: echo`.
 *
 * A binding is therefore only a root when it names an app the governed pull request cannot act as.
 * See artifacts/evidence/2026-08-10-m4-live-github.md.
 */
export const GITHUB_ACTIONS_APP_ID = 15368;

/** A reusable-workflow reference is pinned only when it names an immutable commit. */
export function isPinnedWorkflowRef(ref) {
  if (typeof ref !== "string") return false;
  const at = ref.lastIndexOf("@");
  if (at === -1) return false;
  return FULL_SHA.test(ref.slice(at + 1));
}

/**
 * Assess the enforcement root for one branch.
 *
 * `platform` supplies `requiredChecks(repo, branch)`, returning
 * `{ ok, why, checks: [{ context, appId, source, enforcement }] }`. Nothing here knows what GitHub
 * is; the adapter does.
 *
 * Returns `{ verdict, why, detail }` where verdict is one of four, and the last three are three
 * different propositions rather than three shades of failure:
 *
 *     rooted       something the pull request cannot reach requires the right check
 *     missing      the host answered, and nothing there requires it
 *     invalid      the host answered, and what it described does not root anything
 *     unreadable   the host did not answer, so neither of the above was established
 *
 * `missing` and `invalid` are claims about a configuration that was observed. `unreadable` is the
 * absence of an observation, and collapsing it into either would report knowledge nobody has.
 */
export function assessGate(platform, { repo, branch, expectedCheck, trustedWorkflowRef, requireOrganisationRoot = false }) {
  if (!expectedCheck) {
    return { verdict: "invalid", why: "no expected check name was configured, so nothing could be required", detail: {} };
  }

  // The trusted implementation is part of the gate's identity, and an unpinned one is not a root.
  if (trustedWorkflowRef !== undefined && !isPinnedWorkflowRef(trustedWorkflowRef)) {
    return {
      verdict: "invalid",
      why:
        `the trusted enforcement workflow is referenced as "${trustedWorkflowRef}", which is not pinned to a commit. ` +
        "Whoever can move that reference decides what every governed repository runs",
      detail: { trustedWorkflowRef },
    };
  }

  const answer = platform.requiredChecks(repo, branch);
  if (!answer || answer.ok !== true) {
    // The platform could not tell us. That is an unknown about enforcement, and INV-E1 forbids
    // resolving an unknown in the permissive direction.
    //
    // Its own verdict rather than "invalid" — the correction this release makes. "Invalid" asserts
    // the configuration was READ AND FOUND WRONG; a host that would not answer supplied no
    // configuration to find anything about. Both refuse and both exit 4, so nothing was failing, but
    // the enforcer was stating a proposition it had not established, and a reader sent to fix a
    // misconfiguration that may not exist looks in the wrong place for a problem that is a
    // credential, a permission, or an outage.
    return { verdict: "unreadable", why: answer?.why ?? "the platform did not answer", detail: {} };
  }

  const checks = answer.checks ?? [];
  const named = checks.filter((c) => c.context === expectedCheck);
  if (named.length === 0) {
    return {
      verdict: "missing",
      why:
        `no rule on ${repo}@${branch} requires the check "${expectedCheck}". ` +
        (checks.length === 0
          ? "Nothing is required on this branch"
          : `Required there: ${checks.map((c) => c.context).join(", ")}`),
      detail: { required: checks.map((c) => c.context) },
    };
  }

  // A rule in evaluate/dry-run mode reports as though it were configured and blocks nothing.
  const active = named.filter((c) => c.enforcement === "active");
  if (active.length === 0) {
    return {
      verdict: "missing",
      why: `"${expectedCheck}" is configured on ${repo}@${branch} but its rule is not active (${named.map((c) => c.enforcement).join(", ")}), so it blocks nothing`,
      detail: { enforcement: named.map((c) => c.enforcement) },
    };
  }

  // Name-only matching is the spoofable case: a pull request can add a workflow that emits a check
  // with this exact name and satisfy the requirement with its own green tick.
  const bound = active.filter((c) => c.appId !== null && c.appId !== undefined);
  if (bound.length === 0) {
    return {
      verdict: "invalid",
      why:
        `"${expectedCheck}" is required on ${repo}@${branch} but is not bound to an app, so any workflow ` +
        "that emits a check of that name satisfies it — including one the pull request adds",
      detail: { spoofable: true },
    };
  }

  // Bound, but bound to the one app the pull request can also act as.
  //
  // This is the M4 finding, and it is a spoof the name-binding check does not catch: the requirement
  // looks correctly configured, and a pull request satisfies it anyway. The only thing that rescues
  // an Actions-produced check is a rule pinning WHICH workflow must run — GitHub's `workflows`
  // ruleset rule, naming a repository, a path and a commit the pull request does not control.
  if (bound.every((c) => c.appId === GITHUB_ACTIONS_APP_ID)) {
    const pinned = (answer.workflows ?? []).filter((w) => FULL_SHA.test(w.sha ?? ""));
    const matching = trustedWorkflowRef
      ? pinned.filter((w) => trustedWorkflowRef.endsWith(`@${w.sha}`) && trustedWorkflowRef.includes(w.path))
      : pinned;
    if (matching.length === 0) {
      return {
        verdict: "invalid",
        why:
          `"${expectedCheck}" is required on ${repo}@${branch} and bound to the GitHub Actions app, which every ` +
          "workflow in the repository runs as — including one the pull request adds. Binding to Actions does not " +
          "make the requirement unspoofable. Pin the implementation with a required-workflows rule, or have the " +
          "check produced by an app the pull request cannot act as",
        detail: { spoofable: true, boundToActions: true, requiredWorkflows: pinned },
      };
    }
    return {
      verdict: "rooted",
      why: null,
      detail: {
        rootedAt: [...new Set(bound.map((c) => c.source))],
        appIds: [GITHUB_ACTIONS_APP_ID],
        pinnedWorkflows: matching,
        trustedWorkflowRef: trustedWorkflowRef ?? null,
        note:
          "Required by a rule that pins which workflow must run, at a commit. The check is produced by the " +
          "GitHub Actions app, which the pull request can also act as, so the pinned-workflow rule is what makes " +
          "this a root rather than the app binding.",
      },
    };
  }

  const roots = [...new Set(bound.map((c) => c.source))];
  if (requireOrganisationRoot && !roots.includes("organization")) {
    return {
      verdict: "invalid",
      why: `"${expectedCheck}" is required from ${roots.join(", ")} rather than from the organisation, and organisation rooting was required`,
      detail: { rootedAt: roots },
    };
  }

  return {
    verdict: "rooted",
    why: null,
    detail: {
      rootedAt: roots,
      appIds: [...new Set(bound.map((c) => c.appId))],
      trustedWorkflowRef: trustedWorkflowRef ?? null,
      // Stated rather than implied: a repository-level rule is outside the pull request's tree and
      // is still editable by a repository admin. That is a weaker root than an organisation rule,
      // and a reader deciding how much to trust this needs to be told which one they have.
      note: roots.includes("organization")
        ? "Required by an organisation rule; a pull request cannot reach it."
        : "Required by a repository-level rule. Outside the pull request's tree, but a repository admin can change it.",
    },
  };
}
