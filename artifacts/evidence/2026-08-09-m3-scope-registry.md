# M3 — who decided that these standards govern this repository?

**Date:** 2026-08-09 · **Enforcer:** `0.3.0` · **Milestone question:** can a repository be
ungoverned without anyone deciding it should be?

M2 closed the bypass available to an adopted repository. This closes the one available to a
repository that never adopted — and closes it without pretending an ML detector can tell which
repositories those are.

The success criterion, stated before implementation and held to: **not** that detection is accurate,
but that uncertainty about scope is an explicit governed state rather than a silent bypass.

## The shape of the answer

```text
                repository assessed
                         │
                         ▼
        detection observes evidence  ─── decides nothing, ever
                         │
                         ▼
             registry, held externally
              /          │          \
       no entry     entry, stale     entry, fresh, authorised
     unauthorised   no basis          /              \
       expired      malformed    in-scope         out-of-scope
            \          /             │                 │
             ▼        ▼              ▼                 ▼
        SCOPE_REVIEW_REQUIRED    evaluate /        merge, nothing
              exit 4             NOT_ADOPTED        evaluated
                                                     exit 0
```

Every edge into a non-blocking outcome passes through a named authorised reviewer. Every other edge
goes to exit 4.

## Detection: what it sees, what it calls it, where it stops

| Fixture | Kinds observed |
| --- | --- |
| sklearn training, `src/train.py` + pinned manifest | `training-framework-import`, `training-call-shape`, `training-framework-dependency` |
| PyTorch/YOLO, zero sklearn vocabulary | `training-framework-import` |
| ML terminology in README, comments and string literals only | *(none)* |
| Hosted-inference client, trains nothing | `inference-client` |
| numpy / pandas / scipy, including a bare `.fit(` | *(none)* |
| LightGBM behind `pipeline_step_7.py` | `training-framework-import` |
| An in-house framework nobody has heard of | *(none — a miss, reported as one)* |

Three of those rows are the design rather than the coverage. A README naming PyTorch is a mention,
not a use, and the code view strips comments and blanks string literals before any import is
matched — the discipline MachineLearningStandards spent 1.0 through 1.2 establishing. Calling a
hosted model is its own signal kind and never a training signal, because collapsing the two would
manufacture the exact false positive a human reviewer exists to catch. Statistics is not machine
learning, so numpy, pandas and scipy are deliberately absent from the framework list, and a
training-shaped call only counts in a file that already imports a training framework.

The last row is the honest one. `acmenet.Session().optimise()` is invisible, and the test asserts the
miss and asserts that `assurance: "partial"` and the note travel with the result. The detector's own
words, in the payload:

> Evidence found can contradict a recorded scope decision; evidence not found establishes nothing
> about whether this repository does machine-learning work.

## Detection cannot decide, structurally

There is no code path from a detection result to a disposition. `resolveScope` reads dispositions
only out of registry entries; the footprint is consulted for exactly one purpose, which is deciding
whether the evidence basis a reviewer recorded still describes the repository.

Asserted rather than asserted-about: every shape of detection result — nothing, a full training
footprint, an inference client — driven through an empty registry, with the set of outcomes
collected and required to be exactly `{review-required}`.

## Silence never renews a decision

A fresh disposition carries a `standsOn` sentence, and the wording is the finding:

```text
It stands on the review recorded by j.okafor@acme.example on 2026-08-09. Automated detection did
not confirm this decision; it only failed to contradict it, and its coverage is partial.
```

This is the 1.2 negative-evidence lesson one level out. The decision holds on the reviewer's
authority. Detection going quiet is not a renewal, and the output is not permitted to imply that it
is by staying quiet itself.

Staleness follows from that. It is a change in the *kinds* of evidence, not the passage of time — no
arbitrary expiry, because a review that fires for no reason stops being a review. The digest covers
the sorted set of signal kinds and not file contents, so:

| Change | Effect |
| --- | --- |
| More files, more of the same evidence | digest unchanged — no churn |
| Excluded repository gains training code | `SCOPE_REVIEW_REQUIRED`, `gained: [training-framework-import]` |
| Included repository's ML disappears | `SCOPE_REVIEW_REQUIRED`, `lost: [...]` |
| Decision records no evidence basis | `SCOPE_REVIEW_REQUIRED` — a decision that cannot go stale cannot be trusted to be fresh |

Note the direction of the third row. An in-scope decision is not silently dropped because the code
vanished; a human decides whether the repository left the population or merely moved its training
elsewhere.

## The adversarial case: a repository tries to declare itself ungoverned

