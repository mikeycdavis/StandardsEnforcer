# Oracle-dependent evidence names its subject, not only its authority

**Date:** 2026-08-27
**Item:** [ST-14](../backlog/items/ST-14.md)
**Measured at:** `6587b23e70f4fbbb192fe5bd902ba9fa64587d3e` (`origin/main` before the remedy)
**Red specimen:** `d63a4980fc4330cec91fffca0b92b12ffabe7280`
**Remedy:** `98327d7c6bdcd2aeddd24001bc23e764bc1bab2d`

## The two identities, both now named

ST-14's acceptance requires the recorded evidence to name repository, tag and **peeled commit SHA**
for both halves. A SHA appearing somewhere in the output does not satisfy that, so both are printed
here from the code that resolves them.

| Half | What it decides | Repository | Tag | Peeled commit |
| --- | --- | --- | --- | --- |
| Authority | which standards implementation executes | `MachineLearningStandards` | `v1.6.0` | `eda15a2f56299bc0acc29feb5516dd7c6b8e475d` |
| Subject | which repository bytes are evaluated | `MachineLearningStandards` | `v1.6.0` | `eda15a2f56299bc0acc29feb5516dd7c6b8e475d` |

The two coincide here because the oracle is evaluated under its own release. **That they coincide is
what made the defect invisible and what broke the first attempt at the remedy** — see the cache
collision below. They are separately resolved and separately verified.

Peeled with `git rev-list -n 1 <tag>`, which dereferences an annotated tag to its commit.
`git rev-parse <tag>` would return the tag object's own SHA — the mistake `scripts/identity.mjs`
diagnoses by name.

## What was wrong

`test/enforce.test.mjs` handed `ORACLE_REPO` to `enforce` as the governed repository. That is a host
working tree at whatever state it happens to be in, and the official evaluator reads it off disk. The
authority half was already object-addressed and verified; the subject half was not addressed at all.

## Established by execution, deterministically

The suite never writes to `ORACLE_REPO` — a test that edits the real oracle to prove a point has done
the thing it is complaining about. A clone detached onto the same commit is the same kind of object,
so mutating it demonstrates exactly what mutating the host would, without racing a concurrent edit.

Editing one `status: not-applicable` declaration in the subject's `project-policy.yml`:

```text
applicable = 0     before the edit
applicable = 1     after the edit          <- mutable working-tree bytes reach the result
```

Before the remedy, that edit moved the result. After it, the same edit to the **host** moves nothing,
while the same edit to the **frozen subject** still moves it.

## The remedy

`test-support/oracle.mjs` gained `oracleSubject(hostRepo, sha, cacheRoot)`, which calls the same
`materialise` the authority already goes through: clone from the object database, `checkout --detach`
onto the SHA, then `checkoutIsExactly` before the directory is returned. Reusing it means one
mechanism with one set of guarantees. A bespoke copy would be a second definition of *"these bytes are
that commit"*, free to drift from the first; copying the working tree would fix the bytes for the run
but pin them to no identity, reproducible only by whoever still had the directory.

Materialisation failure returns `ok: false` with a reason and no directory. There is no fallback to
the host — that would restore the defect behind a helper reporting success.

### What the falsifiers found, and what it cost

The subject's cache root is namespaced (`<cacheRoot>/subject`). This is not tidiness. `materialise`
keys entries by SHA alone, and here the subject's commit **is** the authority's commit. Sharing a root
handed both roles the same directory, so `resolveIdentity` verified the authority, found the subject's
mutated state, and repaired it out from under the run.

The liveness falsifier caught it: *mutating the frozen subject changed nothing*, because the next
`enforce` silently restored it. That test exists precisely to stop "unchanged by a host edit" from
being satisfied by an evaluator that reads nothing — and it earned its place on the first run.

## Falsifiers

Each is a test in `test/oracle-subject-identity.test.mjs`.

| # | Property | Red (`d63a498`) | Green (`98327d7`) |
| --- | --- | --- | --- |
| 1 | the mutation is observable in the report at all | pass | pass |
| 2 | editing the host checkout does not change what was evaluated | **fail** | pass |
| 3 | the comparison pair evaluates the same bytes on both sides | **fail** | pass |
| 4 | the identity is established from the checkout, not assumed | **fail** | pass |
| 5 | mutating the frozen subject **does** change the result | pass | pass |
| 6 | an unmaterialisable identity fails, never falls back to the host | **fail** | pass |
| 7 | an identity mismatch consumes no subject bytes at all | pass | pass |

Rows 1, 5 and 7 pass in **both** states by design. They are what stops rows 2–4 and 6 from going green
vacuously: if the evaluator read nothing, or the fixture stopped editing anything it consumes, "the
result did not change" would be trivially true.

## The boundary — `enforce.test.mjs:155`

ST-14's acceptance says *no oracle-dependent assertion may take `ORACLE_REPO` as a target path
directly*. Read as text that catches `:155`, which passes the oracle as `target` under a SHA that
cannot resolve.

Settled by execution rather than by grepping for `target:`. `enforce` checks the target exists, then
returns `STANDARDS_IDENTITY_MISMATCH` before anything is evaluated. Falsifier 7 gives the strongest
available form: **two targets sharing no content — the oracle checkout and an empty directory —
produce an identical state, an identical absence of report, and an identical message.** An answer that
is the same for two disjoint inputs is not a function of either one's bytes.

So `:155` is not a subject site, and freezing it would be an edit made to satisfy the shape of a
sentence. The acceptance wording was amended narrowly to govern assertions that actually consume the
subject; the original is quoted in the item.

**No structural text guard was added.** A scan for `target:` cannot distinguish content-consuming use
from this legitimate pre-evaluation case, and would fail exactly the way the guard ST-11 repaired did
— by mistaking mention for use. The behavioural tests above are the regression guard, and they check
the property rather than the spelling.

## Not changed

Authority pinning (`v1.6.0`, `ORACLE_TAGS`, adapter identity) is untouched; the evidence showed it was
never part of this defect. `STANDARDS_IDENTITY_MISMATCH`, `NOT_EVALUATED` and every other state
semantic is unchanged — falsifier 7 asserts the first directly. The other oracle suites
(`gate`, `scope`, `adapter-less-release`) already evaluate synthetic `mkdtemp` targets that are
immutable for the length of a run, and were not touched.
