# The conformance boundary exists, and it caught things immediately

**Closing Finding 3 of [the boundary review](2026-08-09-adapter-conformance-boundary.md).** That
review found the schema existed, the declarations existed, and nothing anywhere validated one against
the other — so `additionalProperties: false`, the `schemaVersion` `const`, the entrypoint pattern and
`contains` were all decorative. This is the boundary, what it caught on its first run, and the
cross-checkout fidelity evidence the review asked for.

## What was built

```text
scripts/contracts/jsonschema.mjs   executes the schema; throws on any keyword it cannot enforce
scripts/contracts/adapter.mjs      the three properties JSON Schema cannot express
test/adapter-conformance.test.mjs  29 tests, 18 of them hostile mutations
```

The schema is **executed, not paraphrased**. A hand-written checklist standing beside a schema is two
definitions of the same thing, and the drift between them is silent. This is adoption A1 from
[the orchestrator reconciliation](2026-08-10-orchestrator-reconciliation.md).

The strictness that makes it worth having: **an unsupported keyword throws rather than being
ignored**. A validator that skips a constraint it does not implement reports conformance for a
document it never fully checked. `$absentByDesign` — this repository's own root annotation — is named
explicitly in the allowed list rather than admitted by a permissive `^\$` rule, because a permissive
rule would also admit `$ref`, which is a real constraint nothing here implements.

Only three checks are hand-written, because only three are inexpressible in JSON Schema:

| Check | Why not in the schema |
|---|---|
| `passing ⊆ statuses` | JSON Schema cannot compare two sibling arrays |
| entrypoint containment | a pattern that rejects `..` correctly is a pattern nobody will read |
| known placeholders only | requires the enforcer's substitution table, which is code |

## Where it runs, and why in two places

```text
pack CI        Does the adapter I am about to release conform?        producer assurance
enforcer load  Does the adapter I just obtained from this verified    consumer defence
               release conform, before I trust it?
```

Neither substitutes for the other. Producer assurance can be skipped, disabled, or predate the rule;
a pack having validated its declaration last Tuesday is not evidence about the bytes the enforcer just
read out of a checkout. **StandardsEnforcer owns the protocol and its validation semantics; packs own
declarations conforming to it.** One implementation, here, so that eight hand-written interpretations
in eight repositories cannot drift.

## What it caught on the first run

**The schema disagreed with three of the four released contracts.**

`evaluation.arguments` carried `"contains": { "const": "{target}" }` — requiring an argument that is
*exactly* the five-token placeholder. Only Betting's positional form satisfies that:

```text
betting           ["validate", "{target}", "--json"]        const matches
machine-learning  ["evaluate", "--dir={target}", "--json"]  const does not
mathematics       ["validate", "--dir={target}", "--json"]  const does not
innovation        ["validate", "--dir={target}", "--json"]  const does not
```

Phase 1 recorded eight drafts and eight matches. That check was made by reading, not by executing, so
it did not notice that the constraint it wrote down excluded three quarters of what it had just
proven. The constraint has never been enforced, so nothing ever failed.

Corrected to `{ "type": "string", "pattern": "\\{target\\}" }` — substring, which is what substitution
does and what the field always meant. **This is not a `schemaVersion` change.** No released
declaration becomes invalid; three become valid that always should have been. Recorded rather than
quietly fixed, because "the schema was wrong and nothing could tell" is the finding, not the typo.

## Cross-checkout fidelity, properly this time

Findings 1 and 2 of the review said the Phase 2 fidelity tests establish too little: they compare the
adapter against a `DIRECT` constant sitting in the same file and edited in the same commit, and every
invocation uses `target = ROOT`, so the one configuration the adapter exists for is untested. Both
criticisms are accurate.

The experiment the review asked for, run against the three released tags:

```text
standards checkout   a fresh clone at the immutable tag
target               a separate directory, initialised by BettingStandards' own `init`
direct invocation    taken from each pack's README and cited, NOT from its adapter
adapter invocation   constructed from standards-adapter.json by substitution
```

| Pack | Tag | Documented direct | Adapter | Forms | Native result |
|---|---|---|---|---|---|
| betting | `v1.0.1` | `validate <dir>` — README:148 | `validate {target}` | same | **identical** |
| machine-learning | `v1.4.1` | `evaluate .` — README:81 | `evaluate --dir={target}` | **differ** | **identical** |
| mathematics | `v1.0.1` | `validate [path]` — README:57 | `validate --dir={target}` | **differ** | **identical** |

All three adapters conform to the corrected boundary. All three produce a **real verdict** on a target
that is not their own checkout — `NON_COMPLIANT`, `COMPLIANT`, `NON_COMPLIANT` respectively, each
reporting `"project": "REPLACE-ME"` read from the *target's* policy file, which is the proof the target
reached the pack. None graded its own tree.

The two rows where the forms differ are the ones that carry the weight: MachineLearning and
Mathematics are documented positionally and declared with `--dir=`, and until now nothing had ever
checked those agree. They do. **The heterogeneity acceptance case is met**: a positional pack and two
flag packs invoked through one protocol, with no special-casing of `standard.id` anywhere.

### A correction

An earlier reading in this session recorded MachineLearning and Mathematics as exiting `0` while
writing an error to stderr — a fail-open shape. That was a measurement artefact: the commands were run
under `|| true`, so the exit code captured was the fallback's. Both exit `2`. The fail-open hazard
does not exist.

## What the fidelity run found instead

Two defects, neither of them in the adapters.

**MathematicsStandards reports a convincing number beside an honest verdict.** Against a directory
holding one markdown file: `status: NOT_EVALUATED` with `score: 97` and `"passed": 52` of 82
catalogued rules. The status is honest and outside its passing set, so the enforcer fails closed —
but only because it reads `status` and never `score`. That safety is currently a property of what
Phase 3 happens to do. It becomes a stated invariant:

> **The enforcer reads the declared status and nothing else.** No score, no summary count, no
> denominator and no coverage figure may contribute to whether a result is passing.

**MachineLearningStandards returns a passing status having evaluated nothing.** `status: COMPLIANT`,
`denominator.scored: 0` of 46 applicable, `notEvaluated: 46`, exit `0`. Phase 3's acceptance chain
holds at every link and the enforcer would report a pass.

This one falsifies the Phase 3 design rather than refining it, and it is written up where the decision
belongs — [the reconciliation record](2026-08-10-orchestrator-reconciliation.md), *The green from
nothing*. **Phase 3 is not implemented past this point.**

## Standing

```text
DONE      the conformance boundary exists, runs, and is 29 tests
DONE      the schema is executed rather than restated
FIXED     contains: const → pattern; three released contracts now actually admitted
DONE      cross-checkout fidelity, three packs, direct from documentation, all identical
DONE      heterogeneity: positional and --dir= through one protocol, no packId branching
OPEN      the green from nothing — a decision, not an implementation
NOT DONE  pack-side fidelity tests still compare against a colocated constant (Findings 1 & 2)
```

The last line is deliberate. The pack-side repairs are worth doing and are not worth a release: the
released declarations have now been proven correct by an independent surface, so what is defective is
the packs' release-time *assurance*, not their contracts. Improving a test is not by itself grounds
for a version. That distinction is recorded so it does not become a mechanical rule in either
direction.
