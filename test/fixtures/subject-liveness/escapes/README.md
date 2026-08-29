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

**Five specimens**, and **none of them is an aliasing shape**. Round fifteen closed that whole family.

| Specimen | Fault | Family |
| --- | --- | --- |
| `member-assign.mjs` | `o.c = chk` binds a carrier to a MEMBER PATH, which the binder scan skips so member paths are not read as declarations | flow |
| `proto-call.mjs` | `Array.prototype.forEach.call(files, chk)` - the subject is an argument, not the receiver of `.forEach(` | consumption grammar |
| `concat-literal.mjs` | `[].concat(files)` - a subject must begin with an identifier, so an array-literal receiver matches nothing | subject grammar |
| `await-subject.mjs` | `for (const f of await load())` - the subject grammar does not admit `await` | subject grammar |
| `symbol-iterator.mjs` | `staticallyNonEmpty` counts an object literal's own members as proof of what `Symbol.iterator` yields | liveness proof |

`member-assign.mjs` is the only one in the flow family, and it is the one a further pass of the same
analysis could close. The other four are three different mechanisms - consumption grammar, subject
grammar, and what counts as evidence of liveness - and folding them into the flow analysis would be
attributing them to a cause that measurement does not support.

### On `symbol-iterator.mjs`

It is **not the fault it was filed as.** Round twelve recorded it as an attribution failure.
Measurement disagrees: its consumption *is* found, its subject *is* `box`, and the loop asserts
directly, so no attribution is needed. Sound for an array literal, whose members are its elements;
unsound for an object consumed by `for-of`. Closing it changes what counts as evidence of liveness,
and `Object.entries({ ... })` is a legitimate case where the member count *is* the proof.

### The count went 1 -> 6 -> 9 -> 2 -> 5, and every move was measured

Each adversarial round is run against the mechanism it is attacking **and** against the previous one,
so a growing list can be told apart from a widening gap:

| Round | vs previous mechanism | vs the one it attacked |
| --- | --- | --- |
| fourteen | 11 / 20 | 8 / 20 |
| sixteen | 5 / 20 | 3 / 20 |

Nothing that was caught before escapes now, in either round.

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
