# ADR 0005 — Adapter provenance: authority travels with the release

**Status:** accepted, 2026-08-09
**Context:** M2 Phase 3 precondition, raised by the adapter lineage review (`edff4f2`)

> **The governed repository supplies evidence; the pinned standards release supplies authority. No
> artifact controlled by the governed repository may redefine how that authority is invoked or how
> its result is interpreted.**

## Numbering

This is `0005`, not `0004`. The scope lineage already took `0004`
(`0004-scope-is-a-recorded-decision.md`) on its own branch. The two lineages have already collided on
milestone numbers; a second collision on ADR numbers would make the record ambiguous exactly where it
is supposed to be definitive.

## The problem

`schemas/standards-adapter.schema.json` says a pack owns its contract. Nothing said **where the
contract may be read from**. That is not an implementation detail — it decides who holds authority.

An adapter readable from the governed repository lets a target redefine the authority that judges it.
The evaluator stays completely authentic and the attack still succeeds, because the interpretation
contract has been substituted underneath it:

```text
target-controlled adapter
        ↓
result.passing = ["NON_COMPLIANT"]
        ↓
the real, pinned, identity-verified evaluator returns NON_COMPLIANT
        ↓
StandardsEnforcer reports it as passing
```

Every check in the identity chain passes. The tag resolves, the SHA matches, the materialised
checkout is exactly the reviewed release, and the verdict is genuinely what the standards said. Only
the meaning of that verdict was supplied by the party being judged.

This is the same violation as reimplementing verdict logic, which ADR 0001 already forbids — the
enforcer does not get to decide that `COMPLIANT` means passing, and neither does the target. It is
also the third appearance of one lesson: a gate inside the tree it gates, a scope registry inside the
repository it governs, and now an adapter inside the repository it judges.

## Decision

**The invocation contract MUST be read from the resolved, identity-verified standards-pack checkout.
It MUST NOT be read from the governed target, project policy, a workspace override, an
environment-selected path, or any other consumer-controlled source.**

Provenance becomes part of the identity chain rather than a separate configuration step:

```text
configured standard
      ↓
(repository, tag, expected commit SHA)
      ↓
materialise tag
      ↓
dereference annotated tag → commit
      ↓
verify resolved commit == expected SHA
      ↓
ONLY THEN read standards-adapter.json
      ↓
validate contract
      ↓
invoke entrypoint from that same checkout
      ↓
validate native status against that same contract
```

The adapter is therefore not independently trusted configuration. It is **part of the pinned
standards release**, and it inherits that release's verification rather than needing its own.

### The invariant

> **Evaluator code, invocation declaration, native-status vocabulary, and passing-set interpretation
> must share one verified release identity.**

Four properties, one provenance. Splitting any of them across two sources — even two trustworthy
ones — reintroduces the substitution.

### No fallback, of any kind

If the pinned release lacks `standards-adapter.json`, that is an **integration failure**, reported as
such. The enforcer does not search the target, `main`, another tag, a central adapter registry, or a
cached copy from a different resolved identity. There is no degraded mode.

This is why Innovation is `BLOCKED_RELEASE_IDENTITY` rather than being read from `main`: the absence
of a fallback is what makes the rule real. A rule that yields under inconvenience is a preference.

### The filesystem boundary is not a parameter

Phase 3 must not accept an arbitrary `adapterPath`. The signature is

```js
loadAdapter(resolvedStandard)   // resolvedStandard already carries the verified checkout and identity
```

and the location is derived internally:

```js
const adapterPath = path.join(resolvedStandard.checkoutRoot, "standards-adapter.json");
```

The caller has **no mechanism** to substitute another location. A path parameter with a sensible
default is not equivalent: it moves the decision to the call site, and call sites accumulate.

`evaluation.entrypoint` gets the same treatment — resolved relative to the verified checkout, with
traversal and escape rejected. The pack owns the path *inside its release*, not permission to execute
something outside it. These fail closed:

```text
../target/fake-evaluator.mjs
C:\somewhere\fake.mjs
/absolute/fake.mjs
a symlink escaping the verified checkout
```

### Bytes verified are bytes executed

Materialisation clones into a cache keyed by the SHA, detaches onto the commit rather than the tag,
and re-reads `HEAD` to confirm what is about to run (`scripts/identity.mjs:76-104`). The checkout is
private to the enforcer and immutable for the evaluation, so the adapter cannot be swapped between
verification and invocation. **This is a stated invariant, not an accident of the current
implementation**: any change that makes the materialised tree writable by anything other than the
enforcer, or reuses an entry across identities, breaks it and needs this ADR revisited.

Elaborate cryptographic machinery is not required *because* the checkout is private and
content-addressed. If that ever stops being true, it becomes required.

## Tag form: an explicit decision, not incidental git behaviour

An identity resolves through `git rev-list -n 1 <tag>`, which yields the **commit**. `git rev-parse
<tag>` on an annotated tag yields the tag object instead — a different SHA for the same release.

This mistake has now been made twice independently: the Phase 0 inventory recorded tag-object SHAs
throughout, and the lineage review found the same thing from the other direction. Two independent
discoveries is enough to promote it from corrected evidence to an executable invariant, and
`test/identity.test.mjs` now holds it:

```text
configured SHA == commit obtained by dereferencing the configured tag
configured SHA != the annotated tag object's own SHA
```

**Both annotated and lightweight tags are accepted, deliberately.** The identity is the commit; how
git chose to store the label pointing at it is a storage detail, and `rev-list -n 1` yields the same
commit either way. Requiring annotated tags would enforce a git implementation choice while adding
nothing — the SHA comparison already does the work that would justify it. Recorded here so the
behaviour is a decision rather than something nobody noticed. All eight packs presently use annotated
tags; if that ever becomes a requirement it will be for provenance metadata (tagger, date, message),
which is a different argument and needs making on its own terms.

## What Phase 3 must prove

Hostile provenance tests, all failing closed:

1. Target contains a forged `standards-adapter.json` with `passing: ["NON_COMPLIANT"]` → ignored.
2. Target contains a forged adapter pointing at a fake evaluator → ignored.
3. Workspace or filesystem root contains another adapter → ignored.
4. The pinned tag lacks an adapter while `main` has one → fail closed, no fallback.
5. Adapter from the correct repository but the wrong tag → cannot influence evaluation.
6. Configured SHA disagrees with the dereferenced commit → identity failure **before** any adapter
   read.
7. `evaluation.entrypoint` escapes the verified checkout → rejected.
8. Adapter mutated after materialisation but before invocation → impossible by the materialisation
   model, and asserted to be so.
9. A cached adapter from a previous standards version → cannot be reused for another resolved
   identity.

## Consequences

- One authority object flows through the evaluator seam, carrying identity, adapter, entrypoint and
  native vocabulary together. Nothing supplied by the governed repository alters those four.
- The target may supply **the subject** being evaluated, and — only where the pack's contract
  explicitly requires it — its policy. It may not supply **the meaning** of the evaluation.
- Packs whose contract is not in a release stay blocked. That is the cost of having no fallback, and
  it is the intended cost.
- ADR 0001's boundary gains a second edge. The first: the enforcer must not reimplement the
  standards. The second: nobody else may redefine them either.
