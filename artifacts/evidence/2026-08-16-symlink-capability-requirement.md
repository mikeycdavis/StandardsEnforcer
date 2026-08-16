# A capability the pipeline depends on, now asserted — ST-08

**Date:** 2026-08-16
**Item:** [ST-08](../backlog/items/ST-08.md) — *Authoritative container CI must assert the symlink
capability it depends on*
**Branch:** `assurance/st-08-symlink-capability`

---

## What was wrong

Four ADR 0005 provenance cases — 7b, 7d, 7e and 7f — establish that a symlinked entrypoint cannot
execute bytes from outside the verified checkout, that a link chain landing *inside* it still runs,
that a symlinked parent directory escapes just as effectively and is refused, and that a dangling
link is refused explicitly rather than treated as absence.

All four need to create a symlink. All four skip when they cannot.

They ran in the authoritative container because it happens to be Linux with the privilege to create
symlinks. Nothing asserted that. `ci/checks.sh` reads the skip count for the report and says so
explicitly — *"Counts are for the report only. The verdict is the exit code"* — which is the right
principle, and leaves this uncovered by design. Take the capability away (a rootless runtime, a
hardened daemon, a filesystem without symlink support) and all four skip, `npm test` exits 0, and
the pipeline reports green with two containment escapes silently unguarded.

## Why this was worth doing before anything else in EP-06

Because it is not a hypothesis. Case 7b was written correctly, committed, and had **never
executed** — it skipped on the Windows workstation for want of privilege, and hosted Actions were
not running. The first environment capable of running it was the containerised pipeline, and it
failed immediately. See
[2026-08-16-entrypoint-link-containment.md](2026-08-16-entrypoint-link-containment.md).

The repair closed the escapes. It did not make the *exercising* of those cases something the
pipeline asserts. So the specimen for "a control that is never evaluated is indistinguishable from a
control that holds" is this repository's own, and the remedy for it was still missing.

## What was built

The same shape as `ENFORCER_REQUIRE_ORACLE=1`, applied to a capability instead of a dependency,
because that mechanism is already proven here and inventing a second one would be a second thing to
reason about.

```text
ENFORCER_REQUIRE_SYMLINKS=1        compose.ci.yml · .github/workflows/ci.yml
        ↓
test-support/capabilities.mjs      probeSymlinks() · symlinkSkip() · unmetSymlinkRequirement()
        ↓
test/capability-required.test.mjs  a named test; the verdict is its exit status
```

- `probeSymlinks()` **tries**, against a throwaway file, and returns the operating system's own
  refusal. It does not read `process.platform`: Windows can create symlinks given privilege or
  developer mode, and the question is what this environment can do, not what its name is.
- `symlinkSkip(caseId)` is the one wording the four cases share. Previously each carried its own
  copy — four chances for one to drift into reading like a pass.
- `unmetSymlinkRequirement({ required, probe })` takes both as parameters. That is what makes the
  failing arm reachable from a test on a machine where the capability is present.

**No stage was added to `ci/checks.sh`.** A shell reading TAP counts to decide whether the link
cases ran would be exactly the thing that file refuses to become. The verdict stays a named test.

## The failing arm is real, not stubbed

The Windows workstation genuinely cannot create symlinks, which makes it the natural place to
reproduce the red:

```text
$ ENFORCER_REQUIRE_SYMLINKS=1 node --test test/capability-required.test.mjs

✖ capability · a run that claims link containment can create symlinks
✔ capability · both arms of the requirement are exercised, on every platform
✔ capability · the probe answers by trying, not by naming the platform
✖ capability · a satisfied requirement means the provenance cases are not skipped
✔ capability · an unexercised case says so rather than reading as a pass
  tests 5 · pass 3 · fail 2                                                   exit 1

  ENFORCER_REQUIRE_SYMLINKS=1 was set, so this run asserts the environment can create symlinks and
  therefore that the ADR 0005 link-containment cases (7b, 7d, 7e, 7f) were exercised. It cannot:
  EPERM: operation not permitted, symlink 'C:\...\symlink-probe-AjKtZN\a' -> '...\b'
```

The message carries `EPERM` verbatim rather than a paraphrase, because `EPERM` and `ENOSYS` send an
operator to different fixes and neither of them is "symlinks are off".

Without the flag, the same machine is green and the four cases report as **NOT exercised** — which
is the correct report there, and the reason this is not a zero-skip rule.

## The passing arm, in the environment that claims it

