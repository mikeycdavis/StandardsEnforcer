# Plan: stabilise and generalise the M3 applicability authority

**Date:** 2026-08-12
**Branch:** `reconciliation/m3-integration`
**Status:** authoritative — the single live forward-looking implementation plan
**Reconciles:** `m3-scope-registry` @ `7fa4fa4` and `enforcement` @ `fa0fca8`
**Integration base:** `75587b4`

> This is a **forward-looking implementation plan for work not yet begun**. It is deliberately *not*
> placed in `artifacts/project-plan-breakdown/`, which `standards init` creates empty on purpose.
> Nothing in this file is evidence of pre-existing intent, and nothing produced under it may be cited
> as evidence that the project was planned this way from the start. That distinction is the whole
> reason the reconstruction path exists.

**Supersedes** the approved "M2 applicability authority" plan
(`C:\Users\Mike\.claude\plans\graceful-zooming-fog.md`) **in full**. That document's milestone
numbering, its `states.mjs` instructions and its D3 fix are void; its digest foundation,
review-surface semantics, total ratchet and portfolio matrix survive here. The original is preserved
unedited and marked superseded, on the same principle that froze `StandardsOrchestrator` rather than
deleting it.

**Adjudication:** [2026-08-12 M3 reconciliation](../evidence/2026-08-12-m3-reconciliation.md).
Do not re-litigate a classification recorded there; bring a changed proposition back for decision.

---

## 0. What this plan is, and what it is not

**Milestone numbering is this repository's own.** M3 *is* applicability, it is implemented, and it is
documented in [ADR 0004](../adr/0004-scope-is-a-recorded-decision.md). This plan **stabilises and
generalises an M3 that exists.** Any artifact describing it as building applicability from scratch is
wrong and erases work that was done.

### Two commits, two claims — do not collapse them

```text
architectural candidate reconciled   7fa4fa4   received the proposition-by-proposition analysis
integration base                     75587b4   accepted after a narrow delta over scripts/, test/
                                               and artifacts/adr/ returned empty
```

Each future advance of the base is admitted the same way: named, shown to be non-architectural, and
recorded as a base change rather than silently substituted.

### Glossary

- **attestation** — a recorded scope decision plus the repository state it was reviewed against.
- **review surface** — the whole repository minus named, reasoned exclusions. What an attestation
  claims to have covered.
- **`contentDigest`** — sha256 over canonical git-tracked `(mode, blobSha, path)` tuples inside the
  review surface. The freshness authority.
- **`surfaceDigest`** — sha256 over the exclusion globs plus `RESOLVER_VERSION`. Changes when the
  *meaning* of the surface changes.
- **`footprintDigest`** — the existing digest over sorted signal kinds. Retained as corroborating
  evidence; **never** the freshness authority.
- **cell** — one (repository, pack) pair. ~50 × 8 ≈ 400.
- **oracle** — an authoritative standards pack, written by someone other than this repository, that
  the suite runs against. Synthetic packs prove mechanism; only an oracle proves integration.

---

## 1. Decisions this plan implements

Settled in the reconciliation record. Not reopened by implementation convenience.

**C-A · Content-derived staleness is the authority; signal-kind change is corroborating evidence.**
Three independent forcing functions — a decision is stale if **any** fires:

```text
contentDigest changed    the reviewed content is not the content now
surfaceDigest changed    the review-surface semantics changed
expires passed           mandatory on not-applicable
```

**Refined by `7df5e69`, and strengthened rather than reopened.** That implementation introduced a
third evidence disposition for a case this decision had not modelled — a `reviewedFootprint` naming
a surface the run did not observe at all. Three facts stay distinct:

```text
surface observed, matches      → current
surface observed, differs      → stale        → SCOPE_REVIEW_REQUIRED
surface not observed at all    → undetermined → SCOPE_REVIEW_REQUIRED
```

**`undetermined` is an applicability-evidence disposition, not a tenth `STATE`.** It answers a
narrower question than C-A does. The externally visible governance state stays
`SCOPE_REVIEW_REQUIRED` — same required human action — and the report preserves *why* it got there,
because "we looked and it changed" and "we could not look" send a reviewer to different work.

