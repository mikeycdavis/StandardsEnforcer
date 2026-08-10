# 0004 — Scope is a recorded decision, not a detection

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner
- **Milestone:** M3. Makes `SCOPE_REVIEW_REQUIRED` reachable, adds `OUT_OF_SCOPE` and
  `SCOPE_REGISTRY_INVALID`, and gives `NOT_ADOPTED` a stronger meaning.

## Context

M2 established that a repository which has adopted a standards release cannot make its enforcement
disappear through an ordinary pull request. The remaining bypass was simpler and larger than
anything M2 addressed: never adopt at all. Nothing in the system had an opinion about a repository
that trains models and has no `project-policy.yml`, because nothing in the system had an opinion
about which repositories ought to be governed.

The obvious closure is an ML detector, and the obvious closure is wrong. Four independent adoptions
across MachineLearningStandards 1.0–1.4 were spent establishing that this class of detector is not
an oracle — most sharply in 1.2, where the framework had to stop awarding credit for evidence it had
not actually established. A detector promoted to a scope authority would make exactly that mistake
one level up, and it would make it in the direction that matters: a repository the detector missed
would be silently ungoverned, and nothing would say so.

The milestone is therefore about the state of the decision, not the accuracy of the detection:

> Every repository in the governed population has an explicit scope disposition, and the absence or
> staleness of that disposition is visible. Automated detection may require review; it cannot make
> the disposition.

**M3 does not succeed by detecting ML well.** It succeeds when uncertainty about scope is an explicit
governed state instead of a silent bypass.

## Decision

### Detection produces evidence; the registry produces dispositions

`footprint.mjs` observes ML-shaped evidence and emits signal kinds. It cannot return a disposition —
there is no code path from a detection result to `in-scope` or `out-of-scope`, and a test drives
every shape of detection result through an empty registry and asserts the outcome is always
`review-required`.

Detection is also one-directional, and this is the negative-evidence lesson from
MachineLearningStandards 1.2 applied to scope:

> Evidence found can contradict a recorded scope decision. Evidence not found can never confirm one.

A fresh disposition therefore carries a `standsOn` sentence naming the reviewer and the date, and
saying in words that detection did not confirm the decision — it only failed to contradict it, over
coverage it admits is partial. Silence that reads as confirmation is the failure this whole module is
arranged around.

### Authority lives outside the governed repository

A `machineLearningStandards: {scope: out-of-scope}` key in the target is a *request*. The registry is
external, and a registry located inside the tree it governs is refused outright with
`SCOPE_REGISTRY_INVALID` — the exact parallel to M2's "a gate is a required check, not a file in the
repository it gates".

    M2: the target cannot control whether its gate exists.
    M3: the target cannot control whether it is governed.

Entries are keyed by **immutable platform identity**, never by display name. `acme/moneyball` can be
renamed, transferred, deleted and recreated by somebody else; a decision that follows a name follows
whoever holds the name today. When the identity is absent but some entry carries a matching name,
that is reported as a collision requiring review rather than resolved as a match.

Authority also needs a named holder. The registry lists `authorisedReviewers`, and a disposition
recorded by anybody else is reported as a proposal, not a decision. That is the narrow trust source
M3 needs and no more — the general problem of human identity, CODEOWNERS and attestation stays
where ADR 0003 left it, out of scope and awaiting its own adversarial tests.

### An exclusion is a record of the same quality as an inclusion

`OUT_OF_SCOPE` requires a named authorised reviewer, a date, a reason and an evidence basis. Any of
them missing produces `SCOPE_REVIEW_REQUIRED`. An exclusion is a governance decision; an exclusion
with no reason is indistinguishable from an oversight, and the system must not be able to tell itself
otherwise.

Without a durable negative disposition, a portfolio scan has only two available behaviours: nag
about every excluded repository forever, or begin reading detector silence as proof that a repository
is not doing ML. The second is how the bypass returns.

### Staleness is a change in evidence, not the passage of time

A blanket 30- or 90-day expiry manufactures review churn without adding assurance, and churn is how
reviews become rubber stamps. What invalidates a decision is the repository acquiring or losing a
*kind* of ML evidence relative to the footprint recorded at review time. The digest is computed over
the sorted set of signal kinds and not over file contents, so ordinary commits to a repository whose
ML character has not changed do not trigger anything, while an excluded repository that gains
training code, or an included one whose training code disappears, both go to review.

A decision recording no evidence basis produces `SCOPE_REVIEW_REQUIRED`: a decision that cannot go
stale cannot be trusted to be fresh. An `expiresAt` a reviewer chose to set on their own decision is
honoured; none is imposed.

Partial coverage is reported next to the disposition rather than implied away. An ML mechanism the
detector does not recognise can still evade staleness detection, and the payload says so.

### Scope authority does not inherit enforcement authority

`authoritative` continues to mean exactly one thing — the enforcement root verified. A verified root
makes the check unavoidable; it does not make a partial detector more certain. Nothing in `scope.mjs`
reads the gate, and the two are reported as separate blocks.

### `NOT_ADOPTED` gains a stronger reading

Before M3, `NOT_ADOPTED` could only mean "no policy file here". With a confirmed in-scope
disposition it means something blockable: *the authoritative registry says this repository is
governed, and adoption is absent.* Both remain exit 4; they are reported differently, and the payload
carries `governed: true`, because they are different findings with different owners.

## Alternatives considered

**Let the detector decide, and let humans override.** Rejected. The default becomes the detector's
answer, overrides get made by whoever is annoyed rather than whoever is accountable, and a repository
the detector missed is silently ungoverned with nothing recording that a decision was never made.

**Let the target declare its own scope, subject to review.** Rejected. A declaration that takes
effect before review is an exemption with a review attached, and the review is the part that gets
skipped. A self-recorded disposition is accepted as evidence and reported as a proposal.

**Expire every decision on a timer.** Rejected; see above. Reviews that fire for no reason stop being
reviews.

**Key the registry on `owner/repo`.** Rejected. A rename, a transfer, or someone claiming a freed
name would silently inherit a decision made about a different repository.

**Fold `OUT_OF_SCOPE` into `COMPLIANT`.** Rejected, firmly. An exclusion would then read as though the
standards had examined the repository and been satisfied. It is the opposite: nothing was evaluated.

**Keep `PASSING` at two members and exit 4 on `OUT_OF_SCOPE`.** Rejected. Every legitimately excluded
repository would fail its required check forever, and a control that is always red for good reasons
gets routed around. The widening is bounded instead — see below.

## Consequences

`PASSING` grew from two members to three, the only widening in the enforcer's history. It is bounded
structurally rather than by intention: `REQUIRES_RECORDED_DECISION` names the passing states that are
not verdicts, `result()` demotes any such state to `SCOPE_REVIEW_REQUIRED` if the decision record is
incomplete, and a test asserts every member of `PASSING` is a verdict or a recorded decision. INV-E1
is untouched — an exclusion nobody recorded is an unknown, and unknowns still cannot reach the
passing set.

The M2 guard asserting the passing set fired on this change, correctly. It was relocked with the
enumeration kept exact and the bound added, not loosened.

`SCOPE_REVIEW_REQUIRED`, `OUT_OF_SCOPE` and `SCOPE_REGISTRY_INVALID` are reachable. `BYPASS_USED` is
now the only declared-unreachable state.

**Still outstanding, and not buried by this milestone:** nothing in StandardsEnforcer has been
exercised against a live GitHub organisation. The adapter's `integration_id`/`app_id` semantics are
written from documented responses. That was named as M2's weakest link and remains the prerequisite
for calling the system production-ready; M3 adds no live coverage and does not discharge it.
