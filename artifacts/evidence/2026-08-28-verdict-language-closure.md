# The verdict language, closed — and what closing it revealed

**Item:** [ST-16](../backlog/items/ST-16.md) · **Base:** `020a8d40dea7d80a89a32556726f827b666059ff`
· **Status after this work: still open.** Six shapes escape, recorded executably rather than
described. This continues [round one](2026-08-28-subject-liveness.md) and
[round two](2026-08-28-subject-liveness-round-two.md).

## 1 · The question that changed

Round two closed the sink space and left one shape: a verdict written with a foreign assertion
library. Its compensating control was a test asking whether every surface file imports `node:assert`.

That question admits a file that imports `node:assert` **and something else**. Three files in
`test/fixtures/subject-liveness/unsupported/` each import it, assert with it, pass round two's
control, and still reach their verdict somewhere the mechanism cannot read.

The question that closes is not *does this file use the dialect* but *can this file reach a verdict
through anything the mechanism cannot read*.

## 2 · Why that question is answerable

A verdict is reached by calling something, and every call has a root identifier. That identifier is
one of exactly four things:

| | Where it comes from | Readable? |
| --- | --- | --- |
| 1 | bound by an import | yes — every specifier here is `node:` or relative |
| 2 | bound in the file — declaration, parameter, destructuring | yes |
| 3 | a global the language defines | yes — ECMAScript closes the set |
| 4 | **free** | **no** |

Case 4 is where a foreign assertion library lives, whether injected by a runner or imported from a
package. Cases 1–3 are enumerable, so the residue is not "everything else in JavaScript" — it is a
list `test-support/verdict-language.mjs` can print. **Measured: 36 of 36 surface files supported,
zero free callees, zero bare-specifier imports.**

Not knowing is not a pass: an unreadable verdict form makes the file UNSUPPORTED, and an unsupported
file is an offender in the same list as a vacuous subject. It is never "not applicable" — declining
to analyse what it cannot read would be this guard committing the defect it exists to reject.

## 3 · The admitted vocabulary, stated and checked

Measured across 1,025 assertion calls in the 36 enumerated files:

```
equal 545   ok 160   match 125   deepEqual 103   notEqual 62
doesNotMatch 16   throws 8   notDeepEqual 3   doesNotThrow 2   fail 1
```

`ADMITTED_ASSERTIONS` in the test carries that list and is compared against the surface **in both
directions**: a form used but unlisted means the mechanism reasons about a dialect the surface has
outgrown; a form listed but unused means the list describes an imagined repository.
`strictEqual`/`deepStrictEqual` are absent because every file imports `node:assert/strict`, under
which `equal` *is* `strictEqual`.

A separate test runs the **same** non-refuting derivation through **every** admitted form and requires
each to be flagged — so the property is about the form set, not about examples someone thought to
write. Written uniformly it reported `notEqual` and `notDeepEqual` as fail-open sinks; the mechanism
was right and the probe was wrong, because `notEqual(xs, [])` is a lower bound and a perfectly good
proof of liveness. The probe now uses a non-refuting expectation per form and says why.

## 4 · Falsification

Each specimen imports `node:assert` and asserts with it, so round two's control passes:

| Specimen | Escapes liveness | Rejected as |
| --- | --- | --- |
| `foreign-assert.mjs` — `expect(f).toBeTruthy()` | yes | `free-callee` |
| `unknown-wrapper.mjs` — helper from `@acme/test-helpers` | yes | `foreign-module` |
| `aliased-assert.mjs` — `const eq = assert.equal` | yes | `assert-escapes` |

Both halves are asserted. If a specimen stopped escaping the liveness rules the test would otherwise
pass while proving nothing about the language boundary.

## 5 · A defect in a shared helper, found by the resolver

Making imported helpers readable meant resolving names to their declarations. Six of 170 would not
resolve, and two of those were not export forms at all: `stripComments` was **blanking live code**.

```js
const m = /^[a-z][a-z0-9+.-]*:\/\/([^/@]+)@/i.exec(value.trim());
```

The `/` inside the character class `[^/@]` ended the literal early; the `@]+)@` that followed was read
as code, and the `/` before `i` opened a second regex that blanked source until the next slash.

Affected: `ci/credential-hygiene.mjs`, `scripts/contracts/adapter.mjs`, `scripts/identity.mjs` — three
production modules with regions invisible to **every** scanner in this repository, ST-15's and
ST-16's included. **No test-surface file was affected**, and no test outcome changed when it was
fixed: 398/368/0/30 before and after. Verified by dumping the stripped form of every tracked `.mjs`
with and without the fix and diffing.

