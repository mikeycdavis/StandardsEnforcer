# The adapter contract has an owner and a declaration, and no conformance boundary

> **Status: historical evidence.** Findings subsequently dispositioned by
> [the M2 acceptance record](2026-08-10-m2-acceptance.md). Preserved exactly as written on
> 2026-08-09, describing the repository as it then stood.
>
> **Do not update it to describe the repaired state.** Its value is that it recorded these
> deficiencies *before* they were repaired; rewriting "no conformance boundary exists" into "now
> implemented" would destroy the chronology that makes it evidence rather than documentation.

**Date:** 2026-08-09 · **From:** InnovationStandards at `7e75c62` (pushed to `origin/main`) ·
**Reviewing:** `standards-adapter.json` and `test/adapter-contract.test.mjs` as they landed in
InnovationStandards at `036f1f3`, against `schemas/standards-adapter.schema.json` here

This is filed as **one integration-contract review**, not four bugs, because the findings all bear on
a single question:

> Can StandardsEnforcer consume a pack solely from its declared adapter contract, without possessing
> pack-specific knowledge?

## How this was found, which bounds what it is worth

`036f1f3` was authored by a concurrent session and committed into InnovationStandards between two
commits of unrelated maintenance work in another. It was noticed because `npm test` there went red
against a file that session had never seen — a transient failure, the file being mid-write. It passes
now.

The audit that follows was done from the pack side, by reading the two files and running the CLI. It
had no knowledge of this repository's schema, ADRs, or evidence when the four findings were drafted.
Two of them turned out to be **already settled here**, and they are reported that way below rather
than as discoveries. That is the useful part of the accident: an independent reader, holding only the
pack, reached conclusions this repository had already reasoned past — which says something about where
the reasoning is legible from.

## Already settled here — recorded so the pack side stops re-deriving them

**Process semantics.** `$absentByDesign.exitCodes` states the position plainly: parseable JSON
carrying a declared status is the signal that the pack ran, and the exit code is process semantics the
enforcer does not read as a verdict. The pack-side audit flagged InnovationStandards returning
`NOT_EVALUATED` with exit `2` as an ambiguity. It is not one here — it is the documented model.

One addition to the census in that note, which cites Betting for this behaviour: **InnovationStandards
does it too.** Measured today at `7e75c62`, `validate --dir=test/fixtures/mentions-only --json` returns
`NOT_EVALUATED` at exit `2`, because that fixture carries no policy and the pack's own contract
reserves `2` for *the tool could not run*. Same shape as Betting, second instance.

**Heterogeneity across packs.** Also settled, and it is the schema's stated justification. The
pack-side audit observed that four packs now carry adapters and that Betting passes its target
positionally where the other three use `--dir=`:

```text
Betting          validate {target} --json
Innovation       validate --dir={target} --json
MachineLearning  evaluate --dir={target} --json
Mathematics      validate --dir={target} --json
```

That variation is **not a defect** and standardising the nine CLIs to simplify the enforcer would
invert the dependency boundary ADR 0001 exists to hold. Packs declare how they are invoked; the
enforcer adapts. What would be a defect is the enforcer carrying `--dir=` is universal, or `validate`
is the verdict command, or reconstructing an invocation instead of executing the declared argv.

## Finding 1 — adapter fidelity is established self-referentially

`test/adapter-contract.test.mjs` in InnovationStandards contains:

```js
const DIRECT = ["validate", "--dir={ROOT}", "--json"];
```

and asserts that invoking through `contract.evaluation.arguments` equals invoking `DIRECT`. Those two
arrays are byte-identical in content and live in files edited together. The test detects the JSON
being changed without the test being changed. It cannot detect both being wrong, and it never reads
`INSTRUCTIONS.md`, which is where that pack documents its gate invocation.

Its own header claims it "runs the documented invocation directly". It runs a colocated copy of the
declaration under test.

This matters to the enforcer because a green pack-side contract test is not evidence that the
declaration matches the pack's real interface, and the enforcer would otherwise be entitled to treat
it as such.

## Finding 2 — the defining use case is untested

Every invocation in that test uses `target = ROOT` with `cwd = ROOT`. The adapter exists for
`<pinned standards checkout> → <foreign target repository>`, and the shipped test uses the standards
repository as both.

**Current behaviour, established by hand rather than by the test:** from the InnovationStandards
checkout,

