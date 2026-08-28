# Subject liveness, round two — closing the two escapes, and what nine rounds actually found

**Item:** [ST-16](../backlog/items/ST-16.md) · **Base:** `61e8bb7c5f4032ab193a075a4c6810825ca9ec35`
· **Status after this work: still open.** One shape still escapes, and it is recorded rather than
described. This continues [the first round](2026-08-28-subject-liveness.md).

## 1 · The two escapes, observed still escaping first

Re-measured on the base above rather than carried forward from the previous branch:

```
join-empty.mjs   ESCAPES   assert.equal(files.filter(p).join(","), "");
ternary.mjs      ESCAPES   assert.equal(files.length === 0 ? 0 : files.filter(p).length, 0);
```

## 2 · They were not two missing rules

`consumptions()` enumerated the SINKS a derived collection could drain into — `.length, 0`,
`deepEqual(X, [])`, a bound count compared to zero — and therefore **failed open on every sink it did
not know**. `.join()` and a ternary are simply the third and fourth members of a set that also holds
`.toString()`, `.at(0)`, `[0] === undefined`, `JSON.stringify(x) === "[]"`, a template interpolation,
and so on without end. Adding a rule per sink is a race the sink space wins. That is what the first
round's "twelve of fourteen" was really measuring.

**The fix inverts the default.** `test-support/assertion-shape.mjs` asks instead which assertions
*refute* emptiness — those that cannot pass when the collection is empty. That set is small and
closed: a non-zero expected count, a non-empty expected array or string, a `> 0` bound, an
`includes`/`some`/`find`/`has` needing an element. Everything else is vacuity-prone. An unrecognised
sink is now **flagged rather than allowed**, which is INV-E1 applied to the discriminator itself: not
knowing is not a pass.

Both escapes fell to that single change, along with most of what the later rounds threw at it.

One detail makes it possible at all: `stripComments(code, { strings: true })` blanks string CONTENTS
but preserves the quotes and the length, so `""` and `"a,b"` arrive as `""` and `"   "`. The emptiness
of an expected string survives the blanking.

## 3 · Nine adversarial rounds

Each round is 19–20 structurally different vacuous shapes. **A round is only evidence if the
mechanism was not modified during it**, so the "found" column below counts what each round found
against the mechanism *as it stood when the round began*.

| Round | Shapes | Escaped | What the escapes were |
| --- | --- | --- | --- |
| 1 (previous) | 14 | 2 | ternary, `.join(",")` |
| 2 | 20 | 7 | ternary/join closed; `throw` as verdict, `new Set(...)` wrapper, destructuring, `JSON.stringify`, template interpolation |
| 3 | 20 | 8 | boolean/counter accumulators, `map`-as-`forEach`, `Promise.all(map)`, `?? []`, index `while`, `switch`, `Object.groupBy` |
| 4 | 20 | 6 | C-style `for`, `do..while`, `find` asserted absent, `Map`/`Set` mutators, `[...X]` drain, `reduce` to boolean |
| 5 | 20 | 2 | `if (S.some(p)) assert.fail()`, `new Set(files)` as a loop subject |
| 6 | 20 | 3 | object-index accumulators, spread loop subject |
| 7 | 20 | 4 | `reduce` callback, `Array.from(files, m)`, manual iterator, `.toString()` |
| 8 | 19 | 4 | `throw` with no assertion anywhere, `assert.fail` misread as presence, `{ bad: [] }` expectation, verdict in a `catch` |
| 9 | 20 | 2 | destructuring with a default, `while ((f = files.pop()))` |
| 10 | 19 | **1** | a foreign assertion library |

**No round found zero.** Round 10 came closest, and its single escape is a limit of what the
mechanism can READ rather than a sink it failed to recognise — see §6.

Two specimens written as attacks turned out to be **honest** and were reclassified rather than
"fixed": liveness proved *after* the loop, and `assert.notEqual(files.length, 0)`. Both prove exactly
what `assert.ok(files.length > 0)` proves. They are now in the accepted-shapes test, because a
mechanism that flagged them would be wrong.

## 4 · Genuine findings in the existing suite

The rounds did not only exercise specimens. Four more tests were consuming collections they never
proved non-empty, each now stating it in one line:

| Test | Subject | Why it was under-proven |
| --- | --- | --- |
| `checkout-line-endings` | `trackedFiles()` × 3 | git listing nothing made three guards pass green |
| `checkout-line-endings` | `walk(REPO)` | the byte-level CRLF check — the one that runs in the container |
| `oracle-required` | `ORACLE_TAGS` | "every required oracle is available" is trivially true with no tags |
| `diagram-sync` | `vocabulary(read(source))` | a source with no comparable words compares nothing |
| `authority-boundary` | `tokens` (parameter) | a helper that scans an empty token list forbids nothing |

