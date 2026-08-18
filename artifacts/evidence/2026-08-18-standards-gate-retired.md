# The standards gate retired from this repository — 56 runs, zero jobs, no enforcement

**Date:** 2026-08-18 · **Branch:** `fix/retire-unrunnable-standards-gate` · **Base:** `main` = `137bc81`

`.github/workflows/standards-gate.yml` is removed from StandardsEnforcer. This record exists because
deleting the file would otherwise erase the only evidence that it never worked, and because its
disappearance must not be readable as an improvement in enforcement.

**Three facts, recorded durably, because the file's absence states none of them:**

1. **It never produced a job.** 56 runs, 56 failures, zero successes, from its first run to its last.
   Every one was rejected before a job object was created.
2. **It was never an enforcement root.** No rule required it. It produced no check run, so there was
   never a check context anything *could* require.
3. **Removing it does not establish enforcement.** It removes a phantom signal that looked like
   enforcement while performing none. The M2 position is unchanged: there is **no live-validated
   authoritative GitHub enforcement root for GitHub Actions**. See
   [the supersession record](2026-08-10-m2-superseded.md).

## What was measured

All read-only, against `mikeycdavis/StandardsEnforcer` on 2026-08-18, with `main` at `137bc81`.

### The failure class: rejected before job creation

This is one of four distinct conditions, and the distinction is the whole finding:

```text
workflow rejected before job creation      ← this file, all 56 times
  ≠ job created but no runner assigned     (the billing condition, separate and since resolved)
  ≠ runner assigned, setup failed
  ≠ workflow executed and the gate returned red
```

Newest run, `32162620789`:

```text
event=push  head=137bc81  conclusion=failure  run_attempt=1
created_at == run_started_at == updated_at == 2026-08-18T16:52:33Z     zero elapsed time
jobs total_count = 0                                                   no job object exists
logs endpoint                                                          404
gh run view                    "This run likely failed because of a workflow file issue."
```

`jobs total_count = 0` is not "a job that ran nothing" — there is no job. That distinction is worth
making carefully: an aggregate like `[.jobs[].steps|length]|add // 0` yields `0` for both cases.

### It never worked, from birth

```text
workflow id 331303913   state=active
  name = ".github/workflows/standards-gate.yml"
```

GitHub reports the workflow's `name` as its **path**. The file declares `name: Standards gate`. The
path is the fallback used when the file cannot be parsed, so GitHub never read the declared name.

```text
runs total            56
conclusion=failure    56
conclusion=success     0
oldest run 31414251780   2026-08-10T17:29:09Z   failure, identical shape
```

The file was introduced in `2dae58e` (2026-08-09), and `permissions: administration: read` was
present in that first commit. There is no regression here, and no moment when it worked.

### Why the pushes produced runs at all

The file declares `on: workflow_call` only — no `push`, no `pull_request`. A parseable
`workflow_call`-only workflow is not dispatched by a push. These runs exist *because* the file could
not be parsed: GitHub could not determine its triggers, so each push produced a startup failure
against it.

### The controlled comparison

`mikeycdavis/enforcer-m4-trusted` hosts a second copy of the same-purpose gate — the one the M4
experiment actually exercised:

```text
enforcer-m4-trusted/.github/workflows/standards-gate.yml
  24 lines · on: workflow_call only · NO permissions: block
  GitHub resolved its declared name → "Standards gate"        it parsed
  caller enforcer-m4-governed: 2 runs, 2 successes
  zero phantom push runs

StandardsEnforcer/.github/workflows/standards-gate.yml
  on: workflow_call only · permissions: contents: read + administration: read
  GitHub fell back to the path as its name                    it did not parse
  56 runs, 56 startup failures, one per push
```

Both are `workflow_call`-only; only one produces phantom push runs. That rules out
`workflow_call`-only as the cause and leaves the parse failure.

**What this does not establish.** The two files differ in more than one line, so this is a strong
controlled comparison, **not a minimal pair**. `administration` is a fine-grained PAT / GitHub App
permission and is not among the scopes `permissions:` accepts for `GITHUB_TOKEN`, which makes it the
leading candidate — but it is not isolated here, and the retirement does not depend on isolating it.

### It required nothing

```text
check suites at 137bc81
  github-actions  success  latest_check_runs_count = 1     ci.yml's "check"
  github-actions  failure  latest_check_runs_count = 0     standards-gate: no check run at all

check runs at 137bc81   total_count = 1   ("check", success)
```

The red surfaced only in the Actions tab. It produced no check context, so nothing could require it
by name.

```text
GET /repos/mikeycdavis/StandardsEnforcer/branches/main/protection   403
GET /repos/mikeycdavis/StandardsEnforcer/rulesets                   403
  "Upgrade to GitHub Pro or make this repository public to enable this feature."
repository: private=true, owner plan: free
```

