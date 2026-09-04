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

**Nothing.** All fourteen specimens were closed by round nineteen and moved to `caught/`. Five
further rounds have been run against the parser-backed mechanism since, each against a mechanism it
had not yet modified:

| Round | Escapes | What it found |
| --- | --- | --- |
| nineteen | 5 / 20 | parameter defaults and static container writers; `[files].flat()` as a false liveness proof; a length-gated recursion |
| twenty | 2 / 20 | `.at(0)` as a presence shape; an asserting `sort` comparator |
| twenty-one | 1 / 20 | a bare `switch (files.length)` whose empty case is the pass |
| twenty-two | 4 / 20 | an asserting callback inside `some`/`find`/`reduceRight`; an iterator handle advanced outside the loop test |
| twenty-three | 4 / 20 | a string-keyed method call; a detached method; an index destructure through an object pattern; a getter-returned derivation |
| **twenty-four** | **0 / 20** | **nothing** |

Every specimen of all six rounds is in `caught/`, whether it escaped or not — a round is measured by
what it found, and a shape that never escaped is the evidence that it did not.

**An empty directory is not a claim that no vacuous shape exists.** It says that no *known* one does,
which is a much smaller statement and is the only one this corpus can support. The residue of every
round is in `artifacts/evidence/`; what a fresh round finds is the measurement that matters, and
`KNOWN_ESCAPES` being empty is a starting position for the next one rather than a result.

The test that reads this directory asserts the empty case **explicitly** rather than by iterating
nothing. That is not fastidiousness: a list-comparison over an empty corpus passes while examining
no specimen, which is precisely the defect ST-16 exists to reject, and it would be reaching it in
ST-16's own residue check.

## What round nineteen closed, and how

All fourteen at once, by **parsing the source instead of matching it** (ADR 0010). They had been
recorded as three separate faults across three grammars, and the parse tree collapsed the three:

| Group | Specimens | What the tree did |
| --- | --- | --- |
| Subject grammar | `paren-subject`, `comma-subject`, `nested-call-subject`, `await-subject`, `await-member-subject` | Nothing was written. Acorn does not produce a `ParenthesizedExpression` without `preserveParens`; a `SequenceExpression`'s value is its last expression; `await` is one `.argument` away; nesting nests |
| Flow | `mutate-set-add`, `mutate-push`, `computed-key-assign`, `destructuring-assign`, `factory-returns-object` | Five spellings became one question — does this expression carry a checker, and which name does it reach — asked of a node rather than a substring. A computed key and a named one differ only in the *last* segment, and the analysis now binds the **root** |
| Consumption grammar | `reflect-apply`, `array-from-mapper`, `borrowed-every` | A receiver is a receiver wherever the subject was written: in receiver position, as the first argument of `.call`, or as the second of `Reflect.apply` |
| False proof of liveness | `symbol-iterator` | Not a grammar fault, and closed on its own terms: an **array** literal's members are its elements, an **object** literal's are not, because `Symbol.iterator` decides what a `for-of` yields. `Object.entries({ a: 1 })` is still a proof, because there the members *are* what is yielded. The two cases differ in the tree and only in the tree |

`symbol-iterator` and `await-subject` had been recorded as deliberately out of scope for the flow
work, each needing its own mechanism. They were resolved by the bounded semantics of reading a tree,
not by a rule aimed at either of them.

## What left this directory earlier

**Five specimens closed by round thirteen**, all in `caught/` as regression tests:

| Specimen | Closed by |
| --- | --- |
| `destructured-helper.mjs` | pattern names bound to the extent of the initialiser they came out of |
| `factory-wrapper.mjs` | a flow edge for a call whose callee hands back a function |
| `foreach-byref.mjs` | a bare-reference argument read as the call `forEach` is about to make |
| `object-values.mjs` | crediting every containing declaration, and loop variables bound from expressions |
| `optional-subject.mjs` | admitting `?.` in the subject grammar, as six other rules already did |

The first four were one fault: attribution held a NAME, and a function is a VALUE that flows.

`foreign-assert.mjs` was the residue after round two - a verdict written with a foreign assertion
library. It is in `../unsupported/`, because the mechanism **rejects the file** rather than reading
the shape. That is deliberately a weaker claim than catching it, and the tests keep the two apart.

`ternary.mjs` and `join-empty.mjs` were the first round's residue and are in `caught/`.

## Every round is measured against two mechanisms

So a moving measurement can be told apart from a widening gap:

| Round | vs previous mechanism | vs the one it attacked |
| --- | --- | --- |
| fourteen | 11 / 20 | 0 / 20 after round fifteen |
| sixteen | 5 / 20 | 3 / 20, then 0 after round seventeen |
| eighteen | 15 / 20 | 12 / 20 |
| nineteen–twenty-three | — | 5, 2, 1, 4, 4 / 20 |
| twenty-four | — | **0 / 20** |

Nothing caught before escapes now, in any round. The whole `caught/` corpus — 343 specimens — was
re-run after every change made during rounds nineteen to twenty-four.
