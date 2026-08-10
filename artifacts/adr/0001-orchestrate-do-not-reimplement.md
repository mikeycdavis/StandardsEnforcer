# 0001 — Orchestrate the standards; never reimplement them

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

Several independent standards repositories are being built, each authoritative for its own domain
and none depending on the others. What is missing is the layer that decides which of them govern a
given repository, pins the version, runs their official evaluators, and prevents a required standard
from being silently absent.

The obvious failure mode for that layer is that it slowly becomes a second implementation. It starts
by summarising a verdict, then by deciding what a status means, then by having an opinion about
whether a project is really non-compliant — and at that point there are two systems answering the
same question, one of which has four releases of adoption evidence behind it and one of which has
none.

## Decision

**StandardsEnforcer contains no rule, no detector, no applicability logic and no scoring.**

It verifies an identity, decides whether a repository has adopted, invokes the official evaluator
out of a verified checkout, and passes the verdict through unaltered. The evaluator's JSON is
carried verbatim under `report`; anything the enforcer adds sits beside it, never inside it.

Where the enforcer must interpret, the interpretation is about **enforcement** and never about a
standard:

| Legitimate here | Belongs to the standards system |
| --- | --- |
| Did the declared identity resolve? | Does this rule apply? |
| Has this repository adopted? | What evidence satisfies it? |
| Did the evaluator run? | Is this project compliant? |
| May a merge proceed? | What does this standard mean? |

**Verdict states carry the standards system's own exit codes, unchanged** — `0`, `1`, `2`, `3`.
Re-deriving them would be reinterpretation at the level a caller actually reads. `4` is the
enforcer's own and is returned only for states no standards system produces.

## Enforced structurally

A test greps the enforcer's own source for score assignments, rule identifiers and domain
vocabulary. It is blunt on purpose: the moment this repository can decide a compliance question by
itself, it has become a standards system with none of the review behind it.

**The test earned its place immediately.** The first draft of the one-line summary read
`report.status === "BLOCKED_BY_INVARIANT" || report.score === null ? "not computed" : ...` — which
restates the MachineLearningStandards rule *blocked means unscored* in a place where it would go
stale the moment that rule changed. Reading `report.score` and saying what is there needs no opinion
about why it is null. The guard caught it on the first run.

## Alternatives considered

**Import the standards implementation as a library.** Rejected. A module import binds to whatever is
on disk, and the identity that matters is a released commit. Spawning the CLI out of a verified
checkout makes the boundary a process boundary, which cannot be crossed by accident.

**Vendor the evaluator.** Rejected outright. A copied evaluator is a second definition that will
drift, and both copies would look authoritative — the same argument the standards repositories make
about copying their documents.

**Normalise every standards system's output into one enforcer-native shape.** Deferred, and
probably permanently. A normalised summary is a second definition of the verdict. Composition across
several standards systems needs a way to say "all of these passed"; it does not need a common
verdict format, and inventing one would put the enforcer in the business of deciding what each
system meant.

## Consequences

The enforcer is small and will stay small. Most of its future growth is in discovery, identity,
platform adapters and reporting — none of which requires knowing what a standard says.

It also cannot answer questions the standards system cannot answer. If a rule rests on human
judgement, the enforcer's verdict rests on it too, and no amount of orchestration converts that into
a mechanical result. That limit is inherited on purpose.
