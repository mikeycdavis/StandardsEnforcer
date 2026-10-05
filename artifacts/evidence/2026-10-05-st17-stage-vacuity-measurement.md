# ST-17 — a stage that examined nothing, and what was measured about the other stages

**Date** 2026-10-05 · **Base** `dd6d2c9263d968cdca42a71eaad0d11175fb5aad` (remote `main`)
**Route** `./scripts/ci.sh --oracle=<MachineLearningStandards checkout>` — the exact-commit Docker route
**Item** ST-17 (GitHub issue #102) · **Parent** EP-06 / FE-27
**Earlier record** [`2026-09-06-ep-06-parent-falsification.md`](2026-09-06-ep-06-parent-falsification.md)

## AC1 — Arm B reproduced at this base, and observed passing

A throwaway clone at the base, with `package.json` unpinned to `"acorn": "^8.18.0"` and the two
reads in `ci/dependency-posture.mjs` renamed to `pkg.deps` / `pkg.devDeps`:

```text
LOCAL CI: PASS
Checks executed: environment pinned-install-invariant oracle-readiness credential-hygiene test-suite
Credential hygiene: NOT_EXERCISED
Tests:           387 passed, 0 failed, 4 skipped
exit 0
```

A tree with a genuinely unpinned dependency was certified. (The test count differs from the 2026-09-06
record, 407, because the suite has changed since; the shape is the same.)

## AC2–AC4 — the mechanism, and its liveness against real runs

Two independent mechanisms now establish an empty dependency set instead of assuming it:

1. **Corroboration.** The lockfile must agree that nothing is installed. Arm B's lockfile still
   records `acorn`, so the stage fails and names `lockfile root declares dependencies.acorn` and
   `lockfile records installed package "node_modules/acorn"`.
2. **The environment's claim.** `ENFORCER_REQUIRE_DEPENDENCIES=1` (set in `compose.ci.yml` and the
   hosted workflow, because this repository declares a dependency) makes an empty set a failure
   outright — the shape `ci/credential-hygiene.mjs` already uses.

The honest case — no dependencies, lockfile records nothing — still exits 0 and is reported
`NOT_EXERCISED`, in the output and in `latest.json` as `dependencyPosture`.

Arm B on top of the change, both mechanisms tested separately through the Docker route:

| Probe | Result |
| --- | --- |
| Arm B, requirement claimed (as shipped) | **FAIL** at `pinned-install-invariant`; `Checks executed: environment`; `Dependency posture: FAILED`; exit 1 |
| Arm B, requirement claim removed from `compose.ci.yml` | **FAIL** at `pinned-install-invariant`, via the lockfile alone; exit 1 |

## AC5 — the other stages, measured and bounded

This was **bounded to measurement**. No other stage was changed. Each stage was asked one question:
can it report success having examined nothing?

| Stage | Measured | Result |
| --- | --- | --- |
| `credential-hygiene` | Not re-run. Already named-subject plus `--require`; `test/credential-hygiene.test.mjs` asserts a required subject with nothing to inspect is FAILED. | Holds (as the issue already stated). |
| `test-suite` | `scripts/test-surface.mjs` run against a tree whose `test/` directory is empty. | **Holds**: throws and exits 1. (ST-15/ST-16 surface.) |
| `oracle-readiness` | `ORACLE_TAGS` in `test-support/oracle.mjs` emptied to `[]`, run through the Docker route. | **Does not hold.** The stage prints `oracle  /oracle`, resolves no tag, and reports `ok  oracle-readiness`. The same run still failed overall — one suite test, `oracle · a run that claims to be authoritative has an authoritative oracle`, went red (386 passed, 1 failed) — so no false green reached the verdict, but only because a different stage happened to catch it. |

The `oracle-readiness` shape is therefore **found and not fixed here**. It is the same shape as
Arm B — an empty list is iterated zero times and read as success — and the mitigating fact is that
the suite's own guard backstops it today. Whether to harden it (for example by refusing an empty
`ORACLE_TAGS`) is left to the owner rather than widened into this change.

## What this does not establish

- Only an empty `dependencies` / `devDependencies` reading is covered. A manifest whose dependencies
  sit in a key neither reader nor lockfile root knows about, with a lockfile that also omits them,
  would still read as honestly empty; `ENFORCER_REQUIRE_DEPENDENCIES=1` is what covers that in CI.
- `optionalDependencies` and `peerDependencies` declared in `package.json` remain outside the
  exact-pin rule (they were before). They now count only as lockfile evidence against an empty manifest.
- `oracle-readiness` is measured once, with one mutation, not exhaustively.
