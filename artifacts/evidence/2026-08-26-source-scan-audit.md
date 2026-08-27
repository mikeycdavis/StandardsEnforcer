# ST-12 — every test that derives structure from source text, classified by execution

**Date** 2026-08-26 · **Base** `721a97b` · **Branch** `feat/st-12-source-scan-audit`

[ST-11](../backlog/items/ST-11.md) found one source-scanning test that became vacuously green
because the bytes it read were not the bytes it was written against. ST-12 asked whether that was
one specimen or a class.

**It was one specimen.** Zero further class-3 findings. Nothing was repaired, because there was
nothing vacuous left to repair, and the audit is recorded here so that answer can be checked rather
than taken.

## The denominator, stated rather than sampled

> **The counts below are historical-at-execution, and were already stale within a day.** They
> describe the surface at `721a97b`, which is what the audit actually ran against. `main` now
> enumerates **30** files: `test/adoption-marker.test.mjs` arrived with #34/#35 while this audit was
> in review. It was checked rather than assumed — its three `readFileSync` occurrences are strings
> inside a *generated* evaluator script, so it performs no read of repository source and falls in
> the same excluded category as `test/policy-path.test.mjs`. **The zero-class-3 conclusion is
> unchanged.** The number is a measurement with a timestamp; the conclusion is the finding. Recorded
> here rather than by editing the counts, because a denominator silently updated to match today is
> no longer evidence of what was executed.

`scripts/test-surface.mjs` enumerates the surface, so the audit has an exact population rather than
whatever a search happened to reach. This is ST-13's fix doing work it was not built for.

```
surface files (scripts/test-surface.mjs)                29
  of those, reading any path as text                    14
    classified by execution                             12
    excluded, with reason recorded below                 2
```

The two exclusions are **not** unaudited. `test/identity-cache.test.mjs` reads exactly one file,
`VERSION` inside a temporary checkout it created itself. `test/policy-path.test.mjs` performs no
read at all — its two `readFileSync` hits are text inside a string array that becomes a generated
evaluator script. Neither reads repository source, so neither can be defeated by this repository's
line endings.

## Method: stimulus, then mutation

Classifying by reading is what missed the defect the first time. ST-11's guard looked correct; it
was running against an empty string. So each test was **executed**, twice.

**Stimulus.** `git archive HEAD` extracted to a scratch tree, then every tracked text file
converted to CRLF — 169 files, which is the same 169 the falsifier commit `d07b73b` named as
undeclared. `*.sh` was deliberately excluded: a CRLF shebang is unparseable in the container, a
different failure with its own recorded reason, and it would have masked the scanner question with
an execution error.

**Mutation.** Passing under CRLF is exactly what a vacuous scanner does, so passing proves nothing
on its own. For each test, the specific defect that test exists to catch was planted in the CRLF
tree and the test re-run. Red means the guard is live. Green with the defect present is the
class-3 finding.

**The harness asserts its own mutation landed.** An edit whose target text is not found is a no-op,
the run comes back green, and the guard is reported vacuous when nothing was ever tested. That
happened once here — a Python bytes literal held a real CR/LF where the file holds the
two-character escape — and produced a false class-3 verdict against `test-support/source-scan.mjs`
that was withdrawn on inspection. The harness now fails closed on a no-op, which is the same
INV-E1 shape as the rest of this repository: an unverifiable condition must not read as a result.

## Results

Every mutation below was applied to the **CRLF** tree.

| Test | Planted defect | Verdict |
| --- | --- | --- |
| `authority-boundary` | `denominator.scored` property access in `scripts/enforce.mjs` | live, fail=1 |
| `enforce` (no rule/detector/scoring) | `score =` assignment in `scripts/states.mjs` | live, fail=1 |
| `front-door` | a README States row renamed to `INVENTED_STATE` | live, fail=2 |
| `backlog-tracker` | tracker no longer names `scripts/backlog.mjs` | live, fail=1 |
| `release` | `VERSION` set to `9.9.9` | live, fail=2 |
| `test-surface` | `package.json` test script reverted to bare `node --test` | live, fail=1 |
| `adapter-policy-binding` | `POLICY_FILE` planted inside the evaluator seam | live, fail=1 |
| `credential-hygiene` | workflow no longer runs `ci/checks.sh` | live, fail=1 |
| `source-scan` | CRLF normalisation removed from `readSource` | live, fail=1 |
| `adapter-conformance` | schema `required` key disabled | live, fail=37 |
| `host-governance` | governance fixture, every `true` flipped to `false` | live, fail=12 |
| `checkout-line-endings` | none needed — the CRLF tree **is** its defect | live, fail=3 of 4 |

