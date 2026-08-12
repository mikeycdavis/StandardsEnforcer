# FE-12 — scope dispositions keyed per pack, not hardcoded to one

**Date:** 2026-08-12
**Item:** [FE-12](../backlog/items/FE-12.md), under [EP-05](../backlog/items/EP-05.md)
**Shipped in:** `0.5.0`
**Raw output:** [`2026-08-12-fe12-multi-pack-scope-raw/`](./2026-08-12-fe12-multi-pack-scope-raw/)

## The guarantee

> A repository can carry an independent, simultaneous scope disposition for each standards pack, and
> no pack is privileged by the enforcer's code.

And the bar the item set, which is stricter than the guarantee reads:

> Done is not "it works for engineering". Done is that adding a pack requires no change here at all.
> If the implementation ends up with a list of known pack ids, the abstraction has not been built.

## Both falsifiers were written first and observed red

[`red-before.txt`](./2026-08-12-fe12-multi-pack-scope-raw/red-before.txt).

**The feature falsifier** — one repository, two packs, independent dispositions — could not even be
expressed. It failed at module load, because the surface it needed did not exist yet.

**The source guard** failed with one violation, which is the more interesting result:

```text
ADR 0001 forbids the enforcer knowing this. Ask the pack instead:
  scripts/scope.mjs names machineLearning
```

`test/authority-boundary.test.mjs` had banned pack identity in `scripts/` since M2 — and it had been
passing all along, while `scope.mjs` read `entry.machineLearning` and named
`MachineLearningStandards` in its own prose for every pack. The banned list held the *contract id*,
`machine-learning`, and neither spelling in the source is that string.

**One pack was privileged in code for the whole of M3, two files away from a test asserting that could
not happen.** The guard now bans `machineLearning`, `MachineLearningStandards` and `machine_learning`
as well. A prohibition that covers only the canonical spelling is a prohibition on typing it
canonically.

## What changed

**The key.** `repositories.<id>.machineLearning` → `repositories.<id>.standards.<pack id>`, keyed by
the asking pack's own contract id. No legacy fallback: reading the old key would require the enforcer
to know one pack's name, which is the defect. An unmigrated registry yields `SCOPE_REVIEW_REQUIRED` —
fail-safe and visible rather than silently half-working.

**The asking pack is named by the invocation, not by the release** — `--standard=<id>`, in the
existing all-or-nothing scope group.

This is the one design decision worth recording, because the first implementation went the other way
and the test suite caught it. Reading `standard.id` from the pinned release's adapter looks stricter:
the pack naming itself, no configuration to get wrong. It failed seven tests in
`scope-seam-invariance.test.mjs`, among them *"a reviewed exclusion survives a malformed adapter"* and
*"no scope-decisive path reaches the evaluator seam"*.

That suite is right and the stricter-looking design is wrong. **A human decided this standard does not
govern this repository. A broken contract in the release is not new information about that decision,
and must not convert it into an error.** Scope authority sits outside the evaluator seam by
construction, and sourcing the key from the adapter would have quietly moved it inside.

The residual is stated rather than hidden: the id is now configuration, so a misconfigured invocation
looks up a different pack's disposition. It is supplied by the trusted workflow alongside the registry
path and the repository identity — the governed pull request cannot reach it — and an id with no entry
is review-required rather than a pass. Nothing has forced a cross-check against the contract when one
happens to be readable, and none was added.

**The evidence basis names its surface.** `reviewedFootprint` gains `surface`; `detectFootprint`
reports `surface: "training-evidence"`, named for the evidence rather than for a pack — a pack name
there would have put pack identity back into `scripts/`, and would also have been untrue, since the
detector answers a question about a repository that any number of standards might care about.

**Generalising scope did not generalise detection.** There is one detector. A basis naming a surface a
run did not observe is **undetermined** — neither fresh nor stale — and goes to a human. Assuming the
only surface that exists must be the one a reviewer meant would be the enforcer deciding what evidence
they had in mind, which is the same class of error as reading a pack's evidence fields. A pack with no
detector is not a pack whose detector found nothing (ADR 0004).

## Result — [`green-after.txt`](./2026-08-12-fe12-multi-pack-scope-raw/green-after.txt), [`suite-after.txt`](./2026-08-12-fe12-multi-pack-scope-raw/suite-after.txt)

Ten new cases in `test/scope-multi-pack.test.mjs`, all passing, including five invented packs
(`one-standards` … `five-standards`) resolved in one pass. **Nothing in the tests names a real pack
except as opaque data**, so they cannot pass against an implementation that special-cases the real
ones.

The full suite stands at **183 tests, 182 pass, 1 skipped**. The skip is still ADR 0005 case 7b,
symlinked entrypoint, `EPERM` on this platform — skipped and not passed.

The 27 pre-existing scope failures during the change were fixture shape, not properties: both scope
suites absorb the new registry shape in their `registryAt`/`registry` helpers rather than at ~15 call
sites, so every assertion below them is the one it was before.

## What this does not establish

- **The EngineeringStandards `IN_SCOPE` decision has not been migrated into a registry.** This removes
  the reason it could not be; recording it is a governance act by a named reviewer, not a code change,
  and no registry in this repository is the live one.
- Detection is still single-surface. Nothing here gives any other pack a detector, and the item warned
  specifically against making it look as though it had.
- `--standard` is unvalidated beyond its presence. An id no registry knows is review-required, which
  is correct, but a *typo* and a *genuinely unreviewed pack* are indistinguishable from the outcome
  alone.
