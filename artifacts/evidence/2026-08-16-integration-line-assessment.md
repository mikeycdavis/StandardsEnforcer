# `reconciliation/m3-integration`, measured read-only — and the one live defect it found

**Date:** 2026-08-16
**Subject:** `reconciliation/m3-integration` at `db9007c` against `main` at `3eeb65b`
**Item imported as a result:** [FE-17](../backlog/items/FE-17.md)

Nothing was merged. No branch was moved, created or deleted during this measurement.

---

## Why this happened before ST-09

[FE-06](../backlog/items/FE-06.md) closed on 2026-08-16 and, in closing, removed the reason the
integration line had been held separate — *which line is authoritative* is settled. What it did not
answer is whether the non-authoritative line holds still-valid work the authoritative backlog does
not know exists. That is a different question, and leaving it unasked while starting the next local
defect would have been choosing convenience over the measurement.

## Topology

```text
integration ahead: 24    main ahead: 20    merge base: 7df5e69
```

A genuine divergence in both directions, not a stale branch.

## Classification

### Already superseded — 13 paths identical to `main`

`test-support/oracle.mjs` · `test-support/materialise-once.mjs` · `test/oracle-required.test.mjs` ·
`test/cache-concurrency.test.mjs` · `test/enforce.test.mjs` · `test/gate.test.mjs` ·
`scripts/identity.mjs` · ADRs 0003, 0004, 0006 · FE-15 · the FE-15 cache-concurrency evidence and its
six raw captures · the M3 reconciliation evidence.

FE-14 and FE-15 reached `main` by the other route. Nothing is owed here.

### `main` is ahead, on files the integration line also touched

`scripts/enforce.mjs` on the integration line has **no ADR 0005 link containment** — no
`realpathSync`, no two-half resolution, none of the entrypoint escape remedy. `scope.mjs` and
`footprint.mjs` differ in both directions at once.

> These are active seams where `main` has independently moved. A mechanical cherry-pick of any item
> touching them would silently revert the containment fix that PR #6's whole assurance argument rests
> on.

### Genuinely unrepresented — five closed items, two ADRs, seven modules, four test files

```text
FE-16  EP-01  A pack cannot be reported as passing when its process did not complete
FE-17  EP-04  The front door advertises a state model the code removed
FE-18  EP-03  The reviewed surface is the freshness authority, not the signal-kind set
FE-19  EP-03  The ratchet is total, and cells are keyed by identity rather than by spelling
FE-20  EP-03  The portfolio matrix reports every cell, including the ugly ones
```

with `scripts/{digest,gitfacts,glob,matrix,population,portfolio,ratchet}.mjs`,
`test/{exit-contradiction,portfolio-matrix,ratchet,review-surface}.test.mjs`, ADRs 0007 and 0008, and
the D3 and portfolio-matrix evidence.

**Only FE-17 was imported.** The other four are measured and unadjudicated. Their presence on a
non-authoritative line is enough to require individual review and is not enough to justify four
automatic imports — and each touches the seams above.

## The one thing that was presently false on `main`

FE-17. `README.md` on the authoritative branch documented five states `scripts/states.mjs` does not
define, mapped `ENFORCEMENT_ERROR` to exit `2` where `exitFor` returns `4`, and stated that the first
five were verdicts passed through with native exit codes unchanged.

Verified directly rather than inferred from the diff: `grep` over `states.mjs` returns `EVALUATED`
and none of the five.

This is the defect class the rest of this session has been closing — a surface asserting something
nothing checks — sitting on the front page rather than in a test. It is worse than the ones already
closed in one respect: the README is what a new reader or agent trusts *first*, and it was teaching
the verdict-interpretation ADR 0001 was written to forbid.

## A correction to a document `main` now carries

The composition-topology measurement imported by PR #7 states that all four candidate lines report
EP-01 identically. That is no longer true — `main` has EP-01 `COMPLETE`, the integration line has it
`IN_PROGRESS`.

**The measurement is not wrong and is not being amended.** It was taken at `10:30:58` on 2026-08-16;
PR #4 closed EP-01 on `main` at `11:03:50`, thirty-three minutes later. A timestamped topology
measurement is supposed to age. Its own text anticipated this, warning that agreement on EP-01 must
not be read as EP-01 being settled.

What must not happen is a current document presenting that row as present-tense truth. This file is
the qualifier; the historical measurement stands as taken.

FE-06 is a second divergent row, created by PR #7 itself and not pre-existing.

## Method

Read-only throughout. Every figure from `git ls-remote`, `git merge-base`, `git rev-list --count`,
`git ls-tree` and `git cat-file` against object SHAs — no checkout of the integration line, no
working-tree comparison, no fetch that could move a ref.