```bash
node scripts/standards.mjs validate --dir=F:/Repos/HouseDoc --json
```

returns `project: HouseDoc`, `status: COMPLIANT`. Cross-checkout execution works today.

That is evidence of present behaviour and explicitly **not** a substitute for the missing regression
test. Nothing preserves it. `$absentByDesign.workingDirectory` records that cwd independence was
tested rather than assumed — that testing lives here, and the pack-side contract test does not carry
it.

## Finding 3 — the conformance boundary does not exist anywhere

The strongest finding, and the one the other three resolve into.

- The schema is owned here: `schemas/standards-adapter.schema.json`, `additionalProperties: false`,
  every field justified by a real pack.
- The declaration is owned by the pack: `standards-adapter.json` in InnovationStandards.
- **Nothing validates one against the other.** `grep -rl standards-adapter scripts/ test/ .github/` in
  this repository returns nothing. In InnovationStandards the only reader is the contract test above,
  which checks two hand-written properties and never consults the schema. The `$id`,
  `https://standards-enforcer/schemas/standards-adapter.schema.json`, is a host with no TLD; it
  resolves nowhere and is fetched by nothing.

So a pack could ship a declaration with a misspelled key, an absent `{target}`, a `passing` value
outside `statuses`, or an unrecognised `schemaVersion`, and no gate in either repository would say so.
The schema's `additionalProperties: false` and its `const` on `schemaVersion` are doing no work today.

InnovationStandards validates every other structured file it owns against a schema it owns and
executes — `npm run policy` runs `schemas/project-policy.schema.json` over the policy on every push.
The adapter is the one structured file in that repository held to nothing.

```text
schema owned somewhere  +  declaration owned by pack  +  actual validation boundary
        yes                        yes                          missing
```

The first two without the third produce the appearance of a typed integration contract without
establishing conformance to one.

**Whether the schema must become reachable over HTTP is not prescribed by this review.** A remote
`$schema` is one design among several: the enforcer could own a local versioned schema and provide a
validator each pack invokes, or validate declarations centrally at discovery. What matters is that a
boundary exists and runs. That choice belongs to this repository.

## Census correction

The commit message for `036f1f3` states: *"Across the eight packs the verdict is `validate` in four,
`check` in two and `evaluate` in one."* That accounts for seven.

Observed on disk today:

| | |
| --- | --- |
| Standards repositories | **9** |
| With a CLI, and inventoried here | **8** |
| Carrying a committed `standards-adapter.json` | **4** — Betting, Innovation, MachineLearning, Mathematics |

The ninth is **UIUXDesignStandards**: one commit, a README and an `artifacts/` directory, no
`scripts/`. Its absence from `2026-08-09-interface-inventory.md` is correct — it has no interface to
inventory — and this note records the reason so a later reader does not mistake the omission for an
oversight.

Anything describing an eight-pack universe should be labelled **intended scope**, not empirical
census, until the ninth acquires an interface.

## Acceptance surface

What would make the central question answerable, rather than assumed:

1. **Schema conformance has a real executable validation boundary.** A declaration that violates the
   schema fails somewhere that runs, in this repository or in each pack, decided here.
2. **Adapter fidelity is established independently** — against the pack's documented interface or
   another authority, not by comparing two colocated copies of the same array.
3. **The contract is tested with standards checkout ≠ target checkout**, which is the only
   configuration the adapter exists for.
4. **Process semantics are explicit in the contract surface** about the relationship between the
   structured `status`, `passing`, and process exit. The position is already decided and recorded in
   `$absentByDesign`; a pack author reading only their own `standards-adapter.json` cannot see it.
5. **A heterogeneity fixture** proving two adapters with different verdict commands and different
   target placement — Betting positional and MachineLearning's `evaluate --dir=` are the sharpest
   available pair — are both invoked correctly without special-casing their `standard.id`.

Item 5 is the one that actually answers the central question. The first four establish that the
contract is well-formed and honest; only the fifth establishes that the enforcer needs nothing but
the contract.

## What is not being asked of InnovationStandards

Nothing. Its evidence stays as it is, and `036f1f3` stays where it landed in that history —
`d7c9e73 → 036f1f3 → 3ee1985 → 7e75c62`, unrewritten, because two of those commits were genuinely
developed against a tree containing the adapter and moving it afterwards would manufacture a tidier
chronology than the one that occurred.

If resolving any of the above requires a pack-side change, that request originates here.