The M2 test held a required check outside the tree and rewrote the tree. This one holds the
disposition outside the tree and does the same thing.

```text
declare out-of-scope in project-policy.yml            disposition unmoved
add a .standards-scope.yml of its own                 disposition unmoved
commit a registry naming itself excluded              disposition unmoved
add itself to an AUTHORISED_REVIEWERS file            disposition unmoved
claim a different identity in a metadata file         disposition unmoved
hide the training code behind a neutral filename      disposition unmoved
delete the training code entirely                     SCOPE_REVIEW_REQUIRED, exit 4
```

The last row is the one worth reading twice, and it is the counterpart of M2's. **Deleting the
training code is not a route to being ungoverned** — it is a question for a human, because the
detector cannot tell "we stopped doing ML" from "we moved it" from "we renamed the import".

Two negative cases carry the socially realistic bypass:

- A registry located **inside** the repository it governs is refused outright
  (`SCOPE_REGISTRY_INVALID`). A repository that can edit its own scope file decides whether it is
  governed, which is the same defect as a gate that is a file in the tree it gates.
- A disposition recorded by somebody who is not in `authorisedReviewers` is reported as
  `selfAsserted` and produces `SCOPE_REVIEW_REQUIRED`: *a proposal to be excluded is not an
  exclusion.* Self-declaration is legitimate input and is preserved in the payload; it is not
  authority.

Entries are keyed by immutable platform identity. An entry whose `name` matches while the identity
does not is a reported collision, never a match — a renamed, transferred or recreated repository must
not inherit a decision made about a different one.

## What M3 changed about the states

`SCOPE_REVIEW_REQUIRED` is reachable. `OUT_OF_SCOPE` and `SCOPE_REGISTRY_INVALID` are new.
`BYPASS_USED` is now the only declared-unreachable state.

`NOT_ADOPTED` gained a stronger reading. Before M3 it could only mean *no policy file here*; with a
confirmed in-scope disposition it means *the authoritative registry says this repository is governed,
and adoption is absent*, carries `governed: true`, and is legitimately blocking. Both remain exit 4
and both are reported in their own words, because they are different findings with different owners.

**`PASSING` widened from two members to three** — the only widening in the enforcer's history, and
the thing most worth scrutinising in this milestone. `OUT_OF_SCOPE` exits 0 because the alternative
is that every legitimately excluded repository fails its required check forever, and a control that
is always red for good reasons gets routed around.

The M2 guard asserting the passing set fired on this change. It was **relocked, not loosened**: the
enumeration is still exact, and a second clause is now the bound —

> every member of `PASSING` is either a standards verdict or listed in `REQUIRES_RECORDED_DECISION`.

`REQUIRES_RECORDED_DECISION` contains `OUT_OF_SCOPE` alone, and `result()` demotes any such state to
`SCOPE_REVIEW_REQUIRED` if the decision record lacks a reviewer, a date or a reason — checked at the
single point every result is constructed, so no future branch can reach the passing set through an
absence. INV-E1 is untouched: an exclusion nobody recorded is an unknown, and unknowns still cannot
pass.

`OUT_OF_SCOPE` is also excluded from `VERDICT_STATES`, and its rendering says so in words:

```text
  These standards do not govern this repository, by recorded human decision.
  Nothing was evaluated. This is an exclusion, not a pass.
```

## Scope authority is not enforcement authority

`authoritative` still means one thing and one thing only: the enforcement root verified. Nothing in
`scope.mjs` reads the gate. A strong root makes the check unavoidable; it does not make a partial
detector more certain, and letting scope inherit gate authority would be precisely that inference.
The two are separate blocks in the payload and in the rendered output.

## What M3 does not establish

- **Nothing about how complete the governed population is.** The registry answers *what was decided
  about this repository*. Enumerating the organisation's repositories, and noticing one that has
  never been assessed at all, is discovery and is not built.
- **Nothing about reviewer identity beyond a configured list.** `authorisedReviewers` is the narrow
  trust source this milestone needs. Real human-attestation identity — review provenance, CODEOWNERS,
  approvals — remains where ADR 0003 left it, with its own adversarial tests owed.
- **Nothing verified against a live GitHub organisation.** Unchanged from M2 and deliberately not
  buried by M3: the adapter's `integration_id`/`app_id` semantics are written from documented
  responses and have never met a real ruleset. It remains the weakest link in the system and the
  prerequisite for calling any of this production-ready. M3 adds no live coverage.
- **Nothing about bypass events.** `BYPASS_USED` still has no data source.

58 tests, all passing.
