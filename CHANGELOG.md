# Changelog

## Versioning, while below 1.0.0

Stated because Phase 3 exposed the ambiguity rather than resolving it: `VERSION` said `0.2.0` while
`package.json` said `0.3.0`, and nothing decided which was the release.

```text
PATCH   0.x.y → 0.x.(y+1)     compatible fixes; no public-contract break
MINOR   0.x.y → 0.(x+1).0     MAY contain breaking public-contract changes
1.0.0                         requires an explicit stability decision, not a milestone
```

While below `1.0.0` the minor position carries breaking changes. That is the ordinary pre-1.0 reading
and it is written down here so a future release cannot be argued into the patch position because the
diff looked small.

**The public contract** is the state vocabulary in `scripts/states.mjs`, the exit codes, the result
envelope, and the CLI's accepted arguments. ADR 0002 calls the state vocabulary a frozen surface
where a change is MAJOR; below `1.0.0` that class of change takes the minor position, and above it
would take the major one.

### Three versions travel independently

Do not synchronise them by habit, and do not write a test asserting they are equal.

| Version | What it names | Lifecycle |
|---|---|---|
| `VERSION` | the release | changes when anything in the public contract or behaviour ships |
| `package.json` `version` | the same release | must equal `VERSION` — they name one thing |
| `SCHEMA_VERSION` | the **result envelope** the enforcer emits | changes only when that envelope's shape changes |

`VERSION` and `package.json` genuinely share one lifecycle and a test asserts they agree.
`SCHEMA_VERSION` does not: a release may change behaviour without changing the shape of what it
prints, and a printed shape may change without a behavioural release.

**They have now drifted, which is the point.** Through `0.5.0` all three read the same number and the
table above looked like a rule nobody needed. `0.6.0` moved the release while the envelope moved to
`0.5.0`, because the envelope gained one field and that is a smaller event than the release. Reading
either number off the other is now wrong, and the paragraph that used to say "it reads `0.4.0` today"
has been replaced rather than renumbered — a version this file states as current is a claim it has to
keep true.

---

## 0.6.0 — 2026-08-20

**The governing policy is a parameter. A repository may be governed by more than one pack.**

`--policy=<path>`, and the result envelope now carries which policy was read.

Until now a target held exactly one policy, at the root, called `project-policy.yml`, and the path
was a constant rather than an input. That holds for a repository governed by one pack and fails for
one governed by several: every pack's `init` writes `project-policy.yml`, and the schemas are
mutually incompatible — MachineLearningStandards' own `policy.mjs` rejects an EngineeringStandards
policy field by field. Handing pack B the file pack A adopted is finding F's failure arriving from
the other direction, and it produces a confident verdict about the wrong document.

* **`--policy=<path>`** names the governing policy. Omitted, the default resolves exactly as before.
* **The envelope gains `policy: { path, source, digest }`.** `source` is `"explicit"` or `"default"`,
  so a deliberate default and a forgotten flag are distinguishable; `digest` is the SHA-256 of the
  bytes evaluated, because two runs can name one path and mean different content. **`SCHEMA_VERSION`
  moves `0.4.0` → `0.5.0`** for that field.
* **R1** — where the scope registry's new optional `policyPath` names the policy for a
  (repository x pack), defaulting is refused (`ENFORCEMENT_ERROR`) and a `--policy` naming anything
  else goes to a human (`SCOPE_REVIEW_REQUIRED`). Registry-scoped on purpose: the enforcer cannot
  tell which pack a target's root policy belongs to, because **no pack's policy file declares one**.
* **R2** — a pinned release declaring a pack the invocation did not ask for is
  `STANDARDS_IDENTITY_MISMATCH`, refused after the adapter loads and before anything is spawned.
