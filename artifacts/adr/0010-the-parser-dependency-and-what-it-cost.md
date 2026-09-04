# ADR 0010 — The parser dependency, and what it cost

**Status:** accepted, 2026-09-04
**Context:** [`ST-16`](../backlog/items/ST-16.md). Reverses the zero-dependency decision recorded in
`.github/workflows/ci.yml`, `ci/Dockerfile`, `ci/checks.sh`, `AGENTS.md`, `docs/architecture.md` and
`docs/local-ci.md`.

> **This repository now has one dependency. The guarantee that replaces "there is no install" is
> weaker than the one it replaces, and this ADR exists to say so rather than to describe the
> replacement as equivalent.**

## Numbering

This is `0010`. `0007` and `0008` remain reserved for the unmerged lineage described in
[ADR 0009](0009-gate-authority-is-not-required-check-presence.md), which records — as the fourth
occurrence of that hazard — that checking `main` for a free number is not enough, because every
unmerged branch is also a claimant. Every remote branch was enumerated before this number was taken;
none claims `0010`. (`origin/docs/mls-adr-0010-permalink` refers to MachineLearningStandards' ADR
0010, not this repository's.)

## What was decided

Add [acorn](https://github.com/acornjs/acorn) `8.18.0` as this repository's only dependency, pinned
exactly, with a committed integrity-pinned `package-lock.json` and an `npm ci` step in both CI
environments.

## Why the previous decision could not be kept

ST-16 is a standing guarantee: no assurance verdict in the authoritative test surface may be derived
from a collection this repository never proved had elements. Enforcing it means reading the meaning
of JavaScript assurance tests, and that reading was implemented as a set of regular expressions.

Eighteen adversarial rounds were run against it. The record is in
[`artifacts/evidence/`](../evidence/); the decisive one is round eighteen
([2026-08-29](../evidence/2026-08-29-three-residuals.md)), and its finding was not the escape count:

- Rounds two, eleven, twelve and fourteen each had **one dominant fault**, and each was closed by
  inverting a default rather than extending a list — the sink space, the syntax space, the name
  space, the flow-edge space.
- **Round eighteen had no dominant fault.** Twelve escapes spread evenly across all three grammars
  the recognizer has: flow, subject, consumption. Two of them say why plainly —
  `for (const f of (files))` is ordinary JavaScript that a parser handles for nothing and a regex
  subject grammar cannot see at all.

Extending three grammars in step is not a smaller job than parsing the source, and it does not
converge, because ordinary JavaScript keeps producing shapes a regular expression cannot express.

A repository-owned partial parser was considered and rejected: it recreates the same structural
failure mode one layer down, and leaves the standing guarantee dependent on an ever-growing grammar
that this repository would then own and have to keep growing.

## Why acorn specifically

| | acorn 8.18.0 | espree 11.2.0 | meriyah 7.3.2 | @babel/parser 8.0.4 |
| --- | --- | --- | --- | --- |
| License | MIT | BSD-2-Clause | ISC | MIT |
| `engines` | `>=0.4.0` | `^20.19.0 \|\| ^22.13.0 \|\| >=24` | `>=20.0.0` | `^22.18.0 \|\| >=24.11.0` |
| Transitive dependencies | **none** | 3 | none | 1 |
| Unpacked | 565 KB | 96 KB | 1.5 MB | 1.9 MB |

`package.json` declares `"node": ">=18"`; `.github/workflows/ci.yml` pins Node 20 and `ci/Dockerfile`
pins `node:20-bookworm-slim`. Acorn's `>=0.4.0` satisfies all three. **espree and @babel/parser do
not** — @babel/parser requires ≥22.18 and would fail on the pinned CI Node outright; espree requires
≥20.19 and would break the declared `>=18` range. That eliminated both before preference entered it.

Acorn is also the de-facto ESTree reference producer — espree is a thin wrapper around it — so
choosing espree would mean taking acorn plus two further packages to obtain the same tree. Zero
transitive dependencies means the entire new trust surface is one package.

Node exposes no usable alternative: its bundled acorn is internal
(`Cannot find module 'internal/deps/acorn/acorn/dist/acorn'`) and `node:vm` compiles without
producing an AST.

## What was lost, stated plainly

The previous guarantee was **structural**: an install is a second thing that can differ between the
machine that reviewed a release and the machine that runs it, and a repository with nothing to
install has nothing that can differ.

The replacement is **procedural**: the install is pinned to an exact version, hashed by the lockfile,
and applied with `npm ci`, so the two machines install the same bytes or neither does.

```text
before   there is no install, so no install can differ
after    there is an install, and it is pinned, hashed and reproducible — or the build fails
```

That is not equivalent. It depends on the npm registry continuing to serve those bytes and on
`npm ci` behaving. A repository whose purpose is to prevent false compliance claims should not
describe a weaker property as though it were the one it replaced, so: this is weaker, it was
accepted knowingly, and the cost is recorded here rather than absorbed silently.

## The check was replaced, not deleted

`ci/checks.sh` carried a stage named `no-install-invariant` whose own failure message read:

> That may be correct. If it is, add the install step here and to the Dockerfile, and record the
> decision — do not delete this check.

All three were done. The stage is now `pinned-install-invariant`, backed by
[`ci/dependency-posture.mjs`](../../ci/dependency-posture.mjs), which asserts:

1. a declared dependency requires a committed lockfile;
2. every declared specifier is an **exact** version — no range, tag, URL or git ref;
3. the lockfile is version 2 or later and every entry carries `resolved` **and** `integrity`;
4. the lockfile agrees with `package.json` on every declared version;
5. `node_modules/` is installed, never committed.

Check 5 is deliberately not the old "`node_modules/` is absent" test. After `npm ci` it is
legitimately present, and asserting its absence there would only prove the install had not run yet.
The property that still matters is that it is not *in the commit*. Where git metadata is unavailable
— the container source arrives via `git archive` and carries none — it reports `NOT_EXERCISED`
rather than a pass it did not earn, the same distinction the credential-hygiene stage draws and for
the same reason.

## What did not change

- **The exact-commit invariant.** The image is built from `git archive` of the commit under test,
  which contains tracked files only, so a developer's local `node_modules/` cannot enter the image.
  No `.dockerignore` is required, and none was added.
- **The no-network-at-runtime property.** `compose.ci.yml` sets `network_mode: none` and
  `scripts/submit-pr.*` pass `--network none`. `npm ci` runs during `docker build`, which is a
  different phase. The Dockerfile comment now distinguishes the two explicitly, because the
  undistinguished version of that claim became false the moment an install existed.
- **`.gitignore`.** It already listed `node_modules/`.

## Consequences

- Reproducibility now depends on an external registry. A vanished or altered package is a build
  failure rather than a silent substitution, which is the correct direction, but it is a failure
  mode this repository did not previously have.
- Every future dependency faces the same gate: exact pin, integrity entry, lockfile agreement, or CI
  refuses it. The invariant is now about *how* dependencies are taken, not *whether*.
- **This reaches consumers, not just this repository.** A governed repository's gate workflow checks
  out `enforcer/` and runs `scripts/enforce.mjs` directly; that tree previously needed nothing
  installed. It now needs `npm ci` in `enforcer/` before the enforcer will run at all. The gate
  topology in [`docs/architecture.md`](../../docs/architecture.md) has been corrected to say so. A
  consumer that upgrades the enforcer without adding that step gets a hard module-resolution failure
  rather than a wrong verdict, which is the right direction — but it is a breaking change for
  consumers and is not signalled by anything except this line and the version number.
- `ci/dependency-posture.mjs` is not yet unit-tested, unlike `ci/verify.mjs`
  (`test/local-ci-verify.test.mjs`) and `ci/credential-hygiene.mjs`
  (`test/credential-hygiene.test.mjs`). It was demonstrated red against a version range and against
  an out-of-sync lockfile before this ADR was accepted, but a demonstration is not a regression test.
  This gap is recorded here rather than left to be noticed later.
