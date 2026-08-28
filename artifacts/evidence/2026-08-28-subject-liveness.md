# Subject liveness — a verdict over an empty subject, whatever shape derived it

**Item:** [ST-16](../backlog/items/ST-16.md) · **Base:** `ee3b52971f71c1ad172b04623159d3963a114709`
· **Status after this work: still open.** The falsification found holes it does not close.

## 1 · The three falsifiers, observed passing first

Added to the authoritative surface on the base above, each an empty subject with a passing verdict:

```
surface 38 | probes enumerated 3
393 tests, 363 pass, 0 fail, 30 skipped
✔ probe-every  · every source file is well formed
✔ probe-filter · no source file contains a forbidden marker
✔ probe-inloop · every source file is well formed
```

ST-15's mechanism was present and correct throughout. It sees none of these, because it asks what
the **verdict** looks like and none of them builds an accumulator.

## 2 · The question the mechanism asks instead

Not *what does the verdict look like* but *what did this test consume, and did it prove that
collection had elements*. Only consumptions whose success survives an empty subject count:

| Consumption | Why it survives emptiness |
| --- | --- |
| `for (const x of S) { …assert… }` | body never runs |
| `for (const k in T) { …assert… }` | same, different keyword |
| `while (Q.length) { …assert… }` | never enters |
| `S.forEach(x => { …assert… })` | callback never runs |
| `S.filter/map/flatMap(p)` asserted empty | yields `[]` |
| `S.reduce(f, [])` asserted empty | accumulates nothing |
| `S.every(p)` | vacuously true |
| `!S.some(p)` / `!S.find(p)` | the negation inverts `some`'s emptiness-safety |
| `Object.keys/values/entries(X)` asserted empty | consumed by a static method, no binding to watch |

`some` and `find` asserted **positively** are deliberately absent: on an empty subject they are
falsy, so the assertion fails rather than passes. They are self-live, and listing them would redden
honest tests.

Three exemptions, each about certainty rather than convenience:

- **A statically non-empty literal.** `const MUTATIONS = { … }` cannot be empty at runtime, so
  demanding a runtime proof of it is the category error ST-15 avoided with `f.kinds`.
- **A non-empty expected value.** `assert.deepEqual([...PASSING].sort(), ["OUT_OF_SCOPE"])` proves
  `PASSING` had an element. This is how `enforce.test.mjs` establishes liveness on the line above the
  loop that consumes it.
- **A loop that does not assert.** `for (const c of a.controls) c.source = "rulesets";` shapes data
  and reaches no verdict.

## 3 · Falsifying it — six defects the runs found in it

| # | Defect | Found by |
| --- | --- | --- |
| 1 | Flagged every table-driven test: `Object.entries(TABLE)` over a literal | 17 of 38 files flagged |
| 2 | Could not see liveness stated as an exact expected value | `enforce.test.mjs` |
| 3 | Braceless loop bodies: `for (const c of a.controls) c.source = …;` had no block, so it scanned forward and **borrowed the assertions of an unrelated later block** | `host-governance`, `verdict-liveness`, `oracle-subject-identity` |
| 4 | `.size` is a Set's length, and the shared helper knew only `.length` | `assert.ok(produced.size > 0)` |
| 5 | Liveness on a call subject (`Object.values(STATE)`) could not be expressed at all | `enforce.test.mjs` |
| 6 | `rootSubject` stripped `Object.entries(X)` to `Object` — a static method is not the receiver's own | re-flagged 2 files |

Two of those were escape-collapse bugs rather than reasoning errors, and both were silent:
`"assert[.]ok\s*"` in a **double-quoted JS string** is `assert[.]oks*`, and `\b` written through a
shell heredoc became a **literal backspace**, which Python does not warn about because it is a valid
escape. Both produced regexes that matched nothing and a mechanism that looked like it worked.

Defect 4 was repaired in `verdict-liveness.mjs`, the shared helper — recognising `.size` can only
ever remove a flag, never add one, and ST-15's six tests are unchanged by it.

## 4 · Five genuine findings in the existing suite

The mechanism did not only flag its own specimens. Five tests consumed a collection they never
proved was non-empty, and each now says so in one line:

| Test | Subject | Why it was under-proven |
| --- | --- | --- |
| `backlog-tracker` | `RECORDS = readItems(ITEMS_DIR)` | discovered from the filesystem; an empty `items/` made the guard vacuous |
| `enforce` | `Object.values(STATE)` | an empty vocabulary would assert nothing |
| `front-door` | `documented`, `real` | protected only by two complementary emptiness checks — emergent, and a reader had to derive it |
| `identity-before-adoption` | `results` | an accumulator, then iterated with the assertions inside |
| `scope` | `PASSING` | an empty `PASSING` made the bound below vacuous |

These are strengthenings, not weakenings: each makes explicit a guarantee the test was silently
relying on.

## 5 · Attacking it — and what still gets through

Fourteen structurally different vacuous shapes were written and run against it. **Twelve are
rejected**; two are not:

```
ESCAPED ternary      assert.equal(files.length === 0 ? 0 : files.filter(p).length, 0)
ESCAPED join-empty   assert.equal(files.filter(p).join(","), "")
```

The first encodes "if the subject is empty, succeed" as an explicit conditional. The second routes
the verdict through a string, so nothing collection-shaped is ever asserted.

Both are kept as specimens in `test/fixtures/subject-liveness/escapes/`, and a test asserts that they
**still escape**. The gap is executable rather than described: if a later change catches one, the
suite fails and says to move the specimen and update ST-16; if the gap widens, the caught/ cases fail.

## 6 · The mechanism's own liveness

Stripping its liveness assertions three at a time proved nothing — ST-15's rule is file-level, and
the remainder still exempted it. Stripping **all seven** makes the suite red, and ST-15's mechanism
names the new one by its accumulators:

```
+ 'test/subject-liveness.test.mjs: offenders'
+ 'test/subject-liveness.test.mjs: missed'
+ 'test/subject-liveness.test.mjs: caught'
```

Stated precisely: the new guard does not catch itself — it is **governed by the guard that preceded
it**, and the two are complementary. ST-15 owns the accumulator shape; ST-16 owns consumption. The
partial strip is recorded here because it briefly read as a passing self-check, and it was not one.

## 7 · Verification

Local, on this branch: **397 tests, 367 pass, 0 fail, 30 skipped**. The 30, counted on this run
rather than carried forward:

| Count | Reason |
| --- | --- |
| 22 | no authoritative oracle configured (`ENFORCER_ORACLE_REPO`) |
| 4 | the platform reads a `0o000` file anyway — Windows ignores it; **NOT simulated** |
| 4 | symlinks unavailable; cases 7b, 7d, 7e, 7f **NOT exercised** |

Surface: 36 enumerated files. The specimens live under `test/fixtures/`, outside it, so they stay
re-runnable without reddening the suite for ever.

## What this does not do

It does not close the shape space, and the two escapes above are the proof rather than a caveat.
Each attack round found fewer holes than the last, but none found none. ST-16 therefore stays open,
and EP-06's guarantee-level evaluation waits on a round that finds nothing — not on the absence of a
round having been run.