* **R3** — a repository recorded in scope for **more than one** pack must name a `policyPath` on the
  disposition being asked about; without one the answer is `SCOPE_REVIEW_REQUIRED` and nothing is
  evaluated. Added on review, because R1 as first written was optional exactly where it was needed:
  it refuses to default only where a `policyPath` exists, so a multi-pack repository that recorded
  none kept the single-pack behaviour and could be evaluated through another pack's policy. The
  trigger is a **count of in-scope dispositions**, never a list of packs — `scope.mjs` may not know
  which packs exist (ADR 0001), and does not need to.

**Compatibility.** Every invocation that omits `--policy` and every registry entry without
`policyPath` behaves exactly as in `0.5.0`, with one exception: a repository recorded in scope for
two or more packs and naming no `policyPath` now requires review (R3). Nothing operational is
affected: no scope registry is committed anywhere in the portfolio yet, and the shipped example has
one in-scope pack, which names its policy. One of this repository's own fixtures did need updating —
`scope-multi-pack`'s five-pack case — and that is the requirement working, not a collision. The minor position because the CLI's accepted arguments and the result envelope are
the public contract, and both changed.

Two behaviour changes reach an existing caller, and both can only turn a verdict into a non-pass,
never the reverse, so INV-E1 is unaffected: **R2**, which previously let a mismatched release answer
— and which fires only for scope-supplied invocations, since it compares against the id the scope
lookup carries; and **R3** above.

**What R2 does not cover, stated plainly.** The check compares the id the invocation named against
the id the release declares. It is *not* a check on the policy: `--policy` naming another pack's
policy while invoking the right pack passes R2, because no policy file carries a pack identity to
compare against. R1 and R3 are what close that, from the registry side. With exactly one pack in
scope the residual is deliberate and tested (`policy-path` case 9) — there is no second policy to be
confused with, and `policy.source` lets a caller demand `"explicit"` for itself.

**Path comparison is by file, not by spelling.** R1's conflict test folds case and separators on
win32 and falls back to `realpathSync.native` when both paths resolve. `path.resolve` preserves the
drive-letter case it is handed, so `F:\Repos\...` from the registry and `f:/repos/...` from a CI
variable are one file that compared unequal — reported as a governance conflict, sent to a human, over
a drive letter. An inconclusive comparison still takes the mismatch branch, which is the fail-closed
one.

Two of this repository's own guard tests moved with it, neither weakened:
`adapter-policy-binding` now matches the ternary resolution and additionally asserts
`path.join(target, POLICY_FILE)` appears exactly once; `scope-seam-invariance`'s unusable-evaluator
fixture declares the pack the invocation asks for, so its governed case still fails on unusability
rather than earlier on identity, and a new assertion pins the two literals together.

---

## 0.5.0 — 2026-08-12

**Breaking. Scope is recorded per standards pack, and no pack is privileged in code.**

`resolveScope` read one hardcoded registry key, `entry.machineLearning`, and named
MachineLearningStandards in its own prose for every pack — including packs that were not it. The unit
of applicability is *repository × standards pack*, so a repository in scope for one standard and out
of scope for another could not be expressed at all. The EngineeringStandards adoption on 2026-08-11
had to record its `IN_SCOPE` decision in an evidence document because the registry the enforcer reads
had nowhere to put it ([FE-12](artifacts/backlog/items/FE-12.md)).

Minor, because two public-contract surfaces move: the registry format and the accepted CLI arguments.

### 1. Dispositions are filed under `standards`, keyed by the pack's own contract id

```jsonc
// was
"github:1024871": { "name": "acme/moneyball", "machineLearning": { … } }
// now
"github:1024871": { "name": "acme/moneyball", "standards": { "machine-learning": { … } } }
```

**Old entries are not silently accepted.** Reading the legacy key would require the enforcer to know
one pack's name, which is the defect. An unmigrated registry produces `SCOPE_REVIEW_REQUIRED` —
fail-safe, and visible. Migration is a registry edit.

Silence about a pack is a question, never an answer: no disposition on file is review-required, and
never inherits another pack's decision.

### 2. `--standard=<id>` is required whenever a scope registry is supplied

It joins `--scope-registry` and `--repo-id` in the all-or-nothing scope group, and the reusable
workflow gains a `standard-id` input.

