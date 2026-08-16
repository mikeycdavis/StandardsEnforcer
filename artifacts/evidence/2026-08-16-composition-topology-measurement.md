# Composition topology, measured — the claims conflict has collapsed into absence

**Date:** 2026-08-16 · **Branch:** `reconciliation/m3-corrected` · **Read-only**

**This record is observational.** It states what was measured and one narrow conclusion that follows
from the measurement. It proposes no order of work, authorises no branch movement, and adjudicates
nothing. It exists because the measurement changes the premise of
[FE-06](../backlog/items/FE-06.md), and the pre-move shape is harder to reconstruct after topology
moves than before.

**No fetch was performed.** Remote state was read with `git ls-remote`, which reports the remote's
refs without mutating remote-tracking refs. Local remote-tracking refs were therefore not consulted
and are not relied on anywhere below. Everything here is evidence about 2026-08-16 and nothing
later; any act that depends on it must re-measure first.

## Worktrees

One repository, five worktrees, five branches. The isolation is structural rather than procedural,
which is why no two of these were written to concurrently.

```text
F:/Repos/StandardsEnforcer              b61841f   m3-scope-registry
F:/Repos/StandardsEnforcer-enforcement  fa0fca8   enforcement
F:/Repos/StandardsEnforcer-integration  db9007c   reconciliation/m3-integration
F:/Repos/StandardsEnforcer-localci      8fba047   feature/local-docker-ci
F:/Repos/StandardsEnforcer-reconcile    ae05c99   reconciliation/m3-corrected
```

All five worktrees were clean at the time of measurement. `main` is checked out in none of them.

## Local topology, relative to `main` at `634f0ec`

```text
branch                          tip       ahead  behind  relationship
reconciliation/m3-corrected     ae05c99      1       0    strict descendant
feature/local-docker-ci         8fba047      7       0    strict descendant
m3-scope-registry               b61841f      0       2    strict ancestor
reconciliation/m3-integration   db9007c     24       4    diverged
enforcement                     fa0fca8      5      17    diverged
```

The single commit by which `reconciliation/m3-corrected` exceeds `main` is `ae05c99`, FE-06's
decision-2 record. **`main` does not currently carry the record of its own most recent authority
transition.**

## Remote, read without fetching

```text
refs/heads/main                     634f0ec   equals local main
refs/heads/feature/local-docker-ci  8fba047   equals local feature/local-docker-ci
refs/heads/m3-scope-registry        e96d90c   16 behind main
```

Two observations follow, both of which contradict statements in FE-06's decision-2 record that were
true when written:

**The remote no longer carries exactly two branches.** It carries three. `feature/local-docker-ci`
has been published since 2026-08-13 and matches its local tip exactly.

**The published `m3-scope-registry` is materially staler than recorded.** FE-06 describes that name
as "still live, still published, and now two commits behind the authority." That is true of the
*local* ref. The *published* ref is `e96d90c`, which is 14 commits behind the local
`m3-scope-registry` tip and 16 behind `main`. `e96d90c` is a strict ancestor of every line except
`enforcement`, so nothing has diverged — the published name is stale, not conflicted. It remains the
only artifact in this measurement with an outside reader.

## Combined-claims audit

Every backlog item on each of the four candidate lines was read at that line's tip and its `status`
compared. `enforcement` carries no backlog and is excluded from the comparison for that reason, not
as a judgement.

```text
34   distinct item ids across the four lines
25   identical on every line that has them, with no line missing them
 9   rows differing in some way
 0   rows on which two lines assert different statuses for the same item
```

The nine:

```text
ID      m3-scope-registry   m3-corrected   m3-integration   local-docker-ci
EP-06   —                   IN_PROGRESS    —                IN_PROGRESS
FE-06   NOT_STARTED         IN_PROGRESS    NOT_STARTED      IN_PROGRESS
FE-14   —                   IN_PROGRESS    IN_PROGRESS      IN_PROGRESS
FE-15   —                   COMPLETE       COMPLETE         COMPLETE
FE-16   —                   —              COMPLETE         —
FE-17   —                   —              COMPLETE         —
FE-18   —                   —              COMPLETE         —
FE-19   —                   —              COMPLETE         —
FE-20   —                   —              COMPLETE         —
```

**Every one of the nine differences is an absence, not a contradiction.** Where a line holds an
item, it agrees with every other line that holds it. FE-06's row is the one apparent exception and
is not one: `NOT_STARTED` on the two lines that predate the decision, `IN_PROGRESS` on the two that
carry it, which is the same claim at two points in time rather than two claims.

`EP-01` does not appear in the table. It was the substance of the conflict FE-06 was written to
adjudicate — one line holding the parent closed, another holding it open over children carrying
real evidence — and **all four lines now report it identically.**

### One within-line inconsistency, which the cross-line agreement does not resolve

`EP-01` reporting identically on all four lines means the lines agree. It does not mean the claim
they agree on is coherent. Validation on the authoritative line reports, and this record preserves
rather than corrects:

```text
EP-01  IN_PROGRESS  over FE-01, FE-02, FE-13, FE-15 — all COMPLETE
```

A parent open over children that have all closed. This is the same shape as the conflict FE-06
adjudicated and is **not** that conflict: it is one line's internal state, not two lines
disagreeing, and it is present identically everywhere rather than being introduced by any merge.
FE-06 already records EP-01 as independently actionable. It is left exactly as found here, because
correcting it is an act on the backlog and this record is a measurement.

Noted so that "all four lines report EP-01 identically" is not read as "EP-01 is settled." The
open children the earlier conflict turned on have since closed; what remains is the parent.

The backlog is otherwise valid at 29 items, the tracker is current, and the test suite passes:
189 tests, 0 failures, 18 skipped for want of a configured oracle (`ENFORCER_ORACLE_REPO`), which
is the documented skip condition rather than a silent gap.

## `enforcement` remains the sole holder of the M5 evidence

Re-measured today, unchanged from the 2026-08-13 measurement:

```text
artifacts/evidence/2026-08-10-m5-dormant.md    enforcement only
artifacts/evidence/2026-08-10-m5-protocol.md   enforcement only
WORKTREES.md                                   enforcement only
```

These three paths exist on no other line. Nothing in this measurement incorporates, adjudicates, or
disturbs them, and nothing here should be read as establishing that M5 never existed or was
abandoned. Whether rescuing that evidence is required repository work remains a separate decision,
not taken here and not converted into a backlog item by the fact of the observation.

## Conclusion

Narrow, and the only one drawn:

> **The combined-claims conflict FE-06 existed to adjudicate is gone. What remains is unincorporated
> work, not contradictory work.**

FE-06's durable requirement was that the lines disagreed about a backlog claim rather than merely
differing in commits, and that a merge in either direction would therefore produce a backlog that
fails validation and let branch movement decide a question nobody decided. Measured today, that
premise no longer holds: no two lines assert conflicting statuses, so no merge direction can settle
a disputed claim by arriving second.

What the measurement does **not** establish, stated so the conclusion is not read as wider than it
is:

- It does not say the remaining incorporation is easy or small. `reconciliation/m3-integration` is
  24 commits ahead of the authoritative line and holds five items that exist nowhere else; those
  need their own measurement and adjudication, and this record performs neither.
- It does not decide any branch's disposition, including the published `m3-scope-registry`.
- It does not compare content beyond backlog `status`. Two lines agreeing that an item is
  `COMPLETE` is not evidence that they agree about anything else in it.
- It does not touch `enforcement`, and it takes no position on the M5 evidence rescue.
