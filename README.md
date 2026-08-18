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
> not. **This claim is not currently established for GitHub Actions.** The mitigation it rested on
> was falsified by live evidence; see
> [the supersession record](artifacts/evidence/2026-08-10-m2-superseded.md). There is **no
> live-validated authoritative GitHub enforcement root for GitHub Actions** today.
>
> **M3** — Every repository in the governed population has an explicit scope disposition, and the
> absence or staleness of that disposition is visible. Automated detection may require review; it
> cannot make the disposition.

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

**Every state here is about enforcement. None of them is a standards verdict**, and that is the whole
point of the 0.4.0 rewrite. Until 0.3.0 this table listed five pack-native statuses — `COMPLIANT`,
`COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`, `NOT_EVALUATED`, `BLOCKED_BY_INVARIANT` — as enforcer
states, and mapped them to exit codes. [ADR 0001](artifacts/adr/0001-orchestrate-do-not-reimplement.md)
does not merely say those strings should come from somewhere else; it says the enforcer must not know
what a pack's verdict **means**. Mapping `NOT_EVALUATED` to `2` kept exactly that meaning in encoded
form, so the semantics had to go, not just the strings.

| State | Meaning | Exit |
| --- | --- | --- |
| `EVALUATED` | An authority was identified, invoked, and returned a status **its own contract declares**. Says nothing about what was said. | `0` or `1` — see below |
| `OUT_OF_SCOPE` | An authorised reviewer recorded that these standards do not govern this repository | `0` |
| `NOT_ADOPTED` | No standards version governs this repository — blocking once scope confirms it does | `4` |
| `SCOPE_REVIEW_REQUIRED` | The scope disposition is absent, unauthorised, or no longer matches the evidence | `4` |
| `SCOPE_REGISTRY_INVALID` | The scope registry is missing, malformed, or inside the repository it governs | `4` |
| `GATE_MISSING` | Nothing requires the standards check on the governed branch | `4` |
| `GATE_CONFIG_INVALID` | Something requires it, in a way the pull request could satisfy for itself | `4` |
| `BYPASS_USED` | An authorised bypass was used; an event, never a verdict | `4` |
| `STANDARDS_IDENTITY_MISMATCH` | The declared release does not resolve to the declared commit | `4` |
| `ENFORCEMENT_ERROR` | Enforcement could not be carried out | `4` |

Whether a merge may proceed rides **beside** `EVALUATED` as `passing`, decided by the pack's own
declared set — never by this repository recognising a word. The process projection is three codes:

```text
0   the authority spoke and established passing
1   the authority spoke and did not establish passing
4   the authority could not be established, heard, or trusted
```

`1` reads as *"an authoritative evaluation completed and did not establish passing"*, **not** as
"non-compliant". A pack's `NOT_EVALUATED` lands there without this enforcer claiming it means failure
— only that the pack did not put it in its passing set.

**What is lost, said plainly:** a caller reading only the exit code can no longer tell "the standards
said no" from "the standards reached no conclusion". That distinction was never the enforcer's to
draw, and it survives verbatim in the payload under `authority.status`. Only the lossy projection
changed. `4` remains a code MachineLearningStandards never returns.

This table is not maintained by hand alone: `test/front-door.test.mjs` derives the state names and
their exit codes from [`scripts/states.mjs`](scripts/states.mjs) and fails when this page disagrees.

`OUT_OF_SCOPE` is the one non-verdict a merge may proceed on, and it is bounded rather than trusted:
it is producible only alongside a named authorised reviewer, a date and a reason, `result()` demotes
it to `SCOPE_REVIEW_REQUIRED` without them, and a test asserts that every passing state is either a
standards verdict or a recorded decision. An exclusion nobody recorded is an unknown, and INV-E1
still forbids an unknown from passing.

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

## Scope

Whether these standards govern a repository is a decision somebody made, not a thing a detector
found. Both halves of that are enforced.

```text
detection  →  evidence only. There is no code path from a detector result to a disposition,
              and a test drives every shape of result through an empty registry to prove it.

registry   →  held OUTSIDE the governed repository. One inside the tree it governs is refused.
              Keyed by immutable platform identity, never by name. Dispositions count only
              from a named authorised reviewer, with a date, a reason and an evidence basis.

staleness  →  a change in the KINDS of ML evidence relative to what was reviewed. Not a timer:
              a review that fires for no reason stops being a review.
```

The asymmetry is the point, and it is the negative-evidence lesson from MachineLearningStandards 1.2
applied one level out: **evidence found can contradict a recorded decision; evidence not found can
never confirm one.** Every fresh disposition says so in the payload rather than letting silence read
as confirmation.

    M2: the target cannot control whether its gate exists.
    M3: the target cannot control whether it is governed.

Scope authority is deliberately not enforcement authority. `authoritative` means the enforcement root
verified and nothing else — a strong root makes the check unavoidable, it does not make a partial
detector more certain.

See [`artifacts/scope-registry.example.json`](artifacts/scope-registry.example.json), and get an
entry's evidence basis with:

```bash
node scripts/footprint.mjs <dir>
```

## What this does not do yet

Stated plainly, because an enforcer that overstates its reach is worse than none.

