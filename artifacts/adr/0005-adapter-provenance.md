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
discoveries is enough to promote it from corrected evidence to an executable invariant.
`test/identity-tags.test.mjs` holds it — one file, because two files locking one behaviour is how
they come to disagree about it, and `test/identity-provenance.test.mjs` covers the surrounding
refusals and the chain ordering instead:

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

---

## Amendment, 2026-08-26 — subject identity: the release must be the pack that was *asked for*

**Status:** accepted. Raised by the wrong-pack-before-adoption defect found on merged PR #34
(finding F2), remedied in `fix/identity-before-adoption-vocabulary`.

The chain above verifies that a release is **the one that was pinned**. It does not verify that the
pinned release is **the one that was asked for**, and those are different questions. Every step
passes for a genuinely verified release of the wrong pack: the tag resolves, the commit matches, the
checkout is exactly the reviewed release, the adapter is read from that checkout and from nowhere
else. Provenance is perfect. The pack is wrong.

That gap had a consequence, because `adoption.policyFiles` gave the release a second kind of
authority. Scope asks for pack `A`; the pinned triple points at a verified release of pack `B`; `B`'s
declared marker vocabulary became the set the target was searched for. A repository that had adopted
`A` correctly was reported `NOT_ADOPTED` — under a confirmed in-scope disposition, a **blockable
delinquency finding** — and told to create a filename belonging to a pack its operators never asked
about. INV-E1 in its plainest form: a true condition reported as a different, blockable one.

### The invariant, extended

The invariant above named four properties sharing one provenance. It gains a fifth, and a
precondition on all of them:

> **Evaluator code, invocation declaration, native-status vocabulary, passing-set interpretation and
> adoption vocabulary must share one verified release identity — and that identity must be the one
> the invocation named, established before any of the five is consumed.**

`adoption.policyFiles` is **pre-invocation authority metadata**. It is consumed before the evaluator
is spawned, so a check that lives at the evaluator seam is, for it, a check that never runs.

### Two gates, deliberately, and neither is redundant

```text
scope resolved
      ↓
adapter loaded from the verified checkout        (this ADR, unchanged)
      ↓
declared standard.id == the scoped standard      ← the early gate: protects the metadata below
      ↓
adoption vocabulary may now be consumed
      ↓
evaluator seam — runOfficialEvaluator
      ↓
declared standard.id == the invocation's id      ← R2: defence in depth for the seam itself
      ↓
spawn
```

**R2 is not superseded and MUST NOT be moved.** Its own note records why travelling earlier is
forbidden: it would put scope resolution behind the evaluator seam, which
`test/scope-seam-invariance.test.mjs` exists to prevent. It also guards a wider surface than the
early gate — `runOfficialEvaluator` is exported and has callers that never pass through the adoption
path, and a gate is only worth what its narrowest caller gets.

Equally, the early gate is not made redundant by R2. It answers the same question at a point R2
cannot reach, about data R2 never sees. Removing either on the grounds that the other exists
reintroduces one of the two defects.

The early gate is **silent when no standard was scoped**. With nothing asked for, no release can be
the wrong one, and refusing every release for failing to match nothing would be a new defect in place
of the old one.

`test/identity-before-adoption.test.mjs` holds this: both gates asserted to fire on the paths that
reach them, and the ordering proved load-bearing by a falsifier. Its negative property is asserted
rather than inferred — the same mismatch is run against three different wrong-pack vocabularies and
the whole result must be invariant under them and must name none of their filenames.

### What this does not decide

Whether a consumer may extend a pack's marker set. It may not — `LEGACY_ADOPTION_MARKERS` is frozen
and carries that prohibition at its definition — but the authority boundary behind it is recorded in
no ADR. That gap is tracked separately and is deliberately not resolved here.
