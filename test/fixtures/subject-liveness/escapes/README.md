# Known escapes from the subject-liveness mechanism

This directory holds one `.mjs` specimen for every vacuous shape the ST-16 mechanism is known **not**
to reject. It is the residual gap, kept executable rather than described in prose.

**It is currently empty of specimens, and that is an assertion, not a silence.**
`test/subject-liveness.test.mjs` reads this directory and compares its contents against the
`KNOWN_ESCAPES` list in that file. The two must agree, so the gap cannot change size in either
direction without a test failing and saying so:

- **A specimen here starts being caught** — the suite fails, and the fix is to move it to `caught/`
  and record the closure against ST-16.
- **A new escape is found** — add the specimen here *and* to `KNOWN_ESCAPES`, which is the deliberate
  act of re-opening the gap. Adding it silently fails the suite.

Two specimens lived here after the first adversarial round: `ternary.mjs`
(`assert.equal(files.length === 0 ? 0 : files.filter(p).length, 0)`) and `join-empty.mjs`
(`assert.equal(files.filter(p).join(","), "")`). Both are now in `caught/`. They escaped because the
mechanism enumerated the *sinks* a derived collection could drain into, which is an open-ended list;
they were closed by inverting that default, so an unrecognised sink is flagged rather than allowed.

An empty directory here is not a claim that no vacuous shape exists — only that no *known* one does.
The record of what has actually been attacked is in
`artifacts/evidence/2026-08-28-subject-liveness.md`.
