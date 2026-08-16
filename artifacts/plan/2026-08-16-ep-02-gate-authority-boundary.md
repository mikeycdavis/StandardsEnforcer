# EP-02 amendment — the gate authority boundary, 2026-08-16

Design only. **No implementation follows from this document**, and none should begin until it is
internally coherent and its open questions are answered. Written for a reader with none of the
originating session's context.

**Repository:** `F:/Repos/StandardsEnforcer`
**Branch:** `design/ep-02-gate-authority-boundary`, off `main` @ `3eeb65b`
**Normative output:** [ADR 0006](../adr/0006-gate-authority-is-not-required-check-presence.md)
**Not implemented on:** `m3-scope-registry`. That branch carries active M3 scope-registry work; this
is EP-02, and appending to it would mix two epics in one history.

---

## 1. What prompted this

An external host-governance producer now exists. UIUXDesignStandards at `54352e9` emits a contract of
six declared controls with a derived aggregate, plus two real observations of the same repository
before and after a genuine host configuration change.

That producer is useful and its arrival exposed a boundary this repository had implemented but never
stated: **required-check presence is not gate authority.** ADR 0006 states it.

## 2. Reconciliation with FE-04, ST-06, ST-07

| Item | Status | What this amendment changes |
| --- | --- | --- |
| [FE-03](../backlog/items/FE-03.md) | COMPLETE | Nothing. Its mitigation is still recorded as superseded by M4. |
| [FE-04](../backlog/items/FE-04.md) | IN_PROGRESS | Nothing about its asymmetry. The hole is proven, the patch is not. This does not close it. |
| [ST-06](../backlog/items/ST-06.md) | COMPLETE | Its live finding becomes the reason for a stated evidence rule, not only for `assessGate`'s behaviour. |
| [ST-07](../backlog/items/ST-07.md) | BLOCKED | Nothing. Still dormant rather than failed, still blocked on an organisation. |

The one substantive addition is that ST-06's finding now has a **consumer-side** consequence.
Previously it constrained how this enforcer assesses a gate. It now also constrains what this enforcer
may accept from anyone else's governance evidence.

ST-07's measured 422 gains a second role. It was a record of why an experiment cannot run; it is now
also the explanation of why a personal-account repository **cannot currently satisfy** the rooting
requirement. Its epistemic character is unchanged and must stay unchanged: an accessibility boundary,
never evidence against the remedy, and never satisfaction.

## 3. The two-source composition, without inventing an adapter

Deliberately specified as a dataflow rather than as a module, because naming a module invites someone
to write it before the open questions below are answered.

```text
external governance observation          this enforcer's host collection
  id / required / result                   requiredChecks:
  evidenceRead / source                      context, appId, source, enforcement
                                           workflows:
  establishes:                               path, sha
    a check named X is required
                                     ┌───────────────┘
       │ necessary, not sufficient   │
       └──────────────┬──────────────┘
                      ▼
                 assessGate()
                      ├─ GATE_MISSING
                      ├─ GATE_CONFIG_INVALID
                      ├─ ENFORCEMENT_ERROR
                      └─ rooted → continue
```

Two properties of this composition are load-bearing:

1. **The right-hand column is never populated from the left.** The external record carries no
   `appId`, no enforcement mode, and no workflow rooting, and must not be adapted so that it appears
   to. If it ever does carry them, that is a producer-contract revision with its own identity, not an
   inference.
2. **An external `SATISFIED` may narrow what must be collected. It may not shorten the assessment.**
   The gate verdict comes from `assessGate` in every case.

## 4. The insufficiency as an invariant

The most valuable thing the external record gives this repository is a **negative** assertion:

> Given only a governance record of the shape UIUXDesignStandards emits today, StandardsEnforcer must
> be unable to conclude that the gate is rooted.

An adapter that grows clever enough to infer application identity or workflow authority from those six
control results must fail. That is a property of the consumer, asserted on the consumer's side —
the producer is entitled to be coarse.

This makes the post-configuration record an **adversarial fixture**, which is a stronger test than the
positive one originally expected: six controls all `SATISFIED`, and the correct conclusion is still
`GATE_CONFIG_INVALID`. A synthetic happy-path fixture would have proved only that an adapter parses.

Note the record cannot drive `assessGate` at all, and this is not a defect to be fixed. The raw
platform shapes continue to come from this enforcer's own collection.

## 5. Deliberately not decided

- **Where force-push prohibition, branch-deletion prohibition, tag immutability, and bypass
  configuration belong.** Genuinely new evidence, genuinely unmodelled. Consumed and preserved, not
  mapped. Options are: prerequisites of an existing passing state; policy findings; or a versioned
  extension to the frozen surface. Nothing establishes which yet, and filing them under
  `GATE_CONFIG_INVALID` for proximity would be a mapping chosen by adjacency.
- **Whether any new public state is needed.** None is added here. The surface is frozen and additions
  are breaking.
- **Whether an external `UNGOVERNED` decomposes cleanly.** This enforcer already distinguishes
  `GATE_MISSING`, `GATE_CONFIG_INVALID`, `NOT_ADOPTED` and `SCOPE_REVIEW_REQUIRED`, where the external
  contract aggregates. The decomposition is not obviously total, and guessing it is how a state gets
  minted for a case that already had a home.

## 6. Producer-side correction, recorded for the other repository

Not actionable here, recorded so the dependency is visible. UIUXDesignStandards should **not** redefine
`main.standards_check_required` into the stronger proposition — that would change the meaning of
historical evidence. A distinct control is the clean model:

```text
main.standards_check_required   SATISFIED     GitHub requires the "standards" context
main.standards_gate_rooted      ABSENT        and nothing roots it against self-substitution
```

Adding a required control deliberately changes that contract's required-control set and therefore its
digest, which is what the digest is for. Under such a contract that repository would cease to classify
itself as governed — uncomfortable, and correct.

## 7. Open questions, to be answered before implementation

1. Do the four unmodelled governance dimensions map onto the frozen surface, or is a versioned
   extension required? Answering this needs at least one repository where they differ from each other.
2. Does an external governance observation change what this enforcer must collect, or only what it may
   skip collecting when it agrees? The second is safe; the first is a dependency on an external
   producer's freshness and is not obviously acceptable.
3. What is the freshness contract for an external governance record? Host facts change with no commit,
   so a record has an age, and this repository has no rule yet for how old is too old.
4. Should the adversarial fixture live here or be referenced from the producing repository? Copying it
   makes it stale silently; referencing it makes this suite depend on another checkout, which
   [FE-14](../backlog/items/FE-14.md) already shows produces environment-dependent results.

## 8. What was done, and not done

Read: `scripts/states.mjs`, `scripts/gate.mjs`, `scripts/contracts/`, `FE-03`, `FE-04`, `IN-01`,
`ST-06`, `ST-07`, `ADR 0003`, `ADR 0005`.

Not done: no code changed, no state added, no adapter written, no backlog item filed, no mapping
decided, and nothing touched on `m3-scope-registry` or on
[PR #2](https://github.com/mikeycdavis/StandardsEnforcer/pull/2) (`feature/adapter-contract-1.1.0` @
`47f5eec`), whose schema-capability subject is unrelated to this and must not be broadened by it.
`enforcer-m4-governed` PR #1 remains the preserved artefact and not a merge candidate.
