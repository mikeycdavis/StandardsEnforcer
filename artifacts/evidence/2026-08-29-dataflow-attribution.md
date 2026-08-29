# Following the value: what a data-flow model of attribution closed, and what it did not

**Item:** [ST-16](../backlog/items/ST-16.md) · **Base:** `8de2845f2ae47bef659a92e4f157e01437c6c255`
· **Status after this work: still open.** Nine shapes escape, recorded executably rather than
described. This continues [round one](2026-08-28-subject-liveness.md),
[round two](2026-08-28-subject-liveness-round-two.md) and
[round three](2026-08-28-verdict-language-closure.md).

## 1 · The record was wrong about one of the six

Round twelve found six escapes against a mechanism it did not modify, and recorded all six as one
fault: attribution holds a NAME, and a function is a VALUE that flows.

**Measurement disagrees about one of them.** Before changing anything, each specimen was run through
the mechanism and asked why it escaped:

| Specimen | Recorded as | Measured |
| --- | --- | --- |
| `destructured-helper` | attribution | attribution — the pattern binds no name the scan sees |
| `factory-wrapper` | attribution | attribution — the hop was gated on construction only |
| `foreach-byref` | attribution | **consumption** — `blockAt` returns `check);`, not nothing |
| `object-values` | attribution | attribution — innermost binder is `len`, the loop names neither |
| `optional-subject` | subject shape | subject shape — `?.` absent from the subject grammar |
| `symbol-iterator` | attribution | **a false proof of liveness** — see section 5 |

Three faults, not two. For `symbol-iterator` the consumption *is* found and the subject *is* `box`; no
attribution is needed at all, because the loop asserts directly.

## 2 · The model

Two edges over names, applied to fixpoint:

```
CONTAINMENT   a verdict-reaching body inside a name's extent makes that name a carrier
FLOW          a carrier reaching a new name through a binding makes that name a carrier
```

Three changes made it real, and each replaced a rule that had been stated as a special case:

- **Containment credits EVERY containing declaration**, not the innermost. `{ len: (f) => ... }` puts
  the checker inside `handlers` as surely as inside `len`, and a loop over `Object.values(handlers)`
  never mentions `len`. The innermost rule existed to stop a helper nested inside another helper
  crediting its host; that case is now over-approximated rather than missed, which is the direction
  this guard is required to err in, and the surface measurement is what holds it honest.
- **Pattern bindings carry the extent of the initialiser** they came out of, so `const [check] = [...]`
  binds a name containment can credit.
- **The flow edge is gated on what a callee HANDS BACK.** This is the whole reason the edge is safe.
  `make()` returns a checker, so its result performs a verdict; `statesTable()` returns rows, so its
  result is data. Both mention a carrier and both bind the result to a name — "mentions a carrier"
  cannot tell them apart, and written that way in round eleven it reddened an honest parse loop in
  `front-door.test.mjs`.

## 3 · Two of the six were not attribution at all

`foreach-byref` was a **consumption** gap. `files.forEach(check)` passes the callback by reference, so
there is no block, and `blockAt` — correctly, for every other caller — returns the braceless statement
`check);` rather than nothing. A fallback keyed on an empty body could never fire. It is decided from
the ARGUMENT LIST instead: a bare reference is read as the call `forEach` is about to make of it,
which lets every existing verdict rule see it without a by-reference case of its own.

`optional-subject` was a **subject grammar** gap, and the repository's own evidence settled whether it
belonged to this mechanism. The mechanism already reads `?.` in **six** of its own derivation rules;
the for-of subject was the one place it was left out. The surface writes `?.` in 7 of its 36 files.
Admitting it makes one mechanism consistent with itself rather than adding a shape to it.

## 4 · Round fourteen, which DOES count

Twenty new shapes, run against the mechanism this work left behind and **not modified since**.
**Eight escaped.**

