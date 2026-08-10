# Interface inventory — the eight standards packs, at their released identities

**M2 Phase 0.** Recorded before `schemas/standards-adapter.schema.json` exists, because a contract
derived from two packs and assumed to fit the other six is the failure this phase exists to prevent.

Every cell below is read from the **pinned ref**, not `main`, and cites a file and line in that ref.
Nothing here is inferred from a sibling pack.

## Identities

**Corrected 2026-08-09.** This column originally recorded `git rev-parse <tag>` — the **annotated tag
object's** SHA. The enforcer resolves identity with `git rev-list -n 1 <tag>`, which dereferences to
the commit, because that is what a release identity means (`scripts/identity.mjs:54-56`). Every
original value would have been rejected by `verifyTagResolvesTo` as a mismatch. The commit SHAs are
below; the superseded tag-object SHAs are kept in the last column so the correction is visible rather
than silent. See [the release record](2026-08-09-adapter-releases.md).

| Pack | Ref read | Commit SHA | `VERSION` | `package.json` version | was recorded |
|---|---|---|---|---|---|
| EngineeringStandards | **`HEAD` — no tag exists** | `f1a03c9` | `2.0.1` | `2.0.0` | — |
| FinancialStandards | `v1.1.0` | `0d0b271` | `1.1.0` | `1.0.0` | ~~`f0216d9`~~ |
| BettingStandards | `v1.0.0` | `a4e7e68` | `1.0.0` | `1.0.0` | ~~`f47bdf7`~~ |
| MachineLearningStandards | `v1.4.0` | `6bfd078` | `1.4.0` | `1.4.0` | ~~`4860e34`~~ |
| MathematicsStandards | `v1.0.0` | `85b3a11` | `1.0.0` | `1.0.0` | ~~`dc29992`~~ |
| PredictionStandards | `v1.1.0` | `ebe232b` | `1.1.0` | `1.1.0` | ~~`72b8f43`~~ |
| InnovationStandards | `v1.0.1` | `b914efc` | `1.0.1` | `1.0.0` | ~~`4950e3f`~~ |
| HealthAndFitnessAndNutritionStandards | **`HEAD` — no tag exists** | `6c2f447` | `1.0.0-dev` | `1.0.0-dev` | — |

Three of these have since been superseded by releases carrying the adapter contract — Betting
`v1.0.1`, MachineLearning `v1.4.1`, Mathematics `v1.0.1`. The rows above are left at the refs this
inventory was taken from; the current pinned identities are in the release record.

## Invocation

| Pack | `bin` | Entry script | Subcommands | **Authoritative verdict** | Target syntax |
|---|---|---|---|---|---|
| Engineering | `standards` | `scripts/standards.mjs` | `audit` `validate` `init` | **`validate`** | positional or `--dir=<path>` |
| Financial | `standards` | `scripts/standards.mjs` | `audit` `check` `explain` `status` `init` | **`check`** | positional only; **no `--dir`** |
| Betting | `standards` | `scripts/standards.mjs` | `init` `plan` `check` `audit` `validate` `explain` `status` | **`validate`** | positional `<dir>` |
| MachineLearning | `standards` | `scripts/standards.mjs` | `init` `scan` `evaluate` `explain` `status` | **`evaluate`** | positional or `--dir=<path>` |
| Mathematics | **`math-standards`** | `scripts/standards.mjs` | `audit` `validate` `check` `explain` `status` `init` | **`validate`** (`check` is an alias) | positional or `--dir=<path>` |
| Prediction | **`predictions`** | **`scripts/predictions.mjs`** | `init` `audit` `check` `explain` `status` | **`check`** | `record.json` **or** a directory |
| Innovation | `standards` | `scripts/standards.mjs` | `audit` `validate` `check` `explain` `init` | **`validate`** | positional or `--dir=<path>` |
| Health | `standards` | `scripts/standards.mjs` | `init` `audit` `check` `explain` `status` | **`check`** | positional `[path]` |

Sources: `EngineeringStandards@f1a03c9:scripts/standards.mjs:395,405`;
`BettingStandards@f47bdf7:scripts/standards.mjs:553-559`;
`MachineLearningStandards@4860e34:scripts/standards.mjs:56,880,896`;
`MathematicsStandards@dc29992:scripts/standards.mjs:6-9,281`;
`PredictionStandards@72b8f43:scripts/predictions.mjs:63`;
`InnovationStandards@4950e3f:scripts/standards.mjs:6-9,172`;
`HealthAndFitnessAndNutritionStandards@6c2f447:scripts/standards.mjs:935-939`;
`FinancialStandards@f0216d9:scripts/standards.mjs:475-489`.

## Policy location — the sharpest divergence

| Pack | Where the policy is read from | Source |
|---|---|---|
| Engineering | the **target** repo root | `scripts/standards.mjs:75` |
| Betting | the **target** dir | `:131` |
| MachineLearning | the **target** root | `:826` |
| Mathematics | the **target** repo root | `:456` |
| Innovation | the **target** repo root | `:134` |
| Health | the **target** root | `:506` |
| Prediction | walks up from the target, then **falls back to its own** | `:136,142` |
| **Financial** | **its own checkout**, always, unless `--policy` is passed | `:167`, `:373` |