Strengthenings, not weakenings. No assertion was removed or loosened, and no test was made to pass by
lowering what it claims.

## 5 · Defects the rounds found in the mechanism

Nine, all found by measurement rather than by reading:

| # | Defect | Found by |
| --- | --- | --- |
| 1 | Resolving a name to its literal defeated the static-literal exemption, re-flagging every table-driven test | 12 surface files |
| 2 | Liveness was tested only at the END of a resolution chain, walking past the name that was proven | `diagram-sync` (`SOURCES.length >= 2`, four lines above the loop) |
| 3 | Accumulation treated as a verdict flagged every guard that iterates its own offenders list | 6 surface files |
| 4 | `[a, b].filter(p)` — an inline literal subject — was not seen as statically non-empty | `cache-concurrency` |
| 5 | An expected value that is a name the file proves live was not accepted | `front-door` |
| 6 | `assert.ok(known.has(s))` read as vacuous, when an empty `known` would FAIL it | `host-governance` |
| 7 | `[...spellings, undefined, null]` treated as a pure spread and so as possibly empty | `enforce` |
| 8 | `assert.fail(bad.name)` misread as a claim that `bad` is present | round 8 |
| 9 | `{ bad: [] }` read as a non-empty expectation because the OBJECT is non-empty | round 8 |

Defects 1–7 each flagged an honest test. That is the failure mode that makes a discriminator worse
than no discriminator, and it is why every round was measured against the whole surface and not only
against its specimens.

**A shared-helper change.** `stripComments` blanked `${...}` template interpolations, so a verdict
written inside one was invisible to *every* scanner in this repository — ST-15's included. It now
preserves interpolations as the code they are. This only ever makes more code visible; ST-15's six
tests are unchanged by it.

## 6 · What still escapes

One shape, kept as an executable specimen in `test/fixtures/subject-liveness/escapes/`:

```
foreign-assert.mjs    for (const f of files) expect(f).toBeTruthy();
```

The mechanism reads this repository's verdict dialect — `node:assert` and `throw`. A foreign
assertion library reaches a verdict through neither, so the loop reads as data shaping and its
subject is never questioned.

**Its compensating control is a test, not a paragraph.** `subject-liveness.test.mjs` asserts that
every file in the authoritative surface imports `node:assert`, measured at 36 of 36. Adopting another
library fails that test rather than silently widening the gap. That guards the ASSUMPTION; it does not
close the gap, which is why the specimen stays and ST-16 stays open.

`KNOWN_ESCAPES` in the test is compared against the directory in both directions, so the gap cannot
change size — in either direction — without the suite failing and saying which way it moved.

## 7 · The mechanism's own liveness

Stripping all 13 liveness assertions from `test/subject-liveness.test.mjs` makes the suite red **twice
over**, which is stronger than the first round's result:

```
ST-16 (its own surface guard) + 'test/subject-liveness.test.mjs: testFiles(ROOT) (for-of)'
                              + 'test/subject-liveness.test.mjs: vacuousSubjects(code) (for-of)'
                              + 'test/subject-liveness.test.mjs: fixtures("caught") (for-of)'
                              + 'test/subject-liveness.test.mjs: fs.readdirSync(...) (derived)'
ST-15 (accumulators)          + 'test/subject-liveness.test.mjs: offenders'
                              + 'test/subject-liveness.test.mjs: missed'
```

The first round recorded that the guard did **not** catch itself and was governed only by its
predecessor. That is now superseded: because the guard scans the authoritative surface and its own
test file is in that surface, it catches itself as well. ST-15 continues to govern it independently.

## 8 · Verification

Local: **398 tests, 368 pass, 0 fail, 30 skipped**. The 30, counted on this run rather than carried
forward:

| Count | Reason |
| --- | --- |
| 22 | no authoritative oracle configured (`ENFORCER_ORACLE_REPO`) |
| 4 | the platform reads a `0o000` file anyway — Windows ignores it; **NOT simulated** |
| 4 | symlinks unavailable; cases 7b, 7d, 7e, 7f **NOT exercised** |

Surface: 36 enumerated files, **0 flagged**. Specimen corpus: 194 `caught/`, 1 `escapes/`. All nine
attack corpora re-run against the final mechanism: **177 of 178 rejected**, the single exception
being the recorded escape.

## What this does not do

It does not close the shape space, and ten rounds cannot show that it has. What changed is the
DIRECTION of failure: the mechanism used to let an unrecognised sink through, and now flags it. That
converts an open-ended enumeration into a closed one, which is why round 10 found one shape rather
than eight — but "one" is a measurement of ten rounds of my own imagination, not a property of the
shape space. The honest close condition for ST-16 remains a clean round finding nothing, and this
round did not deliver one.
