# Rounds nineteen to twenty-four — the parser-backed mechanism, and the round it closed on

**Date:** 2026-09-04
**Story:** [`ST-16`](../backlog/items/ST-16.md)
**Mechanism:** [`test-support/subject-liveness.mjs`](../../test-support/subject-liveness.mjs) and
[`test-support/js-ast.mjs`](../../test-support/js-ast.mjs), on acorn 8.18.0 ([ADR 0010](../adr/0010-the-parser-dependency-and-what-it-cost.md))

## What the rounds measured

Rounds one to eighteen attacked a mechanism that read JavaScript with regular expressions. Round
eighteen's finding was not its escape count of twelve but its **shape**: the residue had stopped
being one fault. Every earlier round had a dominant fault closable by inverting a default; round
eighteen's twelve were spread evenly across all three grammars the scanner had, and the plainest of
them — `for (const f of (files))` — is ordinary JavaScript no regular expression can express.

Rounds nineteen to twenty-four attack the mechanism that replaced it.

| Round | Escapes | Against | What it found |
| --- | --- | --- | --- |
| nineteen | **5 / 20** | the parser-backed mechanism, first run | flow through a parameter default, `Object.assign`, `Object.defineProperty`; a false liveness proof in `[files].flat()`; a length-gated recursion |
| twenty | **2 / 20** | unchanged since nineteen | `.at(0)` as a presence shape; an asserting `sort` comparator |
| twenty-one | **1 / 20** | unchanged since twenty | a bare `switch (files.length)` whose empty case is the pass |
| twenty-two | **4 / 20** | unchanged since twenty-one | an asserting callback inside `some`/`find`/`reduceRight`; an iterator handle advanced outside the loop test |
| twenty-three | **4 / 20** | unchanged since twenty-two | a string-keyed method call; a detached method; an index destructure through an object pattern; a derivation returned from a getter |
| **twenty-four** | **0 / 20** | **unchanged since twenty-three** | **nothing** |

Every round was run against the mechanism **before** that round modified anything, and the whole
corpus of every previous round was re-run after each change. **No specimen caught before escapes
now**, across all 120 specimens of rounds nineteen to twenty-four plus the 223 already in `caught/`.

**Round twenty-four is the closing measurement**: twenty fresh shapes, a mechanism nothing touched
between writing them and running them, zero escapes.

## What the parse tree closed for nothing

The fourteen escapes standing at the end of round eighteen were recorded as three separate faults
across three grammars. Reading a tree collapsed the three, and most of what closed them is not a
rule this repository now maintains:

| Group | Specimens | What actually happened |
| --- | --- | --- |
| Subject | `paren-subject`, `comma-subject`, `nested-call-subject`, `await-subject`, `await-member-subject` | Nothing was written. Acorn produces no `ParenthesizedExpression` without `preserveParens`; a `SequenceExpression`'s value is its last expression; `await` is one `.argument` away; nesting nests |
| Flow | `mutate-set-add`, `mutate-push`, `computed-key-assign`, `destructuring-assign`, `factory-returns-object` | Five spellings became one question — does this expression carry a checker, and which name does it reach — asked of a node. A computed key and a named one differ only in the last segment; the analysis binds the **root** |
| Consumption | `reflect-apply`, `array-from-mapper`, `borrowed-every` | A receiver is a receiver wherever the subject was written: in receiver position, as `.call`'s first argument, or as `Reflect.apply`'s second |
| False liveness proof | `symbol-iterator` | Not a grammar fault. An **array** literal's members are its elements; an **object** literal's are not, because `Symbol.iterator` decides what a `for-of` yields. `Object.entries({ a: 1 })` stays a proof, because there the members *are* what is yielded |

`symbol-iterator` and `await-subject` had both been recorded as deliberately out of scope for the
flow work, each needing its own mechanism. Both were resolved by the bounded semantics of reading a
tree rather than by a rule aimed at either.

## Three faults the rounds found that a parser does not fix by itself

Worth separating, because they are the ones that cost work:

1. **`[files].flat()` is a false proof of liveness** (round nineteen). The literal has one member and
   that member is a *collection*, not an element. Identical in kind to `symbol-iterator`, arriving
   through flattening rather than through `Symbol.iterator`. A parser makes the distinction
   *available*; it does not make it.
2. **The `some`/`find` exemption was about the RESULT and had been applied to the ITERATION** (round
   twenty-two). `files.some((f) => { assert.ok(ok(f)); return false; })` — `some` is exempt as a
   liveness proof because its result is falsy on an empty subject. Its callback is exempt from
   nothing: it runs once per element, so on an empty subject it never runs.
3. **A string key is unreadable in blanked source, and unreadable is not benign** (round
   twenty-three). This mechanism reads source whose string *contents* are blanked to spaces, so a
   specimen held as data cannot satisfy a rule about what a file asserts. That makes
   `files["forEach"](chk)` a call through a key nobody can read. The fail-closed reading is to treat
   it as an iteration of the receiver: it could be `forEach`, and not knowing is not a pass.

## Two findings that were not escapes

- **`Object.groupBy(files, cb)` was caught, and named `Object` as the collection nobody proved
  non-empty.** A correct verdict reached through a nonsense subject, because a namespace receiver was
  read as a collection. Fixed in round twenty-three. A right answer for a wrong reason is a defect
  this repository counts.
- **A text-proximity heuristic flagged two honest bindings.** `mentionedInAssertion` searched for the
  name within 160 characters of a `throw` — the approximation a scanner without a tree is forced
  into. It flagged two bindings in this repository's own ST-16 test whose entire relationship to the
  `throw` beside them was that they were near it. Now asked of the tree: *inside* a verdict, not
  *near* one.

## What was NOT replaced

The **assertion grammar** — `assertion-shape.mjs` and `verdict-liveness.mjs` — is unchanged. It reads
a closed vocabulary of ten `assert.*` forms, checked against the surface in both directions, and it
is built on the inversion that makes an unrecognised form fail closed. That is the structure the
three replaced grammars lacked, and it is why they lost and this has not.

## Numbers

- Suite: **407 tests, 371 pass, 0 fail, 36 skipped** (Windows workstation). One test added — the
  falsifier for the unparseable path.
- Skips: 26 no authoritative oracle configured + 2 oracle subject unmaterialisable + 4 the platform
  reads a `0o000` file anyway (**NOT simulated**) + 4 symlinks unavailable, cases 7b/7d/7e/7f
  (**NOT exercised**).
- `caught/`: **343 specimens**. `escapes/`: **none**, and the test asserts that case explicitly
  rather than by filtering an empty list — which would be ST-16's own defect, reached inside ST-16's
  residue check.
- The suite is **faster** than before the parser: ~19s against ~28s, because the tree is built once
  per file where the regular expressions re-scanned the source per rule.

## What an empty `escapes/` does and does not claim

It says **no known escape remains**. It is not a claim that none exists, and no number of rounds can
make it one. Six rounds against this mechanism found 16 escapes in the first five and none in the
sixth; that is a measurement of the mechanism's frontier moving, not of the shape space closing. The
empty list is the starting position for round twenty-five.