The content-derived resolver obeys the same rule when it is built:

> **No current digest is not equivalent to a matching digest.**

Cannot establish the reviewed surface → `undetermined`. Can establish it and the digest differs →
`stale`. This is the same inversion §1.4 makes against the packs' `if (current && current !== …)`,
arriving from the evidence side. And the signal-kind footprint does **not** become the staleness
authority by having acquired a better unknown state: tracked content over the explicit review
surface remains the decided basis, kinds remain discovery evidence.

**C-B · The governance unit is repository × pack.** Generalise `scope.mjs`'s mechanics; do not
replace them.

**C-C · The review surface is the whole repository minus reasoned exclusions.** Discovery cannot
define the surface — its false negatives are what applicability review exists to survive. Ordinary
churn inside an excluded tree does not invalidate; **a newly discovered signal inside an excluded
tree does.**

**C-D · Close the narrow D3 residue only.** Native exit-code semantics are not reconstructed. But
`passing === true` with a nonzero process exit is contradictory authority evidence.
**HOLD on this line — see §0.3. Classified, not admitted, not scheduled here.**

**H1 · D1 first.** CI can currently certify this repository without exercising a single
subject-touching test.

**H2 · D2 before the generalised work**, under FE-13's framing.

**H3 · The M2 supersession is visible.** Done — commit `0f27f5e`.

---

## 2. What is retained and protected from this plan

| Retained | Where |
|---|---|
| 0.4.0 state model | `scripts/states.mjs` |
| Pack-owned adapter contracts | `standards-adapter.json`, `scripts/contracts/` |
| Identity-verified, path-contained invocation | `scripts/identity.mjs`, `scripts/enforce.mjs` |
| Provenance / conformance machinery | `test/adapter-*.test.mjs` |
| Footprint discovery, and its incapacity to decide | `scripts/footprint.mjs` |
| Immutable repository identity, `authorisedReviewers`, external registry | `scripts/scope.mjs` |
| Reconciliation / acceptance record discipline | `artifacts/evidence/` |

**No new `STATE` member is required.** `SCOPE_REVIEW_REQUIRED`, `OUT_OF_SCOPE` and
`SCOPE_REGISTRY_INVALID` already exist and are reachable. If implementation finds itself wanting a
tenth state, that is a signal to re-examine the design — not to widen a frozen surface. The
EngineeringStandards adoption already demonstrated the discipline: with no `UNRESOLVED` state
available, the result was held in evidence rather than a state being invented for it.

---

## Phase 0 — hardening

Each lands as its own commit, classified as hardening rather than feature work.

### 0.1 · D1 — CI is green with every subject-touching test skipped

**Present state.** `F:/Repos/MachineLearningStandards` is hardcoded in `test/enforce.test.mjs:29`,
`test/gate.test.mjs:28` and `test/scope.test.mjs:32`; each derives `MLS_AVAILABLE` and attaches
`{ skip: !MLS_AVAILABLE && "..." }` to every identity, adoption, oracle, gate-root and
scope-integration test. CI runs on `ubuntu-latest`, where that path cannot exist. `npm test` exits 0.

**The fix pattern already exists here.** ADR 0005 case 7b probes symlink capability against a
throwaway file, separately from the fixture, so only a platform that *cannot* create symlinks earns a
skip; a capable platform where the fixture fails goes red. Apply that discipline to the oracle.

1. `test/oracle.mjs` resolves `ENFORCER_ORACLE_REPO`. **No default path** — unset is unset.
2. Availability is probed, not assumed: the path is a git repository and the pinned tag resolves.
3. `ENFORCER_REQUIRE_ORACLE=1` makes unavailability a **failure**. Set it in CI.
4. CI obtains a real oracle, pinned to the tag and SHA the suite asserts against.
5. A guard test: with `ENFORCER_REQUIRE_ORACLE=1` and no oracle, the suite goes **red**.

> **Open dependency, named rather than assumed.** Whether MachineLearningStandards is reachable from
> a hosted runner has not been verified. If it is not, the truthful outcome is that **CI fails
> explicitly** until an oracle is provided. Substituting synthetic packs is **not** an acceptable
> resolution: they prove mechanism, not integration.

