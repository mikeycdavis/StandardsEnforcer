# M2 — the enforcement root

**Date:** 2026-08-09 · **Enforcer:** `0.2.0` · **Milestone question:** can the governed project
avoid the verdict?

> **SUPERSEDED IN PART — 2026-08-10.** The mitigation proposed below, binding a required check to
> the app permitted to satisfy it (`integration_id` / `app_id`), was **falsified by live evidence**
> in [M4](2026-08-10-m4-live-github.md). Every workflow in a repository — including one the pull
> request adds — runs as the same GitHub Actions app, so the binding partitions nothing. See
> [the supersession record](2026-08-10-m2-superseded.md) for what survives and what does not.
>
> **This document is deliberately not amended.** It is an accurate account of what was believed and
> what had been demonstrated when it was written. The chain — adversarial reasoning finds a real
> hole, proposes a plausible mitigation, a live experiment falsifies the mitigation — is the more
> valuable artefact, and rewriting the first link would destroy it. Read what follows as history.

M1 asked whether the authoritative verdict could be reproduced without interpreting it. This asks
whether the project being judged can arrange not to be judged. Tested through negative and
adversarial cases, because the positive case proves almost nothing — a gate that works when
everything is configured correctly is not the claim.

## The finding that most changed the design

**A required status check matched by name alone can be satisfied by the pull request itself.**

GitHub matches required checks by context string. A pull request can add a workflow of its own that
emits a check with exactly the required name, pass it in seconds, and satisfy the requirement while
the real enforcement never runs. Branch protection reports green. Nothing looks wrong.

The mitigation is that the requirement must be bound to the app permitted to satisfy it —
`integration_id` on a ruleset, `app_id` on classic protection — and an unbound requirement is
therefore a **configuration defect rather than a gate**. That is `GATE_CONFIG_INVALID`, kept
separate from `GATE_MISSING` because *nobody requires this* and *something requires it in a way the
PR can satisfy for itself* send an operator to different fixes.

This was not in the milestone brief. It came out of asking what a pull request could actually do.

## Negative cases

| Configuration | State |
| --- | --- |
| Nothing required on the branch | `GATE_MISSING` |
| A workflow file present, nothing requiring it | `GATE_MISSING` |
| A different check required | `GATE_MISSING` |
| The rule present but in `evaluate` mode | `GATE_MISSING` |
| Required, bound to no app | `GATE_CONFIG_INVALID` |
| Trusted workflow referenced `@main`, `@v1`, unpinned, or by a short SHA | `GATE_CONFIG_INVALID` |
| The platform cannot answer (`gh` unauthenticated) | `GATE_CONFIG_INVALID` |
| No expected check name configured | `GATE_CONFIG_INVALID` |
| Organisation rooting required, only a repository rule present | `GATE_CONFIG_INVALID` |
| Required, active, app-bound, organisation-rooted | **rooted** |

Two orderings are asserted rather than assumed. An unpinned trusted workflow invalidates the gate
**before the platform is asked at all** — asking first would let a correctly configured requirement
look as though it had rescued an untrustworthy implementation. And a platform that cannot answer is
an unknown, never an absence: reporting it as `GATE_MISSING` would be a guess, and reporting it as
rooted would be the failure INV-E1 exists to prevent.

## The adversarial case

One working tree, one external requirement held constant outside it, seven mutations applied in
sequence — everything a pull request could plausibly try:

```text
delete the local workflow                              gate still rooted
delete the whole .github directory                     gate still rooted
add a workflow emitting a check of the required name   gate still rooted
claim a different standardVersion in the policy        gate still rooted
add a CODEOWNERS granting itself review                gate still rooted
add a file named like the enforcer's own config        gate still rooted
remove project-policy.yml entirely                     gate still rooted → NOT_ADOPTED
```

The requirement is held by the injected platform, outside the target directory, which is the point
of the fixture rather than a convenience: the repository can be rewritten freely and demonstrably
cannot reach it. The assertion is not that the verdict never changes — deleting the policy
legitimately changes it — but that no mutation moves the gate, and no mutation produces a passing
state it should not.

The last row is the one worth reading twice. **Removing the standards is not a route to a green
check**: it produces `NOT_ADOPTED`, exit 4, no verdict, no merge.

## Advisory versus authoritative

A local run with no gate configured is legitimate and is stamped:

```text
  Enforcement root: not checked
                    No enforcement root was checked. This run is advisory: a merge must not be
                    gated on it.

  ADVISORY: no enforcement root was verified, so this result does not establish that
  the repository could not have avoided being asked.
```

`authoritative: true` appears only when the root verified. Silence here would let an advisory
invocation be mistaken for a gate, which is the same class of error as reporting an unknown as a
pass. A half-configured gate — some flags but not all — is refused rather than half-checked.

## Rooting is reported, not flattened

An organisation rule and a repository rule are both outside the pull request's tree, and they are
not equivalent: a repository admin can change the second. The report says which is in force rather
than accepting both as the same thing, and `--require-organisation-root` refuses the weaker one for
projects that want it.

## What M2 does not establish

- **Nothing about a repository that never adopted.** The remaining bypass, and the whole of M3.
- **Nothing about who approved anything.** GitHub has the primitives for human-attestation identity;
  none was needed here, and it deserves its own adversarial tests rather than a ride on these.
- **Nothing about bypass events.** `BYPASS_USED` is in the vocabulary with its semantic settled — a
  bypass is an event and never a verdict — and is unreachable because the data source cannot be
  assumed. Inventing one would be worse than the gap.
- **Nothing verified against a live GitHub organisation.** Every gate semantic is asserted against
  an injected platform; the adapter's two API shapes are written from the documented responses and
  have not been exercised against a real ruleset. That is the weakest link in this milestone and it
  is named rather than left for someone to discover.

33 tests, all passing.
