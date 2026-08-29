# Known escapes from the subject-liveness mechanism

This directory holds one `.mjs` specimen for every vacuous shape the ST-16 mechanism is known **not**
to reject. It is the residual gap, kept executable rather than described in prose.

`test/subject-liveness.test.mjs` reads this directory and compares its contents against the
`KNOWN_ESCAPES` list in that file. The two must agree, so the gap cannot change size in either
direction without a test failing and saying so:

- **A specimen here starts being caught** - the suite fails, and the fix is to move it to `caught/`
  and record the closure against ST-16.
- **A new escape is found** - add the specimen here *and* to `KNOWN_ESCAPES`, which is the deliberate
  act of re-opening the gap. Adding it silently fails the suite.

## What is here now

**Nine specimens.** One left over from round twelve, eight found by round fourteen.

### The aliasing group - seven of them, one fault

Round thirteen taught the mechanism to follow a checker VALUE across three edges: containment in a
declaration, a factory's return, and iteration of a collection. Round fourteen went one hop further
and found the cheapest edge of all missing - a plain re-binding.

| Specimen | The hop |
| --- | --- |
| `alias-hop.mjs` | `const chk = mid` - a bare alias, no call, no construction |
| `alias-ternary.mjs` | the alias is chosen by a ternary, so the initialiser is an expression |
| `alias-nullish.mjs` | `chk ??= ...` binds with no declaration keyword, so containment has nothing to credit |
| `alias-spread.mjs` | `[...base]` derives a collection from one holding a checker |
| `alias-bind.mjs` | `.bind()` returns the function, and its body is not this file's to read |
| `alias-map-get.mjs` | `Map.get()` retrieves it, same shape as a factory with a builtin callee |
| `arg-passthrough.mjs` | the checker is an ARGUMENT, called through the parameter name |

The last two show the limit of the returns-a-function gate that makes round thirteen's flow edge
safe: it asks what the callee hands back, and it can only ask that of a function whose body is in
this file. `.bind()` and `Map.get()` are not.

### The other two

`await-subject.mjs` is a SUBJECT shape - `for (const f of await load())`, which the subject grammar
does not admit, so the loop is never a consumption.

`symbol-iterator.mjs` is **not the fault it was filed as**. Round twelve recorded it as an attribution
failure. Measurement disagrees: its consumption *is* found, its subject *is* `box`, and the loop
asserts directly, so no attribution is needed. It escapes because `staticallyNonEmpty` counts an
object literal's own members as proof the collection is non-empty - sound for an array literal, whose
members are its elements, and unsound for an object consumed by `for-of`, where `Symbol.iterator`
decides what is yielded. Here it yields from `files`, which may be empty. A false **proof of
liveness**, not a lost name. Closing it changes what counts as evidence, and `Object.entries({ ... })`
is a legitimate case where the member count *is* the proof; separating the two needs its own
falsifier.

### The list grew from one to nine, and that is the measurement moving

The whole of round fourteen was run against the PREVIOUS mechanism as well as this one: **11 escapes
there, 8 here.** Every one of the eight recorded here escaped both. Nothing that was caught before
escapes now. Counting something for the first time is not the same as causing it.

## What left this directory

**Five specimens closed by round thirteen**, all now in `caught/` as regression tests:

| Specimen | Closed by |
| --- | --- |
| `destructured-helper.mjs` | pattern names bound to the extent of the initialiser they came out of |
| `factory-wrapper.mjs` | a flow edge for a call whose callee hands back a function |
| `foreach-byref.mjs` | a bare-reference argument read as the call `forEach` is about to make |
| `object-values.mjs` | crediting every containing declaration, and loop variables bound from expressions |
| `optional-subject.mjs` | admitting `?.` in the subject grammar, as six other rules already did |

The first four were one fault: attribution held a NAME, and a function is a VALUE that flows. They
were closed by following the value rather than by adding a binder form per hop - the same inversion
this mechanism has now needed three times, at three different levels.

`foreign-assert.mjs` was the residue after round two - a verdict written with a foreign assertion
library. It is in `../unsupported/`, because the mechanism **rejects the file** rather than reading
the shape. That is deliberately a weaker claim than catching it, and the tests keep the two apart.

`ternary.mjs` and `join-empty.mjs` were the first round's residue and are in `caught/`.

An empty directory here would not be a claim that no vacuous shape exists - only that no *known* one
does. The record of what has actually been attacked is in `artifacts/evidence/`.