**Acceptance criteria**

- With `ENFORCER_REQUIRE_ORACLE=1` and no oracle available, `npm test` exits **non-zero**.
- With an oracle available, the previously-skipped identity, adoption, oracle, gate-root and
  scope-integration tests **execute** and pass.
- No test file contains a hardcoded absolute path to a standards repository.
- Mutation check: unsetting `ENFORCER_ORACLE_REPO` under `ENFORCER_REQUIRE_ORACLE=1` turns the suite
  red, not green.
- Any reported test count states the environment it was produced in.

### 0.2 · D2 — a cache marker is not proof of current identity — **DONE, `31fb5ec`**

> **Completed independently and integrated, not reimplemented.** FE-13 is `COMPLETE`; the fix landed
> as `0.4.1` and was merged here at `c3cb08e`. It went beyond what this section specified: `HEAD`
> alone would have satisfied the text below, and the implementation also requires a **clean working
> tree**, because an edited file leaves `HEAD` correct while executing different code. The marker
> moved **out of the checkout** — a marker inside the tree is a file the enforcer added to the
> authority it is about to run. Repair stages to `.staging-<sha>-<pid>` and renames rather than
> deleting in place.
>
> **Left open by it, and inherited here rather than assumed closed:** verification happens at
> materialisation, not continuously; and **concurrent repair has no cross-process lock.** The second
> bears directly on [FE-15](../backlog/items/FE-15.md), whose reproduction must be re-run against
> this design — the old one was written about a mechanism that no longer exists.
>
> Also carried across: a real MachineLearningStandards cache entry on this machine was **five files
> short, and the old code executed it.** No exploitation is claimed.
>
> The text below is retained as the specification that was written before the fix existed. It is
> not a description of the fix.

Tracked as [FE-13](../backlog/items/FE-13.md), whose framing governs:

```text
weak    verify the cache once
strong  establish the requested repository identity when the checkout is consumed
```

The weak form rebuilds the same false green one layer up. **Freeze the red reproduction first**, then
design the remedy; the mechanism follows the evidence and is deliberately not chosen here.

**Threat model, corrected.** *Not* sibling repositories sharing a SHA — the same SHA denotes the same
tree wherever it is reached from. The exposure is a cache under `tmpdir`, writable by anything running
as the user, that nothing re-verifies. Provenance case 8 covers edits to the *source* repository;
case 9 covers two SHAs in one repository; **nothing covers an entry mutated after marking.**

Also: `identity.mjs:117` writes the marker via `spawnSync(node -e ...)`, whose failure mode is a
silently absent marker. Use `writeFileSync`.

**Acceptance criteria**

- A failing reproduction exists and is committed **before** any remedy.
- Three cases fail differently and are distinguishable in the result: a wrong `HEAD`; missing or
  corrupt marker metadata; a directory that exists and proves nothing about (repository, tag, SHA).
- A cache entry mutated after marking is **not served**.
- An untouched warm entry **is** served — the fix must not silently disable caching.
- ~~The marker is written with `writeFileSync`.~~ **Superseded — 2026-08-12. See below.**
- No result reports `verified: true` on the strength of a marker alone.

> **Superseded acceptance criterion — marker creation must use `writeFileSync`.**
>
> The criterion was written against the earlier threat model, in which a failed marker write could
> silently leave a state that was later trusted. FE-13 removed the assurance dependency underneath it:
> marker absence is checked (`identity.mjs:340`), a missing marker returns `ok: false`, marker presence
> gates only the warm-path shortcut and never establishes identity, and `checkoutIsExactly` remains the
> sole authority on whether an entry may be used. A failed marker write now costs work rather than
> creating false assurance.
>
> The specific API requirement is therefore **no longer necessary for correctness**. Changing it may
> still be worthwhile for cost and clarity — `spawnSync(node -e …)` starts a whole Node process per
> cache miss and discards its error — but that is outside Phase 0 assurance closure and is not a
> blocker for declaring Phase 0's local work exhausted.
>
> Recorded rather than deleted: keeping a mandatory criterion after its rationale has disappeared turns
> a historically sensible implementation choice into cargo-cult governance, and deleting the line would
> destroy the evidence that the rationale ever existed.

