# ST-14 — the subject of an oracle-dependent assertion, made identified bytes

**Date** 2026-08-27 · **Base** `6587b23` · **Branch** `feat/st-14-subject-identity`

ST-14 said the authority half of the oracle chain is identity-bound and the subject half is not.
**The premise reproduces on `6587b23`**, unchanged from the `2ba90ac` measurement in the item, and
the defect is repaired here.

## The premise, re-measured before anything was changed

`test/enforce.test.mjs:43` still binds `const MLS = ORACLE.repo` — the raw `ENFORCER_ORACLE_REPO`
path — and four assertions still took it as the governed subject:

```
test/enforce.test.mjs:155   target: MLS
test/enforce.test.mjs:209   target: MLS
test/enforce.test.mjs:225   target: MLS   +  path.join(MLS, "project-policy.yml")
test/enforce.test.mjs:226   target: MLS
```

An ambient observation, not a constructed one: at the time of this audit the real oracle checkout at
`F:/Repos/MachineLearningStandards` was at `4abc0a2` **with 3 uncommitted changes** — not at the
pinned `v1.6.0` at all. The premise was not hypothetical on this machine.

## The falsifier

The real oracle is a foreign repository and was never modified. A clone was taken to a scratch
directory and checked out at `v1.6.0`; every mutation below is to that **clone's working tree only**,
uncommitted, with `HEAD` never moving.

**Identity of the specimen, both halves, as criterion 4 requires:**

```
repository   MachineLearningStandards   (clone of F:/Repos/MachineLearningStandards)
tag          v1.6.0
peeled SHA   eda15a2f56299bc0acc29feb5516dd7c6b8e475d      git rev-parse v1.6.0^{}
             eda15a2f56299bc0acc29feb5516dd7c6b8e475d      clone HEAD at checkout
```

### Direction 1 — the silent one

One uncommitted edit to `project-policy.yml`, `standardVersion` `1.0.0` → `9.9.9`:

| subject | `standards.verified` | `standards.sha` | `report.standardVersion` | `state` |
| --- | --- | --- | --- | --- |
| `target: ORACLE_REPO` | `true` | `eda15a2…` | **`9.9.9`** | EVALUATED |
| `target:` materialised checkout | `true` | `eda15a2…` | `1.0.0` | EVALUATED |

`9.9.9` exists in no commit of that repository. The run reported it while simultaneously reporting
`standards.verified: true` and the peeled SHA of `v1.6.0`. That is evidence claiming more identity
than the execution established, which is EP-06's property exactly.

**This mutation breaks no existing assertion.** The suite stayed 18/18 green before the repair, so
the defect was never going to surface as a red run — the evidence was simply wrong. That is why
criterion 3 asks for a structural exclusion and explicitly refuses "assert today's verdict" as a
substitute.

### Direction 2 — the loud one

`applicability` emptied in the same working tree, again uncommitted:

```
before repair, poisoned host tree      18 tests, 16 pass, 2 fail
  ✖ oracle · MachineLearningStandards under its own v1.4.0 reproduces the recorded verdict
  ✖ oracle · the enforcer's payload IS the official evaluator's output, not a recomputation
after  repair, same poisoned tree      18 tests, 18 pass, 0 fail
```

Two of this repository's own oracle tests went red with no local cause — a defect in another
repository's working tree arriving here as a red. After the repair the same poisoning is inert.

## The repair

The subject is materialised by **the same verified route the authority already uses**, rather than
read from the host path in place:

```js
const oracleSubject = () =>
  resolveIdentity({ repo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE }).dir;
```

`resolveIdentity` resolves the tag to a SHA, verifies the declared SHA or refuses, clones from the
object database, checks out detached, and re-verifies a cache hit rather than trusting its marker.
The host path remains what the item allows it to be — a transport for the object database — and
stops being the authority.

Site by site:

| Site | Before | After |
| --- | --- | --- |
| `:155` | `target: MLS` | an empty `scratch()` directory |
| `:209` | `target: MLS` | `target: oracleSubject()` |
| `:225` | `target: MLS`, `path.join(MLS, …)` | `target: subject`, `path.join(subject, …)` |
| `:226` | `target: MLS` | `target: subject` |

`:155` evaluates nothing — identity fails first and `r.report` is `undefined` — so the subject
cannot affect its outcome. It was changed anyway, because a prohibition is worth keeping
unconditional rather than carving out the cases where it happens not to bite.

