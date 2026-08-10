# The adapter contracts acquire release identities

**M2 Phase 2, closing record.** Three of the four READY packs now publish `standards-adapter.json`
**at an immutable tag**. Until this point the contracts existed only on `main`, which is precisely the
ref the enforcer is forbidden to read.

## The problem this solves

The enforcer reads a pack's contract out of the **pinned checkout**. `BettingStandards v1.0.0`
predates its contract, so a run pinned to `v1.0.0` would find no declaration at all. Reading `main`
instead would mean the rules come from a release and the invocation from whatever HEAD happens to
be — an authority assembled from two different points in time.

Four released products acquired a new public machine-readable interface, so new releases publish that
interface. **No fake release was created to satisfy this architecture**, and no existing tag was moved
or recreated.

## Released

| Pack | Was | Now | Commit |
|---|---|---|---|
| BettingStandards | `v1.0.0` | **`v1.0.1`** | `e0a9fb358440cd10e2051fb50ddfcd178dbf67d1` |
| MachineLearningStandards | `v1.4.0` | **`v1.4.1`** | `f128dac8358c7e6e0f18f6d58dbf6e91d70ae0ba` |
| MathematicsStandards | `v1.0.0` | **`v1.0.1`** | `f21ea832907f0f5ae70f30076c06084eb3bf8237` |

Each satisfied three preconditions before tagging:

1. **The adapter declaration and its fidelity test are the only substantive changes** since the prior
   release. Verified by `git diff --stat <prior-tag>..HEAD`, not asserted.
2. **The complete native chain is green** — Betting 163, MachineLearning 207, Mathematics 79, all
   passing, plus each pack's own `validate` / `evaluate` run.
3. **The release notes classify the change as interoperability metadata with no normative or
   evaluator semantic change**, in the pack's own changelog and in its release commit message.

### Betting had a release-isolation mechanism, and it fired

`test/baseline.test.mjs` pins the published shape — standards count, rule count by level, the
non-exemptible property of all 23 prohibitions, manual-review count, evaluated count, verdict and
score — and it **failed on the version bump**, exactly as designed.

The repair was to move the one field that genuinely moved. Every other field passed untouched: 21
standards, 51 rules at 25/3/23, 8 manual-review, 41 evaluated, 13 fully machine-represented,
`COMPLIANT` at 94. That is what turns *interoperability metadata, no normative change* from a label
into a proof. The other two packs carry no analogous gate and none was invented for these patches.

## Not released: InnovationStandards

`v1.0.2` was planned and is **not cut**, because the first precondition fails and no honest
interoperability-only release exists.

`main` carries four commits since `v1.0.1`, and the adapter is neither the first nor the last:

```text
7e75c62  Record what the first independent adoption produced      project-policy.yml, 3 ADRs
3ee1985  Correct four false decision-record citations in output   catalog.mjs diagrams.mjs policy.mjs
036f1f3  Declare how this pack is invoked                         ← the adapter
d7c9e73  Remove inherited normative provenance                    7 scripts + a test
```

There is **no commit at which only the adapter has been added on top of `v1.0.1`**. Tagging the tip
would publish emitted-output corrections and a rewritten `project-policy.yml` under a note claiming no
semantic change. Tagging the adapter commit would still carry `d7c9e73` beneath it. Either would make
the release notes false, and the release note is the artifact a consumer trusts.

InnovationStandards' next release is its owner's to describe, because it has real content to
describe. Its 131 tests pass and its contract and fidelity test are committed and correct — it is the
release identity, not the integration, that is outstanding.

**Integration status: `BLOCKED_RELEASE_IDENTITY`** — the same classification as Engineering and
Health, reached by a third route:

```text
Engineering   no tag at all
Health        no truthful version to tag
Innovation    a tag exists, but no truthful released identity currently
              contains the invocation contract
```

Innovation's next legitimate release can carry the contract naturally, alongside whatever those four
post-`v1.0.1` commits actually mean. M2 waits. The alternative — cherry-picking the declaration onto
an old tree, or manufacturing an adapter-only commit to make M2 symmetrical — would be inventing a
release that never happened, and the adapter being non-normative does not make the commits
surrounding it non-normative.

## Correction to the Phase 0 inventory

The SHA column in [the interface inventory](2026-08-09-interface-inventory.md) recorded **annotated
tag object SHAs**, not commit SHAs. `git rev-parse v1.0.0` returns the tag object; the enforcer uses
`git rev-list -n 1 <tag>`, which dereferences to the commit, because that is what a release identity
means (`scripts/identity.mjs:54-56`).

The recorded values were therefore not the ones `verifyTagResolvesTo` compares against, and every one
of them would have been rejected as a mismatch. Both SHAs are immutable, so nothing unsafe was
published — but an identity document that names the wrong object is wrong regardless of whether the
wrongness is currently load-bearing. Corrected in that document.

## Pinned identities for M2

```text
betting          v1.0.1  e0a9fb358440cd10e2051fb50ddfcd178dbf67d1  contract present
machine-learning v1.4.1  f128dac8358c7e6e0f18f6d58dbf6e91d70ae0ba  contract present
mathematics      v1.0.1  f21ea832907f0f5ae70f30076c06084eb3bf8237  contract present
```

Each of these three is `(repository, tag, commit SHA)` with the contract inside the tagged tree. The
SHAs are the commits `git rev-list -n 1 <tag>` yields, not the annotated tag objects — see
[the identity correction](2026-08-09-interface-inventory.md) and `test/identity.test.mjs`.

## Standing

READY and BLOCKED flattens five different situations into one word, and the remedies are not
interchangeable. Stated as dependencies, each keeps its reason:

```text
READY
  Betting             v1.0.1
  MachineLearning     v1.4.1
  Mathematics         v1.0.1

DEPENDENCIES
  Innovation          release containing the contract
  Engineering         immutable release identity
  Health              truthful immutable release identity
  Financial           evaluator repair + release containing the contract
  Prediction          authoritative status + release containing the contract
```

Two of the five now need **two** things, which the single word hid. Financial's path-resolution
defect and Prediction's missing top-level status were each described as the whole remedy; neither
pack has a released contract either, so repairing the evaluator alone would leave both exactly where
Innovation is.

**M2 remains open.** Three genuinely READY integrations is not a weaker form of *every applicable
standards result is produced by that pack's pinned authoritative evaluator*. Innovation replaced
nothing — it joined the dependency list on its own grounds, and the list grew from four to five.