## 6 · Round eleven — which does NOT count

Twenty shapes aimed at the new boundary. **Ten escaped.** They were two faults, both the round-two
fault one level up:

- **Six**: a verdict-reaching function reached through a value the mechanism could not name — an
  object shorthand method, a class method, an arrow in an array, an arrow as a default parameter, a
  function in a `Map`, a tagged template. `assertingHelpers` enumerated *declaration syntaxes*, and
  the syntax space wins that race exactly as the sink space did.
- **Two**: `assert` itself escaping into a value position — `run(assert, files)`, `new Proxy(assert, {})`.

Both were fixed by inverting rather than extending. `helper-attribution.mjs` finds every function
*body* structurally and attributes the verdict-reaching ones to the declaration containing them, so a
new way of spelling a function needs no rule. `assertEscapes` says `assert` may appear as a callee and
nowhere else.

The mechanism was modified during this round, **so it is not evidence.** It is recorded because what
it found is.

Two corrections came out of it, both caught by measuring against the whole surface rather than the
specimens:

- A transitive hop written as "mentions a verdict-bearing name" promoted `const rows = statesTable()`
  — *data*, whose assertions already ran — and flagged an honest parse loop in `front-door.test.mjs`.
  Restricted to construction (`new V()`), which is the narrow case it was for.
- `r-optional-call.mjs` was withdrawn: written as an attack, it reaches no verdict at all, so not
  flagging it is correct.

## 7 · Round twelve — which does count

Twenty new shapes, run against a mechanism **it did not modify**. **Six escaped.**

```
destructured-helper   const [check] = [(f) => assert.ok(f)]
factory-wrapper       const chk = make()          // make returns an asserting arrow
foreach-byref         files.forEach(check)        // no loop body mentions the helper at all
object-values         for (const h of Object.values(handlers)) h(f)
symbol-iterator       { *[Symbol.iterator]() { ... } }
optional-subject      for (const f of files?.list)
```

Five are one fault: **attribution is by NAME, and a function is a VALUE that flows** — out of a
destructuring, out of a return, into an argument, through a derived collection, behind a computed key.
Each hop loses the name, and the loop that calls the function mentions a name attribution never saw.
Closing them needs data flow, not another binder form. The sixth is a subject shape and unrelated.

All six are in `test/fixtures/subject-liveness/escapes/` with `KNOWN_ESCAPES` compared against the
directory in both directions.

**The list grew from one to six, and that is the measurement moving rather than the gap opening.**
Every one of these escaped round two's mechanism as well; nobody had attacked with them. Counting
something for the first time is not the same as causing it.

## 8 · Regression and self-liveness

All nine earlier attack corpora re-run against the final mechanism: **0 escapes each**. Round eleven's
nineteen valid shapes: 0. Surface: **36 files, 0 offenders** — no honest guard reddened.

Stripping all 13 liveness assertions from `test/subject-liveness.test.mjs` makes the suite red twice
over, as in round two: ST-16 catches itself, because its own test file is in the surface it scans, and
ST-15 catches it independently through the accumulator route.

`test-support/verdict-language.mjs` and `test-support/helper-attribution.mjs` are **not** in the
authoritative surface, which enumerates `test/*.test.mjs`. Neither is `subject-liveness.mjs`. That is
the existing scope, stated rather than implied: these modules are governed by the tests that exercise
them, not by the surface scan.

## 9 · A stale record, fixed

`test/fixtures/subject-liveness/escapes/README.md` on `020a8d4` says the directory is "currently empty
of specimens" while `foreign-assert.mjs` sits beside it. That prose shipped in #45 — my own — and was
wrong the day it merged. The *test* was correct throughout, because `KNOWN_ESCAPES` is executable and
the sentence was not. It is the exact failure this line of work is about, committed in its own
paperwork.

## 10 · Verification

Local: **400 tests, 370 pass, 0 fail, 30 skipped.** The 30, counted on this run:

| Count | Reason |
| --- | --- |
| 22 | no authoritative oracle configured (`ENFORCER_ORACLE_REPO`) |
| 4 | the platform reads a `0o000` file anyway — Windows ignores it; **NOT simulated** |
| 4 | symlinks unavailable; cases 7b, 7d, 7e, 7f **NOT exercised** |

## What this does not do

It closes the **language** a verdict may be written in, and that closure is argued from the four
places a call can root rather than from a list of shapes. It does not close the shape space, and
round twelve shows it does not: six shapes reach a verdict in the admitted language, through names
the mechanism holds, and are still missed because it tracks names and not values.

ST-16's close condition is unchanged and unmet.
