# M3 reconciled — an approved plan against the implementation that already existed

**Date:** 2026-08-12 · **Branch:** `reconciliation/m3-integration`

**A bounded comparison, not a milestone.** An approved plan for an "applicability authority"
milestone was written against a repository state that no longer described this one. By the time it
was compared, the milestone it proposed **had already been built, accepted and documented** as
[ADR 0004](../adr/0004-scope-is-a-recorded-decision.md). This record classifies every materially
different proposition and closes the comparison.

It follows the protocol established by
[the orchestrator reconciliation](2026-08-10-orchestrator-reconciliation.md): total classification,
decide empirically where an experiment exists, freeze rather than delete, record what the losing side
got right, and name what the win does not buy.

## The numbering collision, resolved first

The approved plan called applicability "M2". This repository's M2 is authority transport; **its M3 is
applicability**, and it is implemented. The repository's numbering stands. Nothing below is
"implement M3" — it is *stabilise and generalise an M3 that exists*. Any later artifact describing
this as building applicability from scratch is wrong and erases work that was done.

## Two commits, two different claims

```text
architectural candidate reconciled   7fa4fa4   received the proposition-by-proposition analysis
                                               behind every classification in this record
integration base                     75587b4   taken as the base only after a narrow delta
                                               established that intervening work changed nothing
```

`1433bf9` (backlog bootstrap) and `75587b4` (EngineeringStandards adoption, FE-13) landed between the
review and the integration. A read-only delta over `scripts/`, `test/` and `artifacts/adr/` returned
**empty**: the intervening work is documentation, backlog, evidence, plans, generated diagrams and a
policy file. The base advanced; **the review did not.** Restating the base as though it were the
thing reviewed would imply an analysis that was never performed.

## AGREE — independently derived, and identical in substance

**A1. Discovery produces evidence and cannot decide.** Both sides reached a detector structurally
incapable of expressing a disposition, evidence-shaped output with no confidence score, and an
explicit statement that finding nothing establishes nothing. `footprint.mjs` enforces it with a test
driving every detection shape through an empty registry. The plan reached the same place from a
different direction — dropping the `edge` token after it produced 1,883 hits in a repository with no
prediction character, exactly as `footprint.mjs` omits numpy/pandas/scipy for precision.

**A2. The single-operator limit.** Reviewer, reviewee, ratchet editor and the person who can delete
the registry are one person. Both sides state this as a limit rather than engineering around it.

## ADOPT — the implementation is stronger, and the plan yields

**D1. The 0.4.0 state model.** The plan instructed *do not touch `STATE`, `PASSING`, `exitFor`* and
proposed an `EXIT_PRECEDENCE` array. `states.mjs` had already removed the five pack-native verdicts
and collapsed the projection to `0/1/4`, on the argument that mapping `NOT_EVALUATED` to 2 kept the
meaning in encoded form and so violated ADR 0001 wherever the strings lived. The plan's instruction
would have preserved the defect. **Adopted; the instruction is void.**

**D2. Pack-owned adapter contracts and provenance.** Read from the identity-verified checkout, schema
executed rather than paraphrased, entrypoint containment, nine hostile cases, and an open-vocabulary
proof on words no pack uses. The plan barely addressed this. **Adopted wholesale.**

**D3. Registry trust mechanics.** Keyed by immutable platform identity with name collisions
*reported* rather than resolved; `authorisedReviewers` as a named trust source; a registry inside the
governed tree refused outright; a self-recorded disposition reported as a proposal. All stronger than
the plan's `{id, path}` roster. **Adopted, and generalised rather than replaced.**

**D4. The D2 cache defect's framing.** Both sides found `materialise()` returning on marker existence
alone. [FE-13](../backlog/items/FE-13.md) states the acceptance property better than the plan did:

```text
weak    verify the cache once
strong  establish the requested repository identity when the checkout is consumed
```

The weak form rebuilds the same false green one layer up, with *verification cached* replacing
`.enforcer-complete` as the stale assertion. **FE-13's framing is authoritative.** The plan's
contribution is narrower and survives only as a correction: the threat is **not** sibling
repositories sharing a SHA — the same SHA denotes the same tree whichever repository reaches it — but
a cache under `tmpdir` that nothing re-verifies.

