# ADR 0006 — Gate authority is not established by required-check presence

**Status:** accepted, 2026-08-16
**Context:** EP-02 amendment. Reconciles [ADR 0003](0003-the-enforcement-root.md) with the M4 live
finding ([`ST-06`](../backlog/items/ST-06.md)) and with an external governance producer that has since
appeared — UIUXDesignStandards at `54352e9`.

> **A governance observation that establishes a required check by context name does not establish the
> authority that produced that check. `SATISFIED` for required-check presence is necessary but
> insufficient evidence for a rooted enforcement gate.**

## Context

ADR 0003 decided that a gate is a required check rather than a workflow file, and that a
requirement matched by name alone is spoofable. Its mitigation was to bind the requirement to the app
permitted to satisfy it.

M4 established live that this mitigation is **correct in form and empty in substance**: every workflow
in a repository runs as the GitHub Actions app, including one a pull request adds, so a requirement
bound to `integration_id: 15368` constrains nothing the pull request could not already do. `ST-06`
recorded `mergeable: MERGEABLE` on a pull request that had deleted the enforcement. `assessGate`
already encodes the consequence; what has not been written down is the **evidence boundary** that
follows from it, and that boundary now has a second party to observe it.

That second party is new. UIUXDesignStandards has produced a host-governance contract that reports six
controls, one of which is `main.standards_check_required`. Read casually, a `SATISFIED` there looks
like the gate question answered. It is not the same question, and the repository emitting it is itself
the illustration: its `standards` check is produced by the GitHub Actions app, required by a
repository-level ruleset with no `workflows` rule. Its own contract truthfully reports `SATISFIED`.
This enforcer must still conclude `GATE_CONFIG_INVALID`.

Both are correct. They answer different questions, and the failure mode this ADR exists to prevent is
a future adapter treating the first as an answer to the second.

## Decision

### Three propositions, and none implies the next

```text
required-check presence        a host governance fact
required-check configuration   a gate-assessment fact
required-check rooting         an authority fact
```

Each must be established from evidence adequate to it. A consumer holding only the first has not
established the second, and a consumer holding the first two has not established the third.

### Gate authority evidence must come from a source that exposes what `assessGate` evaluates

Gate authority evidence **MUST** come from an evidence source exposing the attributes `assessGate`
actually evaluates — required-check application identity, rule enforcement mode, rule source, and
workflow-root information. Those attributes **MUST NOT** be reconstructed from a coarser governance
observation, from workflow provenance, from documentation, or from the fact that a check was produced
by GitHub Actions.

The last clause is the one with teeth. Knowing that a check came from Actions is exactly the
temptation, because it is nearly always true and it *looks* like `appId`. Deriving `appId: 15368` that
way would reconstruct downstream precisely the attribute M4 proved must be observed, and would do it
in the one direction that produces a false pass.

### The composition, stated as a dataflow

```text
external governance observation
  └─ establishes: a check named "standards" is required
       │  necessary fact, not a gate verdict
       ▼
this enforcer's own host collection
  ├─ requiredChecks: context / appId / source / enforcement
  └─ workflows: rooting evidence
       │
       ▼
assessGate()
       ├─ absent requirement ────────────→ GATE_MISSING
       ├─ present, self-substitutable ───→ GATE_CONFIG_INVALID
       ├─ authority unreadable ──────────→ ENFORCEMENT_ERROR
       └─ rooted ────────────────────────→ continue enforcement assessment
```

An external `SATISFIED` is **input to** `assessGate`, never a replacement for it. It may narrow what
must be collected; it may not shorten the assessment.

### The insufficiency is itself an invariant

Given only an external governance record of the shape UIUXDesignStandards emits today —
`{id, title, required, result, evidenceRead, source}` — this enforcer **must be unable** to conclude
that a gate is rooted. An adapter that grew clever enough to infer application identity, workflow
authority, or equivalent rooting evidence from those fields must fail its tests.

