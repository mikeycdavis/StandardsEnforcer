# FE-15 reproduced against the post-FE-13 cache — the defect changed

**Date:** 2026-08-12 · **Branch:** `reconciliation/m3-integration` @ `4cf1a13`
**Against:** the cache implementation introduced by `31fb5ec` (0.4.1) and integrated at `c3cb08e`
**Status:** reproduction only. No remedy designed, and deliberately none chosen.

FE-15 was written against a mechanism that no longer exists. This record re-runs its paired proof
against the current implementation and states what survives, because evidence produced against
deleted code is not evidence.

## The headline

**The security property held. Operational isolation did not.**

> Cross-process use of the same shared cache root can cause one verified run to invalidate another
> run's entry mid-use, producing a **false negative** rather than false assurance.

That is a different claim from the one FE-15 was opened with, and it changes the design target.

## What was run

Node v24.15.0, Windows. `ENFORCER_REQUIRE_ORACLE=1`,
`ENFORCER_ORACLE_REPO=F:/Repos/MachineLearningStandards`. Oracle available, so no test was gated out.

### 1 · Ordinary parallel runs — now deterministic

Three consecutive `npm test` invocations, one at a time:

```text
run 1   185 tests   184 pass   0 fail   1 skipped
run 2   185 tests   184 pass   0 fail   1 skipped
run 3   185 tests   184 pass   0 fail   1 skipped
```

`node --test` runs files in parallel, so this is the exact condition that previously produced 12
failures on one run and 4 on the next. **It no longer reproduces.** The skip is ADR 0005 case 7b.

### 2 · Two concurrent suite processes — reproduces

Two `npm test` processes started together against the same shared cache roots:

```text
A   185 tests   184 pass   0 fail   1 skipped
B   185 tests   183 pass   1 fail   1 skipped
```

```text
test/adapter-provenance.test.mjs:113
✖ 1 · a forged adapter in the target, declaring failure to be passing, is ignored
    actual   'STANDARDS_IDENTITY_MISMATCH'
    expected 'EVALUATED'
```

Raw output: [`concurrent-run-A.txt`](2026-08-12-fe15-cache-concurrency-raw/concurrent-run-A.txt),
[`concurrent-run-B.txt`](2026-08-12-fe15-cache-concurrency-raw/concurrent-run-B.txt).

## What the failure means, precisely

One process's repair discarded and rebuilt a cache entry the other was about to consume. The second
process re-verified, found the entry no longer established *(repository, tag, SHA)*, and **refused**.

```text
before FE-13   ENOTEMPTY faults, and one file observing another's cache contents
               → a failure mode that could mask or fabricate a result

after FE-13    STANDARDS_IDENTITY_MISMATCH
               → a refusal to execute bytes whose identity is not established
```

**No corrupted or unverified content was executed.** The identity boundary did its job under a
condition nobody designed for. `31fb5ec` did not move the race elsewhere; it converted the dangerous
outcome into a safe one.

## What this is now, and what it is not

**It is not a false-assurance defect.** Calling it one would be inaccurate, and would push the remedy
toward hardening a boundary that already held.

**It is a concurrency and isolation defect producing false negatives and flaky enforcement.** The
secondary risk is governance rather than technical: repeated unexplained failures train operators to
re-run or ignore them, and an enforcement gate that is routinely re-run is a gate that is routinely
argued with. That is the same degradation ADR 0004 identified when it refused a blanket expiry —
churn is how reviews become rubber stamps.

## What FE-13 solved, and what it deliberately did not

`31fb5ec` stages repair to `.staging-<sha>-<pid>` and renames, with the reason stated in the source:
*"staging is per-process, so two runs repairing the same identity cannot collide mid-clone."* That
addresses collision **during** repair.

It says in its own record what it did not close: **concurrent repair has no cross-process lock.**
This reproduction is that gap, observed. It is an inherited limitation, not a regression, and not a
defect introduced by the integration.

## Constraint the remedy must respect

`test/adapter-provenance.test.mjs` case 9 — *two identities never share a materialisation, so one
cannot serve the other* — is **about** a shared cache. Giving every test a private root would delete
the condition that case exists to exercise. "Make every test use a private cache" is therefore not
automatically acceptable, and any remedy must keep at least one deliberately shared root with the
sharing scoped to the tests that are about sharing.

## The superseded reproduction

FE-15's original symptom list — non-deterministic `ENOTEMPTY` on cleanup, and cache-listing
assertions observing another file's entries, 12 failures then 4 — is **superseded, not deleted**. It
was accurate against the pre-`31fb5ec` implementation and is preserved in the item's history so the
change in failure mode remains visible. It must not be cited as current evidence.

## The falsifier — written after ADR 0006, observed red before any remedy

`test/cache-concurrency.test.mjs`. Three arms, run three consecutive times, **identical every time**:

```text
✖ arm 1   two processes, same identity, shared root      RED   3/3
✔ arm 2   a tampered verified entry is not trusted       green 3/3
✔ arm 2b  a real checkout of a different commit          green 3/3
✔ arm 3   two different identities materialise together  green 3/3
```

Raw: [`falsifier-red-before.txt`](2026-08-12-fe15-cache-concurrency-raw/falsifier-red-before.txt).

**One red property and three negative controls, deliberately.** Arms 2, 2b and 3 pin guarantees the
product *already* has, so the remedy cannot buy determinism by giving them up. Forcing them red would
have meant damaging the code to manufacture a failure, and a falsifier that damages what it measures
is measuring itself.

### What Arm 1 actually shows, and it is worse than expected