Read this precisely. **403 is a capability answer, not an observation of absence** — the endpoint did
not report "unprotected", it reported that the feature cannot be used. The correct reading is
stronger than "nobody configured protection": branch protection and rulesets are **unavailable on
this repository under its current plan and visibility**, so this gate could not have been a required
check even had it parsed and run.

An earlier working note recorded `404 Branch not protected` for the same endpoint. The measurement
above supersedes it.

### The capability the file assumed does not exist

The removed file's own comment states the purpose of the invalid permission:

> Reading the ruleset that requires this check. The enforcer verifies its own gate, which is the only
> way a removed requirement becomes visible from inside the run it was supposed to require.

That intent is sound, and it is exactly the M2 / [ADR 0003](../adr/0003-the-enforcement-root.md)
problem. But reading organisation rulesets is not grantable to `GITHUB_TOKEN` under any `permissions:`
scope name. **Correcting the syntax alone would not have produced a working gate** — it would have
moved the failure from *rejected before job creation* to *executed, and unable to read its own
ruleset*. That is enforcement-root work requiring a credential principal, not a workflow-file fix, and
it is deliberately **not** done in this change.

## Callers: none

Searched before removing, because the file's header says it does not belong here but actual consumers
would outrank that comment:

```text
grep for "StandardsEnforcer/.github/workflows" across all of F:/Repos     0 hits
grep for "uses: …standards-gate.yml" across all of F:/Repos               only the illustrative
                                                                         "acme/standards-ci/…" comment,
                                                                         inside this repo's own worktrees
GitHub code search for the path                                           total_count 0
```

The one real caller in the account, `enforcer-m4-governed/.github/workflows/standards.yml`, pins a
**different repository**:

```yaml
uses: mikeycdavis/enforcer-m4-trusted/.github/workflows/standards-gate.yml@34db273f5f1fa8ebcc1a9dc1fa6fd58c40cc2ae2
```

**The M4 evidence is therefore untouched by this removal.** It exercised the `enforcer-m4-trusted`
copy, which parses and runs. No evidence chain depends on the file removed here.

## The falsifier, which is historical rather than code-level

There is no test to add. The claim is about what GitHub did, and it is falsifiable against the run
history:

```text
before:
    push to main → a standards-gate run appears
                   jobs = 0, zero elapsed, no check run
                   nothing gates the merge

after removal:
    push to main → no standards-gate run appears
                   ci.yml's "check" is unaffected
                   nothing gates the merge — unchanged, and still unestablished
```

The second and third lines of the "after" block are the point. **Only the phantom disappears.** If a
future reader observes that the Actions tab went green around this date, this record is the reason,
and it is not an enforcement improvement.

## Deliberately not done in this change

- **No replacement gate, tokenized or otherwise.** Collapsing artifact retirement and enforcement-root
  design into one change would make 56 phantom reds disappearing look like evidence that a replacement
  works. The enforcement-root question — where the authoritative gate lives, which credential
  principal can read the ruleset, how it is provisioned, and how a governed repository is prevented
  from weakening the root it depends on — remains open, separate, and is the ST-07 / EP-02 problem.
- **No syntax-only repair.** See above: it would produce an executable artifact that fails later
  without closing the guarantee.
- **No change to `scripts/` or `test/`.** `test/gate.test.mjs` references the path only as an injected
  string fixture (`acme/ci/…`); it never reads this file.

## The retired file, preserved verbatim

Kept here because its header is the clearest surviving statement of why each property of a trusted
gate is a root of trust, and that reasoning outlives the artifact. **This is a record, not a template
— the YAML below is the version GitHub could not parse. Do not copy it into a repository.**

