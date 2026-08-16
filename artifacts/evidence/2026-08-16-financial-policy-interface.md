# The FinancialStandards policy interface, measured

**Date:** 2026-08-16
**Subject:** FinancialStandards at `3627c6f` (`main`); latest release `v1.1.0` at `0d0b271`, no later tag
**Method:** read-only inspection of the released implementation. Nothing in FinancialStandards was
modified, and no release was proposed.
**Occasion:** a blocking review question on this branch — is `{policy}` derivable from `{target}`?

---

## Why this was measured

Phase 0 recorded **finding H**: *FinancialStandards' evaluation unit may be an analysis document
rather than a repository root.* That finding is what this branch's `{policy}` placeholder was
justified by, and a reviewer asked the obvious question in the other direction: if the enforcer is
going to supply a policy path at all, can it simply derive one from the subject it is already
supplying?

The answer decides whether schema 1.1.0 needs two placeholders or one. It was measured rather than
argued.

## The three layers, kept apart

The distinction that made the answer legible is that three different kinds of fact were being quoted
as if they were one. They are separated here, and the separation is the deliverable.

### 1. Released FinancialStandards behaviour

What the shipped code does. Binding on any consumer.

| Property | Behaviour | Evidence |
|---|---|---|
| evaluation subject | one **or more** positional Markdown document/directory selections; a file is evaluated, a directory is scanned recursively for `.md`, multiple targets accumulate and deduplicate | `scripts/standards.mjs:482` usage `standards check <doc\|dir>...`; `markdownUnder` at `:55-64` |
| `--policy` | an **independent explicit path** to the governing policy document. Space-separated, two argv elements | `:507` — `else if (arg === "--policy") options.policy = argv[++i]` |
| filename restriction on `--policy` | **none.** Any path is accepted | `:167`, `:373` — the supplied value is used verbatim |
| omitted `--policy` | resolves to **`<FinancialStandards checkout>/project-policy.yml`** | `:167`, `:373` — `policyPath ?? path.join(ROOT, "project-policy.yml")`, where `ROOT` is the pack's own directory |
| documented default | *"policy to evaluate against (default: `./project-policy.yml`)"* — reads as caller-relative, is not | `:489` |
| relationship between subject and policy | **none required.** They are parsed independently and reach `commandCheck` independently | `:507` vs `:167` |

### 2. FinancialStandards repository convention

What the pack scaffolds and recognises. Real, and *not* an interface guarantee.

| Property | Convention | Evidence |
|---|---|---|
| what `init` creates | `<root>/project-policy.yml` | `scripts/init.mjs:53` |
| what counts as already-adopted | `project-policy.yml` **or** `project-policy.yaml` | `scripts/init.mjs:71` — `POLICY_MARKERS = ["project-policy.yml", "project-policy.yaml"]` |

### 3. StandardsEnforcer's responsibility

What this repository must therefore do.

```text
target != governedRoot
policyPath is established once, at the adoption/discovery boundary
the exact policyPath is passed to the authority
policy is never derived from target
--policy is never omitted
```

## What this falsifies, and what it confirms

**Falsified:** `{policy} = path.join(target, "project-policy.yml")`. Two of the released subject
forms break it outright — a document target yields `…/analysis.md/project-policy.yml`, a path below a
regular file, and a subdirectory target yields a policy that is simply not the repository's.

**Not falsified, and worth stating plainly:** this branch never implemented that derivation.
`runOfficialEvaluator` has taken the governed root as an input separate from the subject since
`f513b68`, and `test/adapter-policy-binding.test.mjs` has asserted the analysis-document case since
then. The measurement confirms the separation rather than overturning it. The reviewer's premise was
the thing that was wrong, and it is recorded here as measured-and-refuted rather than quietly dropped.

**What the measurement did change:** the policy path was still *reconstructed* at the seam, from a
single hardcoded spelling. See below.

## Finding F, strengthened

Finding F recorded that Financial resolves an absent `--policy` to its own file and reports
confidently against it. The help-text discrepancy at `:489` makes that worse than an accident of
external use:

> The CLI advertises a caller-relative default. The implementation resolves from the pack's own
> checkout. A consumer can follow the published interface, deliberately omit `--policy`, and receive a
> valid-looking verdict computed against the standards repository's own policy.

So omitting `{policy}` is not a convenience this enforcer declines to use; it is unsafe for
cross-repository enforcement, and the never-omit rule is load-bearing rather than stylistic.

## Finding H, qualified

Finding H, as written, is too strong in the opposite direction to the reviewer's premise. Neither
"the subject is a repository root" nor "the subject is an analysis document" is correct. Corrected:

> **FinancialStandards' evaluation subject is a document-or-directory analysis selection, and may be
> more than one. It is not guaranteed to be the governed repository root. A repository root is one
> valid target shape (`check .`); an individual analysis document is another (`check <doc>`).**

This narrows the evidence and leaves the implemented separation intact — the over-strong version
happened to drive the correct design, and the correction does not imply a code defect.

## The one defect the measurement did surface

`project-policy.yaml` is admitted by the authority's own adoption detection and is fully evaluable by
its `check` (no filename restriction on `--policy`). This repository recognised only `.yml`, in a
single constant used for two purposes: deciding adoption, and rebuilding the policy path at the
evaluator seam.

Split, because the two halves have different owners and different blast radii:

- **Handled on this branch.** The seam no longer reconstructs anything. `enforce()` resolves the
  policy once, proves it exists, and hands that exact value on. The invariant is now *the policy whose
  presence established adoption is the exact policy handed to the authority*, replacing an equality
  between two reconstructions that nothing kept true. `POLICY_FILE` no longer appears in
  `runOfficialEvaluator`, which is asserted structurally.
- **Filed separately as FE-21.** The adoption marker set is still narrower than the authority's, so a
  repository governed via `project-policy.yaml` is reported `NOT_ADOPTED` — and, where scope records
  it `IN_SCOPE`, actively reported as governed-but-delinquent, with the authority never invoked. That
  is an enforcement false negative and it occurs *before* the adapter is reached, so it is not this
  branch's to absorb.

The amendment on this branch is what makes FE-21 a one-site change: discovery lands at the adoption
boundary and everything downstream consumes the path unchanged. The evaluator seam never needs to
learn `.yml` from `.yaml`.

## Argv, concretely

For a governed repository:

```text
F:/Repos/RetirementPlanner/
├── project-policy.yml
└── analyses/
    └── retirement.md
```

Document-scoped:

```text
{target} = F:/Repos/RetirementPlanner/analyses/retirement.md
{policy} = F:/Repos/RetirementPlanner/project-policy.yml
```

```bash
node F:/Repos/FinancialStandards/scripts/standards.mjs check F:/Repos/RetirementPlanner/analyses/retirement.md --policy F:/Repos/RetirementPlanner/project-policy.yml --json
```

Repository-scoped, also legitimate:

```text
{target} = F:/Repos/RetirementPlanner
{policy} = F:/Repos/RetirementPlanner/project-policy.yml
```

In the second form `path.join(target, "project-policy.yml")` happens to produce the right path. That
coincidence is the whole hazard: it is a property of choosing the root as the subject, not an
invariant of FinancialStandards, and every test written against it would pass.
