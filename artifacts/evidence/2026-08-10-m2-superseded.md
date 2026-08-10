# M2's enforcement-root conclusion, superseded

**Date:** 2026-08-10 · **Supersedes the conclusion of:**
[M2 — the enforcement root](2026-08-09-m2-enforcement-root.md) at `2dae58e` ·
**On the evidence of:** [M4 — the enforcement root, against GitHub itself](2026-08-10-m4-live-github.md)

M2's evidence record is **not amended**. It is an accurate account of what was believed and what had
been demonstrated when it was written, and rewriting it would destroy the more interesting artefact,
which is the chain: careful adversarial reasoning found a real hole, proposed a plausible mitigation,
and a live experiment falsified the mitigation.

This record states what is no longer established.

## The claim that does not hold

M2 concluded:

> For repositories already adopted, enforcement cannot silently disappear through an ordinary
> governed pull request.

**That was not established by M2's tests, and M4's live evidence contradicts it for the GitHub
Actions case.** M2 asserted it against an injected platform, which can only demonstrate that the
enforcer's *model* is internally consistent. Whether the model described GitHub was the open question
M2 itself named as its weakest link.

## What went wrong, precisely

M2 reasoned:

```text
required context
+ GitHub Actions integration_id
= the pull request cannot impersonate enforcement
```

M4 observed:

```text
trusted workflow  ──┐
                    ├── both run as GitHub Actions, app 15368
malicious workflow ─┘
                         │
              same required context satisfied
                         │
                 MERGEABLE / CLEAN
```

The error is one word wide and worth naming exactly: **`integration_id` is the identity of the app
that produced the check, not the identity of the enforcement implementation.** For GitHub Actions
those are not the same thing, because every workflow in the repository — including one the pull
request adds — runs as that single app. A binding to it partitions nothing.

M2's underlying instinct was right. A requirement must be tied to something the pull request cannot
forge. It tied it to something the pull request *can* be.

## What survives from M2

Not everything. The following are unaffected, because they never depended on the app binding:

- **A gate is a required check, not a workflow file.** A workflow the repository owns, that nobody
  requires, is not enforcement.
- **A name-only requirement is spoofable.** Confirmed live in M4 case 3.
- **An unpinned trusted-workflow reference is not a root**, and is refused before the platform is
  asked. Confirmed live in M4 case 4.
- **An unknown is never an absence.** A platform that cannot answer produces `GATE_CONFIG_INVALID`.
- **`GATE_MISSING` behaves as modelled.** Confirmed live in M4 case 2.
- **A bypass is an event, not a verdict.**

What does not survive is the conclusion built on top of them.

## Current status of the load-bearing claim

```text
Confirmed defect          GitHub Actions app binding does not establish an
                          external enforcement root.

Candidate remediation     Organisation-level required-workflow rules, which bind a
                          repository, a path and a commit rather than an output name.

Remediation assurance     NOT live validated. The rule was rejected with HTTP 422 on a
                          personal account; it is an organisation feature.
```

The candidate is not promoted to a solution. Three things are established and no more: the previous
mechanism is exploitable, GitHub exposes a mechanism shaped like the needed one, and that mechanism
could not be exercised under the experiment available. Calling that "GitHub enforcement solved" from
documentation would be the identical move that produced this record.

## The honest one-line status

> **StandardsEnforcer currently has no live-validated authoritative GitHub enforcement root for
> GitHub Actions.**

M1 established delegation. M3 established scope-registry semantics. M2 is simulated design evidence
whose central mitigation has been falsified, and M4 is a successful experiment whose result is
negative. A negative result recorded plainly is what this architecture was built to be able to
produce; it is not a failed milestone.

## What that means for sequencing

Composition and routing are not the next main line. The open question is prior to both:

> Can GitHub provide an enforcement root that an ordinary governed pull request cannot replace?

M5 is that experiment: an organisation required-workflow rule pinning the trusted implementation by
repository, path and commit, against the exact pull request that defeated M2 — deleting the
legitimate invocation and emitting a check of the same name.

If the merge stays blocked, there is empirical evidence for a real GitHub root. If it does not, the
answer is not a more elaborate description of status checks; the architecture needs a different root.
