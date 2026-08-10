# 0002 — The enforcement state model, and INV-E1

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

An enforcer can fail in ways a standards system cannot. The repository never adopted. The declared
version does not resolve. The gate that was supposed to run is absent from the pull request. None of
those is a compliance verdict, and none of them can be expressed in a vocabulary designed for one.

Forcing them into the standards system's exit codes would make *we could not establish anything*
indistinguishable from *the standards had no objection*. Every MachineLearningStandards release from
1.0 to 1.4 was spent removing instances of exactly that confusion: scaffolding accepted as evidence,
a detector's silence read as a pass, an unexamined rule scored, a widened rule invisible to the guard
that was supposed to see it.

## Decision

### The foundational invariant, from the first commit

> **INV-E1 — StandardsEnforcer must never convert an unknown, missing, unverifiable, or failed
> enforcement condition into a successful compliance result.**

Enforced structurally rather than by discipline. `PASSING` is a closed two-element set; `exitFor`
derives from it; an unrecognised state falls to a non-zero code rather than a default; and a test
walks every state in the vocabulary asserting that everything outside `PASSING` exits non-zero. A
state added later without a decision about its exit code fails that test instead of quietly becoming
a merge.

### Ten states, in two groups

**Standards verdicts**, passed through unaltered with the standards system's own exit codes:
`COMPLIANT` · `COMPLIANT_WITH_EXCEPTIONS` · `NON_COMPLIANT` · `NOT_EVALUATED` ·
`BLOCKED_BY_INVARIANT`.

**Enforcement states**, which no standards system produces: `NOT_ADOPTED` ·
`SCOPE_REVIEW_REQUIRED` · `GATE_MISSING` · `STANDARDS_IDENTITY_MISMATCH` · `ENFORCEMENT_ERROR`.

The four preconditions exit `4`, a code MachineLearningStandards never returns, so a caller reading
only a status can tell *the standards said no* from *enforcement could not be established*. They are
different problems with different owners.

### The vocabulary is complete; the implementation is not, and the gap is data

`SCOPE_REVIEW_REQUIRED` needs applicability detection and a scope registry. `GATE_MISSING` needs the
GitHub adapter. Neither exists, and neither is faked. `REACHABLE_IN_M1` records which states the
current implementation can produce, and a test asserts the unreachable set is exactly those two — so
the limitation is machine-checked rather than a comment somebody deletes.

### NOT_ADOPTED reports what was observed and no more

Absence of a policy file is observable. Whether a repository *ought* to have adopted is not: that
needs detection, and detection proposes rather than decides — the discipline
MachineLearningStandards applies to applicability, one layer out. `NOT_ADOPTED` therefore says the
repository is not governed. It does not say it should be. That claim belongs to
`SCOPE_REVIEW_REQUIRED`, after a human scope confirmation exists to authorise the transition.

A test asserts the detail line contains no *should* or *must*, because the temptation to editorialise
there is exactly how a proposal becomes a decision.

## Alternatives considered

**Fold `NOT_ADOPTED` into `NON_COMPLIANT`.** Rejected. They send an operator to different work —
adopt the standards, versus fix the project — and merging them would also make the un-adopted state
look like a normal compliance failure that a team could argue about.

**Let `NOT_ADOPTED` exit 0 until adoption is rolled out.** Rejected, and it is the exact shape of
INV-E1's prohibition. Not installing the standards would become the cheapest way past the gate,
which is the hole layer 9 of the design exists to close.

**Define a passing default and enumerate the failures.** Rejected. A default is how an unlisted
state becomes a pass; the closed `PASSING` set inverts the risk so that forgetting a state is safe.

## Consequences

Five exit codes rather than four. Callers that only check zero versus non-zero are unaffected;
callers that discriminate get a distinction they need.

Two states are currently unreachable, which means the enforcer cannot yet detect the two most
important bypasses: a repository that does ML and never adopted, and a pull request that removed its
own gate. **Until those exist, this system enforces an opt-in.** That is stated here rather than
implied, because an enforcer that overstates its reach is worse than none.
