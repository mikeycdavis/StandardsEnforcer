# StandardsOrchestrator, reconciled

**A bounded comparison, not a milestone.** `F:/Repos/StandardsOrchestrator` independently built the
same merge gate this repository is building — ten commits, M0 through M8, released at `v1.0.0`, 259
tests passing. It was discovered before Phase 3 was written, which is the only cheap moment to find
it.

This record classifies every materially different architectural proposition in that repository as
**AGREE**, **ADOPT**, **REJECT** or **NOT YET EARNED**. When every one is classified, the comparison
is closed and Phase 3 proceeds. It is deliberately finite: the point is to not build a third
implementation of this boundary, and a merger project would be a third implementation wearing a
different name.

The disposition is recorded there as [`FROZEN.md`](../../../StandardsOrchestrator/FROZEN.md), commit
`81013dd`. Nothing was deleted.

## The decision, and why it was not a matter of taste

Both repositories own adapter protocol, identity resolution, applicability, native execution, outcome
handling and merge gating. That is duplicate orchestration, and the portfolio may have one gate.

The two disagree about **who owns the adapter**, and that disagreement turned out to be empirically
settleable rather than architectural preference. Both independently derived a declaration of how to
invoke BettingStandards:

```text
pack-owned    BettingStandards v1.0.1     ["validate", "{target}",  "--json"]
central       Orchestrator registry       ["validate", "--json", "--dir={{target}}"]
```

Run against `a4e7e68` — the exact commit the orchestrator's adapter names as its `expectedCommit`, so
this is not a version-skew artefact:

```text
$ node scripts/standards.mjs validate --json --dir=<target>
standards: unknown flag '--dir=<target>'
exit 2
```

BettingStandards takes its target positionally and has never had a `--dir` flag. The central
declaration was wrong for the whole of that repository's life.

Two things follow, and they point in opposite directions.

**In the orchestrator's favour:** it failed closed. Exit `2` is declared `infrastructureFault`, so the
mis-invocation became `INDETERMINATE`, never a false green. The outcome algebra did exactly its job
while the declaration beneath it was wrong. That is a real endorsement of layered fail-closed design
and is the reason several propositions below are ADOPT.

**Against it, decisively:** nothing in that repository could have caught the error, and nothing ever
would have. A pack does not read a registry that describes it, so a central declaration has no
mechanism to be wrong-and-noticed. A pack-owned declaration sits in the same tree as the CLI it
describes, changes under the same review, and is exercised by that pack's own suite.

This is ADR 0005 arriving from the other direction. The invariant says evaluator code, invocation
declaration, native vocabulary and passing interpretation must share **one** verified release
identity. The central registry makes the effective authority a *pair* —
`(BettingStandards v1.0.0, Orchestrator revision X)` — and the second element decides what the first
one's answer means. The `--dir` defect is what that looks like in practice.

**Not a free win.** Pack-owned declarations move the failure mode rather than removing it: a pack can
still declare its own invocation wrongly, and the Phase 2 fidelity tests as written could not have
caught that either (see [the conformance-boundary review](2026-08-09-adapter-conformance-boundary.md),
Findings 1 and 2). The difference is that a pack-owned defect is *reachable* by a test living beside
the code — which is what steps 4 through 6 of the current sequence exist to build. The orchestrator's
defect was not reachable by any test at all.

## The classification

### REJECT — conflicts with an established Enforcer invariant

**R1. Central adapter registry.** `registry/<pack>-<version>.adapter.json` held by the orchestrator.
Rejected on ADR 0005, with the `--dir` defect as the empirical case. Superseded by pack-owned
`standards-adapter.json` read from the identity-verified checkout.

**R2. Per-pack interpreter modules.** `registry/interpreters/betting-1.0.0.mjs`, exporting
`readVerdict`, `positiveEvidence`, `describeEvidence`, `readCoverage`. The orchestrator argues for
these explicitly and the argument is good: *"meaningfully evaluated" has different semantics in every
pack, and a generic field interpreted uniformly would be exactly the cross-pack inference this
architecture forbids.*

It is still REJECT here, for two reasons that survive that argument. First, it is executable code
about a pack, owned by the consumer — R1 with a sharper edge, because code can encode judgements a
declaration cannot. Second, the enforcer's Glossary fixes the contract as **declarative data only: no
JavaScript, no adapter modules, no `switch (packId)`**, and ADR 0001's grep guard is mechanical about
it. Adopting interpreters would require repealing that guard.

