# Adoption plan: EngineeringStandards 2.0.0

**Date:** 2026-08-11
**Branch:** `m3-scope-registry` @ `1433bf990e8e6dbfb0868e4198902637ba0273b6`
**Status:** approved, executing

> This is a **forward-looking adoption plan for work being done now**. It is deliberately *not*
> placed in `artifacts/project-plan-breakdown/`, which `standards init` creates empty on purpose.
> Nothing in this file, and nothing generated during this adoption, is evidence of pre-existing
> intent. That distinction is the whole reason the reconstruction path exists.

Adoption of an existing repository — **not a redesign**. ADR 0001 governs: EngineeringStandards is
consumed as an authoritative pack, never reimplemented here. `scripts/` and `test/` are untouched.

---

## The two decisions

### D1 — Two-stage binding. EngineeringStandards is IN_SCOPE but UNRESOLVED.

Applicability and release identity are **two separate facts** and stay separate:

```text
Applicability:     EngineeringStandards governs StandardsEnforcer.        → IN_SCOPE
Release identity:  engineering@2.0.0 has no resolvable immutable release. → UNRESOLVED
                   reason: no v2.0.0 tag exists
```

The absence of the tag is **the correct enforcement state, not an obstacle to work around.** The
identity model is not weakened to accommodate it. A standards authority without a truthful immutable
release remains a *dependency*, and dependencies are not skipped successes.

Do **not** bind to: `VERSION` alone (a declaration, not an identity); `develop` or
`plan/repair-release-model` (mutable); a commit plus a synthetic tag (satisfies the schema while lying
about release state); or a SHA-only special case (weakens the supply-chain property precisely for the
pack being onboarded).

**Do not create the tag.** It must follow EngineeringStandards' own release gate; `VERSION: 2.0.0` is
a release-candidate declaration. Later, the binding is `(repository, v2.0.0, git rev-parse v2.0.0^{})`
— the **dereferenced commit**, never the annotated tag object's SHA.

Running `standards init/audit/validate` by hand is the pack's own evaluator invoked directly. That is
adoption and assessment — **not** enforcement, and it creates no enforcement binding.

### D2 — Keep the SVGs; if `scm.no-generated-artifacts` fires, propose a narrow adopter-side exception via the pack's own mechanism.

```text
EngineeringStandards owns:  the rule, its meaning, its level, its exception semantics
StandardsEnforcer-as-adopter owns:  whether it applies here, the justification, the evidence
```

Do **not**: mark it `not-applicable` (generated artifacts plainly exist, so "no subject here" is
false); delete the SVGs to make `validate` green; invent a local waiver format; or silently drop the
finding. If the rule is `recommended` and warns, **preserve the warning**. If ES does not permit the
exception, record the collision and weaken nothing locally.

---

## Findings (read-only, 2026-08-11)