### 0.3 · D3 — the narrow residue

> **HOLD on this line — not admitted by the 2026-08-12 reconciliation.** What follows is imported as
> the source line's record and is **not scheduled work here**. Read it as classification, not as a
> commitment.
>
> ```text
> Source evidence   670d617 / test/exit-contradiction.test.mjs   (deliberately NOT imported)
> Property          contradictory authority evidence must remain unknown under INV-E1
> Disposition       HOLD — classified, not admitted
> Reason            the falsifier is intentionally red in cases 3 and 5; no remedy exists, and no
>                   backlog item on either line owns the property. Admitting it would make this
>                   line knowingly red for work neither line has scheduled.
> Reopening         a backlog item owns the property and authorises starting from the red falsifier
> ```
>
> The falsifier is **not softened or deleted on the source line**, where it remains useful evidence.
> Nothing below may be cited as showing D3 implemented, scheduled, or owned on this line.

**Extended to five cases — 2026-08-12.** The three below were the reconciliation's adjudication of
C-D. Two more were added before the falsifier was written, and the falsifier freezes all five.

```text
1  declared passing  && exitCode === 0     normal                   → EVALUATED, exit 0
2  declared failing  && exitCode !== 0     normal; the pack said no → EVALUATED, exit 1
3  declared passing  && exitCode !== 0     contradictory evidence   → ENFORCEMENT_ERROR
4  undeclared status && exitCode !== 0     vocabulary error FIRST   → ENFORCEMENT_ERROR
5  declared passing  && exitCode === null  completion not evidenced → ENFORCEMENT_ERROR
```

**Case 4 is about order.** Both conditions hold at once, and the vocabulary check must win: `passing`
is not computable from a status the contract never declared, so "the status contradicts the exit code"
is not a statement that run is in a position to make.

**Cases 3 and 5 stay separate in the implementation**, even though `exitCode !== 0` catches both. They
are different findings — 3 is evidence that contradicts itself, 5 is evidence that is missing — and
both must prevent a passing result while remaining distinguishable to a reader. Handle `null`
explicitly, then nonzero explicitly. The code should communicate the authority model rather than
merely produce the correct boolean.

**Acceptance criteria**

- Cases 3 and 5 produce `ENFORCEMENT_ERROR`, with details that differ from each other.
- Cases 1 and 2 are untouched and still reach `EVALUATED` — case 2 is the arm proving the fix did not
  become an exit-code interpreter.
- Case 4 still names the undeclared status, proving the new logic was not ordered ahead of the
  vocabulary check.
- No case may depend on **which** nonzero code was returned.
- `exitCodes` is **not** added to the adapter contract.
- No enforcer source names a native exit-code meaning.

---

## Phase 1 — generalise applicability

Nothing here starts before Phase 0 lands.

### 1.1 · ADR 0007 — the review surface, written before the digest

Written first so the code cannot decide the exclusion semantics by accident. It states: the surface is
the whole repository minus reasoned exclusions; `reviewedAgainst.paths` is **echo, never input**, and
an echo that disagrees with the recomputation is a hand-edit reported as `ENFORCEMENT_ERROR`, distinct
from staleness; excluded paths are excluded from content churn; and the hole, in these words — *an
excluded tree is watched for signals and for size, and is not watched for content.*

Four bounds contain it: discovery scans excluded paths and a signal there forces review regardless of
a recorded disposition; exclusions expire with the determination; every run reports each exclusion's
current match count beside its count at review time (`vendor/** — 1,204 files (3 when reviewed)`); and
`counts.exclusions` is a ratchet field. Bound 1 inherits discovery's unbounded false negatives, and
the ADR says so.

`RESOLVER_VERSION` bumps are **intentional mass invalidations**. No migration path suppresses them.

**Acceptance criteria**