What the orchestrator got right inside a rejected mechanism is preserved as **A2** below.

**R3. `verdictMap` — pack vocabulary translated into the consumer's outcome classes.** The
orchestrator maps `COMPLIANT → PASS`, `NOT_EVALUATED → INDETERMINATE`, and so on. This is the
reinterpretation ADR 0001 forbids: the enforcer carries the pack's native status verbatim and decides
only membership of the pack-declared `passing` set. Note the orchestrator's own schema is careful here
— it requires `verdictMap` to cover `packVocabulary` exactly, so an upstream addition cannot pass
through unmapped. The mechanism is disciplined; it is the translation itself that is refused.

**R4. Adapters pinning versions the portfolio has moved past.** `betting-1.0.0` and
`prediction-1.1.0`. Betting is now at `v1.0.1`. A central registry must be updated for every pack
release, so the registry is a second thing that can be stale; a pack-owned declaration cannot be stale
relative to its own release by construction. This is a consequence of R1 rather than an independent
proposition, recorded because it is the maintenance cost made visible.

### AGREE — independently reached, already established here

**G1. Dereferenced commit, never the tag object.** The orchestrator's `expectedCommit` documents
`refs/tags/<tag>^{}` and says why in the schema itself. This repository reached the same rule via
`git rev-list -n 1 <tag>` — and got it *wrong first*, recording annotated tag-object SHAs across the
whole Phase 0 inventory before `b60a207` caught it. Two independent implementations converging on the
same non-obvious rule, one of them after paying for the mistake, is about as strong as this kind of
evidence gets.

**G2. Never fall back.** *"NEVER: fall back to `main`, to another tag, to a newer version, to
'latest', or to a local ref."* Identical to ADR 0005's no-fallback rule, reached independently.

**G3. Nothing evaluated is not a pass.** The orchestrator's empty-set rule and INV-E1 are the same
invariant. Both explicitly refuse the mathematically-correct empty conjunction.

**G4. Absence of detection never waives an authority.** *"If it meant that, every gap in detector
recall would become authority to waive a standards pack."* This is Phase 4's `NOT_APPLICABLE`-must-be-
earned rule, and ADR 0004's scope-is-a-recorded-decision, in the orchestrator's words.

**G5. Declaration and detection disagreeing is adjudicated, never resolved automatically.** The
orchestrator's `CONFLICT`; the enforcer's `SCOPE_REVIEW_REQUIRED` over a repository that declares
itself out while tripping strong signals.

**G6. An engine fault is never a project finding.** The orchestrator reserves exit `2` for itself;
this repository separates `ENFORCEMENT_ERROR` from every standards verdict. Same boundary.

**G7. The honest limit on CI.** *"The gate can be bypassed. The guarantee is visibility, not
prevention."* This is what M4 established here — that app binding to GitHub Actions is not an
enforcement root — reached independently and stated more plainly than this repository has yet stated
it. The wording is worth borrowing when M4's claim is written up.

### ADOPT — better than the Enforcer's equivalent, and compatible with its authority model

**A1. Execute the schema; do not restate it in hand-written checks.** From `scripts/jsonschema.mjs`:

> *a hand-written validator alongside a schema is two definitions, and the drift between them is
> silent*

and the strictness that makes it work — **an unsupported keyword throws rather than being ignored**,
because a validator that silently skips a constraint reports PASS for a document it never fully
checked.

This directly shapes step 4. The conformance boundary must *run the schema file*, not paraphrase it.
`schemas/standards-adapter.schema.json` already carries `additionalProperties: false`, the
`schemaVersion` `const`, the entrypoint `pattern` and `contains: {"const": "{target}"}` — all of which
the boundary review found were doing no work. Executing the schema puts every one of them to work at
once, and hand-written code is then needed only for what JSON Schema cannot express.

Adopted as a design constraint, not as a file copy: the enforcer's validator is written here against
this repository's schema, which uses a different keyword set. One wrinkle the orchestrator's version
would reject outright — this schema carries a custom `$absentByDesign` annotation at its root, which
is documentation rather than a constraint. It must be recognised explicitly as an annotation rather
than tolerated by a permissive default, or the strictness A1 exists for is gone.

**A2. `passing` requires positive evidence, not merely a passing status.** The strongest idea in that
repository, and the enforcer currently lacks it.

The orchestrator will not let a pack contribute a pass on its status alone. Betting's interpreter
requires `denominator.scored > 0` — at least one required-level rule actually scored — because a run
that skipped every rule as not-applicable still reports a positive status. It also refuses to read the
`score` field at all: *"a percentage from a run that concluded nothing is the most convincing false
green available."*