**It is passed rather than read out of the pinned release's adapter, and that is deliberate.** Taking
it from the contract looks stricter — the pack naming itself — but it would put scope resolution
behind the evaluator seam, and `test/scope-seam-invariance.test.mjs` exists to assert that a reviewed
exclusion survives a release whose adapter is malformed, absent or unusable. A human decided the
standard does not govern the repository; a broken contract is not new information about that decision
and must not convert it into an error.

### 3. An evidence basis names the surface it was reviewed against

`reviewedFootprint` gains `surface`, and `detectFootprint` reports which surface it observed
(`training-evidence` — named for the evidence, not for a pack).

**Generalising scope did not generalise detection, and must not appear to.** There is one detector. A
basis naming a surface a run did not observe is **undetermined** — not fresh, not stale — and goes
back to a human. Assuming the only surface that exists must be the one a reviewer meant would be the
enforcer deciding what evidence they had in mind. A pack with no detector is not a pack whose detector
found nothing (ADR 0004).

A basis with no `surface` is refused for the same reason.

### The guard that should outlive the feature

`test/authority-boundary.test.mjs` now bans `machineLearning`, `MachineLearningStandards` and
`machine_learning` in `scripts/`, not only the canonical `machine-learning`. One pack was privileged
in code for the whole of M3 while a test asserting that could not happen sat two files away, because
neither spelling was the contract id. A prohibition that covers only the canonical spelling is a
prohibition on typing it canonically.

## 0.4.1 — 2026-08-12

**A cache marker stops standing in for identity verification.**

`materialise()` returned as soon as its completion marker existed, without re-establishing that the
cached tree was still the pinned commit. Step 3 of the identity model — *the materialised checkout is
that SHA* — therefore ran once, at population time, and never again. Every run after the first
executed whatever was at `<cacheRoot>/<sha>/` on the strength of a file recording that the directory
had been verified in the past. **That is a false green in the identity model, which is the one thing
this repository exists to prevent** ([FE-13](artifacts/backlog/items/FE-13.md)).

Patch, not minor: the public contract — state vocabulary, exit codes, result envelope, CLI arguments —
is untouched. What changed is that a guarantee already claimed is now actually enforced.

- **Every cache hit is re-verified.** `checkoutIsExactly(dir, sha)` asks whether there is a repository
  there, whether `HEAD` is the commit, and whether `git status --porcelain` is empty. The tree check
  is load-bearing: an edited file leaves `HEAD` correct and executes different code.
- **A failing entry is discarded and rebuilt**, then verified by the identical check, so repair cannot
  become a softer path than the one it replaces. The reason is returned as `repaired` rather than
  discarded — a content-addressed entry cannot go stale by itself, so a rejection always means
  something.
- **The completion marker moved out of the checkout**, `<cacheRoot>/<sha>/.enforcer-complete` →
  `<cacheRoot>/<sha>.complete`. A marker inside the tree is a file the enforcer added to the authority
  it is about to run, and it would have required a permanent exception in the clean-tree check. Old
  entries are not migrated; each fails verification once and is rebuilt.
- **Repair builds into per-process staging and renames into place**, and the filesystem mutations
  report faults instead of throwing. Deleting a rejected entry in place raced with concurrent runs
  sharing a cache root, and an exception is a third outcome this module does not have.

A materialised MachineLearningStandards entry on the development machine was found with five files
deleted from it — the defect biting outside its own fixture. No exploitation is claimed and nothing
establishes how it happened; what is established is that the previous implementation ran it anyway.

**Not closed by this release:** verification happens at materialisation, not continuously, and two
concurrent runs can still repair the same identity without a cross-process lock. Both are recorded in
[the evidence](artifacts/evidence/2026-08-12-fe13-cache-identity.md).

## 0.4.0 — 2026-08-10

**Breaking. The enforcer stops knowing what a verdict means.**

Phase 3 of M2. Two independent breaking changes, listed separately because a consumer may be affected
by either alone.