```yaml
# The trusted enforcement workflow.
#
# THIS FILE IS NOT MEANT TO LIVE IN A GOVERNED REPOSITORY. Host it in a repository the governed
# projects cannot write to, and have the organisation ruleset require the check it produces. A
# governed project then references it — pinned to a commit SHA, never a branch or a tag:
#
#   jobs:
#     standards:
#       uses: acme/standards-ci/.github/workflows/standards-gate.yml@<40-hex-sha>
#
# Three properties make this a root of trust rather than a convenience, and all three are checked
# by StandardsEnforcer rather than assumed:
#
#   the ORGANISATION requires the check, so a pull request cannot remove the requirement;
#   the requirement is BOUND TO AN APP, so a pull request cannot satisfy it with its own workflow
#     emitting a check of the same name;
#   this workflow is PINNED, so whoever can push to its default branch cannot silently change what
#     every governed repository runs.
#
# A governed repository can delete its own copy of this call. The requirement remains, the check
# never reports, and the merge stays blocked — which is the intended behaviour and is asserted in
# test/gate.test.mjs.

name: Standards gate

on:
  workflow_call:
    inputs:
      standards-repo:
        description: The standards repository, as owner/name.
        required: true
        type: string
      standards-tag:
        description: The release tag being enforced.
        required: true
        type: string
      standards-sha:
        description: The 40-character commit that tag must resolve to.
        required: true
        type: string
      enforcer-sha:
        description: The StandardsEnforcer commit to run. Pinned for the same reason as everything else.
        required: true
        type: string
      gate-check:
        description: The check context the organisation ruleset requires.
        required: true
        type: string
      standard-id:
        description: >-
          The asking pack's own contract id, as it appears in that release's standards-adapter.json —
          `machine-learning`, `engineering`, and so on. Scope dispositions are filed per standards
          pack, so this is the key the registry is looked up under. Required whenever a scope registry
          is supplied. It is passed rather than read out of the pinned release on purpose: a reviewed
          exclusion must survive a release whose adapter is malformed, absent or unusable.
        required: false
        default: ''
        type: string
      require-organisation-root:
        description: Refuse a repository-level rule as the enforcement root.
        required: false
        default: true
        type: boolean
      scope-registry-repo:
        description: >-
          The repository holding the scope registry, as owner/name. It must be one the governed
          projects cannot write to: a repository that can edit its own scope decides whether it is
          governed. Leave empty to run without a scope check, which is advisory about scope.
        required: false
        default: ''
        type: string
      scope-registry-sha:
        description: The commit of the scope-registry repository to read. Pinned, like everything else.
        required: false
        default: ''
        type: string
      scope-registry-path:
        description: Path to the registry JSON within that repository.
        required: false
        default: scope-registry.json
        type: string

permissions:
  contents: read
  # Reading the ruleset that requires this check. The enforcer verifies its own gate, which is the
  # only way a removed requirement becomes visible from inside the run it was supposed to require.
  administration: read

jobs:
  enforce:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the governed repository
        uses: actions/checkout@v4
        with:
          path: target

      - name: Check out the standards release
        uses: actions/checkout@v4
        with:
          repository: ${{ inputs.standards-repo }}
          ref: ${{ inputs.standards-sha }}
          path: standards
          fetch-depth: 0

      - name: Check out StandardsEnforcer at a pinned commit
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/StandardsEnforcer
          ref: ${{ inputs.enforcer-sha }}
          path: enforcer

      # Checked out beside the target, never into it. The enforcer refuses a registry located inside
      # the repository it governs, so this placement is not a convention it would be convenient to
      # break — it is the difference between a decision and a request.
      - name: Check out the scope registry
        if: inputs.scope-registry-repo != ''
        uses: actions/checkout@v4
        with:
          repository: ${{ inputs.scope-registry-repo }}
          ref: ${{ inputs.scope-registry-sha }}
          path: scope

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # No install step, for either repository. An install is a second thing that can differ
      # between the machine that reviewed a release and the machine that enforces it.
      - name: Enforce
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          node enforcer/scripts/enforce.mjs \
            --target=target \
            --standards=standards \
            --tag='${{ inputs.standards-tag }}' \
            --sha='${{ inputs.standards-sha }}' \
            --platform=github \
            --gate-repo='${{ github.repository }}' \
            --gate-branch='${{ github.event.repository.default_branch }}' \
            --gate-check='${{ inputs.gate-check }}' \
            --trusted-workflow='${{ github.workflow_ref }}' \
            ${{ inputs.require-organisation-root && '--require-organisation-root' || '' }} \
            ${{ inputs.scope-registry-repo != '' && format('--scope-registry=scope/{0} --repo-id=github:{1} --standard={2} --repo-name={3}', inputs.scope-registry-path, github.repository_id, inputs.standard-id, github.repository) || '' }}

      # --repo-id is github.repository_id, not github.repository. The name can be renamed,
      # transferred, or freed and claimed by somebody else; a scope decision that follows a name
      # follows whoever holds the name today.

      # Exit codes, and why none of them may be waved through:
      #   0  the standards accepted it and the enforcement root verified, OR an authorised reviewer
      #      recorded this repository as out of scope — an exclusion, in which nothing was evaluated
      #   1  the standards rejected it
      #   2  no verdict could be reached
      #   3  BLOCKED_BY_INVARIANT — the standards system called itself untrustworthy here
      #   4  enforcement could not be established: not adopted, gate missing or misconfigured, scope
      #      unreviewed or stale, the scope registry unusable, or the declared standards release did
      #      not resolve to the declared commit
```
