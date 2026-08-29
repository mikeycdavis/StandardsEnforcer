# The set of ways a value stops travelling is closed, and has one member

**Item:** [ST-16](../backlog/items/ST-16.md) · **Base:** `13d1a0494eb8808d1169d51910ea400c38471013`
· **Status after this work: still open.** Five shapes escape, none of them an aliasing shape.
Continues [round three](2026-08-28-verdict-language-closure.md) and
[round four](2026-08-29-dataflow-attribution.md).

## 1 · What the owner authorised, and what it was

Round fourteen found eight escapes, seven of them aliasing: `const chk = mid`, a ternary, `??=`, a
spread, `.bind()`, `Map.get()`, and a checker called through a parameter. The owner scoped ST-16 to
carry those seven, keeping the fail-closed language boundary intact.

They were one fault. Round four's model followed a checker across three edges — containment, a
factory's return, iteration — and **enumerated them**. That is the same mistake this line of work has
now made four times at four levels: the sink space beat round two, the syntax space beat round eleven,
the name space beat round twelve, and the flow-edge space beat round fourteen.

## 2 · The inversion

```
An expression CARRIES a checker unless every mention of a carrier is a call whose result is data.
```

Default to yes; subtract the one case that provably stops. `statesTable()` ran its assertions at that
line and handed back rows. Everything else — an alias, a ternary branch, a spread, a receiver, an
element, an argument — is the function value still travelling.

**The set of ways a value can travel is open. The set of ways it stops is closed, and has one
member.** That asymmetry is why this is a closure argument rather than a longer list, and it is the
same shape as round three's argument about where a call can root.

Two edges were added around it, each a binding the previous scan could not see at all:

- **Logical assignment binds.** `chk ??= (f) => assert.ok(f)` declares nothing and initialises
  nothing, so the function body it holds had no name to be attributed to.
- **A parameter that RECEIVES a carrier at any call site carries it.** `run(files, chk)` puts the
  loop inside `run`, over the parameter `xs`, and nothing inside `run` names a carrier. Positional and
  one hop deep, which is all the measured shapes need and all this can honestly claim.

## 3 · A regression the sweep caught, and what it taught

Unifying the edges dropped a case that had been caught for eleven rounds:

```js
class V { check(f) { assert.ok(f.length > 3); } }
const v = new V();
for (const f of files) v.check(f);
```

`new V()` was folded into the callee case, and `V`'s body does not return a function, so the carrier
stopped there. **Construction is not a call whose result is data** — it yields an object holding the
carrier's methods, so the checker has not stopped travelling, it has been wrapped. Found by running
all nine earlier attack corpora, not by reasoning; the specimen is `round11/r-class-method.mjs`.

## 4 · Round sixteen, which counts — and does NOT meet the gate

The owner required a clean adversarial round against an unchanged mechanism with **zero** escapes.
Twenty new shapes were run against what this work left behind, unmodified during the round.

**Three escaped. The gate is not met, and ST-16 does not close.**

| Specimen | Fault | Family |
| --- | --- | --- |
| `member-assign.mjs` | `o.c = chk` binds a carrier to a MEMBER PATH, which the binder scan skips so member paths are not read as declarations | flow |
| `proto-call.mjs` | `Array.prototype.forEach.call(files, chk)` — the subject is an argument, not the receiver | consumption grammar |
| `concat-literal.mjs` | `[].concat(files)` — a subject must begin with an identifier | subject grammar |

Only `member-assign` is in the flow family. The other two are different mechanisms, and folding them
into the flow analysis would attribute them to a cause measurement does not support.

They are recorded rather than patched. Patching them would make round sixteen stop counting, and the
round after it would have to establish everything again from scratch.

## 5 · Measurement moving vs the gap opening

Every adversarial round is run against the mechanism it attacks **and** against the previous one, so a
growing list can be told apart from a widening gap:

| Round | vs previous mechanism | vs the mechanism it attacked |
| --- | --- | --- |
| fourteen | 11 / 20 | **0 / 20** after this work |
| sixteen | 5 / 20 | **3 / 20** |

Nothing that was caught before escapes now, in either round.

## 6 · Regression and self-liveness

| Measured | Result |
| --- | --- |
| Surface, 36 files | **0 offenders** — the over-approximation reddened no honest guard |
| 237 shapes across eleven corpora | only the five recorded escapes get through |
| Round fourteen's eight | seven now caught and moved to `caught/`; `await-subject` remains |

**Red twice over.** Stripping the liveness assertions from `test/subject-liveness.test.mjs` — the file
is inside the surface it scans — fails both guards:

```
subject  · every consumed collection in the surface was proven to have elements
liveness · every accumulator verdict in the surface proves it examined something
```

ST-16 names its own collections; ST-15 catches it independently through the accumulator route. The
assertions were restored and the suite is green.

**A qualification worth recording.** ST-15's guard is satisfied by ANY liveness assertion anywhere in
the file, so it fires only once the file has none left — eight had to be stripped, where ST-16 fired
after one. ST-15's independent catch is real but **coarser** than ST-16's, and it is not a per-subject
check. That is a fact about ST-15's mechanism, discovered here rather than assumed.

## 7 · Verification

Local: **406 tests, 370 pass, 0 fail, 36 skipped.** The 36, counted on this run:

| Count | Reason |
| --- | --- |
| 26 | no authoritative oracle configured (`ENFORCER_ORACLE_REPO`) |
| 2 | the oracle subject could not be materialised — same missing configuration, reported separately by ST-14's new guard |
| 4 | the platform reads a `0o000` file anyway — Windows ignores it; **NOT simulated** |
| 4 | symlinks unavailable; cases 7b, 7d, 7e, 7f **NOT exercised** |

The count rose from 30 because PR #47 (ST-14) landed on `main` mid-work and added six oracle-dependent
tests. `main` was re-measured immediately before this work and had moved from `8de2845` to `13d1a04`;
it was merged in and the whole surface re-measured rather than carrying the earlier result forward.

## What this does not do

It closes the aliasing family and does not close value flow. `member-assign.mjs` is the standing proof
of that: a member path is a binding this analysis does not hold.

The remaining four escapes are **four different mechanisms** — flow, consumption grammar, subject
grammar, and what counts as evidence of liveness. That is a change in kind from round twelve, where
six escapes were one fault, and it is the most useful thing this round establishes: the flow gap is no
longer the dominant one.

ST-16's close condition is unchanged and unmet. Sixteen rounds have been run and none has delivered a
clean one.
