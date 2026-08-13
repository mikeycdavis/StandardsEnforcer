# 0008 — The cell identity key, and why the ratchet is total

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Project owner
- **Milestone:** Phase 1, C-B + C-D. Written **before** `population.mjs`, `ratchet.mjs` and
  `matrix.mjs` exist, for the same reason [ADR 0007](0007-the-review-surface-is-the-whole-repository.md)
  was written before `digest.mjs`: the implementation must be judged against this document rather than
  allowed to decide what a *cell* is by accident.

## Context

[ADR 0007](0007-the-review-surface-is-the-whole-repository.md) established what it means for **one**
applicability determination to be current. It says nothing about which determinations ought to exist.
A repository nobody registered, or a standards pack nobody registered, has no cell at all — and a
cell that does not exist cannot be stale, cannot be reviewed, and cannot fail. That is the last
remaining shape of the bypass this milestone exists to close: **not "declare it out of scope", but
"never appear in the population".**

Making the population total requires answering a question the enforcer has so far been able to avoid:
**what identifies a cell?** Until now the answer leaked in from the invocation. `--repo-id` is
supplied by the caller, `--standard` is supplied by the caller, and
[FE-12](../backlog/items/FE-12.md) closed noting the residue in as many words: *"`--standard` is
unvalidated beyond presence — a typo and a genuinely unreviewed pack look the same from the outcome
alone."*

That residue is harmless while cells are resolved one at a time on request. It is **not** harmless
once a population is enumerated and ratcheted, because a misspelling then does something new: it
makes one cell vanish and a different, unreviewed one appear, with no governance event anywhere.
`machine-learning` becomes `machinelearning` and the ratchet is satisfied that a registered pack is
present, having compared a string to itself.

## Decision, part 1 — the cell identity key

> **A cell is keyed by *immutable repository identity* × *authoritative pack contract identity*.
> Neither component may be a display name, a directory name, a remote URL, or a registry spelling.**

```text
cellKey = repoId  ␀  contractId

repoId      an immutable platform identity, opaque to this enforcer      (unchanged from ADR 0004)
contractId  the `standard.id` the pack declares in its own adapter contract
```

Both halves already had a rule; only one of them was enforced.

**The repository half is unchanged.** ADR 0004 settled it: `acme/moneyball` can be renamed,
transferred, deleted and recreated by somebody else, so a decision that follows a name follows
whoever holds the name today. The enforcer treats `repoId` as opaque and never parses it.

**The pack half is new, and it is the point of this section.** A registry may not invent a pack. It
may only **register** one, by transcribing the identity that pack declares about itself:

```jsonc
"standards": {
  "machine-learning": {                       // the map key
    "contract": {
      "id": "machine-learning",               // MUST equal the map key
      "sourceRef": "MachineLearningStandards@v1.4.0:standards-adapter.json",
      "tag": "v1.4.0",
      "sha": "6bfd0789e50196da3ff666594ff5b981b8ae5763"
    }
  }
}
```

Three properties follow, and each is a refusal rather than a convention:

1. **The map key must equal `contract.id`.** A registry that files a pack under a spelling the pack
   does not use is `SCOPE_REGISTRY_INVALID`, not silently accepted and not silently corrected. This
   is the defence against registry spelling becoming identity.
2. **An invocation naming a pack that is not registered is refused**, and refused *differently* from
   a registered pack with no disposition. A typo is a configuration error; an unreviewed pack is a
   governance gap. FE-12's residue closes here.
3. **`sourceRef` records where the identity was transcribed from**, so a wrong transcription is a
   findable act rather than an anonymous string. It is a provenance note, not a live lookup.

### The tension with FE-12, adjudicated rather than quietly resolved

FE-12 closed on the finding that reading `standard.id` **out of the pinned release** looked stricter
and was wrong: it broke seven arms of `scope-seam-invariance.test.mjs`, among them *a reviewed
exclusion survives a malformed adapter*. **A human decided the standard does not govern this
repository; a broken contract is not new information about that decision.** Scope authority sits
outside the evaluator seam, and the stricter-looking design moved it inside.

That finding is retained in full, and this ADR does not overturn it. The distinction it turns on:

```text
TRANSCRIBED contract identity   registry data, read with the registry, never at evaluation time
                                → the ratchet and the matrix key on this

RESOLVED contract identity      read out of a pinned release at evaluation time
                                → never a precondition of a scope decision
```

The ratchet reads the **transcribed** identity. It never opens a pack, never resolves a release, and
therefore cannot be broken by an unreachable, unpublished or malformed one. A pack whose release
cannot be fetched still has a cell, still appears in the matrix, and still holds whatever disposition
a human recorded — which is exactly the behaviour FE-12's seam tests protect.

**Confirming a transcription against a resolved contract is a separate check with a separate owner,
and it is deliberately not built here.** When it is built, its failure mode must be a reported
mismatch on that cell, never the erasure of a recorded decision.

## Decision, part 2 — the ratchet is total, and fails closed

> **The baseline enumerates every cell in the registered population. A cell that appears, disappears,
> or changes its governance configuration without a baseline edit in the same commit is an
> enforcement failure, not a default.**

