# Adapter lineage — a candidate integration, reviewed against M3's boundaries

**Date:** 2026-08-09 · **Reviewing:** `dc9d72e` (M2 Phase 0, interface inventory) and `3e66703`
(M2 Phase 1, adapter contract), plus one uncommitted edit to
`artifacts/evidence/2026-08-09-contract-expressiveness.md` · **From:** `m3-scope-registry` at
`86ac596`

Two lines developed independently after `2dae58e`:

```text
                    2dae58e  (enforcement root)
                      /   \
     main: adapter work     86ac596  scope registry
```

Reviewed as a candidate integration rather than merged, because "currently docs and a schema only"
is a statement about today's diff, not about the architectural dimension the work introduces.

## Verdict

**The four boundaries hold.** Nothing in the adapter lineage reinterprets pack semantics, imposes a
repository-wide applicability flag, weakens conjunctive composition, or lets adapter presence imply
scope. It is usable as groundwork.

Three things must be settled before the lines merge, and one of them is a defect.

## 1. Do adapters reinterpret pack semantics?

**No, and the refusals are the evidence.** The schema is `additionalProperties: false` over four
things: an entrypoint path, a literal argument vector containing `{target}`, the pack's complete
status vocabulary, and the closed subset of it on which a merge may proceed. No aliasing, no
preference ordering, no discovery, no normalising eight vocabularies into one.

Two decisions carry more weight than the schema itself:

- **`result.passing` is declared by the pack.** All six provable packs pass on `COMPLIANT` and
  `COMPLIANT_WITH_EXCEPTIONS`, so nothing forced the field — it exists because ADR 0001 forbids the
  enforcer from holding the knowledge that `COMPLIANT` means passing. That is the boundary being
  defended where it costs something rather than where it is free.
- **PredictionStandards was blocked rather than derived.** Its verdict exists only as exit-code logic
  over counters, and the work stopped instead of writing a selector or aggregation language. Deriving
  it in the enforcer is precisely what ADR 0001 prohibits, and the milestone accepted four-of-eight
  rather than reach for it.

`$absentByDesign` refuses exit-code interpretation on demonstrated grounds: Betting exits `2` on
`NOT_EVALUATED` *with valid JSON*, MachineLearning exits `3` on blocked, Health exits `4`, Financial
collapses blocked into `1`. Parseable JSON carrying a declared status is the signal that the pack ran.

**Unresolved — where does an adapter file live?** The schema says the pack owns its contract; nothing
says where the file sits or what stops it being read from a governed repository. This matters twice
over. If an adapter is readable from the target, a repository declares its own `passing` set and the
whole chain collapses — the same defect as a gate that is a file in the tree it gates, and a scope
registry inside the repository it governs. It would be the third recurrence of one lesson. And if
adapters must ship inside each pack, then no adapter can exist for any already-frozen release:
MachineLearningStandards `v1.4.0` is closed at `6bfd078` and contains none. That points at
enforcer-side adapter files pinned by the enforcer's own SHA — which is defensible, but weakens the
ADR 0001 argument for `passing` being pack-declared, because in practice the enforcer would hold it.
**Decide the locus of adapter authority explicitly, and test that it is unreachable from the target.**

## 2. Does scope remain pack-specific?

**Yes, by construction, and the code needs one generalisation.**

The registry is already keyed by domain, not by a boolean:

```json
"github:1024871": { "name": "acme/moneyball", "machineLearning": { "disposition": "in-scope", ... } }
```

A repository being `in-scope` for MachineLearningStandards and `out-of-scope` for BettingStandards is
expressible today by adding a sibling key. Nothing anywhere is called `standardsApplicable`, and the
adapter work introduces no such notion.

What is single-pack is the *code*, not the shape: `resolveScope` reads `entry.machineLearning`
literally, and `OUT_OF_SCOPE` / `SCOPE_REVIEW_REQUIRED` are whole-run states rather than per-pack
ones. Under composition both must become per-pack — a repository governed by three packs can easily be
in scope for two and unreviewed for the third, and flattening that to one state would either block a
compliant repository or hide an unreviewed pack. Small, mechanical, and better done as part of
composition than pre-emptively.

