# StandardsEnforcer

Determine which independent standards releases govern a repository, pin them by immutable identity,
run their official evaluators, and prevent a required standard from being silently absent or
bypassed.

**It contains no standards.** No rule, no detector, no applicability logic, no scoring. Each
standards repository stays authoritative for its own domain; this one decides which of them apply,
which released version, and whether a merge may proceed. [ADR 0001](artifacts/adr/0001-orchestrate-do-not-reimplement.md)
records why that boundary is enforced by a test rather than by intention.

Zero dependencies. Node 18 or later. Nothing to install.

---

## What it claims, and nothing wider

> **M1** — Given a repository and an immutable *(standards repository, release tag, commit SHA)*
> identity, StandardsEnforcer executes the official standards implementation and reports its result
> without independently recreating or reinterpreting the standards.
>
> **M2** — For a repository already adopted, it determines whether enforcement of that release is
> rooted outside changes the governed pull request controls, and produces no verdict where it is
> not.

```bash
node scripts/enforce.mjs \
  --target=F:/Repos/Numerai \
  --standards=F:/Repos/MachineLearningStandards \
  --tag=v1.4.0 \
  --sha=6bfd0789e50196da3ff666594ff5b981b8ae5763
```

## The invariant

> **INV-E1 — StandardsEnforcer must never convert an unknown, missing, unverifiable, or failed
> enforcement condition into a successful compliance result.**

This is the lesson connecting almost every defect found across MachineLearningStandards 1.0 to 1.4,
and it is structural here rather than aspirational: the passing set is closed, an unrecognised state
falls to a non-zero exit, and a test walks the whole vocabulary asserting it.

## States

| State | Meaning | Exit |
| --- | --- | --- |
| `COMPLIANT` | The standards accepted the repository | `0` |
| `COMPLIANT_WITH_EXCEPTIONS` | Accepted, with approved and current waivers | `0` |
| `NON_COMPLIANT` | The standards rejected it | `1` |
| `NOT_EVALUATED` | The standards reached no verdict | `2` |
| `BLOCKED_BY_INVARIANT` | The standards system declared itself untrustworthy here | `3` |
| `NOT_ADOPTED` | No standards version governs this repository | `4` |
| `SCOPE_REVIEW_REQUIRED` | Detection proposes this repository is in scope; a human must confirm | `4` |
| `GATE_MISSING` | Nothing requires the standards check on the governed branch | `4` |
| `GATE_CONFIG_INVALID` | Something requires it, in a way the pull request could satisfy for itself | `4` |
| `BYPASS_USED` | An authorised bypass was used; an event, never a verdict | `4` |
| `STANDARDS_IDENTITY_MISMATCH` | The declared release does not resolve to the declared commit | `4` |
| `ENFORCEMENT_ERROR` | Enforcement could not be carried out | `2` |

The first five are verdicts, passed through **with the standards system's own exit codes,
unchanged**. The rest are states about enforcement, and `4` is a code MachineLearningStandards never
returns — so a caller can tell *the standards said no* from *enforcement could not be established*.

## Identity

A version string is a claim, and a git tag is mutable. An identity here is a triple, and all three
must resolve consistently before anything runs:

```text
repository + release tag + 40-character commit SHA
        │
        ├── the tag resolves to exactly that commit
        ├── a tree is materialised at that commit, cached by SHA
        └── the materialised checkout's HEAD is that commit
```

The third check is not redundant with the first: one asks what the tag points at, the other
establishes what is about to run. The source repository is never mutated.

## What this does not do yet

Stated plainly, because an enforcer that overstates its reach is worse than none.

- **`SCOPE_REVIEW_REQUIRED` is unreachable.** It needs applicability detection and a human scope
  registry, which is M3. `BYPASS_USED` is unreachable too: GitHub exposes bypass events only through
  audit-log endpoints this enforcer cannot assume. `REACHABLE` records both and a test asserts it.
- **Therefore it still cannot detect a repository that does machine-learning work and never
  adopted.** That is the remaining bypass and the whole of M3. What M2 established is narrower and
  worth stating exactly: *for repositories already adopted, enforcement cannot silently disappear
  through an ordinary governed pull request.*
- No repository discovery, no organisation inventory, no multi-standard composition, no Azure
  DevOps. GitHub is the first adapter; every gate semantic is asserted against an injected platform
  so the second adapter changes none of them.

## Layout

```
scripts/enforce.mjs     the CLI, and the only place a standards system is invoked
scripts/identity.mjs    tag + SHA verification, and the content-addressed checkout cache
scripts/gate.mjs        what makes an enforcement root a root; platform-agnostic
scripts/platform/       adapters. GitHub today; the boundary exists for the next one
scripts/states.mjs      the state vocabulary, the exit contract, and INV-E1
test/                   the invariant, identity, adoption, and the oracle
artifacts/adr/          decisions
artifacts/evidence/     what was actually run, and what it produced
```

## Decisions

- [0001](artifacts/adr/0001-orchestrate-do-not-reimplement.md) — orchestrate the standards; never reimplement them
- [0002](artifacts/adr/0002-states-and-the-no-unknown-pass-invariant.md) — the state model, and INV-E1
- [0003](artifacts/adr/0003-the-enforcement-root.md) — the enforcement root: a required check, bound to an app, from a pinned implementation

## Evidence

- [M1 oracle](artifacts/evidence/2026-08-09-m1-oracle.md) — MachineLearningStandards `v1.4.0` against
  itself and against Numerai, with the payload-fidelity comparison
- [M2 enforcement root](artifacts/evidence/2026-08-09-m2-enforcement-root.md) — the negative and
  adversarial cases, including the spoofable-check finding
