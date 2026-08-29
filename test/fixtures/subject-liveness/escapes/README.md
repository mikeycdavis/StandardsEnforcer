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

**Fourteen specimens**, and for the first time they do **not** share a dominant fault.

### Flow (5) - a checker reaching a name the analysis does not follow

| Specimen | The hop |
| --- | --- |
| `mutate-set-add.mjs` | `s.add(chk)` - a MUTATION, and this analysis follows bindings; `s` was bound once, empty |
| `mutate-push.mjs` | `cs.push(chk)` - the same |
| `computed-key-assign.mjs` | `reg["c"] = chk` - a subscript has no segment to bind |
| `destructuring-assign.mjs` | `[a, b] = [b, a]` - a destructuring assignment with no declaration keyword |
| `factory-returns-object.mjs` | `mk()` hands back a CONTAINER of a checker, not a checker |

### Subject grammar (4) - the loop is never seen as a consumption

| Specimen | The subject |
| --- | --- |
| `paren-subject.mjs` | `for (const f of (files))` |
| `comma-subject.mjs` | `for (const f of (0, files))` |
| `nested-call-subject.mjs` | `Array.from(new Set(files))` - two calls deep |
| `await-subject.mjs`, `await-member-subject.mjs` | `await load()`, `await o.load()` |

### Consumption grammar (3) - the iteration is real but unrecognised

`reflect-apply.mjs` (`Reflect.apply`), `array-from-mapper.mjs` (`Array.from(files, chk)`),
`borrowed-every.mjs` (`assert.ok(Array.prototype.every.call(files, ok1))`).

### One false proof of liveness

`symbol-iterator.mjs` is **not the fault it was filed as.** Its consumption *is* found and its subject
*is* `box`; the loop asserts directly. It escapes because `staticallyNonEmpty` counts an object
literal's own members as proof - sound for an array literal, unsound for an object whose
`Symbol.iterator` yields from elsewhere. Closing it changes what counts as evidence of liveness, and
`Object.entries({ ... })` is a legitimate case where the member count *is* the proof.

## What this list is now telling you

`paren-subject.mjs` is the one to read first. `for (const f of (files))` is ordinary JavaScript that a
parser handles for nothing and a regular expression cannot see. Rounds two, eleven, twelve and
fourteen each had a dominant fault closed by inverting a default; round eighteen has none, and the
residue is spread evenly across all three grammars this scanner has.

Extending three grammars in step is not a smaller job than parsing the source, and it does not
converge. That is a scope question, recorded here rather than answered.

## Every round is measured against two mechanisms

So a moving measurement can be told apart from a widening gap:

| Round | vs previous mechanism | vs the one it attacked |
| --- | --- | --- |
| fourteen | 11 / 20 | 0 / 20 after round fifteen |
| sixteen | 5 / 20 | 3 / 20, then 0 after round seventeen |
| eighteen | 15 / 20 | 12 / 20 |

Nothing caught before escapes now, in any round.

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
