# Contract expressiveness — can one declarative contract invoke all eight?

**M2 Phase 1.** Derived from [the interface inventory](2026-08-09-interface-inventory.md), by
execution rather than by reading. Every row below was produced by running the pack against a scratch
target carrying that pack's own template policy, and checking whether the report named **the target**
or the pack itself.

## Result

| Pack | Contract expressible | Proven by execution | Release-pinnable | **M2 integration** |
|---|---|---|---|---|
| BettingStandards | yes | `project: TARGET-PROBE` | yes `v1.0.0` | **READY** |
| MachineLearningStandards | yes | `project: TARGET-PROBE` | yes `v1.4.0` | **READY** |
| MathematicsStandards | yes | `project: TARGET-PROBE` | yes `v1.0.0` | **READY** |
| InnovationStandards | yes | `project: TARGET-PROBE` | yes `v1.0.1` | **READY** |
| EngineeringStandards | yes | `project: TARGET-PROBE` | **no — no tag exists** | **BLOCKED** |
| HealthAndFitnessAndNutritionStandards | yes | `project: TARGET-PROBE` | **no — no tag, `1.0.0-dev`** | **BLOCKED** |
| **FinancialStandards** | **no — CLI defect** | crashes on an out-of-tree target | yes `v1.1.0` | **BLOCKED** |
| **PredictionStandards** | **no — no authoritative status** | n/a | yes `v1.1.0` | **BLOCKED** |

**The contract is adequate. Four of eight packs are not.** In every case the obstacle is a defect in
the pack's own release or result surface, not a shortcoming of the contract — the same shape as
"a missing tag is a defect in release identity, not in the identity model".

## The proven invocations

Six packs, run against an external target, each correctly reporting `project: "TARGET-PROBE"`:

```text
Engineering    validate --dir={target} --json
Betting        validate {target} --json
MachineLearning evaluate --dir={target} --json
Mathematics    validate --dir={target} --json
Innovation     validate --dir={target} --json
Health         check {target} --json
```

Only Financial requires `{policy}`, because only Financial does not read the policy from the target.
That is what earns the placeholder its place in the schema.

## FinancialStandards — a CLI defect, not a contract limit

`commandCheck` discovers files with a path resolved against the standards checkout and then re-joins
them to it: `path.join(ROOT, file)`. When the target is not beneath `ROOT` this composes two absolute
paths.

Reproduced in **the enforcer's real configuration** — a materialised checkout under the cache on `C:`
and a target on `F:`:

```text
Error: ENOENT: no such file or directory, open
  'F:\Repos\FinancialStandards\C:\Users\...\p1\FinancialStandards\README.md'
```

The other six survive the identical shape. This is specific to FinancialStandards.

It is also **worse than a crash in one direction**: with a same-drive target the join succeeds and the
run completes, which is how `check F:/Repos/HowLongUntil` returned a confident verdict earlier. So the
pack fails loudly in the configuration the enforcer will use and fails *quietly* in the one a developer
would try by hand.

**Required before M2 acceptance:** resolve discovered paths once, against the target. Non-normative —
no rule, level, severity, assurance or verdict changes — and `test/release-isolation.test.mjs` is the
proof rather than the label.

## PredictionStandards — no authoritative status to address

`check --json` emits `{schemaVersion, command, policy, asOf, parameters, records[], aggregate}`.
There is **no top-level status**. `aggregate` is a set of counters
(`supported`, `supportedWithExceptions`, `insufficientlySupported`, `blockedByInvariant`,
`notEvaluated`, `scripts/predictions.mjs:201-207`), and the repository-level verdict exists **only as
exit-code logic** (`:465-470`):

```js
if (aggregate.notEvaluated > 0) process.exit(EXIT_INVOCATION);
const bad = aggregate.insufficientlySupported + aggregate.blockedByInvariant;
process.exit(bad > 0 ? EXIT_FINDINGS : EXIT_OK);
```