- **Nothing here has met a live GitHub organisation.** The adapter's `integration_id`/`app_id`
  semantics are written from documented responses and have never been exercised against a real
  ruleset. This is the weakest link in the system and the prerequisite for calling it
  production-ready; M2 named it and M3 did not discharge it.
- **No repository discovery.** The registry answers what was decided about a repository it is asked
  about. Enumerating an organisation and noticing one that was never assessed at all is a different
  problem and is not built.
- **No reviewer identity beyond a configured list.** `authorisedReviewers` is the narrow trust source
  scope needs. Real human-attestation identity — review provenance, CODEOWNERS, approvals — is a
  separate claim and deserves its own adversarial tests rather than a ride on these.
- **`BYPASS_USED` is unreachable**, and is now the only such state. GitHub exposes bypass events only
  through audit-log endpoints this enforcer cannot assume; the semantic is settled in ADR 0003 and
  the state is not produced until the data can be read. `REACHABLE` records the gap and a test
  asserts it.
- No multi-standard composition, no Azure DevOps. GitHub is the first adapter; every gate semantic is
  asserted against an injected platform so the second adapter changes none of them.

## Layout

```
scripts/enforce.mjs     the CLI, and the only place a standards system is invoked
scripts/identity.mjs    tag + SHA verification, and the content-addressed checkout cache
scripts/gate.mjs        what makes an enforcement root a root; platform-agnostic
scripts/scope.mjs       who decided this repository is governed, and whether that still holds
scripts/footprint.mjs   ML evidence detection. Deliberately incapable of deciding anything
scripts/platform/       adapters. GitHub today; the boundary exists for the next one
scripts/states.mjs      the state vocabulary, the exit contract, and INV-E1
test/                   the invariant, identity, adoption, the oracle, the gate, and scope
test-support/           helpers node --test must NOT collect: the oracle resolver, the symlink
                        capability probe, and the single-materialisation runner the concurrency
                        arms drive. A file under test/ with no tests in it counts as a passing
                        test, which is how a vacuous green got into a count here once
ci/checks.sh            the authoritative CI check list; local Docker and GitHub both run it
ci/verify.mjs           the submission gate: does this evidence authorise pushing this commit?
scripts/ci.*            run the complete pipeline locally, in Docker
scripts/submit-pr.*     verify, then push exactly the verified commit, then open the PR
artifacts/adr/          decisions
artifacts/plan/         the live forward-looking plan; see AGENTS.md §5
artifacts/evidence/     what was actually run, and what it produced
artifacts/backlog/      tracked work. README.md there is written by hand and CHECKED against
                        items/ by scripts/backlog.mjs — it is not generated, and it no longer
                        claims to be
```

## Local CI

The complete pipeline runs in Docker before anything is pushed, and a pull request may only be
submitted if the exact commit SHA being pushed passed it:

```
.\scripts\ci.ps1          # or ./scripts/ci.sh — run the checks, change nothing
.\scripts\submit-pr.ps1   # or ./scripts/submit-pr.sh — verify, push that SHA, open the PR
```

GitHub remains source control, pull requests and review. GitHub-hosted Actions are not required to
establish that a branch passes, and a local result is never reported as a GitHub Actions result.
See [docs/local-ci.md](docs/local-ci.md).

## Decisions

- [0001](artifacts/adr/0001-orchestrate-do-not-reimplement.md) — orchestrate the standards; never reimplement them
- [0002](artifacts/adr/0002-states-and-the-no-unknown-pass-invariant.md) — the state model, and INV-E1
- [0003](artifacts/adr/0003-the-enforcement-root.md) — the enforcement root: a required check, bound to an app, from a pinned implementation — **mitigation superseded by live evidence**
- [0004](artifacts/adr/0004-scope-is-a-recorded-decision.md) — scope is a recorded decision, not a detection
- [0005](artifacts/adr/0005-adapter-provenance.md) — the adapter is read from the identity-verified release, and nowhere else
- [0006](artifacts/adr/0006-the-cache-is-shared-and-coordination-is-not-authority.md) — the cache is shared on purpose; coordination decides who may write, verification decides what may run
- [0009](artifacts/adr/0009-gate-authority-is-not-required-check-presence.md) — a required check by name is necessary but insufficient evidence of a rooted gate; authority must be observed, never inferred

## Evidence

- [M1 oracle](artifacts/evidence/2026-08-09-m1-oracle.md) — MachineLearningStandards `v1.4.0` against
  itself and against Numerai, with the payload-fidelity comparison
- [M2 enforcement root](artifacts/evidence/2026-08-09-m2-enforcement-root.md) — the negative and
  adversarial cases, including the spoofable-check finding.
  **Its central mitigation has been falsified — read it with
  [the supersession record](artifacts/evidence/2026-08-10-m2-superseded.md).**
- [M2 superseded](artifacts/evidence/2026-08-10-m2-superseded.md) — what M2 no longer establishes,
  on the evidence of M4, and what survives because it never depended on the app binding
- [M3 scope registry](artifacts/evidence/2026-08-09-m3-scope-registry.md) — the detection fixtures,
  the staleness model, and a repository trying to declare itself ungoverned
- [M3 reconciled](artifacts/evidence/2026-08-12-m3-reconciliation.md) — an approved plan classified
  against the implementation that already existed, and the four conflicts adjudicated
