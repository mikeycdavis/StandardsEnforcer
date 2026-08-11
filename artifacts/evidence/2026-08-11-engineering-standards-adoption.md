# EngineeringStandards adoption — what was run, and what it established

**Date:** 2026-08-11
**Repository:** StandardsEnforcer, `m3-scope-registry` @ `1433bf990e8e6dbfb0868e4198902637ba0273b6`
**Plan:** [`artifacts/plan/2026-08-11-engineering-standards-adoption.md`](../plan/2026-08-11-engineering-standards-adoption.md)
**Raw output:** [`2026-08-11-adoption-raw/`](2026-08-11-adoption-raw/) — `audit.txt`, `validate.txt`, `validate.json`

---

## Read this first

**The artifacts generated during this adoption are not evidence of pre-existing intent, and not
evidence that standards were followed.** `project-policy.yml`, `PROJECT.md`, `AGENTS.md`,
`CLAUDE.md` and `.github/copilot-instructions.md` were written by `standards init` on this date.
Agent-instruction files are contracts telling coding agents which standards apply; their presence
establishes nothing about compliance.

**This repository is adopted and assessed. It is not governed.** No organisation ruleset, no hosted
gate workflow, and no scope registry exists for it. Nothing here creates an enforcement binding.

**StandardsEnforcer has no live-validated authoritative GitHub Actions enforcement root.** M4
falsified the app-binding mitigation against a live repository; the required-workflows remedy is
dormant, not validated. This adoption does not change that.

---

## Provenance — what actually executed

| | |
|---|---|
| Standards pack | EngineeringStandards, `F:/Repos/EngineeringStandards` |
| **Executed revision** | **`2d34c99ab3e40b2bc5f1e73e73edaad467818a75`** |
| Branch | `plan/repair-release-model` (mutable) |
| Working tree at execution | clean — no uncommitted changes |
| Adopter-declared version | `standardVersion: "2.0.0"` in `project-policy.yml` |
| Release identity | **none — `git tag` is empty in EngineeringStandards** |
| Invocation | explicit path: `node F:/Repos/EngineeringStandards/scripts/standards.mjs …` |

The full 40-character SHA is recorded because an abbreviation is not an identity. **This is a record
of what ran. It is explicitly not a release identity**, and it must not be used as one.

**Why the invocation used an explicit path.** Six packs in this portfolio declare the identical
`bin` name `standards` — EngineeringStandards, MachineLearningStandards, BettingStandards,
FinancialStandards, InnovationStandards, and HealthAndFitnessAndNutritionStandards. (Mathematics uses
`math-standards`, UIUX `uiux-standards`, Prediction `predictions`.) A PATH-resolved `standards` would
be ambiguous about which authority spoke.

### The pack moved twice during this session

Recorded rather than smoothed over. Observed sequence:

```text
062a1776133bb672132a43a823cebcfaca0086e5   first observation; tree DIRTY (3 files)
e5f9135ab79d8a0210f1025767a36d5cd98d4427   "Terminal semantics, so section 08 cannot become a permanent blocker"
2d34c99ab3e40b2bc5f1e73e73edaad467818a75   "Approve testing.no-fabricated-results, and name what the approval excludes"
```

Before invoking, the executable surface was audited read-only and found **unchanged**:
`git diff --stat e5f9135..HEAD -- scripts rules schemas templates standards` was empty, and both
commits touched only EngineeringStandards' own `artifacts/`. The tree was clean at execution time.

The revision was pinned before the run and re-verified after; both reads returned
`2d34c99ab3e40b2bc5f1e73e73edaad467818a75` with a clean tree. At the first observation the tree was
dirty, which would have made **no** truthful provenance record possible — a commit SHA plus
uncommitted modifications is not any commit. That it later became clean is why this record can be
made at all.

---

## The two-stage binding

Two separate facts, deliberately not collapsed:

```text
Applicability:     EngineeringStandards governs StandardsEnforcer.        → IN_SCOPE
Release identity:  engineering@2.0.0 has no resolvable immutable release. → UNRESOLVED
                   reason: no v2.0.0 tag exists
```

**Both are held here, in evidence, outside the enforcement identity contract**, because neither can
be represented inside it:

- `scripts/scope.mjs:144` reads a hardcoded `entry.machineLearning` key. There is no way to record an
  `engineering` disposition in the registry the enforcer reads.
- `scripts/states.mjs` has no `UNRESOLVED` state. The nearest, `STANDARDS_IDENTITY_MISMATCH`, means a
  tag resolving to the *wrong* commit — not a release that does not exist.

Neither file was modified. No synthetic `(repository, tag, sha)` triple was constructed, no tag was
created in EngineeringStandards, and no SHA-only special case was added. The absence of the tag is
the correct enforcement state.

**Reopening condition, owned by EngineeringStandards:**

```text
refs/tags/v2.0.0 exists in the authoritative EngineeringStandards remote
AND dereferences to a 40-hex commit
AND that commit is the release commit approved by EngineeringStandards' own release gate
```