| # | Finding | Where |
|---|---|---|
| F1 | `init --dry-run` infers **reconstruction-required** and creates `artifacts/project-plan-breakdown/` **empty on purpose** | dry-run |
| F2 | **EngineeringStandards has no git tags.** Default branch `develop`; adoption ran against `plan/repair-release-model` | `F:/Repos/EngineeringStandards` |
| F3 | Therefore no `(repo, tag, 40-hex SHA)` identity exists — D1's UNRESOLVED, not a defect to route around | `scripts/identity.mjs:47` |
| F4 | `scope.mjs` reads a **hardcoded `entry.machineLearning` key** and names MachineLearningStandards in prose. **No `engineering` disposition can be recorded** | `scripts/scope.mjs:138,144` |
| F5 | The conformance baseline `CONFORMING` is a **hardcoded copy** of Betting's declaration inside the test — an adapter whose test restates the adapter is not independently verified | `test/adapter-conformance.test.mjs:34-52` |
| F6 | The heterogeneity test is **schema-only** — it mutates Betting into an ML shape and calls `validateAdapter`; it never invokes either pack | `test/adapter-conformance.test.mjs:65-74` |
| F7 | Separate-target topology **is** exercised (`target: dir`), but with **one** pack; the M1 oracle uses `target: MLS` — target and standards checkout are the same where cross-checkout behaviour is the subject | `test/enforce.test.mjs:199,216` vs `237,281` |
| F8 | All invocation tests gate on `MLS_AVAILABLE`. A skipped authoritative test is not a passing one; never compress `162 passed, 1 skipped` into "all tests passed" | `test/enforce.test.mjs:35` |
| F9 | Live worktrees: `StandardsEnforcer-enforcement` on `enforcement` @ `fa0fca8`; EngineeringStandards has three | `git worktree list` |
| F10 | `main` is **17 commits behind** `m3-scope-registry` | `git rev-list` |
| F11 | **No `UNRESOLVED` state exists in `STATE`.** Nearest is `STANDARDS_IDENTITY_MISMATCH`, which means a tag resolving to the *wrong* commit — not a release that does not exist. Also no `GOVERNED`/`UNGOVERNED`/`INDETERMINATE`/`UNDECIDED` | `scripts/states.mjs:48-64` |
| F12 | ES `exceptions[]` is `additionalProperties: false` — exactly `rule`, `reason`, `approvedBy`, `approvedAt`, `expires?`, `reference?`. No `scope`/`invariant`/`revisitWhen` fields | ES `schemas/project-policy.schema.json` |
| F13 | **The checkout cache does not re-verify on a hit.** `materialise` returns as soon as `.enforcer-complete` exists, without re-running `git rev-parse HEAD` — and `DEFAULT_CACHE` is under `tmpdir()`. Cached verification is not permanent verification | `scripts/identity.mjs:96`, `scripts/enforce.mjs:51` |
| F14 | **Six packs expose the identical bin name `standards`** (Engineering, MachineLearning, Betting, Financial, Innovation, Health); Mathematics `math-standards`, UIUX `uiux-standards`, Prediction `predictions` | `*/package.json` `bin` |
| F15 | **FE-07, FE-08, FE-10 were explicitly seeded from README prose** — each says *"Seeded from the README's What this does not do yet."* | `artifacts/backlog/items/FE-0{7,8,10}.md` |
| F16 | **EngineeringStandards moved during this session** — `062a177` → `e5f9135` — with three files uncommitted (`artifacts/project-plan-breakdown/`×2 and its own `project-policy.yml`). Its **executable surface** (`scripts/`, `rules/`, `schemas/`, `templates/`, `standards/`) was verified clean, and `standards.mjs:101` reads the target's policy via `--dir`, not its own | audit, 2026-08-11 |

F5–F8 are live adapter-fidelity limitations. **F11 and F4 together mean D1's record has nowhere to
live inside the enforcement path** — the correct outcome, not a blocker: it goes in evidence, outside
the identity contract, and no code changes.

---

## Conflicts — adjudicated by the owner, 2026-08-11

