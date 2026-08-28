# ST-15 — a guard that examined nothing, made unable to report success

**Date** 2026-08-27 · **Base** `f035ab9` · **Branch** `feat/st-15-liveness-guard`

EP-06's seven children were all complete and the epic's own failure was still reachable. This
records making it unreachable, in the order the item required: falsifier first, observed passing,
then a mechanism that reddens it, then proof the honest surface stayed green.

## 1 · The falsifier, and the suite accepting it

Added to the live surface at `f035ab9`:

```js
test("probe · no source file contains a forbidden marker", async () => {
  const files = [];                  // populated by nothing
  const offenders = [];
  for (const f of files) { /* never runs */ }
  assert.deepEqual(offenders, []);   // vacuously true, forever
});
```

```
385 tests, 355 pass, 0 fail, 30 skipped     <- the probe passed; nothing objected
```

[ST-13](../backlog/items/ST-13.md)'s enumeration added it to the **authoritative** surface. That is
ST-13 working exactly as designed, and it is what makes the result damning: the repository certified
a guard that examined nothing and counted it toward its own assurance.

The specimen is kept at `test/fixtures/liveness/vacuous-guard.specimen.mjs` — outside the enumerated
surface, so it stays re-runnable without reddening the suite forever. A falsifier nobody can re-run
is a claim, not evidence.

## 2 · The discriminator, designed separately

**"Asserts an empty array" is not the property.** `test/scope.test.mjs` asserts
`deepEqual(f.kinds, [])` about a field of one detector result; no collection there could have been
vacuously empty, and demanding a liveness assertion would be nonsense. The mechanical property is
narrower:

> an array **declared** empty in the file, **pushed to** in the file, and then **asserted** empty

That is an accumulator over an iteration. Its emptiness means *nothing was found* — or *nothing was
looked at*, and from outside those are the same result.

## 3 · Falsifying the discriminator, which found two of its own defects

Run against all 35 surface files, and corrected twice on what that showed:

| Draft | What it did | Why it was wrong |
| --- | --- | --- |
| 1 | flagged any `deepEqual(x, [])` | flagged `scope.test.mjs`'s `f.kinds`, a result field, not a scan |
| 2 | accepted liveness only as `> 0` | flagged `diagram-sync`, which asserts `SOURCES.length >= 2` — **an exact or higher bound is a stronger claim, not a weaker one** |
| 3 | read the bound's number without its operator | rejected `assert.ok(files.length > 0)` — the repository's commonest spelling, and the one [ST-11](../backlog/items/ST-11.md) introduced. It flagged the very guard whose liveness ST-11 added |
| final | keys on accumulator-over-iteration; `>` accepts 0, `>=` requires 1 | — |

Final state across the surface: **one** file flagged, the specimen. Thirty-four legitimate files
untouched, including the four that assert accumulator verdicts and prove liveness their own way
(`authority-boundary`, `cache-concurrency`, `credential-hygiene`, `front-door`,
`oracle-subject-identity`, `diagram-sync`).

## 4 · A hole the mechanism had, found by attacking it

With the mechanism in place, its own liveness assertions were stripped — it should have flagged
itself, and did not. The cause: `test/verdict-liveness.test.mjs` holds specimens like
`"assert.ok(xs.length > 0)"` as **string data**, and `stripComments` removes commentary but not
string bodies. **A file could satisfy the liveness rule with data rather than code.**

Repaired at the shared helper rather than by duplicating its state machine, which is the
duplication [ST-12](../backlog/items/ST-12.md) recorded as an observation:
`stripComments(source, { strings: true })` blanks string and regex bodies, keeps their delimiters
and newlines, and **defaults to false so every existing caller is unaffected** — the ten
`source-scan` tests still pass unchanged.

## 5 · Red before, green after

```
mechanism absent,  specimen in surface     390 tests, 359 pass, 1 fail   <- (before removal)
mechanism present, specimen in surface     390 tests, 359 pass, 1 fail
      ✖ liveness · every accumulator verdict in the surface proves it examined something
        + [ 'test/vacuous-probe.test.mjs: offenders' ]

mechanism stripped of ITS OWN liveness     flags itself as well as the specimen
        + [ '…vacuous-probe…: offenders', 'test/verdict-liveness.test.mjs: offenders' ]

specimen moved to fixtures, surface clean  390 tests, 360 pass, 0 fail, 30 skipped
```

The mechanism is subject to its own rule — it accumulates and asserts empty — and proves its own
liveness. That is not decoration: stripping those three assertions makes it name itself.

## 6 · Suite

| Surface | tests | pass | fail | skipped |
| --- | ---: | ---: | ---: | ---: |
| Windows host, no oracle | 390 | 360 | 0 | 30 |

The 30 are **22** oracle-dependent, **4** symlink, and **4** unreadable-file cases where the platform
ignores `0o000` so the condition cannot be simulated and is marked NOT simulated rather than passed.
Unchanged by this work; the six new tests all execute.

## What this does not do

- **It does not prove the liveness assertion covers the same collection the accumulator iterated.**
  That needs a type system, not a scan, and a discriminator that guessed would redden honest guards.
  The rule is file-level, which is exactly the pattern ST-11 established and ST-12 audited by hand;
  this makes that pattern executable rather than advisory.
- **It does not close [EP-06](../backlog/items/EP-06.md).** The parent guarantee is evaluated
  separately, as it was on 2026-08-27 when a full child count did not establish it.
- **It does not claim every vacuous shape is now impossible.** It forbids one shape — the accumulator
  verdict — across the whole surface. A verdict derived some other way is not covered, and saying so
  is the difference between a mechanism and a guarantee.