- The ADR is committed **before** `digest.mjs` exists.
- It states the hole in the words above, not a paraphrase that reads as coverage.
- It records the rejected alternative — a third digest over the whole tracked inventory — and why:
  it would go stale for reasons the reviewer knows are meaningless, for *every* cell.

### 1.2 · `scripts/gitfacts.mjs` — the only place a git call for discovery lives

`git ls-files -s -z` yields `(mode, blobSha, path)` with no file I/O. CRLF-immune, which is decisive:
31 of ~50 repositories have no `.gitattributes`.

`-c safe.directory=<abs>` is passed **per invocation** — never a global config write, which mutates
the operator's machine and permanently hides the condition.

**Zero is never inferred.** Throw on non-zero status; throw on non-empty stderr; and if git returns no
files, a `readdirSync` of the repository must also be empty or throw `DISCOVERY_INCONSISTENT`.
**11 of ~50 repositories hit git's dubious-ownership fatal and return empty stdout today** — Forecast,
CrunchDAO, kaggle, Quantiacs, QuantConnect, TaxWise, GradePal, IceBox, DPTB, RiemannHypothesis,
drivendata.

**Acceptance criteria**

- No code path returns `[]` on failure. A test asserts this by construction, not by inspection.
- Empty git output over a non-empty directory produces `DISCOVERY_INCONSISTENT`, never an empty
  surface.
- No global git config is written. A test asserts the operator's config is unchanged after a run.

### 1.3 · `scripts/glob.mjs`

A deliberate subset: `**`, `*`, `?`, `[a-z]`, trailing `/`. No brace expansion, no negation.

**Acceptance criteria**

- An unsupported construct is a **hard error**, never a silent non-match.
- A glob matching nothing is distinguishable from a glob that could not be parsed.

### 1.4 · `scripts/digest.mjs`, `RESOLVER_VERSION = 1`

Enumerate via `gitfacts`; canonicalise (NFC; hard-error on `\n`, `\0`, `..`; hard-error on case-only
collisions, irreproducible across NTFS and ext4); exclude via `glob`; sort with `Buffer.compare` over
UTF-8, not `String.sort()` and not `localeCompare`; combine into a canonical LF-terminated stream and
`sha256`.

Untracked and dirty files are reported, participate in nothing, and set `reproducible: false`.
`scope propose` **refuses to emit an attestation block** for a non-reproducible or empty surface —
reviewing nothing must not be attestable. Submodules, LFS pointers and symlinks are reported as *not
covered* rather than silently digested.

**The comparison is inverted relative to the packs, deliberately.** Both
`EngineeringStandards/scripts/compliance.mjs:225-228` and
`PredictionStandards/scripts/compliance.mjs:393-398` read `if (current && current !== against.digest)`
— an uncomputable digest is falsy, so *"I could not compute it"* reads as *"it matches"*. Here:
`if (!current || current !== recorded) → stale`. **This plan does not reach into the packs to fix
theirs.** That is their defect, on their release cycle.

**Acceptance criteria**

- Determinism: touching every file leaves the digest unchanged.
- CRLF independence: the same commit under `core.autocrlf=true` and `=input` digests identically.
- A directory in `paths` cannot digest to a constant — it is an error.
- `reproducible: false` blocks attestation emission.

### 1.5 · Generalise the registry to repository × pack — **DONE, `7df5e69`. Retention, not specification.**

