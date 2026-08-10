# The false green was repaired in the authority, not absorbed by the transport

**Closing *The green from nothing*** from [the reconciliation record](2026-08-10-orchestrator-reconciliation.md).

MachineLearningStandards `v1.4.1` returned a passing status on a run that established nothing.
Phase 3's acceptance chain held at every link — valid adapter, evaluator ran, status declared, status
in the pack's declared passing set — and the false green came through it intact.

```text
applicable:    46
scored:         0
notEvaluated:  46
status:         COMPLIANT      ← in the pack's declared passing set
exit:           0
```

## The decision, and why it was not close

**Remedy (a): fix the authority. Not (b): add an evidence gate to the adapter contract.**

The experiment found a defect in the authority, not missing information in the transport protocol.
Had the enforcer responded by reading `denominator.scored`, it would have crossed exactly the boundary
ADR 0001 exists to protect. Today `scored > 0`; tomorrow another pack needs `notEvaluated == 0`, or a
minimum coverage, or a different denominator entirely. That path ends with the enforcer as a second
compliance engine.

That StandardsOrchestrator independently chose `denominator.scored > 0` is good evidence the failure
mode is real. It is not a reason to adopt its remedy: its central adapters already embody a different
authority model, and this is the same architectural difference showing up again.

MachineLearningStandards owns the proposition *46 applicable + 0 evaluated = what verdict?*, so
MachineLearningStandards answers it.

## What the pack decided, in its own terms

The requirement given to it was narrow: **when an evaluation establishes no rule results, do not emit
`COMPLIANT`.** The precise condition was left to the pack, and `scored == 0 → NOT_EVALUATED` was
explicitly not prescribed from here.

The pack's own model supplied a better condition than `scored`. `scored` counts only required- and
forbidden-level rules, so a project establishing only recommendations would have been called
unevaluated. What the pack chose instead is its **assurance buckets**: a positive verdict requires at
least one applicable rule to have been *established* — examined and given a result. Skipped rules
establish nothing; rules whose evidence was sought and absent establish nothing either, which is why
`insufficient-evidence` is excluded on the same grounds that give it its own bucket.

`compliance.mjs` had already claimed *there is NO default-pass path* as its first load-bearing
property. It held for individual rules and did not hold for the verdict assembled from them, because
the status ladder ended in a bare `else`. The repair is that property applied one level up, using
vocabulary the pack already had.

## A second conclusion moved, and the pack was right to move it

The correction also caught a case not in the original report: **every rule declared not-applicable**
was `COMPLIANT` and is now `NOT_EVALUATED`. Declaring a project out of every rule establishes nothing
about it, and passing it made *declare everything away* the cheapest route to green.

This is Phase 4's earned-`NOT_APPLICABLE` rule appearing inside a pack, and the division of authority
holds in both directions: whether the pack applies to a project at all is the enforcer's scope
question, and the pack correctly declines to answer it by saying `COMPLIANT`.

**The pack's own dogfooding was one of these.** Every domain rule in its `project-policy.yml` is
declared not-applicable — correctly, there being no ML work in a standards repository — so
`npm run evaluate` had reported `COMPLIANT` on that repository for four releases, and its CI gate
passed on it. Its policy had already recorded that self-evaluation there exercises the invariants and
the test suite; nothing had asserted the verdict.

## Released as 1.5.0, not 1.4.2

The instruction named `v1.4.2`. The pack's own changelog defines **PATCH** as *corrections that change
no conclusion*, and this changes conclusions, so a patch would have been a release argued into being
smaller than it is — which that changelog explicitly forbids.

Nothing on the frozen surface moved: status and disposition vocabularies unchanged, `NOT_EVALUATED`
already existed, exit-code meanings unchanged, envelope and score semantics untouched. Not MAJOR.

The deciding precedent is in the same file. Release `1.1.0` dropped corpus scores — `yolov5` 80% → 50%,
`Numerai` 67% → 0% — and recorded that *every point removed was a pass the framework was not entitled
to*. That was MINOR. This is the same class of change and takes the same increment.

```text
MachineLearningStandards  v1.5.0  d9cffa11df68f15da9aadc6032ca49748cad5946
```

Release notes classify it as **normative evaluator behaviour**, explicitly not interoperability
metadata. 219 tests pass, up from 207; the full native chain is green.

## Guarded, and proven to bite

The boundary is epistemic, and a guard that refuses to conclude when nothing is known is only correct
if it still concludes when something is. Both sides are tested:

```text
applicable > 0, none evaluated       → cannot be COMPLIANT      ✓
evidence sought and absent           → cannot be COMPLIANT      ✓
one rule genuinely evaluated         → does not collapse        ✓
all applicable rules pass            → COMPLIANT reachable      ✓
a real violation                     → NON_COMPLIANT unchanged  ✓
an invariant violation               → still outranks the guard ✓
an exception                         → COMPLIANT_WITH_EXCEPTIONS ✓
```

And the one that matters most: the guard is **deleted from a copy of the source** and the zero-evidence
case is re-run, requiring the false green to return. A test named for an invariant establishes nothing
unless it bites, and this one is shown to.

## The specimen replayed

Not a newly constructed friendly fixture — the same hostile target, the same adapter-declared
invocation, against a fresh clone at the new tag:

```text
v1.4.1   status COMPLIANT       scored 0   applicable 46   exit 0
v1.5.0   status NOT_EVALUATED   scored 0   applicable 46   exit 2
```

`NOT_EVALUATED` is outside the pack's declared passing set, so the enforcer fails closed on it —
reading nothing but the status, exactly as before. **No enforcer code changed.** That is the whole
point of the remedy chosen.

Fidelity and conformance re-verified at `v1.5.0`: the adapter still conforms to the boundary, and the
documented direct invocation and the adapter-constructed one still produce identical native results.
The contract published at `1.4.1` describes `1.5.0` unchanged — same entrypoint, arguments, statuses
and passing set. What moved is which of those statuses the evaluator reaches, which a contract has
never claimed to constrain.

## What this establishes about the architecture

The falsified proposition was never *the enforcer may trust an authority's declared status*. It was
the weaker operational assumption that **every currently released authority is ready to be trusted
that way**. `v1.4.1` was not.

The architecture tolerates that state explicitly, and must:

```text
valid adapter + correct evaluator + declared status + defective evaluator semantics
    =  PACK NOT READY FOR ENFORCEMENT
    ≠  another interpretation rule in StandardsEnforcer
```

Otherwise every upstream standards defect becomes pressure on the enforcer to accumulate defensive
domain semantics. These pre-Phase-3 oracle runs exist precisely to catch this before that pressure
can be applied.

## Standing

```text
READY
  Betting             v1.0.1   e0a9fb358440cd10e2051fb50ddfcd178dbf67d1
  Mathematics         v1.0.1   f21ea832907f0f5ae70f30076c06084eb3bf8237
  MachineLearning     v1.5.0   d9cffa11df68f15da9aadc6032ca49748cad5946

DEPENDENCIES
  Innovation          release containing the contract
  Engineering         immutable release identity
  Health              truthful immutable release identity
  Financial           evaluator repair + release containing the contract
  Prediction          authoritative status + release containing the contract
```

ML dropped to a dependency when the false green was found and returned to READY when it was repaired,
released and replayed. Three READY and five dependencies, as before the defect — but the three are
now backed by cross-checkout fidelity against an independently documented invocation, and by a
conformance boundary that actually runs.

**M2 remains open**, on the same five grounds it was open on before.