So the verdict would have to be **derived** — and deriving it in the enforcer would be recreating
PredictionStandards' verdict logic in the one place ADR 0001 forbids it. Work stopped here rather than
designing a selector or aggregation language: that is a qualitatively different abstraction and needs
justification before implementation, not after.

**Required before M2 acceptance:** PredictionStandards publishes a top-level authoritative status in
`check --json`, computed by its own code from its own counters. The contract then needs no new field.

## What the schema does not contain, and why

Recorded because a schema is judged as much by what it refused. Full reasoning is in
`$absentByDesign` in the schema itself.

- **`statusPath`** — every provable pack puts the verdict at top-level `status`. Prediction would have
  forced it; Prediction is blocked for a different reason.
- **`exitCodes`** — nothing forced it, and reading them would mislead: Betting exits `2` on
  `NOT_EVALUATED` *with valid JSON*, ML exits `3` on blocked, Health exits `4` on `NOT_EVALUATED`,
  Financial collapses blocked into `1`. **Parseable JSON carrying a declared status is the signal that
  the pack ran.** The exit code is process semantics.
- **`runtime`, `output`, `workingDirectory`, `versionSource`** — none forced. `workingDirectory` was
  tested rather than assumed: no pack needs its own checkout as cwd.

Two fields are present without being forced by expressiveness, each on a stated separate ground:
`result.passing`, because ADR 0001 forbids the enforcer knowing that `COMPLIANT` means passing; and
`result.statuses`, so an unrecognised status fails closed rather than being silently treated as
not-passing.

## M2's dependency list

M2 cannot satisfy its acceptance condition for these four until their owners act. They are classified
rather than listed, because "four packs weren't ready" flattens three different problems with three
different remedies and three different owners:

| Pack | Integration status | Remedy |
|---|---|---|
| EngineeringStandards | `BLOCKED_RELEASE_IDENTITY` | Tag the exact intended released commit. **No code change** merely to integrate with the enforcer. |
| HealthAndFitnessAndNutritionStandards | `BLOCKED_RELEASE_IDENTITY` | First resolve whether `1.0.0-dev` is releasable at all. **Do not create `v1.0.0` because M2 wants a tag** — release identity must tell the truth. |
| FinancialStandards | `BLOCKED_EVALUATOR` | Repair out-of-tree target handling, with regression tests for same-drive and cross-drive paths; run the unchanged v1.1 isolation gate; ship `v1.1.1`. |
| PredictionStandards | `BLOCKED_RESULT_CONTRACT` | Compute and expose the authoritative top-level `status` inside the existing evaluation path, with tests proving it agrees with the existing aggregate and exit behaviour. **Do not redesign its vocabulary** for the enforcer. |

These are Phase 2 dependency classifications, **not** new public `STATE` values — the enforcer's state
vocabulary is a frozen surface and none of these is a state it reports about a repository.

Each pack gets its adapter only after its prerequisite is independently satisfied. The remedies are
deliberately the smallest possible: an evaluator that claims to accept a target must actually accept an
out-of-tree absolute one, and a pack that knows how its counters become a process disposition must
publish the corresponding status. Neither is compensated for in the adapter.

## Milestone status

**M2 is not partially complete.** Four of eight is not a weaker form of *every applicable standards
result is produced by that pack's pinned authoritative evaluator*.

```text
M2 implementation: progressing
contract schema:   frozen from Phase 1 evidence

READY                          BLOCKED
✓ Betting                      ○ Engineering — immutable identity
✓ MachineLearning              ○ Health      — immutable identity
✓ Mathematics                  ○ Financial   — evaluator defect
✓ Innovation                   ○ Prediction  — missing authoritative status
```

Phases 2 and 3 proceed for the four READY packs. `tag: HEAD` is not introduced and
`(repository, tag, SHA)` is not weakened to accommodate the two untagged ones.
