# Local CI, and verified pull requests

GitHub stays the source-control, pull-request and review system. GitHub-hosted Actions are **not**
required to establish that a branch builds and passes its checks — the complete pipeline runs here,
in Docker, before anything is pushed.

One invariant holds the whole thing together:

> **A pull request may only be submitted if the exact commit SHA being pushed has successfully
> passed the repository's complete containerised CI pipeline.**

Everything below exists to make that true rather than merely intended.

---

## Prerequisites

| | |
| --- | --- |
| Docker | Engine 24+ with Compose v2 (`docker compose version`). Docker Desktop on Windows/macOS. |
| Git | Any recent version. `tar` too, which ships with Windows 10+ and every POSIX system. |
| GitHub CLI | Only for `submit-pr`, and only to open the pull request. Uses your existing `gh auth login` session — no token is stored anywhere in this repository. |
| A standards oracle | A checkout of the authoritative standards repository. See below. |

**Node is not a prerequisite.** It runs inside the container. That is the point: the pipeline does
not depend on which Node you happen to have, or on any other globally installed SDK, service or
database.

### The oracle

This repository's one external dependency is a **real standards release to integrate against**.
`test-support/oracle.mjs` explains why a synthetic pack cannot substitute: an evaluator this
repository wrote, agreeing with this repository's expectations of it, is not independent evidence.

Local CI bind-mounts a checkout of it read-only at `/oracle`. It is found in this order:

1. `--oracle=<path>` / `-Oracle <path>`
2. `$ENFORCER_ORACLE_HOST_PATH`
3. `../MachineLearningStandards`, beside this repository

The checkout must resolve every tag in `ORACLE_TAGS` (today `v1.4.0` and `v1.5.0`), so it needs its
tags — a `--depth 1` clone will not do.

---

## Running local CI

```powershell
.\scripts\ci.ps1
```

```bash
./scripts/ci.sh
```

Exit `0` means every check passed. Anything else means it did not, and nothing about the run should
be read as partial success.

| Option | Effect |
| --- | --- |
| `-WorkingTree` / `--working-tree` | Verify uncommitted files instead of the committed HEAD. For iterating. The result is stamped `"source": "working-tree"` and **will not authorise a push**. |
| `-KeepOnFailure` / `--keep-on-failure` | On failure, keep the image and staged source, and print how to get a shell inside them. |
| `-Verbose` / `--verbose` | Stream the Docker build output instead of summarising it. |
| `-Oracle` / `--oracle=` | Point at the standards checkout explicitly. |

### What gets verified is the commit, not your working tree

By default the pipeline runs against `git archive HEAD` — the committed tree, exported into the
image. Once that archive is taken, nothing on your disk can change what runs.

This is deliberate and it is half of the invariant. `submit-pr` pushes a *commit*, so CI has to
have verified a *commit*. If you have uncommitted work, either commit it or accept that it was not
tested.

---

## What CI performs

The check list lives in exactly one place: **`ci/checks.sh`**. Both the local pipeline and the
GitHub workflow run that file, so they cannot drift into disagreeing about what "passed" meant.

| Check | What it establishes |
| --- | --- |
| `environment` | Records the Node, npm, git and user identity that produced the result. Not a gate — the evidence that makes the rest legible. |
| `pinned-install-invariant` | Every declared dependency is pinned to an exact version, `package-lock.json` is committed and carries an integrity hash for every entry, the lockfile agrees with `package.json`, and `node_modules/` is installed rather than committed. Until [ADR 0010](../artifacts/adr/0010-the-parser-dependency-and-what-it-cost.md) this stage was `no-install-invariant` and asserted that there were no dependencies at all; that was stronger, and the ADR records what was given up. A decision nothing checks is a decision that decays, so the replacement is asserted (`ci/dependency-posture.mjs`) rather than assumed. |
| `oracle-readiness` | The mounted oracle is a git repository and resolves every release the suite pins, each via `rev-list -n 1` so an annotated tag dereferences to its commit. This is the dependency health check — a real resolution, never a sleep. |
| `test-suite` | `npm test` verbatim, with `ENFORCER_REQUIRE_ORACLE=1` and `ENFORCER_REQUIRE_SYMLINKS=1`. The repository's own authoritative command, not a reconstruction of it. |

