# A structural guard that never ran

**Date:** 2026-08-16
**Subject:** the structural assertion in `test/adapter-policy-binding.test.mjs`, merged in PR #2 as
`bfb30c4`.
**Baseline:** `main` at `6d91ee6`, unmodified.
**Found:** while reconstructing FE-16 on a branch cut from that main — not by review, and not by
anything going red.

## The claim under test

PR #2's commit message, its post-merge correction, and [FE-21](../backlog/items/FE-21.md)'s
acceptance list all say the same thing: the evaluator seam contains no policy filename, and that this
is *asserted structurally*. This document establishes that the structural assertion did not exist in
any executed form, and repairs it.

## The code as merged

```js
const src  = await readFile(new URL("../scripts/enforce.mjs", import.meta.url), "utf8");
const seam = src.slice(src.indexOf("export function runOfficialEvaluator"));
const body = seam.slice(0, seam.indexOf("\n}\n") + 1);
assert.equal(body.includes("POLICY_FILE"), false, "…");
assert.equal(/governedRoot/u.test(body), false, "…");
```

`core.autocrlf=true` on the authoring machine, and `.mjs` carries no `text eol=lf` attribute in
`.gitattributes` — which pins `*.sh` and two other paths, but nothing else. So the working tree
carries CRLF, and so does the `git archive <commit>` the CI image is built from. The delimiter
`"\n}\n"` does not occur in CRLF text at all.

## Measurement, on unmodified main

```text
CRLF present in working tree:   true
indexOf("\n}\n")                -1
body.length as shipped          0
```

`slice(0, 0)` returns `""`. `"".includes("POLICY_FILE")` is `false`; `/governedRoot/u.test("")` is
`false`. Both assertions were satisfied by the absence of any input, in every environment this
repository has run in — the Windows workstation, hosted Actions, and authoritative container CI
alike. It was green from the day it merged and had never executed.

## Falsification, in both directions

The defect the guard exists to catch, reintroduced into the seam — the exact reconstruction PR #2
removed:

```js
argv = bindArguments(contract, { "{target}": target, "{policy}": path.join(target, POLICY_FILE) });
```

Both guards run against that identical mutated source, on the same machine, same Node:

| Guard | tests | pass | fail | which |
|---|---|---|---|---|
| **as shipped in PR #2** | 13 | 11 | **2** | both behavioural |
| **repaired** | 13 | 10 | **3** | the two behavioural, **plus the structural one** |

The two behavioural failures are the same in both rows. The third is the assertion that had never
run. On unmodified source the repaired guard is 13/13.

*(A first attempt at this mutation bound `path.join(governedRoot, POLICY_FILE)`, which is not in
scope inside the seam and threw `ReferenceError` — seven tests red for a reason unrelated to the
property. Discarded, and recorded here because a falsifier that fails everything proves nothing
about the specific guard.)*

### And in the container, which is the environment the claim was about

A host measurement would leave the important half unproven: the defect was that the guard was
vacuous *in authoritative CI*, whose image is built from `git archive` — the CRLF bytes themselves.
So the same mutation was committed and run through `scripts/ci.ps1`, network-isolated, oracle
mounted read-only:

```text
e0fd512  repaired, unmutated     LOCAL CI PASS   276 passed, 0 failed, 0 skipped
61b7faa  repaired, mutated       LOCAL CI FAIL   273 passed, 3 failed, 0 skipped
           not ok 44 - policy · a subject below the governed root does not drag the policy path …
           not ok 46 - policy · the seam binds the exact path supplied, not one it rebuilds …
           not ok 47 - policy · the invoked policy IS the one whose presence established adoption
```

**Test 47 is the assertion that had never run.** In this same container, before the repair, it was
one of the 276 reported `ok`. `61b7faa` was a throwaway commit for this measurement and was reset;
it is named here so the run is identifiable, not because it exists on any branch.

## What was affected, and what was not

The distinction matters, because the mechanism was never wrong:

- **PR #2's behavioural guard was live** and remains so. The seam does bind the exact `policyPath`
  it is given; that was proven by execution then and is proven by execution now.
- **PR #2's structural guard was not exercised**, because CRLF made its source extraction empty.

What failed was the claimed *second assurance layer*, not the thing it claimed about. No product
behaviour changes in this repair.

## The repair, and why it is not "normalise the line endings"

Normalisation removes this instance. The class is broader: an extraction that can match nothing and
hand its assertions an empty search space. So the ordering is fixed, and each step asserts itself:

```text
source normalisation
→ locate the function boundary
→ ASSERT the boundary was actually found
→ ASSERT the extracted region identifies the intended seam
→ strip comments, and ASSERT stripping left code and removed prose
→ only then, the structural assertions
```

A future source-layout change under a different delimiter now fails saying it could not find the
seam, rather than recreating the same green.

### Why comments are stripped rather than reworded

Applying the repaired guard to unmodified `main` goes red — on **prose**:

```text
scripts/enforce.mjs:218-219
  // […] Deriving `path.join(governedRoot,
  // POLICY_FILE)` here made the enforcer read one path and hand the pack a second one […]
```

That comment is correct and worth keeping; it is the explanation of why the reconstruction is
forbidden. The tempting fix — reword it — leaves the guard exactly as blunt and adds an unwritten
rule that a future author cannot see: *do not say this word here*. Instead the scanner was fixed, in
`test-support/source-scan.mjs`, so the guard's subject is code rather than commentary.

`stripComments` is a small state machine rather than a regex, because the regex form must decide
whether `//` inside a string literal opens a comment and gets it wrong — the suite is full of paths
and URLs, and the guard's own `"\n}\n"` is a counterexample. A stripper that removed real code would
manufacture the same false green one layer down, so it carries its own tests
(`test/source-scan.test.mjs`, 10 cases) asserting both failure directions, including the original
CRLF defect reproduced as a case.

## What this does not establish

- **Whether any other source-scanning test shares the defect.** Not audited. Filed as
  [ST-12](../backlog/items/ST-12.md), deliberately unsolved here.
- **That `.mjs` should be pinned to `text eol=lf`.** One specimen does not earn a repository-wide
  normalisation, and a blanket `.gitattributes` change would fix the scanners' environment rather
  than the scanners. The narrow fact established is only that *authoritative CI may execute text
  whose line endings differ from the committed blob, and at least one source-inspection test was
  sensitive enough to become vacuous*. ST-12 answers the rest from a count, in either direction.

## Correction to the record

PR #2's body and the `2026-08-16-adapter-policy-binding.md` supersession note both assert that the
seam property is asserted structurally. Superseded in part, by appending rather than rewriting:
**the behavioural guard was live; the structural guard was not, until this repair.** FE-21's
acceptance line — *"the existing structural assertion stays green without amendment"* — is amended
in the same way and for the same reason: it was resting on an assertion that did not run.