---

## What was run

### 1. `standards init` — exit 0

```text
Mode: reconstruction-required [INFERRED]
      implementation markers: package.json
      no plan or original prompt found

created:
  + project-policy.yml
  + PROJECT.md
  + AGENTS.md
  + CLAUDE.md
  + .github/copilot-instructions.md
  + artifacts/project-plan-breakdown/
preserved:
  = artifacts/adr/
```

The created set matched the dry-run prediction **exactly**; no unpredicted file appeared. Verified
after the run: `git diff --stat artifacts/adr artifacts/evidence artifacts/backlog` empty — the five
ADRs, fourteen prior evidence files and twenty-four backlog items untouched.

`artifacts/project-plan-breakdown/` was created **empty on purpose** and **remains empty**. `init`'s
own words: *"scaffolding template sections over existing code is a fabricated history,
indistinguishable from a real plan later."*

**One adopter-owned observation.** The generated `project-policy.yml` carried the template's literal
`project: "REPLACE-ME"`. `init` copies templates verbatim — it performs no substitution — and the
template states it is *"a starting point, not a default to leave untouched."* This is therefore an
adopter task, **not a pack defect**. It was set to `"StandardsEnforcer"`, a factual declaration. Of
the five generated files, only `project-policy.yml` contained a placeholder.

**Every rule level was left exactly as the template declares it.** No level was lowered, no
applicability declared, and no exception written, so that `validate` would report against the
strictest reading rather than one adjusted in advance.

### 2. `standards audit` — exit 0, evidence survey, no verdict

```text
102 file(s) scanned, 3 finding(s).
0 error(s), 1 warning(s), 2 informational.
```

- **[warning]** `artifacts/project-plan-breakdown/` exists but has no `00-overview.md`
- **[info, OBSERVED]** an architecture document exists and is authoritative — `docs/architecture.md`
- **[info, INFERRED]** 1 CLI entry point (`standards-enforce`), 1 npm script

Audit's own caveat, preserved: *"a clean run means nothing matched the patterns — not that the
repository is compliant."*

### 3. `standards validate` — exit 1, the authoritative evaluation

Quoted, not restated:

```text
Status: NON_COMPLIANT
Score:  91%  (required-level rules that were evaluated: 11)
Rules:  17 passed, 1 failed, 0 warning(s), 32 skipped
Cover:  18 automated, 0 manual-review, 32 not-evaluated

Failing:
  planning.breakdown-directory [required]
    artifacts/project-plan-breakdown/ exists but has no 00-overview.md.

Unestablished prohibitions — nobody looked for these:  (19 rules)
```

Envelope: `schemaVersion: 1.0`, `denominator: {total: 50, applicable: 50, scored: 11}`,
`frameworkCoverage: {cataloguedRules: 50, evaluatedRules: 18, standards: 53, standardsWithRules: 23,
fullyMachineRepresentedStandards: 6}`.

**The exit code is a coarse control-flow signal.** The semantic state is `status: NON_COMPLIANT`,
read from the payload. Exit `1` is not itself the verdict and must not be quoted as one.

**The 91% is not a compliance measure.** It is a summary statistic over the 11 evaluated
required-level rules, out of 50 catalogued. 32 rules were not evaluated at all, and a skipped rule is
neither a pass nor a failure. The score is recorded because the tool emitted it, not because it means
the repository is 91% compliant.

**19 prohibitions are unestablished** — "nobody looked for these". Per Standard 45 R6, a forbidden
rule is satisfied only by the absence of a violation, so a rule nothing has examined has established
nothing. This is the same negative-evidence discipline this repository applies to its own detector in
`scripts/footprint.mjs`, arriving from the other direction.

---

## Findings, and who owns them

| Finding | Owner | Disposition |
|---|---|---|
| `planning.breakdown-directory` fails: no `00-overview.md` | **EngineeringStandards** | **Not fixed.** Native finding preserved verbatim. **No StandardsEnforcer-owned remediation has been inferred from it** — see the tension below |
| `project: "REPLACE-ME"` in the generated policy | StandardsEnforcer-as-adopter | Fixed — set to the true value |
| EngineeringStandards has no immutable release | **EngineeringStandards** | Recorded with a reopening condition. **Not** a StandardsEnforcer backlog item |
| 19 unestablished prohibitions | shared | Recorded. Resolving them requires evaluation, human attestation, or a reasoned not-applicable — none of which may be manufactured |

### The reconstruction tension, stated rather than resolved

The single failing rule puts two messages from the same framework in direct conflict:

```text
init     → artifacts/project-plan-breakdown/ is created EMPTY on purpose.
           "Do NOT author a plan as though this project were starting now."
           Next: run the project-reconstruction skill (Standard 44).

validate → planning.breakdown-directory [required] FAILS because it is empty.
           Remedy offered: "Run /plan-structure and /plan-handoff, writing each
           top-level section to its own file under artifacts/project-plan-breakdown/."
```

