# A pack cannot pass when its process did not complete — D3 / FE-16

**Date:** 2026-08-13 · **Branch:** `reconciliation/m3-integration`
**Red before:** `670d617` · **Remedy:** this commit
**Item:** [FE-16](../backlog/items/FE-16.md) · **Plan:** §0.3 of the
[reconciled plan](../plan/2026-08-12-m3-reconciled-plan.md)

The last of the three Phase 0 defects. `enforce.mjs` derived its entire verdict opinion from the
pack's declared status and carried `run.exitCode` into the payload without ever consulting it, so a
pack could declare itself passing, fail to complete, and be reported as `EVALUATED` / `passing: true`
with the enforcer exiting `0`.

## The claim, and the much larger one it is not

> **A pack cannot be reported as passing when its process did not successfully complete.**

Nothing here asks what a native exit code *means*, and nothing may start to. There is nothing to ask:
Betting exits `2` on `NOT_EVALUATED`, MachineLearning `3` on blocked, Health `4`, Financial folds
blocked into `1`. A **non-passing** status with exit `2`, `4`, `17` or anything else stays entirely
the pack's business. What is noticed is one impossible combination — *"this passed"* alongside *"the
process did not complete successfully"* — which is authority evidence contradicting itself, and
INV-E1 says an unknown is not a pass.

This is the **C-D residue** the reconciliation adjudicated, deliberately much narrower than the
superseded plan's general D3, which was rejected on evidence.

## Result

Five arms, five consecutive runs, identical every time:

```text
before 670d617                            after
✔ 1  declared passing  + exit 0           ✔ 1   green 5/5
✔ 2  declared failing  + nonzero          ✔ 2   green 5/5
✖ 3  declared passing  + nonzero   RED    ✔ 3   green 5/5
✔ 4  undeclared status + nonzero          ✔ 4   green 5/5
✖ 5  declared passing  + no exit   RED    ✔ 5   green 5/5
```

```text
full suite, parallel   194 tests · 193 pass · 0 fail · 1 skipped
full suite, serial     194 tests · 193 pass · 0 fail · 1 skipped
```

193 is 191 plus exactly the two arms that were red. Nothing else moved. The one skip remains ADR 0005
case 7b, symlink escape on `EPERM` — **not** "everything passes".

## The controls have teeth — both mutations verified

Assertions that only ever pass prove nothing, so both controls were checked by constructing the
implementation they exist to reject: an exit-code check ordered ahead of the vocabulary check.

```text
mutation: `if (run.exitCode !== 0) → ENFORCEMENT_ERROR`, placed before the status check

✔ 1   unaffected
✖ 2   RED — a pack declaring failure and exiting nonzero became an enforcement fault
✔ 3   green, for the wrong reason
✖ 4   RED — the undeclared status was no longer named
✔ 5   green, for the wrong reason
```

**Case 2 catches the exit-code interpreter.** A pack saying no and exiting nonzero is the commonest
real outcome in the portfolio, and turning it into an enforcement error is exactly the reading D3 was
rejected for once already.

**Case 4 catches the ordering.** The pack's native vocabulary must keep first say over its own
result: `passing` is not computable from a status the contract never declared, so *"the status
contradicts the exit code"* is not a statement that run is in a position to make.

Worth stating precisely, because the weaker claim is the tempting one: case 4 does **not** bite
against the shipped implementation if the block were merely moved, because that block is guarded by
`if (passing)` and `passing` is `false` for an undeclared status. It bites against the *naive*
implementation — an independent exit-code check — which is the wrong design it exists to prevent.

## Shape of the remedy

```text
1. validate the native status is declared by the pack's contract      ← unchanged, still first
2. derive whether that declared status is passing                     ← unchanged
3. if passing:
     a. exitCode === null  → ENFORCEMENT_ERROR, completion not established
     b. exitCode !== 0     → ENFORCEMENT_ERROR, status contradicts the process result
4. otherwise               → existing non-passing handling, untouched
```

`null` and nonzero are kept apart although `!== 0` catches both and would be the smaller diff. They
are different findings — one is evidence that contradicts itself, the other is evidence that never
arrived — and the details differ so a reader can tell which occurred without re-running anything. The
code communicates the authority model rather than merely producing the correct boolean.

Case 3's fixture exits **7**, so nothing can depend on which nonzero code it was. `exitCodes` was not
added to the adapter contract, and no enforcer source names a native exit-code meaning.

## Platform-pending — stated rather than implied

**Case 5's `null`-specific reason has never executed.**

Windows has no signals: `process.kill` becomes `TerminateProcess`, which supplies an exit code, so a
killed evaluator arrives here as case 3 and `run.exitCode` is never `null`. Probed against the same
construct the fixture uses, not inferred from `process.platform`, and the probe fails loudly if the
fixture rather than the platform is at fault.

```text
asserted on every platform      a killed evaluator must never produce a passing result   ✔ proven
asserted only where null occurs the two reasons are distinguishable in the detail        ⧗ pending
```

The `null` branch of the remedy is therefore **specified, implemented and tested, but not yet
executed**. CI runs on `ubuntu-latest`, where `status === null` is producible and the arm runs for
real. Until that run happens this is a claim with a test behind it and no observation behind the
test.

No null status was faked locally to make the branch appear exercised. That would have turned a
platform-pending arm into a green one that proves nothing — the same false-assurance shape as
[FE-14](../backlog/items/FE-14.md)'s skipped oracle, which is the defect this repository opened its
Phase 0 with.

## What Phase 0 is now

**All locally actionable Phase 0 defects are complete. Phase 0 is not closed.**

| | | |
|---|---|---|
| D1 | [FE-14](../backlog/items/FE-14.md) | `IN_PROGRESS` — **externally blocked** on unpublished MachineLearningStandards `v1.4.0`/`v1.5.0` |
| D2 | [FE-13](../backlog/items/FE-13.md) | `COMPLETE` — plus [FE-15](../backlog/items/FE-15.md), the concurrency residual it named |
| D3 | [FE-16](../backlog/items/FE-16.md) | `COMPLETE`, with the platform-pending arm above |

Both halves of that sentence matter. An upstream dependency must not make the local work look
unfinished, and local completion must not be dressed up as full closure.

## Not closed by this

- The `null` reason distinction, above — pending first Linux CI execution.
- A pack that exits `0` while its report is internally inconsistent is not addressed. The enforcer
  reads one field of the report and the process outcome; it does not audit a pack's self-consistency,
  and ADR 0001 says it must not.
- §0.2's `writeFileSync` criterion remains struck rather than met — the marker still writes through
  `spawnSync(node -e …)`. Recorded at `670d617` with its rationale; not a correctness property since
  FE-13.