## REJECT — argued, and the argument holds

**R1. Reconstructing pack-native exit-code semantics.** The plan proposed treating any disagreement
between a pack's status and its exit code as unknown. Rejected on evidence: Betting exits 2 on
`NOT_EVALUATED`, MachineLearning 3 on blocked, Health 4, Financial folds blocked into 1. A declared
non-passing status with a nonzero exit is **normal**, and a check that fired on it would fire
constantly. Native exit codes are not a common abstraction and `exitCodes` is rightly absent from the
contract.

## ADJUDICATED — the four conflicts, and the decisions taken

**C-A · Staleness authority — content, with signal-kind retained as evidence.** Two symmetric
failure modes, neither refuted by anything in the repository, and **no experiment available** to
settle it — the one tool the orchestrator precedent used does not reach here.

| | Signal-kind digest (built) | Content digest (approved plan) |
|---|---|---|
| Blind to | growth *inside* a kind already present | churn inside excluded trees |
| Failure | a decision that never goes stale | churn → rubber-stamp reviews |

**Decided: content-derived staleness is the authority.** An attestation is a claim about a reviewed
repository state; if materially different tracked content can appear while the attestation stays
current because the detected-signal vocabulary did not change, the attestation has outlived what was
reviewed. That is the more dangerous failure. `footprintDigest` is **retained and demoted** to
corroborating evidence. Three independent forcing functions: content changed, surface semantics
changed, or `expires` passed — mandatory for not-applicable.

**C-B · The cell model is repository × pack.** The ML-keyed registry is a valid implementation proof
and an invalid final cell model. Eight independently versioned packs, ~50 projects. This was already
felt: the EngineeringStandards adoption had to record its result *in evidence rather than in the
enforcement path* because `scope.mjs` reads a hardcoded `machineLearning` key. Neither file was
changed to make room, which was correct. [FE-12](../backlog/items/FE-12.md) already tracks it.

**C-C · The review surface is the whole repository minus reasoned exclusions.** Discovery cannot
define the surface: its false negatives are exactly what applicability review exists to survive. No
counterpart exists today. **Not yet earned rather than rejected.**

**C-D · The narrow D3 residue is closed.** R1 refutes reconstructing exit semantics — a claim the
plan did not make. What survives is one case: **`passing === true` with a nonzero process exit.** The
pack's own contract says this release passes; its own process says it failed. Detecting that requires
no exit-code semantics, only the observation that one authority contradicted itself.

## NOT YET EARNED — neither conflict nor supersession

Absent rather than rejected, and each is now sequenced in the authoritative plan:

- **The total enforcement ratchet.** No `baseline.json`, no `--write` prohibition, no test grepping
  for a baseline-writing path. The only baseline in the tree was `authority-boundary`'s, written for
  a different purpose and deliberately deleted when it reached zero.
- **The honest portfolio matrix.** ~400 cells, nearly all `SCOPE_REVIEW_REQUIRED`. A first run
  showing materially fewer would mean cells are hidden.
- **The review surface and its digests** (C-C).

## What the win does not buy

**The reconciliation resolves no open question about enforcement.** M5 — whether GitHub can provide a
root an ordinary governed pull request cannot replace — is untouched by everything above, and is
prior to the portfolio work in importance if not in sequence.

**Nothing here was settled by an experiment.** The orchestrator precedent decided its central
question by running a command. C-A had no such option, and was decided on which failure mode is worse
to be wrong about. That is a weaker basis and is recorded as one.

**A live false green survived this entire review.** D1 — the oracle suite skipping on CI while
`npm test` exits 0 — was found by the reconciliation and has been carried in a scratchpad plan while
less severe future work held durable IDs. It is tracked now.

## Disposition

The approved plan is **superseded in full** by
[the reconciled M3 plan](../plan/2026-08-12-m3-reconciled-plan.md). Its numbering, its `states.mjs`
instructions and its D3 fix are void; its digest foundation, review-surface semantics, total ratchet
and portfolio matrix survive into that document. The original is preserved unedited outside this
repository, marked superseded, exactly as `StandardsOrchestrator` was frozen rather than deleted.

The comparison is closed. No proposition from either side is left unclassified.
