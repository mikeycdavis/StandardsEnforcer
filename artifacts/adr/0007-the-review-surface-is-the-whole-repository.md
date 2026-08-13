# 0007 — The review surface is the whole tracked repository, minus reasoned exclusions

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Project owner
- **Milestone:** Phase 1, C-A + C-C. Defines what a scope determination was reviewed *against*, and
  what makes it stop being current. Written **before** `gitfacts.mjs`, `glob.mjs` and `digest.mjs`
  exist, so that the implementation is judged against this document rather than allowed to define the
  meaning of "reviewed surface" by accident.

## Context

[ADR 0004](0004-scope-is-a-recorded-decision.md) established that whether a standards pack governs a
repository is a decision a named human made, and that detection is evidence only. It left one thing
underspecified, and the gap is load-bearing: **a decision is recorded against something, and nothing
said what that something is.**

Today the only recorded basis is `reviewedFootprint` — the sorted set of *kinds* of ML evidence
[`footprint.mjs`](../../scripts/footprint.mjs) observed, digested. That was a deliberate choice with a
good reason behind it, stated in the source: digesting file contents would manufacture review churn
from ordinary commits, while a repository that gains or loses a whole kind of ML evidence has
genuinely changed.

**It is also insufficient, and the failure is one-directional in the dangerous direction.** A
repository can acquire a great deal of first-party prediction code without acquiring a new *kind* of
signal — a second, third and tenth model file where one already existed; a whole new inference path
in a repository already importing an inference client. The kind set is identical, the digest matches,
and a determination made when the repository was much smaller reads as current. C-A exists because of
exactly that case, and it is the falsifier this ADR must survive.

The threat this is really about is **under-declaration**, moved one level up from where ADR 0004 left
it. Not *"these standards do not apply"* asserted baldly, which ADR 0004 already refuses, but
*"PredictionStandards is not applicable — I reviewed `docs/**`"* while `src/prediction/**` was never
looked at.

## Decision

> **The reviewed surface is the whole tracked content of the repository, minus explicit, reasoned
> exclusions recorded in the determination itself.**

Narrowing is possible, and it is expensive on purpose: it requires an affirmative, committed,
reasoned exclusion that appears in every report and invalidates every attestation that referenced the
previous surface.

Two digests describe it, and either one changing returns the cell to `SCOPE_REVIEW_REQUIRED`:

```text
surfaceDigest    resolver semantics + exclusion configuration
                 — WHAT WAS AGREED TO BE LOOKED AT

contentDigest    the canonical tracked tuples falling inside that surface
                 — WHAT WAS ACTUALLY THERE
```

They are separate because they fail differently and a reader must be able to tell which happened.
A changed `surfaceDigest` means somebody altered the agreement about what counts as reviewed; a
changed `contentDigest` means the repository changed underneath an unaltered agreement. Collapsing
them into one value would make "the exclusions were widened" indistinguishable from "someone added a
file", and those have different owners and different remedies.

### The three dispositions

```text
current surface observable, digests equal        → current
current surface observable, digests differ       → stale
current surface NOT observable                   → undetermined

stale       → SCOPE_REVIEW_REQUIRED
undetermined→ SCOPE_REVIEW_REQUIRED
```

Both non-current dispositions resolve to the same enforcement state, and that is deliberate: from the
point of view of a merge, *"this review no longer describes the repository"* and *"whether it does
cannot be established"* are the same instruction — a human looks again. They are reported distinctly
because the **remedy** differs, and reporting them identically would hide a broken toolchain behind
what looks like ordinary drift.

**`undetermined` is not a new enforcement state.** It is an evidence disposition inside scope
resolution. `STATE` gains nothing, and the gap `REACHABLE` records stays exactly `["BYPASS_USED"]`.

### Exclusion semantics — the fork we took, and the hole it leaves

**Excluded paths are excluded from content churn.** A file added under an excluded glob does not
change `contentDigest` — it is filtered out — and does not change `surfaceDigest` — the glob is
unchanged. The determination stays current.

The alternative was a third digest over the whole tracked inventory *including* excluded files, so
that `vendor/foo.js` invalidates. **Rejected.** Generated and vendored trees change names constantly,
and a digest that goes stale for reasons the reviewer knows are meaningless trains the reviewer to
re-paste without looking. That degradation would reach **every** cell, not only the excluded regions.
A contained hole is better than a systemic one, and this is the same reasoning ADR 0004 used to
refuse a blanket expiry: a review that fires for no reason stops being a review.

**The hole, stated plainly: first-party code can grow inside an excluded tree and no content check
will see it.** Four bounds contain it, none of which reintroduce churn:

1. **Discovery scans the whole repository, including excluded paths.** A signal landing outside the
   reviewed surface returns the cell to `SCOPE_REVIEW_REQUIRED` regardless of a recorded
   determination. This is discovery's one privilege and the primary bound.
2. **Exclusions expire with the determination.** They are fields of it, not of the registry.
3. **Every run reports each exclusion with its current match count beside the count at review time** —
   `vendor/** — 1,204 files (3 when reviewed)`. Growth is visible even where it is not invalidating,
   which is the information a human acts on.