## 3. Does composition remain conjunctive?

**Not violated, and not yet established.** The adapter lineage stops at the contract; it defines no
aggregation. The enforcer today produces one state from one pack, and `PASSING` / `exitFor` are
single-verdict.

So this is a requirement to carry forward rather than a finding, and it has a sharper edge than it
first appears. `result.passing` being per-pack makes the aggregate rule easy to state — every
confirmed-in-scope pack must be passing, and one pack's success or approved exception cannot offset
another's failure — but interface-inventory finding **H** complicates the units: Financial's unit of
evaluation is an analysis document and Prediction's is a prediction record, not a repository. A
conjunction over heterogeneous units needs its subjects pinned before it means anything.

The existing structural bound helps: `PASSING` is closed and every member must be a verdict or a
recorded decision. An aggregate result must be held to the same rule rather than routed around it.

## 4. Does M3's authority boundary survive?

**Yes, with a terminology hazard worth fixing now.**

Nothing in the adapter work converts adapter presence into applicability. A pack having an adapter
means it can be invoked; it does not mean it governs anything. Files an adapter would understand are
detection evidence at best, and detection has no authority to decide scope.

The hazard is in interface-inventory finding H:

> `{target}` is a repo root, and M3's adoption record — not M2 — is where a project declares which
> subpath a pack should evaluate.

Two collisions in one sentence. First, **"M3" means different milestones on the two lines** — scope
here, and something later there — and two evidence directories using the same numbers for different
claims makes the lineage unreadable within a month. Second, *"where a project declares"* is correct
for a subpath (a mechanical detail inside an already-adopted, already-in-scope pack) and would be
catastrophic if it drifted into scope. Adoption is a thing a project does. **Scope is a thing done to
a project.** Keeping those words apart is most of the discipline.

## The defect: the identity table records tag objects, not commits

Every SHA in the Phase 0 identity table is the **annotated tag object**, not the commit it points at.
Confirmed across every locally checkable pack:

| Pack | Tag | Recorded | Actual commit |
| --- | --- | --- | --- |
| MachineLearningStandards | `v1.4.0` | `4860e34` | `6bfd078` |
| BettingStandards | `v1.0.0` | `f47bdf7` | `a4e7e68` |
| MathematicsStandards | `v1.0.0` | `dc29992` | `85b3a11` |
| InnovationStandards | `v1.0.1` | `4950e3f` | `b914efc` |
| FinancialStandards | `v1.1.0` | `f0216d9` | `0d0b271` |
| PredictionStandards | `v1.1.0` | `72b8f43` | `ebe232b` |

The data is not wrong; the column heading is, and the heading is the part the identity model cares
about. `resolveIdentity` verifies `git rev-list -n 1 <tag>` against the declared SHA, so an identity
triple built from this table produces `STANDARDS_IDENTITY_MISMATCH` for all six — the system catching
it, which is the good news, but only after somebody spends an afternoon on it.

Worth noticing what this is an instance of: the inventory's own thesis is that a contract derived from
two packs and assumed to fit six is the failure to prevent. The same shape applied to `git rev-parse`,
which answers a different question from `git rev-list -n 1` for exactly the tags that were annotated.

## Recommendation

Usable as groundwork for the later composition milestone. Before either line merges:

1. **Renumber one lineage.** Two different M2s and two different M3s in one evidence directory.
2. **Correct the identity table** to commit SHAs, and note why the two differ.
3. **Decide where adapter contracts live**, and prove by test that a governed repository cannot
   supply or edit one.

Carry forward into composition, not resolvable now: per-pack scope states, conjunctive aggregation
held to the `PASSING` bound, and the unit-of-evaluation problem for Financial and Prediction.

Nothing here argues for forcing reconciliation on a schedule. If those three are not settled, the
adapter lineage keeps its own branch and loses nothing.