```
class 1  line-ending agnostic          11
class 2  sensitive, and fails loudly    1   (checkout-line-endings)
class 3  can succeed vacuously          0
```

### Two results worth stating separately

**`adapter-policy-binding` is class 1 because ST-11 made it so, and the audit proves the repair
holds rather than assuming it.** With the normalisation removed from `readSource` under CRLF, its
liveness assertion fires by name — *"the seam body could not be located, so the assertions below
would prove nothing"*. That is the ST-11 pattern doing exactly what it was built for: the guard
reports that it stopped working instead of reporting success.

**`credential-hygiene` does not depend on the helper at all.** Under CRLF with the normalisation
removed *and* the defect planted, it still went red. Its extraction is structurally tolerant, so it
is class 1 on its own terms rather than by borrowing the repair.

## The `.gitattributes` question was answered elsewhere

ST-12's third acceptance criterion asked for the `.gitattributes` decision to be taken **from the
resulting count**. That decision had already been made and landed before this audit ran, so the
criterion is satisfied by provenance rather than by re-deciding it:

```
2b88466  Declare a default line ending, so a checkout is not a property of the machine (#21)
         2026-08-18, claimed by EP-04
         .gitattributes:  * text=auto eol=lf
         guarded by:      test/checkout-line-endings.test.mjs
```

ST-12 was opened 2026-08-16, two days earlier, which is why its text still describes the pin as
being held. **This audit does not reopen that decision**, and its count does not bear on it: a
count of zero would have argued against a repository-wide pin, and the pin exists for a reason the
audit never examined — that a checkout should not be a property of the machine, which is true
whatever the scanners do. The two arguments are independent and only one of them is ST-12's.

What the count *does* settle is the narrower question ST-12 actually owned: **fixing the scanner
was the right boundary.** ST-11 repaired the specimen rather than normalising the tree, and no
second specimen exists.

## One observation, recorded and not repaired

`test/enforce.test.mjs` performs its own comment stripping with two regexes instead of using
`test-support/source-scan.mjs`, and carries no liveness assertion. It is class 1 — it went red under
mutation — and it cannot scan nothing, because it iterates three files by name and `readFile` throws
on a missing path rather than returning empty. So it is sound today for a reason that is structural
rather than deliberate. It is recorded here because ST-12's remit was to repair vacuous guards, and
this one is not vacuous; adopting the shared helper there is a separate decision with its own
evidence, not a repair this item is entitled to make.

## Limitations of this audit

- **The stimulus is CRLF only.** Other ways an extraction can silently match nothing — a renamed
  function, a reformatted brace — were not exercised. ST-11's remedy defends against those; this
  audit did not measure them.
- **Class 1 is a claim about today's assertions**, established by one mutation each. A guard with
  several assertions was classified live if the planted defect reddened it; the audit does not
  establish that every assertion inside every guard is individually load-bearing.
- **The scratch tree needed `git init`** before the three git-dependent cases in
  `checkout-line-endings` could execute; without it they skipped, and a first run reported three
  extra skips that were the harness and not the stimulus.

## Suite

| Surface | tests | pass | fail | skipped |
| --- | ---: | ---: | ---: | ---: |
| LF worktree (Windows, no oracle) | 345 | 319 | 0 | 26 |
| CRLF scratch tree, before `git init` | 345 | 315 | 1 | 29 |

The CRLF run's single failure is `checkout-line-endings`, which is the correct result: that guard's
whole purpose is to fail when the tree carries CRLF. The three extra skips were the missing `.git`,
not the line endings; after `git init` all four cases executed, three red and one green.

The 26 skips on the LF surface are 22 oracle-dependent and 4 symlink cases, unchanged by this work.
