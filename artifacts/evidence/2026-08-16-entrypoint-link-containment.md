# The evaluator entrypoint could leave the verified checkout through a link

**2026-08-16.** A defect found by the containerised local CI pipeline on the day it was built, in
`scripts/enforce.mjs`, fixed in the same branch as a separately authorised unit of work.

## The property that did not hold

> The evaluator entrypoint that is executed must resolve, through filesystem links, to bytes inside
> the identity-verified standards checkout.

`loadAdapter` performed only a lexical check:

```js
const entrypoint = path.resolve(standardsDir, contract.evaluation.entrypoint);
const inside = path.relative(standardsDir, entrypoint);
if (inside.startsWith("..") || path.isAbsolute(inside)) { throw ... }
```

`path.resolve` is a string operation. It never touches the filesystem, so it cannot know about a
link. A pack whose `scripts/standards.mjs` was a symlink to a file outside the checkout had those
bytes executed, and the enforcer accepted the resulting report as the authority's verdict.

**The comment directly above that code claimed the opposite** — that this was "the resolved half,
which a static check cannot do because it cannot know about a symlink". `grep -rn realpath scripts/`
returned nothing. The explanation described a control that had never been written. Both are fixed
together, because a comment asserting a guarantee the code does not provide is the more dangerous
half of the two: it stops the next reader from looking.

## Why this survived

`test/adapter-provenance.test.mjs` case 7b existed and was correct. It had **never executed**.

| Where | Outcome |
| --- | --- |
| Windows workstation | **Skipped.** Symlink creation needs privilege; the suite probes for the capability and honestly reports the case as NOT exercised. |
| GitHub-hosted `ubuntu-latest` | Would have run. Hosted Actions have not been running for this repository. |
| Anywhere else | Nowhere else existed. |

So the control had a test, the test had a correct assertion, and the assertion had never been
evaluated. That is the exact shape this repository exists to refuse — a green suite whose subject
was absent — sitting one level below where FE-14 found the previous instance of it.

The containerised pipeline changed the platform, not the test. Case 7b ran for the first time in
Linux and failed immediately.

## The measurements, in order

Preserved as a sequence rather than a summary. The first run is the evidence that found the defect;
the last is a successor result, **not a correction of it**.

```text
1. host, Windows, pre-fix        189 tests   171 passed   0 failed   18 skipped   (no oracle)
2. host, Windows, pre-fix        189 tests   188 passed   0 failed    1 skipped   (oracle; the skip IS 7b)
3. container, Linux, pre-fix     199 tests   198 passed   1 failed    0 skipped   <- 7b executed and failed
4. container, Linux, pre-fix     204 tests   201 passed   3 failed    0 skipped   <- 7b, 7e, 7f, with 7c-7g added
5. container, Linux, post-fix    204 tests   204 passed   0 failed    0 skipped
```

Run 3 is the defect report. The failure:

```text
not ok 50 - 7b · a symlinked entrypoint pointing outside the checkout
            does not execute foreign bytes
  error:    'bytes from outside the verified checkout executed'
  expected: 'outside'
  actual:   'outside'
  operator: 'notStrictEqual'
```

`actual: 'outside'` is the evaluator's own `ranFrom` marker. The foreign bytes did not merely become
reachable — they ran, and their report was accepted.

Run 4 is the falsifier check for the *fix*, performed before the fix was applied: the new cases were
run against the unmodified code to establish which of them are load-bearing rather than vacuous.

```text
7b  symlinked entrypoint resolving outside        RED pre-fix    load-bearing
7e  symlinked parent directory                    RED pre-fix    load-bearing
7f  link that does not resolve                    RED pre-fix    load-bearing
7c  ordinary entrypoint inside the checkout     GREEN pre-fix    regression guard
7d  link chain that stays inside                GREEN pre-fix    regression guard
7g  entrypoint simply absent                    GREEN pre-fix    regression guard
```

Three going red for the stated reason is what makes run 5 mean something. Three staying green is
what establishes that the fix refuses escapes rather than refusing links.

## The fix

Containment is now decided twice, on two different questions:

- **Lexical**, unchanged in effect, so a declared `../../etc/passwd` is refused without the named
  file having to exist.
- **Filesystem-resolved**, via `realpathSync` on the *whole* path rather than the final component —
  a symlinked parent directory escapes exactly as well as a symlinked file, and case 7e is the test
  that a filename-only check would pass 7b and still fail.

Three details that are decisions rather than mechanics:

1. **The checkout root is canonicalised too.** On macOS these checkouts live under a path reached
   through a link (`/tmp` → `/private/tmp`), so comparing a canonical entrypoint against a lexical
   root would report every ordinary entrypoint as an escape.
2. **Containment is separator-aware, not a string prefix.** `/pack` is a prefix of `/packages/evil`,
   and a directory named `..foo` begins with `..` while escaping nothing. Both are near-misses that
   make a containment check look present and behave absent.
3. **A dangling link is refused by name, and is not the same condition as an absent file.** Where it
   would have pointed is *unknown*, and INV-E1 does not permit an unknown enforcement condition to
   be treated as an acceptable one. An absent file keeps its existing message — "the contract names
   X, which is not in the pinned release" — because the two send an operator to different fixes.
   Case 7g exists to hold that distinction open.

The canonical path is what is returned and spawned, so the bytes executed are at the exact path
whose containment was established.

## What this does not establish

- **It is not a claim about any released pack.** No evidence is held that this was ever exploited,
  and none was looked for. The finding is that the control was absent, not that it was defeated.
- **It does not make case 7b established everywhere.** It is established on Linux. On a Windows
  workstation without symlink privilege the suite still reports it as NOT exercised, which remains
  the correct report. The containerised pipeline is what makes it run, so *the pipeline is now part
  of how this guarantee is held* rather than a convenience around it.
- **It says nothing about the other link surfaces** in the identity path — the materialisation cache
  in `scripts/identity.mjs` was not reviewed for the same class of defect as part of this work.
