# M4 — the enforcement root, against GitHub itself

**Date:** 2026-08-10 · **Enforcer:** `0.3.0` · **Milestone question:** does the documented API model
match reality?

M2 established every gate semantic against an injected platform. That was the right boundary for
portability and the wrong one for confidence: the GitHub adapter's two API shapes were written from
documented responses and had never met a real ruleset. This milestone put them in front of one.

**It found that M2's central mitigation does not work.**

## The finding

> **A required status check bound to the GitHub Actions app is satisfiable by the pull request
> itself.** Every workflow in a repository runs as that app — including one the pull request adds —
> so binding the requirement to `integration_id: 15368` constrains nothing the attacker was not
> already able to do.

M2 discovered that a name-matched requirement is spoofable and mitigated it by requiring an app
binding. The mitigation is correct in form and, against the app almost everybody uses, empty in
substance. Nothing in the documented API says otherwise; it simply does not follow from the
documentation, and only an experiment was going to say so.

### Observed

Pull request [#1](https://github.com/mikeycdavis/enforcer-m4-governed/pull/1) deleted the call into
the trusted reusable workflow and replaced it with a local job named exactly the required context:

```yaml
jobs:
  spoof:
    name: standards / machine-learning
    runs-on: ubuntu-latest
    steps:
      - run: echo "no enforcement ran"
```

The requirement in force was app-bound, not name-only:

```json
{"type":"required_status_checks","parameters":{"required_status_checks":[
  {"context":"standards / machine-learning","integration_id":15368}]},
  "ruleset_source_type":"Repository","ruleset_id":20644315}
```

GitHub's answer:

```json
{"name":"standards / machine-learning","app":15368,"slug":"github-actions",
 "status":"completed","conclusion":"success"}

"mergeable": "MERGEABLE",  "mergeStateStatus": "CLEAN"
```

**Mergeable and clean, with the enforcement deleted.** One check run, produced by the pull request,
under the same app the requirement named.

## The remedy, and how far it was validated

What actually pins an Actions-produced check is a different rule: GitHub's `workflows` ruleset rule,
which names a **repository, a path and a commit**. None of those is under the governed pull request's
control, and it constrains *which implementation runs* rather than *what the result is called*.

The gate now requires it. When every binding on a required check is the Actions app, `assessGate`
looks for a required-workflows rule pinning the trusted implementation at the SHA the caller
declared; without one it returns `GATE_CONFIG_INVALID` and says why.

**This remedy is asserted against an injected platform, not against GitHub.** The `workflows` rule
was rejected on a personal-account repository:

```json
{"message":"Validation Failed",
 "errors":["Invalid rule 'workflows': Invalid parameter workflows: Workflow error at index 0: "],
 "status":"422"}
```

Required workflows are an organisation feature. So M4 establishes the defect live and leaves the fix
where M2 left everything — one experiment short. That asymmetry is stated rather than smoothed over:
**the hole is proven, the patch is not.**

## The five cases

Configuration recorded before application, observed after, both preserved in
[`m4-raw/`](m4-raw/). All runs pin MachineLearningStandards `v1.4.0` at `6bfd078`.

| # | Intended configuration | Observed API | Enforcer | Exit |
| --- | --- | --- | --- | --- |
| 2 | nothing required | `[]`, and `404 Branch not protected` | `GATE_MISSING` | 4 |
| 3 | required, name only | `{"context":"standards / machine-learning"}` — no `integration_id` key at all | `GATE_CONFIG_INVALID`, `spoofable: true` | 4 |
| 1 | required, `integration_id: 15368` | binding present as configured | `COMPLIANT`, `authoritative: true` — **wrong, see below** | 0 |
| 4 | as case 1, trusted workflow `@main` | platform not consulted | `GATE_CONFIG_INVALID` | 4 |
| 5 | as case 1, PR emits the required name | `MERGEABLE` / `CLEAN` | **the requirement was satisfied by the PR** | — |
| 1′ | unchanged from case 1 | unchanged | `GATE_CONFIG_INVALID`, `boundToActions: true` | 4 |

Case 1 and case 1′ are the same live configuration read by the enforcer before and after the finding.
The first is what M2 believed; the second is what the experiment forced. Nothing about GitHub changed
between them.

Two documented behaviours also held up, which is worth recording because they were assumptions:

- `404 Branch not protected` is a real answer meaning "no classic protection", and the adapter
  treats it as an empty list rather than as an unknown. A repository with rulesets and no classic
  protection is the common case, and getting this wrong would have made every such repository
  unreadable.
- The `rules/branches/{branch}` endpoint returns only actively enforced rules, so a ruleset in
  evaluate mode is absent rather than present-and-inactive.

## The limitation, stated as agreed

> **Both repositories share an account owner. This experiment establishes separation from the
> governed pull request, not separation from the repository owner or organization-level
> administrative control.**

`--require-organisation-root` is therefore **intentionally unvalidated**. A personal-account ruleset
is not an organisation ruleset, and treating one as evidence for the other would be the same category
of error as reporting an unknown as a pass.

```text
Established live
  a pull request cannot modify the trusted workflow repository
  a pull request CAN satisfy an Actions-bound required check by emitting its name
  GATE_MISSING, GATE_CONFIG_INVALID and the pinned-reference refusal behave as modelled
  ruleset and branch-protection response shapes match the adapter

Not established
  organisation-rooted enforcement
  the required-workflows remedy, which needs an organisation
  protection against account or repository administrators
  audit-log detection of an authorised bypass
  Azure DevOps
```

## Fixtures

Preserved, not deleted, so the recorded configuration can be inspected:

- `mikeycdavis/enforcer-m4-governed` — ruleset `20644315`, pull request #1 open and unmerged
- `mikeycdavis/enforcer-m4-trusted` — reusable workflow at `34db273f5f1fa8ebcc1a9dc1fa6fd58c40cc2ae2`

Both are public, disposable, and marked as such in their descriptions. They can be archived once this
evidence cycle is deliberately closed. **Pull request #1 must not be merged**: it is the artefact.

## What this changes

M2's evidence record says the spoofable-check finding "was not in the milestone brief; it came out of
asking what a pull request could actually do." M4 is the same sentence one level down — asking what a
pull request could actually do *on GitHub*, rather than what the API reference implies it could do.

The pattern is now three for three. Every time a semantic was checked against reality rather than
against its documentation, the reality was weaker:

```text
M2  a required check matched by name is satisfiable by the PR
M4  a required check bound to Actions is ALSO satisfiable by the PR
```

The general lesson is not about GitHub. It is that an enforcement root has to be identified by
*what cannot be forged*, and an app identity shared by everything in the repository forges nothing.