A repository on the reconstruction-required path therefore fails `validate` by construction until
reconstruction runs. That may well be intended — *reconstruction-required* is not a compliant state —
but the remedy text points at `/plan-structure` and `/plan-handoff` rather than at Standard 44's
reconstruction skill, which is the path `init` itself directs the operator to.

**The directory was left empty.** Populating it would produce exactly the fabricated history `init`
warns against, and would be weakening the record to obtain a green result. `/plan-structure` and
`/plan-handoff` were both run during this adoption, and their outputs were deliberately written to
`artifacts/plan/` — not to `artifacts/project-plan-breakdown/` — for that reason.

**This finding is owned by EngineeringStandards, not by StandardsEnforcer.** It is not a
StandardsEnforcer defect merely because StandardsEnforcer happened to be the target that surfaced it.
What the run established is a tension *inside the EngineeringStandards adoption flow*: the
reconstruction path deliberately creates the directory empty and forbids treating generated
scaffolding as historical planning evidence, while `planning.breakdown-directory` requires the
directory to be populated and names the two commands that would populate it.

Consequently:

- The native finding is **preserved exactly as issued**. It is not suppressed, reworded, or reclassified.
- **No StandardsEnforcer-owned remediation has been inferred from it.** No backlog item was created
  for it, no adopter-side workaround was applied, no exception was written, and the directory was not
  populated.
- This repository takes no position on how EngineeringStandards should resolve it. Recording the
  observation is the whole of the action taken here.

### The predicted collision that did not occur

The plan anticipated `scm.no-generated-artifacts` firing against the committed `docs/*.svg`, and
pre-drafted a narrow adopter-side exception. **The rule did not fire.** No exception was written. An
exception appearing because a plan predicted one would be an unapproved waiver for a finding that
never happened.

---

## Integrity checks

| Check | Result |
|---|---|
| `npm test` before and after | **162 passed, 1 skipped**, exit 0, unchanged |
| `git diff --stat scripts/ test/` | empty — no enforcer behaviour changed |
| `VERSION` / `package.json` | `0.4.0` / `0.4.0` |
| Dependencies | none; `dependencies` and `devDependencies` both absent |
| `artifacts/adr`, `artifacts/evidence`, `artifacts/backlog` | untouched by `init` |
| `artifacts/project-plan-breakdown/` | exists, empty |
| Pack revision, pre- and post-run | `2d34c99…`, identical, clean tree both reads |

The skipped test is not incidental: it is an authoritative-oracle test requiring
`F:/Repos/MachineLearningStandards` on disk. **A skipped authoritative test is not a passing one**,
and this count must not be reported as "all tests passed".

---

## Result, reported on separate axes

```text
1. EngineeringStandards compliance verdict
   NON_COMPLIANT — status read from the payload, not from exit 1
   1 required rule failed; 17 passed; 32 not evaluated; 19 prohibitions unestablished

2. StandardsEnforcer governance verdict
   INDETERMINATE
   Evidence surface: Git-host enforcement state not assessed in this adoption
   This does not mean UNGOVERNED.

3. Evidence completeness
   Partial, and partial by design. 18 of 50 catalogued rules evaluated;
   0 manual-review; audit coverage pattern-based and language-agnostic.

4. Framework / version identity
   Declared 2.0.0 · executed 2d34c99ab3e40b2bc5f1e73e73edaad467818a75
   on the mutable branch plan/repair-release-model
   Release identity: UNRESOLVED — no v2.0.0 tag exists

5. CI execution evidence
   None. No enforcement workflow was installed and none ran.

6. Required-check / branch-protection evidence
   None. Not queried; no Git-host state was inspected.

7. Remaining gaps, by owner
   EngineeringStandards  — no immutable v2.0.0 release (reopening condition above)
   EngineeringStandards  — validate's remedy text conflicts with init's reconstruction directive
   StandardsEnforcer     — F13, the checkout cache does not re-verify on a hit (false-green path)
   StandardsEnforcer     — F4, scope is hardcoded to one pack
   StandardsEnforcer     — F5–F8, adapter-fidelity limitations
   shared                — 19 unestablished prohibitions
```

### What this establishes, and what it does not

**Establishes:** EngineeringStandards was invoked from an identified revision against this repository,
and reported `NON_COMPLIANT` with one failing required rule. The adoption artifacts exist. The
enforcer's own behaviour is unchanged.

**Does not establish:** that this repository is governed; that any check is required anywhere; that
enforcement could not be bypassed; that the 32 not-evaluated rules are satisfied; that the 19
unestablished prohibitions are not violated; or that `2.0.0` names a real release.

A non-compliant, indeterminate, unresolved result is the truthful outcome of this adoption. It was
not adjusted toward green, and no finding was closed by weakening a rule, editing another repository,
or fabricating a record.