At `:225-226` both runs now take the **same** materialised checkout. The old comparison was
content-invariant but not time-invariant: a tree edited between the two calls produced a field-level
difference with no local cause.

## The guard (criterion 3)

`test/oracle-subject-identity.test.mjs` scans the enumerated test surface for `target:` bound to any
alias of the host path, or a path joined onto one, and requires the set to be empty.

It is a source-scanning test, so it carries the [ST-11](../backlog/items/ST-11.md) pattern that
[ST-12](../backlog/items/ST-12.md) audited the rest of the suite for: it reads through `readSource`,
asserts the surface is non-empty, asserts each file read non-empty, strips comments so a suite may
explain in prose why it does not do this, and asserts something was actually scanned.

It also carries a **positive** case — `subject · the guard can see a violation, so its silence means
something` — which feeds the matcher the four shapes that were live here and requires it to catch
all four, and requires it *not* to fire on the remedy. A prohibition that cannot demonstrate a
positive is indistinguishable from a broken matcher, and asserting an empty set is exactly the
shape that passes when nothing works.

Red before the repair, naming all five occurrences:

```
✖ subject · no oracle-dependent assertion takes the host oracle path as its subject
  + [ 'test/enforce.test.mjs: target: MLS',   ×4
  +   'test/enforce.test.mjs: path.join(MLS,' ]
  - []
```

### The aliases are derived, not listed

The guard first carried a hardcoded list of the three spellings the host path had here — `MLS`,
`ORACLE_REPO`, `ORACLE.repo`. Review of this change ([PR #36]) pointed out that a list only names the
spellings that existed when it was written, and that an ordinary rename walks straight past it:

```js
const subjectRoot = ORACLE.repo;
await enforce({ ...identity(), target: subjectRoot });
```

That is the defect in full, and the listed guard passed it. **The objection is correct**, and it is
this repository's own vacuous-guard shape — a prohibition that reports success because it was
looking for the wrong string.

The aliases are now derived per file, by propagation from the roots
(`process.env.ENFORCER_ORACLE_REPO`, the `ORACLE_REPO` export, and the `repo` field of any
`oracleAt(...)` result) to a fixpoint, so renames, destructuring, and multi-hop chains are carried.
Verified by planting the reviewer's exact refactor in `test/enforce.test.mjs` — both its sites, the
declaration and the use:

```
guard with the renamed alias present    2 tests, 1 pass, 1 fail
                                        + 'test/enforce.test.mjs: target: subjectRoot'
guard with it removed                   2 tests, 2 pass, 0 fail
```

The positive case now carries those shapes too, and a second negative case requiring the matcher not
to fire on a subject that merely *passed through* the host path to be materialised — otherwise the
guard would forbid its own remedy.

**A first attempt at this falsifier was a partial no-op**: the declaration was planted, the use was
not, and the guard's green was read as a miss. It was caught by asserting both sites rather than
asserting the file had changed. Recorded because it is the same harness defect
[ST-12](../backlog/items/ST-12.md) found and fixed, arriving one level down — a mutation with two
sites needs both asserted, not just a non-empty diff.

**What it still does not catch.** Taint that leaves the file, passes through a function parameter, or
is carried in an object field is not tracked; this is a lexical scan, not a type system. A rename
inside one file is covered; laundering the path through a helper in another is not. The reviewer's
alternative — a behavioural regression that poisons the host tree and requires a red — would close
that, at the cost of a test that can only run where an oracle is configured. Not taken here; recorded
as the next move if this guard is ever defeated.

## Suite

| Surface | tests | pass | fail | skipped |
| --- | ---: | ---: | ---: | ---: |
| Windows host, no oracle | 370 | 344 | 0 | 26 |
| Windows host, clean oracle clone | 370 | 366 | 0 | 4 |

The 26 are 22 oracle-dependent plus 4 symlink cases. With the oracle present the 22 resolve and the
4 symlink skips remain, which is the platform boundary and not this work. **Criterion 5 holds**: the
oracle integration still executes — 18 of 18 in `enforce.test.mjs` with an oracle configured, none
skipped, none excluded.

## What this does not do

- **It does not become an EP-06 mechanism.** The guard forbids one concrete shape in one enumerated
  surface. Whether EP-06 needs a general rule that new assurance code carries a liveness assertion
  is a separate question, deliberately not answered here.
- **It does not restate ST-13.** ST-13 governs which *tests* the runner discovers; this governs
  which *bytes* one consumes once it runs.
- **It does not claim any historical run was wrong.** The finding is about the consumption path,
  established by construction. No past result is retracted.