This session produced the case for it, unprompted. MathematicsStandards `v1.0.1`, `validate
--dir=<target>` against a target containing exactly one markdown file:

```text
"project": "<the target path>"      ← the target was honoured
"status": "NOT_EVALUATED"
"score": 97
"summary": { "passed": 52, "failed": 1, ... }
"denominator": { "total": 82, "applicable": 82, "scored": 39 }
```

Fifty-two rules passed against a directory containing one file. The enforcer is safe here **only**
because it reads `status`, `NOT_EVALUATED` is outside the declared `passing` set, and it never reads
`score`. That safety is currently a property of what Phase 3 happens to do, not a stated invariant —
and `score: 97` sitting beside `NOT_EVALUATED` is exactly the shape that invites a future reader to
"improve" the report by surfacing it.

Adopting A2 in full — a declared evidence gate per pack — is **NOT YET EARNED** (see N1); it needs a
declarative expression of "meaningfully evaluated", and the orchestrator's own argument is that no
generic one exists. What is adopted now is the negative half, which needs no new vocabulary and is
Phase 3's to enforce:

> **The enforcer reads the declared status and nothing else.** No score, no summary counts, no
> denominator, no coverage figure may contribute to whether a result is passing. A test asserts that
> no numeric field of a native envelope is read anywhere in the verdict path.

**A3. Distinguish "could not be obtained" from "ran but established nothing".** The orchestrator keeps
`UNRESOLVED` and `INDETERMINATE` apart all the way into the JSON, because *"both fail the gate for
operationally different reasons and send someone to fix different things."* The remedies really are
different — fix the pin versus fix what it was given to evaluate.

The enforcer collapses both into `ENFORCEMENT_ERROR`. That is safe (both fail closed) but it is a
worse report. Adopted as a **reporting** refinement, not a new state: `ENFORCEMENT_ERROR` keeps its
single fail-closed meaning and gains a distinguishable reason. Deferred to the Phase 6 acceptance
report, and recorded here so it is not lost.

**A4. Record `tagKind`.** The orchestrator records whether a release tag is annotated or lightweight,
so *"a tag re-created in the other kind is a change to the released object that should fail rather
than be absorbed."* ADR 0005 explicitly decided to accept both kinds, which remains right — but that
decision is about *acceptance*, and this is about *stability*. Adopted as a question for the identity
layer rather than an immediate change: a tag that changes kind between runs is drift, and drift the
enforcer currently absorbs silently. Logged for M2 close.

### NOT YET EARNED — interesting, no evidence yet requires it

**N1. Per-pack declared evidence gates.** The positive half of A2. Requires either a declarative
expression of "meaningfully evaluated" — which the orchestrator argues cannot exist generically, and
its argument is not obviously wrong — or per-pack code, which is R2. Revisit when a pack is observed
returning a *passing* status on a run that evaluated nothing. Mathematics returns `NOT_EVALUATED`
honestly, so the case is not yet in hand.

**N2. `capabilities` declared per adapter.** `machineReadableVerdict`, `coverage`,
`separateEvidenceCommand`. Nothing in the enforcer's design needs to ask a pack what it can do; a pack
that cannot produce a machine-readable verdict simply has no valid contract. Revisit only if a pack
forces it, which is this repository's standing rule for schema growth.

**N3. `knownHazards` in the contract.** Genuinely useful documentation — and the `--dir` case shows a
hazard note can be confidently wrong while reading as reassurance. Prose in a contract that no test
executes is the weakest artefact in that repository. Not adopted.

**N4. Dependency ordering between packs.** The orchestrator owns `prediction → betting` and argues
convincingly that it belongs to composition rather than to either pack. The enforcer has no
cross-pack dependency concept and no case requiring one yet. Revisit at M5+; the argument is recorded
because it is good and would be expensive to re-derive.

**N5. Portfolio membership audit.** M8 — reading each governed repository's caller workflow and
GitHub's protection configuration to detect a repository quietly leaving. Adjacent to this
repository's M4 and beyond M2. Recorded, not adopted.

## Closed

Every materially different proposition above is classified. The comparison is finished and
StandardsOrchestrator is frozen. What it contributes to Phase 3 is two things: the strictness
constraint in A1, which determines how the conformance boundary is built, and the read-nothing-but-
status invariant in A2, which Phase 3 must assert rather than merely satisfy.