> **This section is superseded by the implementation it asked for.** FE-12 is `COMPLETE`; `0.5.0`
> landed and was merged here at `56e735b`. What follows is what is **retained and must not drift**,
> not what to build.
>
> **It keys better than this plan specified.** Dispositions live under **`standards.<pack id>`, keyed
> by the pack's own contract id** — not under a generic `entry.packs[<packId>]` map the enforcer
> would have had to know pack names to populate. **No legacy fallback**, deliberately: reading the
> old `machineLearning` key would require the enforcer to know one pack's name, which is the defect.
> An unmigrated registry is `SCOPE_REVIEW_REQUIRED` — fail-safe and visible, never silently
> translated.
>
> **The id comes from the invocation, not from the pinned release.** Reading `standard.id` out of the
> adapter looks stricter and broke seven scope-seam tests, among them *a reviewed exclusion survives
> a malformed adapter*. A human decided the standard does not govern this repository; a broken
> contract is not new information about that decision. Scope authority sits **outside** the evaluator
> seam and the stricter-looking design would have moved it inside.
>
> **The finding to preserve, which is worth more than the feature.** `authority-boundary.test.mjs`
> had banned pack identity in `scripts/` since M2 and passed the entire time, because its list held
> the contract id `machine-learning` while `scope.mjs` wrote `machineLearning`. One pack was
> privileged in code for the whole life of M3, two files from a test asserting that could not happen.
> **A guard that protects a literal token rather than the semantic privilege is a false green by
> representation mismatch** — found in this repository's own guardrail. The regression covering
> non-canonical spellings is retained and must not be narrowed.
>
> **Generalising scope did not generalise detection.** One detector, one surface; a pack with no
> detector is not a pack whose detector found nothing. See the `undetermined` disposition in §1.
>
> **Still outstanding, and not closed by this:** the EngineeringStandards `IN_SCOPE` decision remains
> unmigrated — `7df5e69` removed the obstacle, and recording it is a reviewer's act, not a code
> change. `--standard` is unvalidated beyond presence.

The original specification, retained for the record:

```text
entry.machineLearning  →  entry.packs[<packId>]
```

Retained unchanged: immutable identity keying, name-collision reported rather than resolved,
`authorisedReviewers`, in-tree registry refused, `standsOn` on every fresh disposition, self-asserted
dispositions reported as proposals.

Added: `excludeScope[]` with per-entry reasons, `reviewedAgainst`, and **`expires` mandatory for
`out-of-scope`**. Reviewer-chosen `expiresAt` semantics stay for `in-scope`; only the not-applicable
direction is compelled, because that is where silence is indistinguishable from oversight.

```text
registry/
  repos.json               the roster
  repos/<id>.json          one repository, all pack dispositions
  packs/<id>.pack.json     descriptors: identity triple + signals, each with a sourceRef
  baseline.json            the ratchet
```

**The migration is an intentional mass invalidation.** Existing ML entries migrate into
`packs["machine-learning"]` with their evidence basis preserved and `reviewedAgainst` **absent**,
which correctly returns every one of them to `SCOPE_REVIEW_REQUIRED` on the first run. The reviewed
state changed from *signal-kind evidence was reviewed* to *this explicit repository surface was
reviewed*, and no historical decision was ever made against a surface. **Back-filling digests nobody
reviewed would manufacture evidence** and is forbidden.

**Acceptance criteria**

- No enforcer source branches on `standard.id`. The existing structural guard is extended, not
  relaxed.
- Every migrated ML entry resolves to `SCOPE_REVIEW_REQUIRED` on the first run, and this is recorded
  as expected evidence rather than reported as a regression.
- An `out-of-scope` entry without `expires` produces `SCOPE_REVIEW_REQUIRED`.
- EngineeringStandards' disposition can leave evidence and enter the enforcement path — the concrete
  case that motivated FE-12.

### 1.6 · The ratchet

**Total, not sparse.** Every cell is enumerated including unknown ones, so a repository or pack added
to the world without a baseline edit is `ENFORCEMENT_ERROR` rather than a permissive default. A
missing or unparseable baseline is `ENFORCEMENT_ERROR`, never "nothing to compare" — deletion must be
strictly worse than editing.

**No `--write` flag, ever.** Transplanted from `PredictionStandards/scripts/integrity.mjs`, whose
comment gives the reason: the first response to a red build would be to run it.

**Acceptance criteria**

- Weakening without a baseline edit fails; with one, passes.
- A deleted baseline is worse than an edited one.
- A test greps the enforcer's own source for a baseline-writing path, in the shape of the existing
  guard at `test/enforce.test.mjs:206-223`.

### 1.7 · Discovery stays incapable, and gains one privilege

`footprint.mjs` is retained as written. `footprintDigest` is **demoted in the payload**: reported
beside `contentDigest` as corroborating evidence, never consulted for freshness.

Its one privilege: a signal landing **outside** the reviewed surface returns the cell to
`SCOPE_REVIEW_REQUIRED` regardless of a recorded disposition. That is a question about the *review
artifact*, not about the standard.