```
alias-hop         const chk = mid             a bare alias: no call, no construction
alias-ternary     const chk = c ? a : a       the initialiser is an expression
alias-nullish     chk ??= (f) => ...          binds with no declaration keyword
alias-spread      const all = [...base]       derives a collection from one holding a checker
alias-bind        o.chk.bind(o)               returns the function; body not this file's to read
alias-map-get     m.get("len")                a factory shape with a builtin callee
arg-passthrough   run(files, chk)             called through the parameter name
await-subject     for (const f of await l())  the subject grammar does not admit await
```

Seven are one fault, and it is the next hop after the one just closed: **this model follows a value
across containment, a return and iteration, and does not follow a plain re-binding.** A re-binding is
the cheapest edge there is. `alias-bind` and `alias-map-get` additionally mark the limit of the
returns-a-function gate — it can only ask what a callee hands back when that callee's body is in this
file, and `.bind()` and `Map.get()` are not.

**The record grew from one to nine, and that is the measurement reaching further rather than the gap
opening.** The whole of round fourteen was run against the PREVIOUS mechanism as well: **11 escapes
there, 8 here.** Every one of the eight escaped both, and nothing caught before escapes now.

## 5 · A false proof of liveness, left open deliberately

`symbol-iterator` escapes because `staticallyNonEmpty` counts an object literal's own members as proof
the collection is non-empty. Measured directly:

```
object literal with iterator   staticallyNonEmpty = true
object literal plain           staticallyNonEmpty = true
array literal with elements    staticallyNonEmpty = true
empty object literal           staticallyNonEmpty = false
```

Sound for an ARRAY literal, whose members are its elements. Unsound for an object consumed by
`for-of`, where `Symbol.iterator` decides what is yielded — here, from `files`, which may be empty.

It is left open rather than patched. Closing it changes what counts as *evidence of liveness*, and
`Object.entries({ ... })` is a legitimate case where the member count IS the proof. Separating the two
needs its own falsifier, and guessing at it would risk reddening honest guards — the one failure that
makes a discriminator worse than none.

## 6 · Regression and self-liveness

Every corpus re-measured against the final mechanism:

| Measured | Result |
| --- | --- |
| Surface, 36 files | **0 offenders** — no honest guard reddened |
| Nine earlier attack corpora, round 11 and round 12 (217 shapes) | nothing caught before escapes now |
| Round twelve's six | five now caught, moved to `caught/` as regression specimens |
| Round fourteen, 20 shapes | 8 escape here; 11 escaped the previous mechanism |

**The mechanism catches itself.** Stripping the four liveness proofs from
`test/subject-liveness.test.mjs` — the file is inside the surface it scans — turns the suite red and
names its own two collections:

```
test/subject-liveness.test.mjs: VACUOUS fixtures("      ") (for-of)
test/subject-liveness.test.mjs: VACUOUS testFiles(ROOT) (for-of)
```

The assertions were restored and the suite is green. This is a narrower demonstration than round
three's: four proofs were stripped rather than all thirteen, so ST-15's independent catch through the
accumulator route was **NOT** re-exercised here. ST-15's guard is active and its tests pass.

## 7 · Verification

Local: **400 tests, 370 pass, 0 fail, 30 skipped.** The 30, counted on this run:

| Count | Reason |
| --- | --- |
| 22 | no authoritative oracle configured (`ENFORCER_ORACLE_REPO`) |
| 4 | the platform reads a `0o000` file anyway — Windows ignores it; **NOT simulated** |
| 4 | symlinks unavailable; cases 7b, 7d, 7e, 7f **NOT exercised** |

## What this does not do

It closes one class of value flow. It does not close value flow, and round fourteen shows exactly
where the boundary now sits: a checker that is re-bound, spread, bound, retrieved from a builtin
container, or passed as an argument still reaches a verdict this mechanism cannot see.

The same structural fault has now been met four times — enumerating sinks, then declaration syntaxes,
then names, and now a fixed set of flow edges. Each time the repair was to invert the default rather
than extend the list. The fourth instance suggests the honest end state is a reaching-definitions
analysis over the file, which is a different order of work from any round so far and should be decided
deliberately rather than arrived at by another increment.

ST-16's close condition is unchanged and unmet: an adversarial round that finds nothing, run against a
mechanism it did not modify. Fourteen rounds have been run and none has delivered one.
