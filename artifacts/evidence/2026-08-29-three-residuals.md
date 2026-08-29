# Three residuals closed, and the point at which extending grammars stops being the answer

**Item:** [ST-16](../backlog/items/ST-16.md) · **Base:** `377bbc25aba3c87a70da3b101844cfb3b964a9e3`
· **Status after this work: still open.** Fourteen shapes escape. Continues
[round five](2026-08-29-reaching-definitions.md).

## 1 · The three, closed as three

Round sixteen's residue was explicitly **not** one fault, and it was fixed as three:

| Residual | Fault | Closure |
| --- | --- | --- |
| `member-assign` | `o.c = chk` — the binder scan skips a name preceded by a dot, so member paths are not read as declarations, and this bound nothing | member assignment binds, attributing the LAST SEGMENT, which is the name the call site writes |
| `proto-call` | `Array.prototype.forEach.call(files, chk)` — the subject moved out of the receiver into the first argument | a borrowed-iteration rule; `call` and `apply` are the only two ways a method is invoked on a receiver it was not reached through |
| `concat-literal` | `[].concat(files)` — a subject had to begin with an identifier, so a literal receiver matched nothing | the subject grammar admits an array-literal receiver |

The third carries a false-positive risk that is now asserted rather than argued: a literal **with**
elements proves its own liveness, so `for (const x of [1, 2])` and `for (const x of [1, 2].concat(m))`
are controls in the accepted-shapes test.

## 2 · Round eighteen — twelve of twenty, and the number is not the finding

Twenty shapes aimed at the frontier round seventeen had just moved, against a mechanism it did not
modify. **Twelve escaped** — the highest any round has produced. Run against the previous mechanism it
escaped **15**, and nothing regressed, so this is a harder corpus rather than a worse mechanism.

The finding is what the twelve are:

| Family | Count | Shapes |
| --- | --- | --- |
| **Flow** | 5 | `s.add(chk)`, `cs.push(chk)`, `reg["c"] = chk`, `[a, b] = [b, a]`, a factory returning an object |
| **Subject grammar** | 4 | `(files)`, `(0, files)`, `Array.from(new Set(files))`, `await o.load()` |
| **Consumption grammar** | 3 | `Reflect.apply`, `Array.from(files, chk)`, a borrowed `every` |

Round twelve's six escapes were **one** fault. These twelve are spread evenly across every grammar
this scanner has, and two of them say why:

- **`paren-subject.mjs` — `for (const f of (files))`.** Ordinary JavaScript. A parser handles it for
  nothing; a regex subject grammar cannot see it at all.
- **`mutate-set-add.mjs` — `s.add(chk)`.** The flow analysis follows BINDINGS, and a mutation is not
  a binding: `s` was bound once, to an empty Set.

## 3 · What that changes about the work

Rounds two, eleven, twelve and fourteen each had a dominant fault, and each was closed by inverting a
default — the sink space, the syntax space, the name space, the flow-edge space. **Round eighteen has
no dominant fault.** The residue is now the reading mechanism itself: three grammars that would each
need extending in step, and that do not converge because ordinary JavaScript keeps producing shapes a
regular expression cannot express.

Extending three grammars together is not a smaller job than parsing the source. That is a scope
question for the owner, not a decision to arrive at by another increment, and it is recorded here
rather than acted on.

## 4 · Regression and self-liveness

| Measured | Result |
| --- | --- |
| Surface, 36 files | **0 offenders** |
| 257 shapes across twelve corpora | only the fourteen recorded escapes get through |
| Round eighteen | 15 escapes against the previous mechanism, 12 against this one, **0 regressions** |

**Red twice over.** Stripping the six liveness assertions from `test/subject-liveness.test.mjs` — the
file is inside the surface it scans — fails both guards:

```
subject  · every consumed collection in the surface was proven to have elements
liveness · every accumulator verdict in the surface proves it examined something
```

Restored, and the suite is green. As recorded in round five, ST-15's guard is satisfied by ANY
liveness assertion in a file, so it is coarser than ST-16's; both firing is still an independent
check, not a doubled one.

## 5 · Verification

Local: **406 tests, 370 pass, 0 fail, 36 skipped.** The 36, counted on this run:

| Count | Reason |
| --- | --- |
| 26 | no authoritative oracle configured (`ENFORCER_ORACLE_REPO`) |
| 2 | the oracle subject could not be materialised — same missing configuration, ST-14's guard |
| 4 | the platform reads a `0o000` file anyway — Windows ignores it; **NOT simulated** |
| 4 | symlinks unavailable; cases 7b, 7d, 7e, 7f **NOT exercised** |

## What this does not do

It closes three bounded residuals and leaves fourteen shapes escaping, in three families, none of them
dominant. The clean-round condition — an adversarial round finding nothing, against a mechanism it did
not modify — is unmet, and eighteen rounds have now been run without one.

ST-16 remains open. EP-06 was not re-evaluated.