Both `ENFORCER_REQUIRE_*` flags are claims this environment makes about itself, and each is checked
by a named test rather than by a count. `ENFORCER_REQUIRE_ORACLE=1` says the run exercised the
authoritative integration surface; `ENFORCER_REQUIRE_SYMLINKS=1` says it exercised the ADR 0005
link-containment cases rather than skipping them for want of privilege. The second exists because
those cases first ran in this container — and failed. A capability that four provenance controls
depend on, and which nothing asserts, is a green pipeline waiting for a rootless runtime. See
`test-support/capabilities.mjs`.

### Checks this repository does not have

Named explicitly, because "we did not port it" and "there was nothing to port" are different
statements and only one of them is true here:

| Category | Status |
| --- | --- |
| dependency restore / install | **`npm ci`**, one exactly-pinned dependency. Asserted by `pinned-install-invariant`: exact pins, committed integrity-locked lockfile, lockfile/manifest agreement. There were none at all until [ADR 0010](../artifacts/adr/0010-the-parser-dependency-and-what-it-cost.md), which records that the replacement guarantee is weaker than the absence it replaced. |
| formatting, linting, static analysis | None configured. No ESLint, Prettier, editorconfig or type checker exists in the repository. |
| compilation / build | None. Plain ESM run directly by Node; there is no build step to reproduce. |
| unit + integration tests | The single `node --test` suite. Integration coverage is the oracle-dependent portion of it. |
| capability-dependent tests | Some cases can only run where the platform allows them — symlink creation needs privilege on Windows, so the suite probes and reports those cases as **NOT exercised** rather than as passing. The Linux container is where they actually run; this is not cosmetic, and it found a real defect the first time it happened. See `artifacts/evidence/2026-08-16-entrypoint-link-containment.md`. |
| database provisioning / migrations | **No database.** This repository stores its state as files. |
| API, frontend, E2E/browser tests | None exist. |
| generated-code validation | `docs/*.svg` are rendered from `docs/*.mmd` and are **not** validated by CI today — see *Follow-up* below. |
| security / dependency scanning | Zero dependencies, so there is no dependency graph to scan. |

Nothing that the previous GitHub workflow ran has been dropped. It ran `npm test` with the oracle
environment; that is `test-suite`, plus three checks that did not exist before.

### What cannot be reproduced locally

| Not reproducible | Why |
| --- | --- |
| **GitHub enforcement-root verification** | `scripts/gate.mjs --platform=github` asks the GitHub API whether an *organisation* ruleset requires this check and whether it is bound to an app. That is live GitHub state. No container can stand in for it, and one that pretended to would be manufacturing the exact false green this repository exists to prevent. Tracked as ST-07. |
| **Oracle obtained over the network** | GitHub clones `vars.ENFORCER_ORACLE_REMOTE`; locally you mount a checkout already on disk. The same repository at the same tags — obtained differently. If your local checkout is stale, local CI verifies against a different release than GitHub would. |
| **EngineeringStandards self-governance** | Would need a resolvable `v2.0.0` release of that repository, which does not exist. Recorded as IN_SCOPE + UNRESOLVED, and deliberately not worked around. |

---

## Isolation

### Containers, images, networks

Every resource is uniquely named per repository **and per run**:

```
compose project   localci-<repo-slug>-<commit12>-<pid>
image             local-ci/<repo-slug>:<full-commit-sha>
staged source     <temp>/localci-stage-<project>
```

Cleanup is `docker compose -p <that project> down --volumes --remove-orphans`, plus
`docker image rm` of that one tag. It is scoped by project label, so it cannot reach a container,
volume or network belonging to anything else — another repository, another developer service, or
a concurrent run of this same pipeline.

**`docker system prune` and `docker image prune` are never called.** They would reach resources
that have nothing to do with this repository, and a CI script that removes a colleague's database
container is worse than no CI script.

### The database

There isn't one. This repository stores its state as files, so there is no test database to
provision, no migration to apply, and no developer database that could be damaged. `compose.ci.yml`
declares no database service, the image installs no database client, and the container has
`network_mode: none`, so it could not reach a database even if one were configured.

If a database is ever added, `compose.ci.yml` is where it goes — see *Adding a service*.

### The container

