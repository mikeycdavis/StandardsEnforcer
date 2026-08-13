# The first portfolio matrix, and what it found

- **Date:** 2026-08-13
- **Branch:** `reconciliation/m3-integration`
- **Decides nothing.** This records what was run and what it produced. The decisions are in
  [ADR 0008](../adr/0008-the-cell-identity-key-and-the-total-ratchet.md).
- **Raw output preserved:** [`2026-08-13-portfolio-first-matrix-raw/`](2026-08-13-portfolio-first-matrix-raw/)

## The headline, and it is worse than the plan predicted

The reconciled plan expected *"~400 cells, nearly all `SCOPE_REVIEW_REQUIRED`"*, and said that a
materially smaller first matrix would mean cells were being hidden. The real first matrix is smaller
than that, and nothing is hidden:

```text
Portfolio: 0 cells — 0 registered repositories × 4 registered packs

Ratchet: 1 finding
  POPULATION_EMPTY
      the registered population is empty — 0 repositories × 4 packs — so the ratchet holds over
      nothing.

exit=4
```

Four hundred unreviewed cells would have been a portfolio that had been entered and not reviewed.
This is a portfolio that has not been entered. **Every repository on this machine is outside the
governed population**, which is a different and larger statement than *unreviewed*, and it is the
condition this slice was built to make visible.

## Why the repository axis is empty, and why it was not filled in

A registry entry is keyed by an immutable platform identity — GitHub's numeric repository id or node
id — which only the platform can issue. Obtaining them for the ~60 repositories on this machine means
enumerating an organisation, which is **repository discovery**, which is explicitly not in this slice
and is a separate obligation.

Three local substitutes were considered and refused:

| Substitute | Why not |
|---|---|
| The directory name | The rename/transfer/recreate failure ADR 0004 settled, and the false green FE-12 found one level up |
| The root-commit SHA | Collides across forks and clones that share history. `EngineeringStandards` has two sibling working copies in `F:\Repos\` |
| The `origin` remote URL | A name with a hostname in front of it |

Filling the axis with any of them would have produced a matrix of roughly four hundred cells keyed on
something that is not an identity — a better-looking result and a worse one. The empty axis is the
truthful reading and it is the finding.

## Why the pack axis is four and not nine

Registration is transcription: a registry may register a pack, not name one. Four packs in this
portfolio declare a contract identity that can be transcribed:

| Pack | `standard.id` | Transcribed from |
|---|---|---|
| BettingStandards | `betting` | `8e9487e…:standards-adapter.json` |
| InnovationStandards | `innovation` | `036f1f3…:standards-adapter.json` |
| MachineLearningStandards | `machine-learning` | `e6f00ed…:standards-adapter.json` |
| MathematicsStandards | `mathematics` | `7976938…:standards-adapter.json` |

**Five do not, and they are recorded as unregistrable rather than omitted:** EngineeringStandards,
FinancialStandards, HealthAndFitnessAndNutritionStandards, PredictionStandards and
UIUXDesignStandards publish no `standards-adapter.json`, so they declare no identity and there is
nothing to transcribe. A pack missing from the matrix and a pack missing from the world must not look
the same, which is why the registry says so in a comment that survives the file being read by
machines.

This is a real, previously unstated portfolio finding: **five of nine standards packs cannot
currently be governed by identity at all**, and the gap belongs to those packs' release cycles, not
to this enforcer.

## The finding the run itself produced

`POPULATION_EMPTY` did not exist when the first snapshot was attempted. Every check the ratchet
performs — repository absent, pack absent, cell absent, baseline row orphaned, exclusion unratcheted
— passes vacuously over zero cells, so the first real run of a control designed to make absence
expensive **exited zero**.

That is the same shape as the false green already recorded in this repository's own README: *a file
under `test/` with no tests in it counts as a passing test*. A control that holds over nothing is not
a clean result; it is the absence of a result wearing one. The condition is now the seventh thing the
ratchet fails closed on, and `test/ratchet.test.mjs` pins it with its pair — one registered
repository is enough to make the population real, after which the ordinary findings apply again
rather than being masked by this one.

## What was verified

```text
test/ratchet.test.mjs            20 tests · 20 pass · 0 fail
test/portfolio-matrix.test.mjs   10 tests · 10 pass · 0 fail
full suite, oracle required     243 tests · 242 pass · 0 fail · 1 skipped
```

243 is 213 plus exactly the 30 new arms, less nothing. The single skip remains ADR 0005 case 7b.

## What this does not establish

- **Nothing was evaluated.** The matrix reports applicability, not compliance. An in-scope cell
  carries no state and `evaluated: false`, because no member of `STATE` means *"governed, and not
  evaluated here"* and inventing one to fill a column would put a word in the vocabulary for the sake
  of a table.
- **The totality claim is bounded by the roster.** "Every registered cell is accounted for" is the
  claim; "every cell that exists is accounted for" is not, and will not be until repository discovery
  exists.
- **The transcription is unconfirmed.** Nothing yet compares a registered `contract.id` against the
  identity a pinned release actually declares. ADR 0008 records why that check must never erase a
  recorded decision when it is built.
