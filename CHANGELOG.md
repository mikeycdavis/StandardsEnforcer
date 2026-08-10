# Changelog

## Versioning, while below 1.0.0

Stated because Phase 3 exposed the ambiguity rather than resolving it: `VERSION` said `0.2.0` while
`package.json` said `0.3.0`, and nothing decided which was the release.

```text
PATCH   0.x.y → 0.x.(y+1)     compatible fixes; no public-contract break
MINOR   0.x.y → 0.(x+1).0     MAY contain breaking public-contract changes
1.0.0                         requires an explicit stability decision, not a milestone
```

While below `1.0.0` the minor position carries breaking changes. That is the ordinary pre-1.0 reading
and it is written down here so a future release cannot be argued into the patch position because the
diff looked small.

**The public contract** is the state vocabulary in `scripts/states.mjs`, the exit codes, the result
envelope, and the CLI's accepted arguments. ADR 0002 calls the state vocabulary a frozen surface
where a change is MAJOR; below `1.0.0` that class of change takes the minor position, and above it
would take the major one.

### Three versions travel independently

Do not synchronise them by habit, and do not write a test asserting they are equal.

| Version | What it names | Lifecycle |
|---|---|---|
| `VERSION` | the release | changes when anything in the public contract or behaviour ships |
| `package.json` `version` | the same release | must equal `VERSION` — they name one thing |
| `SCHEMA_VERSION` | the **result envelope** the enforcer emits | changes only when that envelope's shape changes |

`VERSION` and `package.json` genuinely share one lifecycle and a test asserts they agree.
`SCHEMA_VERSION` does not: a release may change behaviour without changing the shape of what it
prints, and a printed shape may change without a behavioural release. It reads `0.4.0` today because
the envelope really did change in `0.4.0` — that is agreement, not synchronisation, and it will drift
the first time only one of them moves.

---

## 0.4.0 — 2026-08-10

**Breaking. The enforcer stops knowing what a verdict means.**

Phase 3 of M2. Two independent breaking changes, listed separately because a consumer may be affected
by either alone.

### 1. Five pack-native states leave the public `STATE` surface

`COMPLIANT`, `COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`, `NOT_EVALUATED` and
`BLOCKED_BY_INVARIANT` were enforcer states. They are not, and never were — they are
MachineLearningStandards' vocabulary, which six other packs do not share.

An authority having spoken is now one state, `EVALUATED`, which says nothing about what was said.
Whether a merge may proceed rides beside it in `passing`, decided **only** by membership of the set
the pack itself declared in `standards-adapter.json`.

```json
{ "state": "EVALUATED", "passing": false, "authority": { "standard": "machine-learning", "status": "NOT_EVALUATED" } }
```

### 2. Exit codes 2 and 3 are removed

```text
was   0 COMPLIANT   1 NON_COMPLIANT   2 NOT_EVALUATED   3 BLOCKED_BY_INVARIANT   4 not enforceable
now   0 passing     1 not passing     4 not enforceable
```

ADR 0001 does not say obtain the five words from somewhere else. It says do not know what a pack's
verdict **means** — and mapping `NOT_EVALUATED` to 2 and `BLOCKED_BY_INVARIANT` to 3 kept exactly
that meaning, in encoded form. Relocating the strings would have been cosmetic.

`1` now reads as *an authoritative evaluation completed and did not establish passing*, deliberately
**not** as *non-compliant*. A pack's `NOT_EVALUATED` lands there without this enforcer calling it a
failure. `4` is reserved exclusively for the enforcer's own inability to establish enforcement:
identity failure, missing or non-conforming contract, invocation failure, unparseable output, or a
status the pack never declared.

**What is lost, said plainly.** A caller reading only an exit status can no longer distinguish "the
standards said no" from "the standards reached no conclusion". That distinction was never this
enforcer's to draw, and it survives verbatim in the payload under `authority.status`. Only the lossy
process projection changed.

`exitCodes` was **not** added to the adapter contract to preserve the old behaviour. That would create
a second semantic projection owned by every pack, to rescue a surface derived from the original
mistake — and Phase 0 established that native exit codes are not a common abstraction: Betting exits
2 on `NOT_EVALUATED`, MachineLearning 3 on blocked, Health 4, Financial folds blocked into 1.

### The evaluator seam is contract-driven

`runOfficialEvaluator` no longer hardcodes `scripts/standards.mjs evaluate --dir=<target> --json`.
It reads the invocation from the pinned release's own contract, validates it against
`schemas/standards-adapter.schema.json`, confirms the entrypoint resolves inside the verified
checkout, substitutes `{target}`, and runs it once. There is no probing and no fallback.

`loadAdapter(standardsDir)` takes the resolved directory and derives the path itself — there is no
`adapterPath` parameter, because a mechanism for substituting another location is a mechanism that
gets used.

### Human output no longer summarises a pack's evidence

`describe()` printed the project, the score, and passed/failed/skipped counts. That is a pack's
evidence reassembled in the enforcer's voice, and MathematicsStandards reports `score: 97` with 52
rules passed beside a status of `NOT_EVALUATED`. Any line quoting that number would have been quoting
the most convincing false green available. It now reads the status and the declared passing set, with
the full native report carried verbatim beside it.

### Fixed

- `VERSION` was `0.2.0` while `package.json` was `0.3.0`. Both are `0.4.0`, and a test now asserts
  they agree.

### Migration

| If you read | Do this instead |
|---|---|
| `state === "COMPLIANT"` | `state === "EVALUATED" && passing` |
| `state === "NON_COMPLIANT"` | `state === "EVALUATED" && !passing`, then read `authority.status` |
| exit `2` or `3` | exit `1`, then read `authority.status` from the payload |
| `exit === 1` meaning non-compliant | `exit === 1` means *did not establish passing* |

### Unchanged

INV-E1, the enforcement states, `OUT_OF_SCOPE` and its recorded-decision bound, the identity model,
gate assessment, and scope resolution.