| Property | Value |
| --- | --- |
| Network | `none`. The suite has no legitimate reason to reach the network, so it cannot — and a check that quietly started depending on a download would fail here rather than on somebody else's machine. |
| User | `node` (uid 1000), not root. Several assertions in the suite are about a process being *unable* to do something; root would satisfy some of them by accident. |
| Privileges | `no-new-privileges:true`. No Docker socket is mounted. No SSH agent, no credentials, no host directories beyond the two below. |
| Mounts | Exactly two: the oracle at `/oracle` **read-only**, and `artifacts/local-ci` at `/out` for the result file. |
| Source | Baked into the image via `COPY`, never mounted. |

---

## Submitting a verified pull request

```powershell
.\scripts\submit-pr.ps1
```

```bash
./scripts/submit-pr.sh
```

The sequence, in this order, and the order is the mechanism:

```
verify this is a git repository
      -> refuse a detached HEAD, or a default/base branch
      -> refuse a dirty working tree
      -> record git rev-parse HEAD
      -> run the full containerised pipeline
      -> stop if it failed
      -> resolve git rev-parse HEAD again
      -> refuse if it moved
      -> push that exact SHA:  git push origin <sha>:refs/heads/<branch>
      -> gh pr create
```

| Option | Effect |
| --- | --- |
| `-Draft` / `--draft` | Open the pull request as a draft. |
| `-Base` / `--base=` | Base branch. Defaults to the remote's own default branch, asked rather than assumed. |
| `-Title`, `-Body`, `-BodyFile` / `--title=`, `--body=`, `--body-file=` | Your PR content. The verification block is **appended**; your text is never replaced. |
| *(no option)* | On a branch whose PR already exists, nothing is created and the description is not rewritten. The new result is added as a **comment**, because the block in the description names the commit that was head when the PR was opened and the head has since moved — leaving it alone would make the PR assert a stale verification. The newest verification is the newest comment. |
| `-Remote` / `--remote=` | Defaults to `origin`. |
| `-AllowDirty` / `--allow-dirty` | Proceed with uncommitted changes present. They are still neither tested nor pushed. |

The script **never** commits, amends, stashes, or force-pushes, and never pushes when verification
failed. Making the pipeline pass is your job, not the script's.

### Why the push names a SHA

`git push origin <sha>:refs/heads/<branch>` rather than `git push origin <branch>`. The two are the
same thing only for as long as nothing moved the branch — and "nothing moved" is precisely the
assumption this whole workflow exists to stop making.

### The two refusals you will actually see

```
CI failed. No branch was pushed and no PR was created.
```

```
HEAD changed after CI verification. The current commit has not been verified.
Re-run CI before submitting.
  verified: <sha>
  current:  <sha>
```

The second comparison lives in `ci/verify.mjs` and is unit-tested in
`test/local-ci-verify.test.mjs`, including the abbreviated-SHA near-miss, absent evidence, stale
evidence and a working-tree run. A guard nothing tests is a guard that fails open.

---

## Verification evidence

A successful run prints the repository, branch, verified commit, result, the checks executed, the
test counts and a completion timestamp — and writes `artifacts/local-ci/latest.json`:

```json
{
  "schema": "local-ci/1",
  "repository": "StandardsEnforcer",
  "branch": "feature/example",
  "commit": "<full 40-hex SHA>",
  "source": "commit",
  "result": "passed",
  "environment": "docker",
  "failedCheck": null,
  "startedAt": "2026-08-16T15:26:11Z",
  "completedAt": "2026-08-16T15:28:45Z",
  "tests": { "passed": 204, "failed": 0, "skipped": 0 },
  "checks": ["environment", "pinned-install-invariant", "oracle-readiness", "test-suite"]
}
```

`artifacts/local-ci/` is **gitignored**. It is transient evidence about one run on one machine,
rewritten by the next run. `artifacts/evidence/` is this repository's intentional, reviewed
evidence-retention surface, and conflating the two would let a machine-generated file inherit the
standing of a human-recorded one.

Test counts are reported as `N passed, N failed, N skipped` and never as "all tests passed". A skip
is part of the result: this repository has already shipped one green suite whose subject was absent.

---

## When it fails