Sparse was the tempting design and it is the wrong one: a sparse baseline lists what is known, so
anything unknown is absent, so absence is permission. The ratchet exists to make absence expensive.

**Six conditions fail closed**, each a way the population is quietly altered:

| Condition | Why it is a failure and not a default |
|---|---|
| A registered repository missing from the baseline | The population grew without a governance event |
| A registered pack missing from the baseline | The pack axis grew without a governance event |
| A baseline cell whose repository or pack no longer exists | The population shrank without one. Removal is the *cheap* bypass — it looks like tidying |
| Exclusion configuration added or widened without the corresponding reviewed governance change | The reviewed surface narrowed. ADR 0007 bound 4, now implemented |
| A malformed or missing baseline | **Deletion must be strictly worse than editing.** "Nothing to compare" is not "nothing to enforce" |
| Any mechanism that silently regenerates the baseline | See below |

### What is ratcheted, and what is only reported

This is the distinction most likely to be lost, so it is stated as a rule:

```text
RATCHET STATE       the exclusion RULE — the glob and its reason, as configuration
REPORTING EVIDENCE  the matched-file COUNT beneath that rule
```

Ratcheting the counts would re-import exactly the churn ADR 0007 refused: `vendor/**` grows from
1,204 files to 1,206 and the build goes red for a reason the reviewer knows is meaningless, which is
how a control trains the people it governs to bypass it. Ratcheting the **rule** catches the act that
actually narrows assurance — someone adding `src/prediction/**` to the exclusion list — while the
count travels beside it on every run as the information a human acts on.

Ordinary growth beneath an exclusion is therefore visible and not invalidating. That is the same
contained hole ADR 0007 accepted, and it is not reopened here.

### No `--write`, and a test that says so

There is no flag, subcommand or environment variable that writes the baseline. The reasoning is
transplanted verbatim from `PredictionStandards/scripts/integrity.mjs`, whose comment gives it best:
**the first response to a red build would be to run it.** A regeneration switch converts every
finding above into a keystroke, and it is the sixth failure condition for that reason.

The tool prints the diff and exits non-zero; a human edits the file. A test greps this enforcer's own
source for a baseline-writing path, in the shape of the existing guard in `test/enforce.test.mjs`
that has already caught a real defect once.

## Decision, part 3 — the matrix reports every cell

> **Every cell in the population appears in the matrix, including — especially — the ugly ones.**

No `--only-signalled`. No flag that hides unknown cells. No default that collapses a category. Any
option that reduces the cell **count** without reducing the **population** is the back door this
milestone was built to close, and its absence is asserted rather than intended.

The first matrix should look worse than anything this repository can currently show. That is the
acceptance signal, not a problem to fix before publishing: the same principle as the 47/52 release,
which made a portfolio look less compliant and more truthful in the same commit.

## Consequences

**Accepted, and intended:**

- **Adding a repository or a pack to the registry breaks the build until the baseline is edited.**
  That is the governance event. Making it cheap would make it meaningless.
- Removing a cell is as loud as adding one. The asymmetry that usually exists here — additions
  reviewed, deletions waved through — is the one an under-declarer relies on.

**Accepted, and not liked — the totality claim is bounded, and the bound is large:**

- **The ratchet is total over the *registered* population, not over the world.** A repository that was
  never registered has no cell to be missing from the baseline. Closing that gap is *repository
  discovery* — enumerating an organisation and noticing something nobody ever assessed — which is a
  separate obligation and is explicitly not in this slice. Until it exists, the honest claim is
  **"every registered cell is accounted for"**, and the matrix must report the size of the registered
  population beside its results so that a small, tidy matrix cannot read as a governed portfolio.
- **A pack that declares no contract identity cannot be registered at all.** Five of the nine packs in
  this portfolio publish no `standards-adapter.json` today, so they have no authoritative identity to
  transcribe. Registering them under their directory name is precisely what part 1 forbids. They are
  reported as unregistrable rather than omitted, because a pack missing from the matrix and a pack
  missing from the world look identical otherwise.
- **Separation of duties still does not exist.** Reviewer, reviewee, baseline editor and the person
  who can delete the registry are one person. Unchanged from ADR 0004 and ADR 0007, and restated here
  because a total ratchet invites the assumption that it is a control over someone who does not want
  to be governed. It is not. It is an alarm clock for someone who does.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Key cells by directory or display name | The rename/transfer/recreate problem ADR 0004 already settled, and the `machineLearning` vs `machine-learning` false green FE-12 found one level up |
| Key packs by the id in the invocation | A typo mints a cell and retires another, with no governance event. This is the residue FE-12 recorded and left open |
| Resolve `standard.id` from the pinned release at scope time | FE-12's finding: a malformed or unreachable contract would erase a human's recorded decision |
| A sparse baseline | Absence becomes permission, which is the bypass |
| Ratchet the exclusion match counts | Systemic churn for no assurance; ADR 0007's reasoning, applied to the ratchet |
| A `--write` / `--update-baseline` flag | It is the first thing anyone runs on a red build |
| Hide unknown cells behind a filter | The unknown cells are the finding |
