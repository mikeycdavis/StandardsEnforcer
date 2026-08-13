# 0006 — The checkout cache is shared, and coordination is not authority

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Project owner
- **Milestone:** FE-15. Defines the concurrency contract for `<cacheRoot>/<sha>` and makes the
  cross-process lock FE-13 deferred into a requirement with a stated boundary.

## Context

`materialise()` clones a standards release into a cache root that is **machine-wide by default** —
`<tmpdir>/standards-enforcer-cache` — and `--cache=<path>` exists so a caller may opt out. Entries are
content-addressed by commit SHA: a cache entry cannot go stale, because its name is what it contains.
Nothing about this is per-worktree, per-run or per-session, and `--cache` being the *override* means
sharing is the deliberate default rather than an accident.

**Concurrent processes sharing that root are therefore part of the supported operating model**, not a
misuse of it. Two CI jobs on one runner, a workstation beside a runner, two sessions, two worktrees —
all of these are ordinary.

FE-13 established that a cache hit must be re-verified against the identity before use, and found a
real entry on this machine that was five files short and had been executing. In fixing it, the
first attempt deleted rejected entries in place, which **raced with concurrent runs sharing a cache
root**: `rmSync` threw `ENOTEMPTY` out of `materialise`, and files with nothing to do with the change
went intermittently red. That was replaced with per-process staging and rename, and the residual was
recorded rather than papered over:

> There is no cross-process lock. Two runs can still repair the same identity concurrently… the
> window is narrowed rather than closed. Closing it needs a lock file, which nothing has yet forced.

FE-15 forced it. Two concurrent suite processes against the same shared root, on
[2026-08-12](../evidence/2026-08-12-fe15-cache-concurrency.md): one process's repair invalidated an
entry the other was about to consume, and the second **refused** —
`STANDARDS_IDENTITY_MISMATCH` where `EVALUATED` was expected.

**The security property held.** No unverified bytes executed. What failed is determinism: a correct
refusal, produced by a condition nobody intended, is a false negative. And a gate that fails for
reasons operators learn to re-run is a gate that is routinely argued with — the same degradation
[ADR 0004](0004-scope-is-a-recorded-decision.md) named when it refused a blanket expiry.

So this decision is about correctness under concurrency, and explicitly **not** about strengthening
the identity boundary, which is the part that worked.

## Decision

### The contract

1. **Shared cache roots are supported across concurrent StandardsEnforcer processes.** The default
   root is shared, and the contract below applies to it. A caller wanting isolation asks for it with
   `--cache=<path>`; nothing else may assume privacy.
2. **Cache entries are content-addressed by release identity.** The name of an entry is a claim about
   its contents, and that claim is checked rather than trusted.
3. **No process may execute bytes it has not re-verified against the requested identity** — repository
   present, `HEAD` is the commit, working tree clean. This holds on every execution including cache
   hits, and is not weakened by anything in this ADR.
4. **Repair and materialisation must be coordinated**, so that one process cannot invalidate another
   process's usable entry mid-operation.
5. **Acquiring a lock does not establish identity or freshness.** *(Normative.)*
6. **Re-verification remains mandatory after coordination.** A process that has acquired the lock
   re-verifies exactly as one that has not.
7. **Lock failure or staleness fails toward uncertainty** — a retryable enforcement failure — **never
   toward trust.**

### Rule 5 is normative because the obvious optimisation is the original defect

The tempting future change is one line:

```text
lock acquired  →  assume the entry is valid
```

That is `.enforcer-complete` again, one layer out. FE-13's whole finding was that **a marker
recording that an artifact was verified in the past cannot substitute for evidence that the artifact
about to be consumed is still that artifact.** A lock records that nobody else is currently repairing
the entry. It records nothing whatever about what the entry contains — a tree corrupted before the
lock existed is corrupted while it is held.

The distinction, stated so it cannot be blurred: **coordination decides who may write; verification
decides what may run.** Neither answers the other's question.

### Lock granularity: per release identity, never global

The unit that races is the materialisation of one `(repository, tag, SHA)`, so that is the unit that
is coordinated — a lock beside the entry, keyed by the same SHA.

A single global cache lock is rejected. It would serialise materialisation of **unrelated** releases,
turning an integrity fix into avoidable contention, and it would make a portfolio run over eight
packs strictly sequential in its slowest phase for no correctness gain. Two different SHAs have
nothing to say to each other: they are different directories with different names, and neither can
invalidate the other.

### Waiting is bounded, and a timeout is not a pass

A process that cannot acquire the entry's lock within a bounded wait reports a **retryable
enforcement failure**. It does not proceed on the assumption that the holder finished, and it does
not silently fall back to an unverified entry. A stale lock — a holder that died — must be
recoverable, and the recovery path is the ordinary one: take the lock, **re-verify**, repair if the
verification fails. Because rule 6 holds unconditionally, a wrongly-broken lock cannot produce a
wrong result; it can only produce redundant work.

## Alternatives considered

**Derive the cache root from an isolation boundary — worktree, run, or session.** Rejected, and it is
the alternative worth stating clearly because it is the one that makes the symptom disappear fastest.
It does not fix the product; it **changes the product contract**, from a shared content-addressed
cache to a private one, discarding reuse across processes that content-addressing exists to enable.
It would also make the test suites stop modelling the real invocation model: two concurrent
`npm test` processes are a faithful model of two CI jobs on one runner, and isolating them would
convert a representative test into a green one. A defect that only disappears because the tests
stopped reproducing production is not fixed.

**Serialise the whole test suite (`--test-concurrency=1`).** Rejected. It hides the defect rather
than addressing it, does nothing at all for the cross-process case — which is the actual defect — and
abandons the parallel execution under which the guarantees are claimed to hold.

**A global cache lock.** Rejected; see granularity above.

**Trust the lock and skip re-verification when it is held.** Rejected, and rule 5 exists to keep it
rejected. See above.

**Do nothing, and treat the flakiness as acceptable noise.** Rejected. The failure is a correct
refusal for an incorrect reason, and its cost is not the failed run — it is that operators learn to
re-run enforcement failures.

## Consequences

**The cache's concurrency model is written down for the first time.** It was previously implied by a
machine-wide default, an opt-out flag, content-addressing, and FE-13's repair design — a property
everything depended on and nothing asserted. That is the same shape as the
`machineLearning`/`machine-learning` spelling mismatch that let one pack be privileged in code for
the whole of M3 while a test asserted it could not be.

**FE-15 is a product defect, not a test-infrastructure defect.** The test flakiness is its discovery
path and remains attached as evidence; the acceptance criteria are about cross-process cache
correctness.

**Provenance case 9 keeps a deliberately shared root.** *Two identities never share a materialisation,
so one cannot serve the other* is a test **about** sharing, and any implementation must leave it able
to exercise one.

**Two different SHAs must still materialise concurrently.** This is an acceptance criterion, not an
optimisation: an implementation that makes the race disappear by serialising everything satisfies the
letter of rule 4 and defeats the reason it is scoped per identity.

**Not settled here:** verification happens at materialisation, not continuously. A tree altered
between the check and the evaluator's read is still not caught — closing that needs the evaluator to
run against a tree nothing else can write to, which is different work. This ADR narrows the window
between concurrent processes; it does not eliminate the window between check and use.