4. **Exclusions are ratchet fields.** Adding or widening one requires a baseline edit in the same
   commit. *(The ratchet is a later slice; this records the requirement, not its implementation.)*

Bound 1 inherits discovery's false negatives, which are unbounded. So the honest claim is: **an
excluded tree is watched for signals and for size, and is not watched for content.**

Both branches are mutation-tested. Adding a file under an exclusion must **not** invalidate; adding a
file under an exclusion **that matches a signal** must invalidate.

### `reviewedFootprint` keeps its job and loses its authority

It stays, and it stays useful: it is what tells a reviewer *what kind of thing* is here, and a change
in kinds remains a real reason to look again. What it stops being is the **freshness authority**.

```text
reviewedFootprint   discovery evidence   — may contradict a decision, never confirms one
reviewedSurface     freshness authority  — decides current / stale / undetermined
```

The asymmetry from ADR 0004 is unchanged and now has a second application: **evidence found can
contradict a recorded decision; evidence not found can never confirm one.** A matching footprint is
not a reason to skip the content comparison, and this ADR makes that structural rather than advisory.

### `RESOLVER_VERSION`

`surfaceDigest` covers it. A change to what "reviewed repository state" means therefore invalidates
every prior attestation, **intentionally**, and no migration path suppresses it. If v2 computes a
different surface from the same repository, then every review conducted under v1 was conducted
against a different question.

**No back-filled historical digests.** A digest computed today and written into a determination dated
last month asserts that somebody looked at this content then. Nobody did. An attestation without a
digest computed at review time is `undetermined` and goes back to a human — which is the correct cost
of not having had the mechanism yet.

## The two shortcuts that stay forbidden

These are not observations. They are the two ways this mechanism gets quietly undone, and both are
tempting because both make work disappear.

> ### 1. Do not define the review surface from discovery signals.
>
> Letting discovery propose the surface and digesting that is the obvious efficiency, and it fails
> because **discovery's false negatives are unbounded.** The portfolio survey found a genuine outcome
> simulator with *zero* `forecast`/`odds`/`expectedValue` tokens, and a location-fit scoring model
> whose top prediction token is `chance`×8. A surface defined by signals inherits every blind spot of
> the signals — and the blind spots are precisely where under-declaration hides. The surface is
> defined by the repository; discovery only ever adds reasons to look again.

> ### 2. Do not treat an uncomputable current digest as matching a recorded digest.
>
> The packs get this wrong today, in a way that is worth naming because it is what the code will
> reach for on its own. Both `EngineeringStandards/scripts/compliance.mjs` and
> `PredictionStandards/scripts/compliance.mjs` read `if (current && current !== against.digest)`, so
> an uncomputable digest is falsy and **"I could not compute it" reads as "it matches"**. In
> PredictionStandards no caller ever passes `digests`, so every staleness check there is currently a
> no-op that reports fresh.
>
> This enforcer inverts it: `if (!current || current !== recorded) → not current`. Recorded as a
> deliberate divergence. **This ADR does not reach into the packs to fix theirs** — that is their
> defect, on their release cycle.

Both are INV-E1 in this domain: an unknown surface and an unknown content state are unknowns, and an
unknown is not a pass.

## Consequences

**Accepted, and intended:**

- **Adding a tracked file anywhere in the reviewed surface returns the cell to
  `SCOPE_REVIEW_REQUIRED`.** That churn is the mechanism, not a cost to engineer away. It is also
  what makes a bulk `not-applicable` afternoon *temporary* rather than permanent.
- A `RESOLVER_VERSION` bump invalidates everything at once, by design.
- Reviewing nothing is not attestable: an empty or non-reproducible surface refuses to emit a
  determination block rather than emitting one over zero files.

**Accepted, and not liked:**

- The excluded-tree content hole above.
- **Separation of duties still does not exist.** Reviewer, reviewee and the person who can delete the
  registry are one person. This raises the cost of the lazy path; it does not close the deliberate
  one. It is a memory and an alarm clock for someone who wants to be governed, not a control over
  someone who does not. Unchanged from ADR 0004, and restated because a mechanism this elaborate
  invites the assumption that it is a control.

**Out of scope for this ADR, deliberately:** the total ratchet and the portfolio matrix. This
establishes what **one trustworthy cell** means. Making that model total across ~400 cells is the
next slice, and doing it in the same pass would mean enumerating cells before knowing what a cell
asserts.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Digest the working tree, not the git index | Machine-dependent: CRLF, `utf8` mangling of binaries, and a directory in a path list digesting to a constant forever. The family's only existing digest does this, and PredictionStandards' own committed policy names a directory in `reviewedAgainst.paths` |
| Let discovery propose the surface | Shortcut 1 above |
| Keep `reviewedFootprint` as the freshness authority | The C-A falsifier: identical kinds, materially changed content, determination reads current |
| One combined digest | "The agreement changed" and "the repository changed" become indistinguishable |
| A time-based expiry instead of digests | ADR 0004 refused it: a review that fires for no reason stops being a review |
| A third digest including excluded files | Systemic churn to close a contained hole |
