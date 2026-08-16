# FE-16 red replay against current main

**Date:** 2026-08-16
**Baseline:** `main` at `6d91ee6`, unmodified. No remedy exists on this branch at the time of these
measurements.
**Oracle:** MachineLearningStandards at `27d4b61`, adapter `schemaVersion 1.0.0`.
**Method:** the current `runOfficialEvaluator` seam, called directly. Nothing stubbed, nothing patched.

Replayed rather than inherited. The parked FE-16 implementation was built from `866cdee`; two
authority-adjacent changes have landed since (`#2`'s policy threading, `#10`'s governance-evidence
consumer), and a proposition established against the old base is not evidence about this one.

## The proposition

> Can StandardsEnforcer report an authority as passing when the evaluator process itself did not
> complete successfully?

## The seam, as it stands

```js
  let report;
  try { report = JSON.parse(r.stdout); }
  catch { return { ok: false, why: "the evaluator did not return JSON", exitCode: r.status, … }; }
  return { ok: true, why: null, exitCode: r.status, report, contract };   // scripts/enforce.mjs:260
```

`r.status` is carried as data and never consulted. `r.signal` is not read at all, and no `signal`
field exists on the returned object. `enforce()` then decides `passing` from the declared status
alone (`:483`).

## The five arms

Each arm ran on both platforms. **Counts are not compared** — `#10` moved the suite independently, so
nothing here reasons from a total.

| Arm | Platform | `ok` | `exitCode` | `signal` | status | disposition |
|---|---|---|---|---|---|---|
| A passing + exit 1 | win32 / linux | `true` | `1` | *field absent* | `COMPLIANT` | **EVALUATED / passing=true / exit 0** |
| B passing + exit 42 | win32 / linux | `true` | `42` | *field absent* | `COMPLIANT` | **EVALUATED / passing=true / exit 0** |
| C passing + SIGKILL | linux | `true` | `null` | *field absent* | `COMPLIANT` | **EVALUATED / passing=true / exit 0** |
| C passing + SIGKILL | win32 | — | — | — | — | **not established locally** |
| D passing + exit 0 | win32 / linux | `true` | `0` | *field absent* | `COMPLIANT` | EVALUATED / passing=true / exit 0 — control, correct |
| E `NOT_EVALUATED` + exit 2 | win32, **real oracle** | `true` | `2` | *field absent* | `NOT_EVALUATED` | EVALUATED / **passing=false** — correct |

Environments: `win32`, Node v24.15.0, host. `linux`, Node v20.20.2, `node:20-alpine`,
`--network=none`, source mounted read-only.

**Arms A, B and C reproduce the false pass on current `main`.** D is the control and behaves. So:

```text
current main            6d91ee6
current evaluator seam  { target, policyPath }, post-#2
current oracle          MachineLearningStandards 27d4b61
same proposition        may a failed process yield a passing authority
same contradiction      yes, on three arms
```

Nothing about the five arms changed materially. The width question is unchanged and the remedy is
reconstructed rather than re-adjudicated.

## Arm C, and the one observation that changes the remedy's shape

The earlier FE-16 work assumed the signalled case needed `exitCode: null` **preserved** against a
temptation to coerce it to `1`. Measured on Linux against this seam, that is not the situation:

```json
{ "arm": "C  passing status + SIGKILL", "ok": true, "exitCode": null,
  "signalField": "(field absent from the seam's return)", "status": "COMPLIANT" }
```

`exitCode` is **already** `null`. What is missing is the signal — there is no field for it, so a
SIGKILLed evaluator is currently reported as a pass whose process projection is `standardsExitCode:
null`, with nothing anywhere recording that a signal occurred. An operator reading that payload sees
an absent exit code and no reason for it.

So the remedy adds the signal rather than rescuing the null. That is the observation driving the
shape, as instructed, rather than the earlier representation being preserved.

**Windows is worse in a quieter way.** `process.kill(self, "SIGKILL")` there produced `status 1,
signal null` — the platform has no signals, so the arm cannot be established locally and is recorded
as *not established*, never simulated. Note that the Windows collapse lands the case on arm A's
mechanism, which is itself a false pass: the platform that cannot demonstrate the signal defect is
not thereby protected from it.

## Arm E — the deciding contrast, re-measured

Not carried forward. Run against the real pack, on this main, twice:

```text
direct    node MachineLearningStandards/scripts/standards.mjs evaluate --dir=<t> --json
          → exit 2, stdout parses, status "NOT_EVALUATED"

seam      runOfficialEvaluator("F:/Repos/MachineLearningStandards", { target, policyPath })
          → ok true, exitCode 2, status "NOT_EVALUATED", declared true, passing false
          → EVALUATED / passing=false
```

A real authority uses a **nonzero exit alongside a declared, parseable, non-passing status**, and it
is correct to do so. That is the whole reason a rule of the form *any nonzero exit is an enforcement
error* cannot be adopted: it would convert this legitimate evaluation into `ENFORCEMENT_ERROR` and
break an authority that is behaving exactly as its contract says.

One qualification on this arm, found while measuring it and worth recording because it nearly
produced a wrong reading: with **no** `project-policy.yml` in the target, the same pack exits `2` with
**empty stdout** and an explanatory stderr — *"Nothing was evaluated. This is a configuration error,
not a compliance result."* That is a different case, already handled by the seam's no-output branch,
and it is not arm E. Arm E requires the policy present, so the pack runs and reports. The two are
easy to confuse from the exit code alone, which is itself an argument for not reading exit codes as
verdicts.

## What this establishes about width

```text
declared PASSING status + nonzero exit      contradiction   → ENFORCEMENT_ERROR
any signalled termination                   not established → ENFORCEMENT_ERROR
declared NON-PASSING status + nonzero exit  legitimate      → EVALUATED, passing=false
```

Width B is earned by arms A/B/C on one side and arm E on the other. The boundary is not "nonzero is
bad"; it is **contradiction** — the pack asserting, in the same breath, that it passed and that it
did not complete. No meaning is attached to which nonzero code occurred: arms A and B differ only in
the number and must be treated identically for gating while remaining distinguishable in evidence.

## What was NOT measured, and is therefore not claimed

- **The Windows signal arm.** Not established locally, and deliberately not simulated. Authoritative
  Linux CI must be the environment that exercises it, under a capability requirement, or it will
  quietly stop being exercised.
- **Whether any other released pack signals.** Only MachineLearningStandards was available as an
  oracle here. Arm E is one authority's behaviour, not a survey.
- **Any remedy.** No implementation existed on this branch when these numbers were taken, which is the
  point of taking them first.
