# Known escapes from the subject-liveness mechanism

This directory holds one `.mjs` specimen for every vacuous shape the ST-16 mechanism is known **not**
to reject. It is the residual gap, kept executable rather than described in prose.

`test/subject-liveness.test.mjs` reads this directory and compares its contents against the
`KNOWN_ESCAPES` list in that file. The two must agree, so the gap cannot change size in either
direction without a test failing and saying so:

- **A specimen here starts being caught** — the suite fails, and the fix is to move it to `caught/`
  and record the closure against ST-16.
- **A new escape is found** — add the specimen here *and* to `KNOWN_ESCAPES`, which is the deliberate
  act of re-opening the gap. Adding it silently fails the suite.

## What is here now

Six specimens, all found by adversarial round twelve, run against a mechanism it did not modify.

They are **one fault wearing six hats**. `helper-attribution.mjs` finds a verdict-reaching function
body and attributes it to the name that declares it — but a function is a *value*, and a value flows.
Out of a destructuring (`const [check] = [...]`), out of a return (`const chk = make()`), into an
argument (`files.forEach(check)`), through a derived collection (`Object.values(handlers)`), behind a
computed key (`*[Symbol.iterator]()`). Each hop loses the name, and the loop that calls the function
mentions a name the attribution never saw. Closing these needs data flow, not another binder form,
which is why they are recorded rather than patched one at a time.

`optional-subject.mjs` is the exception: it is a *subject* shape (`for (const f of files?.list)`)
that the consumption rules do not match, and has nothing to do with helpers.

**The list grew from one to six, and that is a measurement moving rather than a gap opening.** Every
one of these escaped round two's mechanism as well; nobody had attacked with them. Counting something
for the first time is not the same as causing it.

## What left this directory

`foreign-assert.mjs` was the residue after round two — a verdict written with a foreign assertion
library. It is now in `../unsupported/`, because the mechanism **rejects the file** rather than
reading the shape. That is deliberately a weaker claim than catching it, and the tests keep the two
apart. Round two's compensating control asked whether each file imports `node:assert`; the specimen
there now imports it, asserts with it, and still escapes the liveness rules, which is why the
question had to change.

`ternary.mjs` and `join-empty.mjs` were the first round's residue and are in `caught/`.

An empty directory here would not be a claim that no vacuous shape exists — only that no *known* one
does. The record of what has actually been attacked is in `artifacts/evidence/`.
