# 0003 — The enforcement root

- **Status:** Accepted; **central mitigation superseded by live evidence, 2026-08-10**
- **Date:** 2026-08-09
- **Deciders:** Project owner
- **Milestone:** M2. Makes `GATE_MISSING` reachable and adds `GATE_CONFIG_INVALID`.
- **Superseded in part by:**
  [2026-08-10-m2-superseded.md](../evidence/2026-08-10-m2-superseded.md), on the evidence of
  [M4 against live GitHub](../evidence/2026-08-10-m4-live-github.md). The app binding
  (`integration_id` / `app_id`) does **not** establish an enforcement root for GitHub Actions: it
  identifies the app that produced a check, not the enforcement implementation, and every workflow
  in the repository runs as that one app. What survives never depended on the binding — a gate is a
  required check and not a workflow file; a name-only requirement is spoofable; an unpinned
  trusted-workflow reference is not a root; an unknown is never an absence; a bypass is an event,
  not a verdict. The conclusion built on top of it does not hold.

## Context

M1 established that the enforcer reproduces the authoritative verdict without reinterpreting it.
That answers *can I trust the verdict*. It does not answer *can the governed project avoid being
asked*, and until it does, the system enforces an opt-in.

The milestone is the trust boundary rather than the integration:

> Given a GitHub repository that has adopted a standards release, determine whether enforcement of
> that release is rooted outside changes governed by the repository itself, and prevent merge when
> the authoritative standards execution does not permit it.

## Decision

### A gate is a required check, not a workflow file

`.github/workflows/standards.yml` existing establishes nothing, and treating its presence as the
gate would make the gate deletable by the thing it gates. The enforcer queries the platform for the
rules that actually require a check on the governed branch — GitHub rulesets, including ones
inherited from the organisation, and classic branch protection, because a repository may be governed
by either.

A rule in `evaluate` mode reports as configured and blocks nothing; it is treated as missing.

### A requirement matched by name alone is spoofable, and is a configuration defect

**This is the finding that most changes the design.** GitHub matches required status checks by
context string. A pull request can add a workflow of its own emitting a check with exactly the
required name, pass it, and satisfy the requirement with its own green tick — while the real gate
never runs.

So a requirement must be bound to the app permitted to satisfy it: `integration_id` on a ruleset,
`app_id` on classic protection. An unbound requirement produces `GATE_CONFIG_INVALID`, which is a
separate state from `GATE_MISSING` because *nobody requires this* and *something requires it in a
way the pull request can satisfy for itself* need different fixes.

### The trusted implementation is part of the gate's identity

A reusable workflow referenced as `@main` moves the mutable-root problem one repository outward:
whoever can push to that branch decides what every governed repository runs. The reference must name
a commit, and an unpinned one invalidates the gate **before the platform is even asked** — asking
first would let a correctly configured requirement look as though it had rescued an untrustworthy
implementation.

This is the standards-identity argument from ADR 0001 applied to the enforcement path. The same
reasoning, one layer out, for the third time in this family of repositories.

### A bypass is an event, not a verdict

An authorised administrative bypass does not retroactively make a failed evaluation pass.
`BYPASS_USED` is in the vocabulary for reporting it and is **deliberately unreachable**: GitHub
exposes bypass events through audit-log endpoints this enforcer cannot assume are available, and
inventing a source would be worse than the gap. The semantic is settled now so that when the data
arrives nobody has to argue about whether a bypass counts as compliance.

### Human attestation is out of scope here

GitHub supplies the primitives eventually — review identity, CODEOWNERS, approvals, pull-request
ancestry — and none of them is needed to establish the external gate. It is a separate claim about a
different thing, and it deserves its own adversarial tests rather than a ride on this milestone's.

### Advisory versus authoritative

A local invocation with no gate configured is legitimate and common. It is stamped
`authoritative: false`, its payload says the enforcement root was not checked, and the rendered
output warns that a pass from such a run does not establish that the repository could not have
avoided being asked. Silence there would let an advisory invocation be mistaken for a gate, which is
the same failure as reporting an unknown as a pass.

A half-configured gate — some flags but not all — is refused rather than half-checked.

## Alternatives considered

**Treat the workflow file's presence as the gate.** Rejected; it is inside the tree it governs.

**Accept a name-only requirement and note the weakness.** Rejected. A note does not stop the spoof,
and the repository that would read the note is the one that already configured it wrongly.

**Fold `GATE_CONFIG_INVALID` into `GATE_MISSING`.** Rejected: different remedies, and merging them
sends an operator to the wrong one.

**Require an organisation root always.** Rejected as a default, offered as a flag. A repository-level
ruleset is outside the pull request's reach, which is the stated boundary of this milestone; it is
still editable by a repository admin, which is weaker, so the report says which one is in force
rather than silently accepting both as equivalent.

**Have the enforcer query the platform once and cache it.** Rejected for now. The adversarial test
re-asks on every mutation precisely to demonstrate the answer does not come from the repository, and
a cache would weaken what the test proves.

## Consequences

`GATE_MISSING` and `GATE_CONFIG_INVALID` are reachable. `SCOPE_REVIEW_REQUIRED` remains unreachable
by design — the sequencing is deliberate, and M3 asks the harder question of which repositories
should be governed at all.

When this milestone closes the system can say:

> For repositories already confirmed in scope and adopted, enforcement cannot silently disappear
> through an ordinary governed pull request.

It cannot yet say anything about a repository that does machine-learning work and never adopted.
That is the remaining bypass, and it is the whole of M3.

**The GitHub adapter is thin on purpose.** Every assertion in `test/gate.test.mjs` runs against an
injected platform, so the semantics are established without a network and the Azure DevOps adapter
later must change none of them. What the adapter owns is the shape of two API responses; what it
does not own is what an adequate gate is.
