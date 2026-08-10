# M2 acceptance — `IMPLEMENTED — PORTFOLIO_BLOCKED`

**The architecture is accepted. The portfolio claim is not, and the two are different claims.**

> Given an explicitly applicable standards pack pinned to an immutable released identity,
> StandardsEnforcer invokes exactly that pack's declared authoritative evaluator, supplies the correct
> target and policy inputs, preserves its native result and verdict vocabulary without
> reinterpretation, and fails closed whenever that chain cannot be established.

That condition is met, and demonstrated across three heterogeneous released authorities. **Universal
portfolio acceptance remains blocked by five explicitly identified upstream dependencies**, each with
a named next prerequisite and a legitimate owner who is not this repository.

Recorded as one status rather than two, because "M2 failed" would be false and "three of eight" would
be M2 quietly redefined into something smaller than it claimed.

## What is accepted

### The chain, end to end, on three releases

```text
identity verified            git rev-list -n 1 <tag> == declared SHA, before anything is read
      ↓
adapter from that identity   loadAdapter(standardsDir); no path parameter exists to substitute
      ↓
schema validated             executed, not paraphrased; passing ⊆ statuses; known placeholders only
      ↓
contained entrypoint         static segments check, plus resolved-path check inside the checkout
      ↓
declared argv expanded       {target} substituted; run once; no probing
      ↓
native JSON                  parsed, or ENFORCEMENT_ERROR
      ↓
declared native status       must be in this release's own statuses, or ENFORCEMENT_ERROR
      ↓
pack-owned passing           membership of this release's own passing set, and nothing else
      ↓
native result preserved      carried verbatim under `report`; never summarised
```

Pinned identities, all three exercised through the real CLI against one target:

```text
betting           v1.0.1  e0a9fb358440cd10e2051fb50ddfcd178dbf67d1  ["validate","{target}","--json"]
mathematics       v1.0.1  f21ea832907f0f5ae70f30076c06084eb3bf8237  ["validate","--dir={target}","--json"]
machine-learning  v1.5.0  d9cffa11df68f15da9aadc6032ca49748cad5946  ["evaluate","--dir={target}","--json"]
```

Three argv shapes — one positional, two flag-embedded — three different native statuses, **one code
path with no branch on `standard.id` anywhere**. `test/authority-boundary.test.mjs` enforces that
structurally: no pack identity, no native status and no pack evidence field appears in `scripts/`.

### The vocabulary is open, not relocated

The weak version of Phase 3 would move five strings elsewhere and call the coupling removed. Proven
otherwise on vocabulary no pack uses, with **no enforcer source change**:

```text
BANANA / PINEAPPLE   passing ["PINEAPPLE"]   PINEAPPLE → exit 0 ; BANANA → exit 1
MANGO (undeclared)                           → ENFORCEMENT_ERROR, exit 4
```

And the case that cannot be passed by accident — two packs declaring the **same two words** with
opposite passing sets, in the same run:

```text
optimist     statuses ["GOOD","BAD"]  passing ["GOOD"]   → GOOD passes, BAD fails
contrarian   statuses ["GOOD","BAD"]  passing ["BAD"]    → GOOD fails, BAD passes
```

Identical state, identical native status, opposite gate decisions. Nothing infers meaning from
spelling, even for a token decided the other way moments earlier.

### The anti-vacuity specimen

The exact hostile target that exposed MachineLearningStandards `v1.4.1`:

```text
v1.4.1   COMPLIANT      scored 0 / 46 applicable   → would have PASSED
v1.5.0   NOT_EVALUATED  scored 0 / 46 applicable   → EVALUATED, passing false, exit 1
```

It fails now because the authority tells the truth, **not** because the enforcer learned to check a
counter. `scored`, `notEvaluated`, `applicable` and `denominator` are forbidden in enforcer source and
a test scans for them. The pack's evidence is still there, untouched, for a human who wants it.

### ADR 0005, all nine hostile cases, executable

| # | Attack | Result |
|---|---|---|
| 1 | forged adapter in the target inverting `passing` | ignored |
| 2 | forged adapter in the target naming a fake evaluator | ignored — genuine evaluator ran |
| 3 | adapter in the target's parent directory | ignored |
| 4 | pinned tag lacks a contract while `main` has one | fail closed, no fallback |
| 5 | contract at another tag of the same repository | cannot influence the pinned one |
| 6 | SHA disagrees with the tag | identity failure **before** any adapter load |
| 7a | entrypoint escaping the checkout | rejected |
| 7b | symlinked entrypoint pointing outside | **NOT EXERCISED — see below** |
| 8 | working tree edited after materialisation | pinned run unaffected |
| 9 | warm cache from another identity | cannot serve a different identity |

**Case 7b is skipped, not passed.** Symlink creation returns `EPERM` on this machine, so the test
reports SKIPPED rather than green. A provenance control that was never exercised must not read as one
that held — that is the same false-green shape this repository exists to refuse, and allowing it in
the provenance suite would be the worst possible place for it. The case must be run on a platform
where symlinks are available before 7b counts as evidence.

Case 6 is asserted by absence as well as by state: a failed identity produces a result carrying no
`report` and no `authority`, which is what makes "before any adapter load" checkable rather than
merely intended.

## What is not accepted

Five dependencies, each failing for its **own** reason. There is no generic unsupported-pack bucket,
because after an upstream repair the next unmet prerequisite must become visible rather than the
original label persisting.

```text
Innovation    pinned release lacks the contract
              (it exists and is correct on main; no truthful release contains it yet)

Engineering   no immutable released identity
              (no tag at all; 73 commits of active development on develop)

Health        no truthful immutable released identity
              (a version exists that its own repository cannot honestly claim)

Financial     pinned release lacks the contract
              AND the evaluator cannot yet satisfy required target semantics
              (it audits the standards repo's own policy unless --policy is passed explicitly)

Prediction    pinned release lacks the contract
              AND the evaluator publishes no authoritative native status
```

Observed behaviour today, through the real CLI:

```text
Innovation v1.0.1   ENFORCEMENT_ERROR   no standards-adapter.json at the pinned tag
Financial  v1.1.0   ENFORCEMENT_ERROR   no standards-adapter.json at the pinned tag
Engineering         no tag to pin
```

These are explicit dependency failures, not skipped successes. Each reaches `ENFORCEMENT_ERROR` with a
detail naming the missing artefact, and none reaches a passing state.

**Nothing was repaired upstream to improve this denominator.** Engineering's active development is on
its own reason enough not to mint a tag on its behalf; the others have owners and their own evidence
requirements. M2 does not get to close by making other repositories convenient.

## Reopening condition

> Resume portfolio qualification when any blocked standards authority publishes a new immutable
> release satisfying its next prerequisite.

Concrete, and it does not require anyone to remember this document: the next unmet prerequisite
becomes the reported reason on the next run.

## Standing

```text
M2  IMPLEMENTED — PORTFOLIO_BLOCKED

    architecture           accepted, three heterogeneous authorities, 163 tests
    portfolio              blocked, five dependencies, five distinct reasons
    ADR 0005               nine cases executable, one skipped for platform (7b)
    open vocabulary        proven on invented and inverted vocabularies
    anti-vacuity           the ML specimen fails without any ML knowledge in enforcer source
```

Implementation state and external dependency state are not the same claim, and this milestone closes
by saying which is which.