This is asserted as a property of the consumer, not as a note about the producer, because the producer
is free to be coarse. Only the consumer can promise not to over-read it.

### A collection `source` is provenance, never assurance strength

External records may name where collection was attempted — `"branch-protection + rulesets"`,
`"rulesets"`. That field says where a collector looked. It carries no ordering: two named sources are
not corroboration, and one is not weakness. Any consumer preserving the field preserves it verbatim
and attaches no comparison to it.

### The personal-account boundary sits beside the requirement, not beneath it

The remedy for the M4 spoof is GitHub's `workflows` ruleset rule, which pins a repository, a path and
a commit. [`ST-07`](../backlog/items/ST-07.md) records a **measured** 422 rejecting that rule on a
personal-account repository: it is an organisation feature.

The normative consequence is *not* an exception to the rooting requirement. It explains why a
repository in that hosting context **cannot currently satisfy it**. A capability boundary is not
satisfaction, and a requirement is not weakened because a host tier cannot implement it. A repository
that cannot root its gate is a repository whose gate is not rooted.

### Bypass configuration is not a bypass event

An external control reporting that no bypass actors are configured is a **configuration fact**.
`BYPASS_USED` is a **historical event** — somebody actually bypassed enforcement — and remains
deliberately unreachable pending an audit-log source, per ADR 0003.

No external configuration observation may reach `BYPASS_USED`, and *"no bypass occurred"* may never be
inferred from an empty bypass list. An empty list says nobody is permitted to bypass today; it says
nothing about what happened, and it can be edited between the event and the reading.

### What this ADR deliberately does not decide

An external producer may carry governance evidence this enforcer has never modelled — force-push
prohibition, branch-deletion prohibition, tag immutability, bypass configuration. These are legitimate
and newly available, and the forensic pass has **not** established where they belong.

They are therefore consumed and preserved, and not yet mapped. Whether they become prerequisites of an
existing passing state, policy findings, or a versioned extension to the frozen state model is an open
design question. Filing them under `GATE_CONFIG_INVALID` because that state is nearby would be a
mapping chosen by adjacency rather than by meaning.

## Alternatives considered

**Map an external `GOVERNED` onto a passing enforcement state.** Rejected. It aggregates away the
distinction between a required check and a rooted one, which is the distinction M4 was run to find.

**Treat required-check presence as satisfying the gate when the check is known to be Actions-produced.**
Rejected — it is the M4 defect restated as a shortcut, and it fails in the permissive direction.

**Grant an exception to the rooting requirement for hosting tiers that cannot express it.** Rejected.
That converts an accessibility boundary into a pass, which is INV-E1 with extra steps.

**Extend the frozen state model now to carry the new governance dimensions.** Rejected as premature:
the states would be minted before their semantics were established, and the surface is frozen
precisely so that additions are deliberate.

**Wait for a richer producer contract before writing any of this down.** Rejected. The boundary is
established now, the temptation to over-read exists now, and an unwritten boundary is one an
implementer may cross without noticing.

## Consequences

EP-02 gains a stated evidence boundary that `assessGate` already implements but never articulated.
[`FE-04`](../backlog/items/FE-04.md) remains open and its asymmetry is unchanged — the hole is proven,
the patch is not — and this ADR does not close it; `ST-07` is still blocked on an organisation, and
still dormant rather than failed.

A repository can now be truthfully described as *governed by its own declared controls* and
*ungated by this enforcer's standard* at the same time, without either statement being softened.
UIUXDesignStandards at `54352e9` is the first real instance, which makes its post-configuration record
an **adversarial** fixture rather than a positive one: six coarse controls all `SATISFIED`, and the
correct enforcer conclusion is still `GATE_CONFIG_INVALID`.

That record cannot drive `assessGate` on its own, and should not be adapted so that it can. It
serializes no `appId`, no enforcement mode, and no workflow rooting, so those must continue to come
from this enforcer's own collection.

**No implementation follows from this ADR.** No state is added, no adapter is written, and no
mapping of the unmodelled governance dimensions is decided.