```text
$ .\scripts\ci.ps1 -WorkingTree

ok 50 - 7b · a symlinked entrypoint pointing outside the checkout does not execute foreign bytes
ok 52 - 7d · a chain of links that stays inside the checkout runs
ok 53 - 7e · a symlinked parent directory escapes just as effectively, and is refused
ok 54 - 7f · a link that does not resolve is refused explicitly, not treated as absence

tests 224 · pass 224 · fail 0 · skipped 0
LOCAL CI: PASS
Checks executed: environment no-install-invariant oracle-readiness test-suite
```

Zero skips is a property of this environment having both the oracle and the capability, not a rule.
It is recorded here as an observation, not as the acceptance criterion — the criterion is that a
false claim goes red, and that is the section above.

## Falsifiers — a guard alone is not sufficient, and that was proved rather than assumed

Two independent amputations, each run against the unmodified tests.

**Falsifier A — the requirement stops requiring.** `unmetSymlinkRequirement` returns `null`
unconditionally: the shape a decorative check would have.

```text
ENFORCER_REQUIRE_SYMLINKS=1, on a machine that cannot create symlinks:

✔ capability · a run that claims link containment can create symlinks        ← GREEN, and wrong
✖ capability · both arms of the requirement are exercised, on every platform
✖ capability · a satisfied requirement means the provenance cases are not skipped
```

**Falsifier B — the probe infers instead of trying.** `probeSymlinks` returns
`{ available: true }` unconditionally.

```text
ENFORCER_REQUIRE_SYMLINKS=1, on a machine that cannot create symlinks:

✔ capability · a run that claims link containment can create symlinks        ← GREEN, and wrong
✔ capability · both arms of the requirement are exercised, on every platform ← A's catcher misses
✖ capability · the probe answers by trying, not by naming the platform
```

Without the flag, B additionally turns 7b, 7d, 7e and 7f red — they attempt symlinks a lying probe
promised were possible. That is honest collateral, not the detection: it happens only where the
capability is genuinely absent, which is precisely where a hosted CI environment would not be.

**The headline guard is green under both.** It is the *claim*; it cannot be its own evidence. The
two catchers are disjoint — one holds the requirement's logic, the other holds the probe's honesty —
and neither is redundant. This is the same result ST-10 produced for the backlog checker, and the
same reason: a control that agrees with today's environment is not evidence that a wrong environment
would be caught.

## Backlog consequences, and one thing worth recording

`node scripts/backlog.mjs` named nine figures moved by ST-08's closure, and they were applied from
its output rather than recomputed by hand. That is ST-10 doing the job it was built for on the first
routine merge after it landed.

**Four backlog mutation tests failed in the container, and that was correct behaviour.** They pin
their specimens by expected state, and each carries a guard of the form *"ST-08 is no longer
NOT_STARTED; this mutation needs re-pointing"*:

| Mutation | Was | Now |
| --- | --- | --- |
| each status count | `ST-08` NOT_STARTED → IN_PROGRESS | `ST-09` |
| the aggregate-invariant pair | `ST-08` completes, `FE-12` un-completes | `FE-11` completes, `ST-10` un-completes |
| marking an item ready | `ST-08` | `ST-09` (a ready mark only applies to a NOT_STARTED item) |
| a closed date with no completion | `ST-08` | `ST-09` |

A suite that had silently accepted a mutation which no longer mutates anything would have quietly
lost four of its teeth. It failed loudly instead, on the first item transition after it was written.
The specimens are chosen for their *state*, never for their meaning, and the assertions are what
verify each choice still produces the property the case is about — the invariance pair still needs
one NOT_STARTED leaf and one COMPLETE leaf under different epics, and still asserts that no
aggregate moves.

## Boundaries

- **One capability, in environments that claim it.** Not a zero-skip rule. The 17 oracle-conditioned
  skips on a developer workstation are [FE-14](../backlog/items/FE-14.md)'s and remain blocked on
  upstream release state.
- **This establishes that the link-containment cases ran, not that their assertions are right.**
  Their correctness is ADR 0005's, and is tested separately.
- **`ENFORCER_REQUIRE_SYMLINKS=1` will fail on an ordinary Windows workstation, deliberately.** It is
  set by CI, not by `npm test`, and `AGENTS.md` says so.

## Not changed

`VERSION` stays `0.5.0` and `CHANGELOG.md` is untouched, following `bf186e2` and `0fe9c1a`. The
public contract is the state vocabulary, exit codes, result envelope and CLI arguments. A test
capability requirement is none of those and is not exposed through `bin`.

`ci/checks.sh` gained one reporting line and a comment. No stage, no logic, no count consulted.

## Suite

```text
before   219 tests
after    224 tests          +5, all in test/capability-required.test.mjs

workstation   224 tests · 203 pass · 21 skipped · 0 fail
container     224 tests · 224 pass ·  0 skipped · 0 fail
```