**C1 — README-seeded backlog items (F15). RESOLVED: keep FE-07, FE-08, FE-10.**
Distinguishes **origin** from **current authority**. README prose must not manufacture backlog
obligations — but these items exist as deliberate records with their own rationale (EP-05: *"so that a
future reader can tell an acknowledged gap from an unnoticed one"*). Deleting them would rewrite
historical decision evidence.

```text
README statement
    ↓ historical input that caused a decision
backlog item created
    ↓
backlog item is now the authoritative record

README changes later  ≠  automatically open/close/change the item
```

Their README references are **provenance only, never current liveness evidence**. The rule is
**prospective**: do not seed *new* items from README reach statements. See I14.

**C2 — exit-code collapse. RESOLVED in favour of the shipped 0.4.0 design.**
Sharing exit `1` between `NON_COMPLIANT` and `NOT_EVALUATED` is acceptable **provided** the semantic
state stays explicit in `authority.status` and no caller derives meaning from the exit code alone:

```text
process exit code = coarse control-flow signal
authority.status  = semantic enforcement state
```

`NOT_EVALUATED → exit 1` is **not** a collapse into `NON_COMPLIANT`. It becomes a defect only if a
downstream consumer reads `1` and labels it non-compliant. See I1.

---

## Invariants

- **I1 — Never manufacture certainty, in either direction.** Not a pass from uncertainty, not a
  failure from uncertainty. Absence is never upgraded into a positive conclusion. INV-E1 stands.
  **Consumer-side (C2):** no report, script, or summary may read exit `1` and label it
  *non-compliant*; the semantic state is read from `authority.status`.
- **I2 — No fabricated adoption history, and generated scaffolding is not adopter evidence.**
  Nothing `init` writes — including `CLAUDE.md`, `AGENTS.md`, `PROJECT.md`,
  `.github/copilot-instructions.md` — is evidence that standards were followed.
  `artifacts/project-plan-breakdown/` stays empty. Absence of a pre-adoption proposal is never a bypass.
- **I3 — `artifacts/backlog/` is the sole authoritative liveness surface.**
- **I4 — Nothing is weakened to make a run green.**
- **I5 — A limitation is not a backlog item**, and **prerequisites owned by another repository never
  become StandardsEnforcer backlog items** — they are recorded with owner, blocking state, evidence,
  and a mechanical reopening condition. Nor do mechanically-reopening environment conditions.
- **I6 — Repository safety.** Stage explicit paths; never `git add -A`. Re-read `git status`/`git log`
  before any commit. If foreign commits or files appear, stop and audit read-only. Never rewrite
  foreign history. Touch no other repository's worktree.
- **I7 — Evidence before implementation, and before abstraction.** finding → evidence → decision →
  implementation. State the guarantee and construct a falsifier before any mechanism.
- **I8 — No pack semantics enter the enforcer.** `git diff --stat scripts/ test/` stays empty.
  `VERSION` = `package.json` = `0.4.0`. No dependencies added.
- **I9 — Governance and compliance are separate axes.** `GOVERNED` + `NON_COMPLIANT` is valid.
  Repository *content* and Git-host *state* are separate evidence surfaces. Executed-red and
  infrastructure-red are distinct. **`INDETERMINATE` is never reported bare**: it carries the
  unassessed evidence surface and the explicit statement that it does not mean `UNGOVERNED`.
- **I10 — Never invoke a pack through a PATH-resolved binary name (F14).** Explicit paths only.
- **I11 — No composition, and no synthetic score.**
- **I12 — Attestations are human evidence.** `approvedBy` is never the agent.
- **I13 — Report skips explicitly.** Always "162 passed, 1 skipped", with the qualification.
- **I14 — README provenance is not liveness (C1).**
- **I15 — No exception is written without human approval (D2).** The agent prepares a draft and stops.

---

## Evidence routing

| Finding class | Owner |
|---|---|
| Pack mechanism defect | EngineeringStandards |
| Adopter convention / configuration | StandardsEnforcer-as-adopter |
| Cross-pack invocation / schema / orchestration | StandardsEnforcer-as-enforcer |

Do not compensate in the wrong layer. Where they apply, preserve all three facts simultaneously: the
pack produced a finding; the adopter has evidence it may be a framework defect; the raw finding is
unedited.

---

## Reporting format

Reported separately, never collapsed:

1. EngineeringStandards compliance verdict
2. StandardsEnforcer governance verdict
3. Evidence completeness
4. Framework/version identity (declared vs executed)
5. CI execution evidence
6. Required-check / branch-protection evidence
7. Remaining gaps and their owning repository

### The expected outcome, which is allowed to look bad

```text
EngineeringStandards applicability:    IN_SCOPE
EngineeringStandards release identity: UNRESOLVED
Native compliance:                     whatever validate actually reports
Governance:                            INDETERMINATE
Evidence surface:                      Git-host enforcement state not assessed
This does not mean:                    UNGOVERNED
Enforcement binding:                   none
Known owned false-green path:          F13, surfaced rather than hidden
```

That is a stronger result than forcing the adoption to end green.

---

## Open question carried

**Q1 — representing UNRESOLVED (F11), pack-specific scope (F4), and cache re-verification (F13).**
All three are design changes this adoption deliberately does not make. F13 is the most consequential:
a verified false-green path in the identity model, with a concrete falsifier available — corrupt a
cached checkout after its marker is written and require the next run to reject it. That is a statement
about a *future* release, not about this adoption, but it should be booked deliberately rather than
noticed later.

*(C1 and C2 are adjudicated above and are no longer open.)*