**Acceptance criteria**

- Arbitrary mutation of detection output changes no cell's state.
- A file added under an excluded glob does **not** invalidate.
- A file added under an excluded glob **that matches a signal** **does** invalidate.
- No freshness decision reads `footprintDigest`.

### 1.8 · The matrix

```bash
node scripts/scope.mjs propose --repo=<id|path> --pack=<id> [--json]
node scripts/scope.mjs verify  [--repo=] [--pack=] [--ratchet] [--as-of=] [--json]
node scripts/scope.mjs status  [--json]
node scripts/enforce.mjs portfolio [--require-reviewed] [--as-of=] [--json]
```

M1's invocation is unchanged and remains the default. **There is no `--only-signalled`** and no flag
that hides unknown cells; any such option is the back door.

**Acceptance criteria**

- ~400 cells, nearly all `SCOPE_REVIEW_REQUIRED`. **Materially fewer means cells are being hidden.**
- The first matrix is committed permanently as evidence, and the release makes the portfolio look
  **less compliant and more truthful** — the same principle as 47/52.
- No flag exists that reduces the cell count without reducing the population.

---

## 3. Implementation order

```text
D1 → D2 → D3 → ADR 0007 → gitfacts → glob → digest
   → registry generalisation → ratchet → attestation → matrix → evidence artifact
```

**D3 is HOLD on this line and is not in this order — see §0.3.** The sequence is imported as the
source line's plan; on this line D3 is classified, not scheduled, and nothing downstream of it may
treat D3 as a completed prerequisite.

ADR 0007 precedes `digest.mjs`. Each layer is mutation-tested before the next is built.

## 4. Verification

Paired-mutation discipline throughout: for each guard, construct the defect and assert the guard
fires. Every acceptance criterion above is a test, not a review note.

| Guard | Defect constructed | Required |
|---|---|---|
| D1 | oracle absent, `ENFORCER_REQUIRE_ORACLE=1` | suite red |
| D2 | cache entry mutated after marking | not served; untouched entry still served |
| D3 — **HOLD, §0.3** | `passing` true, exit nonzero | *not required on this line; classified, not scheduled* |
| Under-declaration | short `paths` echo | digest mismatch |
| Echo drift | echo ≠ recomputation, digests match | `ENFORCEMENT_ERROR`, distinct from staleness |
| Exclusion, arm 1 | file under excluded glob | does **not** invalidate |
| Exclusion, arm 2 | file under excluded glob matching a signal | **does** invalidate |
| CRLF | `core.autocrlf=true` vs `=input` | identical digest |
| Determinism | touch every file | digest unchanged |
| Dubious ownership | empty git output, non-empty directory | `DISCOVERY_INCONSISTENT` |
| Discovery | mutate detection output | no state change |
| Ratchet | weaken without / with baseline edit | fail / pass |
| Expiry | `out-of-scope` without `expires` | `SCOPE_REVIEW_REQUIRED` |

M1 regression: the exact README invocation produces a payload identical to `14f6f28`. `REACHABLE`'s
gap stays exactly `["BYPASS_USED"]`, asserted rather than relaxed.

## 5. Out of scope, deliberately

Running the other seven evaluators beyond what M2 demonstrates; CI installation; adoption automation;
runtime SDK; `GATE_MISSING`; **and the GitHub enforcement root**, which is M5's question
([ST-07](../backlog/items/ST-07.md)) and is not answered by anything here.

Answering *which standards govern this repository* does not require running any of them.

## 6. Two limits stated rather than implied

**Separation of duties does not exist.** Reviewer, reviewee, ratchet editor, `authorisedReviewers`
editor and the person who can delete the registry are one person. Every mechanism above raises the
cost of the lazy path; none closes the deliberate one. This is a memory and an alarm clock for
someone who wants to be governed, not a control over someone who does not.

**Discovery's silence is evidence of nothing.** The ~400-cell review burden is irreducible, not an
inefficiency to optimise away. Every proposal to shrink it turns out, on inspection, to be discovery
deciding applicability.
