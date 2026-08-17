# PROJECT — StandardsEnforcer

<!--
Project manifest. See standards/06-project-manifest.md.

This is the file a fresh engineer or agent reads first, with no conversation history. It answers
"what is this, and what state is it in" — nothing else in the repository does.

Standard 6 R4: fields representing current project state SHOULD be updated whenever the underlying
state materially changes. At minimum consider Current Status, Current Release Target, Known Risks,
Known Blockers, and Next Recommended Work. A manifest that is only correct on the day it was written
is worse than none, because it is read as current.

Every field below is either a measured fact or explicitly marked "none recorded". A field is never
left as an unfilled placeholder, because a placeholder in a manifest reads as a statement.
-->

## Purpose

StandardsEnforcer determines which independent standards releases govern a repository, pins them by
immutable `(repository, tag, commit SHA)` identity, runs their official evaluators, and prevents a
required standard from being silently absent or bypassed.

**It contains no standards** — no rule, no detector, no applicability logic, no scoring. Each
standards repository stays authoritative for its own domain; this one decides which of them apply,
at which released version, and whether a merge may proceed.

## Standards

- **Standards version:** `2.0.0` — declared in [`project-policy.yml`](project-policy.yml)
- **Adoption guide:** see the EngineeringStandards repository's `INSTRUCTIONS.md`
- **Release identity:** none. EngineeringStandards is `IN_SCOPE` but `UNRESOLVED` — no `v2.0.0` tag
  exists to pin, so the version above is an *adopter declaration*, not an enforcement binding. This
  repository is adopted and assessed against those standards; it is not governed by an executed
  enforcement run of them.

## Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 18+ (`engines.node: ">=18"`) |
| Dependencies | None. Zero runtime and zero build dependencies, by design |
| Entry point | `scripts/enforce.mjs`, exposed as the `standards-enforce` bin |
| Tests | `node --test` (the standard library runner; no framework) |
| Local CI | Docker Engine 24+ with Compose v2 |

## Commands

| Task | Command |
| --- | --- |
| Install | none — there are no dependencies to install |
| Build | none — there is no build step |
| Test | `npm test` |
| Run locally | `node scripts/enforce.mjs <target> --standards=<path> --tag=<tag> --sha=<sha>` — all three identity flags are required; an identity is a repository, a tag *and* a commit SHA |
| Full CI pipeline | `bash scripts/ci.sh` (or `scripts/ci.ps1`) — containerised; see [`docs/local-ci.md`](docs/local-ci.md) |
| Validate standards | the EngineeringStandards evaluator, invoked by explicit path into a checkout of that repository — never via a PATH-resolved `standards` binary, which several packs share |

## Environments

None recorded. This is a command-line tool and library; it has no deployed environments.

## Integrations

| System | Purpose | How connected |
| --- | --- | --- |
| Standards repositories | The authoritative evaluators this tool executes | Cloned and pinned by `(repo, tag, SHA)` into a local cache |
| GitHub | Pull requests, checks, and branch-protection evidence | `gh` CLI using the developer's existing session; no token is stored in this repository |
| Docker | Runs the complete CI pipeline locally before anything is pushed | Compose v2, see [`docs/local-ci.md`](docs/local-ci.md) |

## Architectural rules

- **No pack semantics enter this repository.** No rule, threshold, detector, or scoring logic
  belonging to any standards domain may be implemented here. The boundary is enforced by a test, not
  by intention — see [ADR 0001](artifacts/adr/0001-orchestrate-do-not-reimplement.md).
- **Never convert an unknown, missing, unverifiable, or failed condition into a pass.** Absence is
  never upgraded into a positive conclusion — see
  [ADR 0002](artifacts/adr/0002-states-and-the-no-unknown-pass-invariant.md).
- **A pack declares its own passing set.** A release that declares none has none, and this enforcer
  must not supply one from a neighbouring release, from `main`, or from a built-in default.
- **No pack is invoked through a PATH-resolved binary name.** Six standards packs expose the
  identical `standards` bin, so every invocation uses an explicit path into a specific checkout.

## Artifact locations

| Artifact | Path |
| --- | --- |
| Project policy | `project-policy.yml` |
| Plan | `artifacts/project-plan-breakdown/` — **intentionally empty**; see Known Risks |
| Decision records | `artifacts/adr/` |
| Backlog | `artifacts/backlog/` — `items/*.md` frontmatter is the source of truth; the tracker `README.md` is hand-written and its figures are checked against the items by `test/backlog-tracker.test.mjs` |
| Evidence | `artifacts/evidence/` |
| Documentation | `docs/` |

## Current state

*Measured 2026-08-16 at `main` = `17c3fad`.*

- **Current status:** `IN_PROGRESS`
- **Current release target:** `0.5.0` — the version declared by both `VERSION` and `package.json`,
  which currently agree
- **Known risks:**
  - `artifacts/project-plan-breakdown/` is empty because this repository was adopted with no
    trustworthy pre-existing plan, and reconstruction has not been run. The emptiness is the signal;
    it must not be filled with generated scaffolding to make this manifest look complete.
  - `checkoutIsExactly` verifies a cached standards checkout with `git status --porcelain`, which
    honours `.gitignore`. Files written to ignored paths — including `node_modules/` — are therefore
    invisible to it. This is a known false-green path in the identity model, recorded rather than
    hidden.
- **Known blockers:**
  - Hosted CI cannot read the private standards oracle: no `ENFORCER_ORACLE_TOKEN` is configured, so
    the checkout 404s and `oracle-readiness` fails closed before the test suite starts. Verification
    is currently established by the local containerised pipeline instead. This is a repository
    configuration decision, not a code defect.
- **Next recommended work:** close the `checkoutIsExactly` ignored-path blind spot, red-first — plant
  a file under an ignored path in a cached checkout and require the next run to reject it.