Cleanup runs on failure, on error, and on Ctrl-C — the container, its network and any volumes are
removed either way. Only the result file survives, recording `"result": "failed"` and which check
failed.

To debug:

```powershell
.\scripts\ci.ps1 -KeepOnFailure
```

That keeps the image and the staged source, then prints the exact command to open a shell in the
same environment the pipeline used:

```bash
docker run --rm -it --entrypoint bash -v "<oracle>:/oracle:ro" local-ci/<slug>:<sha>
```

Inside it you are at `/work`, as the same user, with the same oracle mounted. Run `npm test`, or a
single file with `node --test test/<name>.test.mjs`. Remove the image with `docker image rm -f`
when you are done — nothing removes it for you once you asked to keep it.

Add `-Verbose` / `--verbose` when the *build* is what failed rather than the checks.

---

## Local CI and GitHub Actions are different claims

They are not interchangeable and the wording never pretends otherwise.

```
                    ci/checks.sh
             the authoritative check list
                   /            \
                  /              \
        scripts/ci.ps1        .github/workflows/ci.yml
        scripts/ci.sh         hosted runner
        Docker, offline,      network checkout of the oracle
        this workstation
```

Same checks. **Different isolation boundary, and different provenance for the oracle.** A PR body
written by `submit-pr` says *Environment: Docker (containerised local pipeline)* and states plainly
that it is not a GitHub Actions result. Nothing in this workflow reports on GitHub-hosted runs, and
if GitHub-hosted Actions cannot run at all — quota, billing, configuration — local CI is unaffected
and remains independently usable.

---

## Adding a service

The compose file has one service today because this repository needs one. A service dependency goes
in `compose.ci.yml` with a **real health check**, and `ci` waits on it by condition rather than by
sleeping:

```yaml
services:
  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: ${CI_DB_PASSWORD:?generated per run by scripts/ci.*, never committed}
    healthcheck:
      test: ["CMD", "/opt/mssql-tools18/bin/sqlcmd", "-C", "-S", "localhost",
             "-U", "sa", "-P", "$$MSSQL_SA_PASSWORD", "-Q", "SELECT 1"]
      interval: 3s
      timeout: 3s
      retries: 20
      start_period: 10s

  ci:
    depends_on:
      db: { condition: service_healthy }
    network_mode: null      # a service dependency needs a network; remove `none`
```

Three things that would otherwise get this wrong:

- **The credential is generated per run and passed by environment**, never committed. There are no
  real credentials in any file in this repository, and there must not be.
- **The database lives and dies with the compose project**, which is uniquely named per run, so it
  can never be a developer's normal database. `down --volumes` destroys it.
- **Migrations are applied by the same mechanism production uses**, as a stage in `ci/checks.sh` —
  not by a CI-only schema script, which would verify a schema nothing else ever creates.

`scripts/ci.*` needs no change to pick any of this up.

---

## Reusing this in another repository

The pattern is four files and one convention:

| File | Repository-specific? |
| --- | --- |
| `ci/checks.sh` | **Yes** — this is the check list. Rewrite it. |
| `ci/Dockerfile` | Mostly. Change the base image to the language and version the project uses. |
| `compose.ci.yml` | Only if the project needs services. |
| `ci/verify.mjs` | No. Copy unchanged. |
| `scripts/ci.*`, `scripts/submit-pr.*` | No. Copy unchanged — they read the repository name, branch and commit from git, and never hardcode a project. |

The convention is that `ci/checks.sh` is the only definition of the check list, and everything else
— the local pipeline, the GitHub workflow, and a future self-hosted runner — calls it.

## Follow-up

- `docs/*.svg` are generated from `docs/*.mmd` and nothing verifies they are in step. A
  `generated-artifacts` stage would catch a hand-edited SVG, at the cost of putting
  `@mermaid-js/mermaid-cli` into the image. That objection was once decisive because it would have
  broken the no-install invariant; since [ADR 0010](../artifacts/adr/0010-the-parser-dependency-and-what-it-cost.md)
  the cost is smaller — it is one more pinned dependency rather than the loss of a guarantee. Still
  deliberately not done here, but on weight now rather than on principle.
- No self-hosted runner exists. `.github/workflows/ci.yml` carries the exact job that would use
  one, commented, so adding it later is not a redesign.