## Result vocabulary

| Pack | `STATUS` values | Blocked/breach key in the envelope |
|---|---|---|
| Engineering | `COMPLIANT` `COMPLIANT_WITH_EXCEPTIONS` `NON_COMPLIANT` `NOT_EVALUATED` — **no `BLOCKED_BY_INVARIANT`** | `unestablishedProhibitions` (`compliance.mjs:327,357`) |
| Financial | the five | `invariantBreaches` (`compliance.mjs:163,287`) |
| Betting | the five | `blockedBy` (`:343,359`) |
| MachineLearning | the five | **none** — `evidenceRequests` is a different concept (`:156,188`) |
| Mathematics | the five | `blockedBy`, objects not strings (`:359,377`) |
| **Prediction** | **`SUPPORTED` `SUPPORTED_WITH_EXCEPTIONS` `INSUFFICIENTLY_SUPPORTED`** `BLOCKED_BY_INVARIANT` `NOT_EVALUATED` (`compliance.mjs:28-33`) | `blockedBy` (`:493,527`) |
| Innovation | the five | `blocking` (`:375,393`) |
| Health | the five | `integrityViolations` (`:309,592,609`) |

## Exit codes

| Pack | `0` | `1` | `2` | `3` | `4` |
|---|---|---|---|---|---|
| Engineering | ok | findings | invocation | — | — |
| Financial | ok | findings **and blocked** (`:211`) | invocation | — | — |
| Betting | ok | non-compliant or blocked (`:352`) | invocation **and `NOT_EVALUATED`** (`:351`) | — | — |
| MachineLearning | ok | non-compliant | invocation and `NOT_EVALUATED` | **blocked** (`:1052`) | — |
| Mathematics | ok | non-compliant or blocked | invocation | — | — |
| Prediction | ok | insufficiently supported / blocked (`:470`) | invocation **and any `NOT_EVALUATED`** (`:465,468`) | — | — |
| Innovation | ok | non-compliant or blocked | invocation | — | — |
| **Health** | ok | findings | invocation | blocked | **`NOT_EVALUATED`** (`scripts/standards.mjs:51-57`) |

## Findings that shape Phase 1

**A. Two packs have no release identity at all.** EngineeringStandards carries `VERSION 2.0.1` and
HealthAndFitnessAndNutritionStandards `1.0.0-dev`, and **neither has a single git tag**. The enforcer's
identity model is `(repository, tag, 40-char SHA)` and cannot resolve either. This is a precondition
failure, not a contract problem: it is `STANDARDS_IDENTITY_MISMATCH` by construction. Phase 1 proves
the contract against them at `HEAD` and records the result as **provisional**; they cannot be pinned
until they tag.

**B. `check` exists in four packs and means something else in two of them.** Betting's `check`
re-derives decision records and its verdict is `validate`; Innovation's `check` evaluates a single
proposal and its verdict is `validate`. A mapping that assumed "prefer `check`" would run successfully,
return a verdict-shaped object, and be answering a different question. This is the strongest argument
for the contract naming the verdict command explicitly rather than the enforcer guessing.

**C. Exit `4` is already taken.** `states.mjs` documents `EXIT.NOT_ENFORCEABLE = 4` as "a code
MachineLearningStandards never returns" — true of ML, false of Health, which returns `4` for
`NOT_EVALUATED`. Confirms the plan's rule: **canonical status is primary, exit code is process
semantics**.

**D. Prediction's `--json` is not a single envelope.** It emits
`{schemaVersion, command, policy, asOf, parameters, records: [...], aggregate}`. A `result.statusPath`
of `status` addresses nothing. Either the contract must express a multi-record output shape, or
Prediction's aggregate must be nameable as the status path. **This is the first field the starting
vocabulary cannot express, and Phase 1 must resolve it rather than drop Prediction.**

**E. `standard.versionSource: "VERSION"` is required, not decorative.** `package.json` disagrees with
`VERSION` in three of eight packs (Engineering, Financial, Innovation). Reading the wrong one
mislabels the release that produced a verdict.

**F. Financial must be passed `{policy}` explicitly, and the oracle test must prove it.** Verified by
execution: `node scripts/standards.mjs check F:/Repos/HowLongUntil --json` returns
`"project": "FinancialStandards"` — it audits the target's markdown against **the standards repo's own
policy** and labels the report with the standards repo's name. Nothing errors. A contract that omits
`--policy` produces a confident verdict about the wrong thing.

**G. Betting requires a second policy file.** `betting-policy.yml`, distinct from
`project-policy.yml`. Whether the contract needs to express it depends on whether `validate` reads it;
Phase 1 determines that by execution rather than by reading.

**H. The unit of evaluation is not the repository for every pack.** Financial's unit is an analysis
document: pointed at a repository root it audited 19 markdown files including `README.md` and
`CLAUDE.md` and scored 3%. Prediction's unit is a prediction record. The contract must not assume
`{target}` is a repo root, and M3's adoption record — not M2 — is where a project declares which
subpath a pack should evaluate.

## What is deliberately not in this document

No proposed schema, no field list, no adapter drafts. Phase 1 derives those **from** this inventory.
Recording the interfaces and the design in one pass is how the design ends up describing two packs and
assuming six.