Both processes fail. Not one losing to a winner — **both**:

```text
the verified checkout could not be published: EPERM, Permission denied:
  <cacheRoot>/2570997e…
the verified checkout could not be published: EPERM: operation not permitted,
  rename '<cacheRoot>/.staging-2570997e…-34556' -> '<cacheRoot>/2570997e…'
```

Each process cloned, checked out, and **verified its own staging tree successfully**. Both then tried
to publish into the same destination, and on Windows a directory cannot be removed or renamed over
while another process holds a handle inside it. So one failed removing the destination and the other
failed renaming onto it.

Two observations that matter for the remedy:

1. **The failure is at publication, not at verification.** Per-process staging did exactly what
   FE-13 built it for — neither process deleted a tree the other was executing from, and neither
   served unverified bytes. The unprotected step is the swap.
2. **Nothing was thrown.** Both returned `ok: false` with a reason, because FE-13 wrapped the
   filesystem mutations. The contract's "two outcomes only" held under a condition it was not
   designed for.

This is the FE-13 residual, reproduced exactly as it was described: *"two runs can still repair the
same identity concurrently… the window is narrowed rather than closed."*

### A timing seam was required; a verification seam was not

Arms 2, 2b and 3 needed no new surface at all — tamper after materialisation, re-enter through the
ordinary path. Arm 1 needed two genuinely separate processes entering `materialise()` at the same
instant, which cannot be staged from inside one.

`test-support/materialise-once.mjs` is that seam and nothing more: it spins to a shared wall-clock
barrier, then calls the ordinary exported `materialise()` with ordinary arguments and prints whatever
it returns. **It does not stub, wrap, weaken or bypass anything on the identity path.** A helper that
could make verification pass would invalidate every arm it appears in.

It lives in `test-support/` rather than `test/`, so `node --test` does not collect it — the same
reason the oracle resolver moved there.

## The remedy — publication is coordinated, nothing else is

`15827f9` is the **pre-remedy state**, and is worth keeping addressable: one contract property
failing while three negative controls hold. The next commit points back at it.

The falsifier said where the race was, and the fix is scoped to exactly that:

```text
clone / checkout / verify staging tree      concurrent, untouched
        ↓
acquire per-identity publish lock
        ↓
re-check the destination                    verification, not lock-ownership inference
        ↓
publish, or accept an entry that already verifies
        ↓
release
```

**The re-check is the part that earns the lock.** A process may spend a second cloning and verifying
while another publishes a perfectly good entry for the same identity. Under the lock it looks again;
if what it finds satisfies `checkoutIsExactly`, it discards its own staging tree and uses the
published entry rather than needlessly replacing a directory someone may be executing from. Holding
the lock is why it is safe to *look* now — `checkoutIsExactly` remains the only thing that decides
whether what was found may be used.

A directory is the lock, because `mkdir` is atomic. A holder that dies leaves it behind, so a lock
older than `staleMs` is reclaimable — safe **because** reclaiming grants nothing: the reclaiming
process still verifies before using, so a wrongly-reclaimed lock costs redundant work and cannot
produce a wrong result. Waiting is bounded; a timeout returns a retryable failure and never
permission to proceed.

### Result

```text
✔ arm 1   two processes, same identity, shared root      green 5/5   (was RED 3/3)
✔ arm 2   a tampered verified entry is not trusted       green 5/5
✔ arm 2b  a real checkout of a different commit          green 5/5
✔ arm 3   two different identities materialise together  green 5/5
```

Arm 3 staying green is the load-bearing one: unrelated releases still overlap in time, so the fix did
not buy determinism by serialising the cache.

```text
full suite, serial      189 tests · 188 pass · 0 fail · 1 skipped
full suite, parallel    188 pass · 0 fail, twice
two concurrent suites   A: 188 pass · 0 fail    B: 188 pass · 0 fail
```

The last line is the original FE-15 symptom — the run that produced
`STANDARDS_IDENTITY_MISMATCH` — now clean. Raw:
[`falsifier-green-after.txt`](2026-08-12-fe15-cache-concurrency-raw/falsifier-green-after.txt),
[`concurrent-suites-after-A.txt`](2026-08-12-fe15-cache-concurrency-raw/concurrent-suites-after-A.txt),
[`concurrent-suites-after-B.txt`](2026-08-12-fe15-cache-concurrency-raw/concurrent-suites-after-B.txt).

The one skip is still ADR 0005 case 7b, symlink escape on `EPERM`. **Not** "all identity tests pass".

### Not closed by this

- Verification is at materialisation, not continuous. A tree altered between the check and the
  evaluator's read is still not caught; that needs the evaluator to run against a tree nothing else
  can write to.
- The completion marker is still written through `spawnSync(node -e …)`, whose failure mode is a
  silently absent marker. `writeFileSync` would make it throwable. Untouched here because it is not
  this defect, and folding it in would put an unrelated change under this evidence.
- The lock is process-local coordination on one filesystem. Nothing here addresses a cache root
  shared over a network filesystem, where `mkdir` atomicity is not guaranteed.

## The question this does not answer

The remedy depends on something this reproduction cannot establish:

> **Is a cache root intended to be shared safely across independent StandardsEnforcer processes?**

If yes, the product needs cross-process coordination and the tests should prove it. If no, the root
should derive from an isolation boundary — worktree, run, or session identity — and the
deliberately-shared cases should opt into a dedicated shared root.

That is a question about the product's concurrency model, answerable from the cache contract, the
ADRs and the actual invocation model, and it is **not** answerable from "how do we make the tests
stop colliding". It is deliberately left open here.