### 1. Five pack-native states leave the public `STATE` surface

`COMPLIANT`, `COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`, `NOT_EVALUATED` and
`BLOCKED_BY_INVARIANT` were enforcer states. They are not, and never were — they are
MachineLearningStandards' vocabulary, which six other packs do not share.

An authority having spoken is now one state, `EVALUATED`, which says nothing about what was said.
Whether a merge may proceed rides beside it in `passing`, decided **only** by membership of the set
the pack itself declared in `standards-adapter.json`.

```json
{ "state": "EVALUATED", "passing": false, "authority": { "standard": "machine-learning", "status": "NOT_EVALUATED" } }
```

### 2. Exit codes 2 and 3 are removed

```text
was   0 COMPLIANT   1 NON_COMPLIANT   2 NOT_EVALUATED   3 BLOCKED_BY_INVARIANT   4 not enforceable
now   0 passing     1 not passing     4 not enforceable
```

ADR 0001 does not say obtain the five words from somewhere else. It says do not know what a pack's
verdict **means** — and mapping `NOT_EVALUATED` to 2 and `BLOCKED_BY_INVARIANT` to 3 kept exactly
that meaning, in encoded form. Relocating the strings would have been cosmetic.

`1` now reads as *an authoritative evaluation completed and did not establish passing*, deliberately
**not** as *non-compliant*. A pack's `NOT_EVALUATED` lands there without this enforcer calling it a
failure. `4` is reserved exclusively for the enforcer's own inability to establish enforcement:
identity failure, missing or non-conforming contract, invocation failure, unparseable output, or a
status the pack never declared.

**What is lost, said plainly.** A caller reading only an exit status can no longer distinguish "the
standards said no" from "the standards reached no conclusion". That distinction was never this
enforcer's to draw, and it survives verbatim in the payload under `authority.status`. Only the lossy
process projection changed.

`exitCodes` was **not** added to the adapter contract to preserve the old behaviour. That would create
a second semantic projection owned by every pack, to rescue a surface derived from the original
mistake — and Phase 0 established that native exit codes are not a common abstraction: Betting exits
2 on `NOT_EVALUATED`, MachineLearning 3 on blocked, Health 4, Financial folds blocked into 1.

### The evaluator seam is contract-driven

`runOfficialEvaluator` no longer hardcodes `scripts/standards.mjs evaluate --dir=<target> --json`.
It reads the invocation from the pinned release's own contract, validates it against
`schemas/standards-adapter.schema.json`, confirms the entrypoint resolves inside the verified
checkout, substitutes `{target}`, and runs it once. There is no probing and no fallback.

`loadAdapter(standardsDir)` takes the resolved directory and derives the path itself — there is no
`adapterPath` parameter, because a mechanism for substituting another location is a mechanism that
gets used.

### Human output no longer summarises a pack's evidence

`describe()` printed the project, the score, and passed/failed/skipped counts. That is a pack's
evidence reassembled in the enforcer's voice, and MathematicsStandards reports `score: 97` with 52
rules passed beside a status of `NOT_EVALUATED`. Any line quoting that number would have been quoting
the most convincing false green available. It now reads the status and the declared passing set, with
the full native report carried verbatim beside it.

### Fixed

- `VERSION` was `0.2.0` while `package.json` was `0.3.0`. Both are `0.4.0`, and a test now asserts
  they agree.

### Migration

| If you read | Do this instead |
|---|---|
| `state === "COMPLIANT"` | `state === "EVALUATED" && passing` |
| `state === "NON_COMPLIANT"` | `state === "EVALUATED" && !passing`, then read `authority.status` |
| exit `2` or `3` | exit `1`, then read `authority.status` from the payload |
| `exit === 1` meaning non-compliant | `exit === 1` means *did not establish passing* |

### Unchanged

INV-E1, the enforcement states, `OUT_OF_SCOPE` and its recorded-decision bound, the identity model,
gate assessment, and scope resolution.
