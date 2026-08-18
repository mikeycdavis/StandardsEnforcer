# A stage that completed without exercising its property

**Date:** 2026-08-16
**Subject:** the `credential-hygiene` stage added to `ci/checks.sh`, and what a run may claim from it.
**Baseline:** `main` at `17c3fad`; the stage as first written at `89a5f24`.

## The property

The hosted workflow obtains a private standards oracle with a token and then runs `npm test` — code
the pull request under test wrote. `actions/checkout` persists that credential into the checked-out
repository's git configuration by default. The exposure is on the live path rather than a
theoretical one: this repository's own workflow runs same-repository branch pull requests, which do
receive secrets.

The detector is about the mechanism rather than a string, because `actions/checkout` stores
`AUTHORIZATION: basic <base64>` — a search for the literal token reports a compromised checkout as
clean. That part was correct as written and is unchanged here.

## The defect in the stage that carried it

The stage built its subject list by looking for `.git`. In local container CI neither subject is a
clone: the source is baked into the image from `git archive`, and the oracle is a read-only bind
mount. So the list was empty, and the stage printed a line and completed.

Measured in the container at `89a5f24`, unmodified:

```text
CHECK  credential-hygiene
no cloned checkout to inspect (the source is baked into the image; the oracle is bind-mounted read-only)
   ok  credential-hygiene

LOCAL CI: PASS
Checks executed: environment no-install-invariant oracle-readiness credential-hygiene test-suite
Tests:           288 passed, 0 failed, 0 skipped
```

`credential-hygiene` appears in *Checks executed* having inspected nothing. Nothing skipped, nothing
asserted, and a green line either way — [ST-11](../backlog/items/ST-11.md)'s shape one layer up, in
the pipeline rather than in a test.

## The repair

Two changes, and the second is the one that matters:

1. **The subjects are named unconditionally.** `workspace-checkout` and `oracle-checkout` are passed
   on every run and the module decides. Discovering subjects by presence makes a subject that
   *disappeared* indistinguishable from one that was never expected — so a future workflow change
   that stopped cloning the oracle would remove the credential-bearing subject from the observation
   set and leave the stage green.

2. **`ENFORCER_REQUIRE_CREDENTIAL_HYGIENE=1` is the environment's claim about itself**, the same
   shape as `ENFORCER_REQUIRE_ORACLE` and `ENFORCER_REQUIRE_SYMLINKS`, and never a count of
   anything. The invariant it carries:

   > A run that possesses an oracle credential may not reach `test-suite` unless credential hygiene
   > was established on **every** checkout that could retain that credential.

The stage outcome is separate from whether the stage completed, and is carried into the summary and
into `latest.json` as `credentialHygiene`:

```text
local container    NOT_EXERCISED   no credential-bearing checkout exists in this environment
hosted Actions     REQUIRED        both named checkouts inspected, both CLEAN, before npm test
```

`NOT_EXERCISED` is not a pass and does not read like one. An unclaimed environment is still not an
unexamined one: a checkout that genuinely retains a credential is red regardless of what the
environment claimed, because that exposure does not depend on anyone having claimed anything.

## Falsification

**The requirement is not decorative.** Claimed in the container — the one environment that certainly
has no checkout — by adding the flag to `compose.ci.yml` on a throwaway commit:

```text
CHECK  credential-hygiene
requirement: ENFORCER_REQUIRE_CREDENTIAL_HYGIENE=1
  MISSING        workspace-checkout  /work — /work is not a git repository …
  MISSING        oracle-checkout  /work/.oracle — /work/.oracle does not exist
  credential-hygiene: FAILED

LOCAL CI: FAIL
Failed check: credential-hygiene
Checks executed: environment no-install-invariant oracle-readiness
```

**`test-suite` is absent from that list.** The run did not reach the code under test, which is the
invariant stated as an outcome rather than as a sentence. The throwaway commit was reset.

**The guards are load-bearing.** Each amputation run against the same suite:

| Mutation | Red |
|---|---|
| subjects discovered by presence again | `checks · the stage names both credential-bearing subjects unconditionally` |
| `ENFORCER_REQUIRE_CREDENTIAL_HYGIENE` removed from `ci.yml` | `workflow · hosted CI declares that it holds a checkout credential` |
| the missing-subject branch made permissive | `stage · the defect itself …`, `stage · a required subject that leaves the observation set …` |

The hosted direction cannot be reproduced on this machine — there is no runner and no token — so
`decideStage` is pure and driven from recorded subject shapes. The stage's *wiring* to that decision
is covered separately by three cases that spawn the real CLI against real scratch repositories,
since a decision nothing invokes decides nothing.

## What this establishes, and what it does not

Bounded deliberately, because the environment this changes is the one that has not run:

- **Established — the detector.** Unit and fixture evidence, including the known-positive
  `AUTHORIZATION: basic <base64>` extraheader written by real `git config`, which a literal-token
  search would miss.
- **Established — the pipeline.** Local Docker proves stage ordering (hygiene before `test-suite`),
  that local absence is reported honestly as `NOT_EXERCISED`, and that the requirement, when
  claimed without a subject to inspect, is red before the suite runs.
- **Established — intent.** The workflow sets `persist-credentials: false` on every checkout,
  declares `contents: read`, and sets the requirement; all three asserted by executable guards
  rather than by reading the YAML.
- **NOT established — the hosted result.** That no credential is persisted on a real GitHub Actions
  run **has not been directly observed**, and remains unobserved until a hosted run executes. Local
  CI being green is not evidence of it. This is recorded here so that no later reader mistakes the
  green pipeline for the hosted proof.

## Not affected

The CRLF class from ST-11. The workflow scanner splits on `/\r?\n/` and asserts non-vacuity
(`steps.length >= 2`) before asserting about the steps it found; the new source-scanning guards over
`ci/checks.sh` and `ci.yml` are written to the ST-11 ordering and use `test-support/source-scan.mjs`.
This is not a classification of the rest of the suite — that remains [ST-12](../backlog/items/ST-12.md),
unstarted.
