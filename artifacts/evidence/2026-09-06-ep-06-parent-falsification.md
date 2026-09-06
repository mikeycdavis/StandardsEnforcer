# EP-06 — the parent-level falsification, and the shape it found

**Date** 2026-09-06 · **Base** `c04653a078ac832d1e3655e7706e5218d9f0dda1` (remote `main`)
**Route** `./scripts/ci.sh --oracle=<oracle>` — the exact-commit Docker route (`git archive`)
**Item** [ST-17](../backlog/items/ST-17.md) · **Parent** [EP-06](../backlog/items/EP-06.md)

## Why this was run at all

[ST-16](../backlog/items/ST-16.md)'s Notes require EP-06 to be evaluated **at the parent level**
after ST-16 closes, and say the honest close condition is *"a falsification attempt that fails to
find a fourth shape — not the absence of one having been tried."* Two earlier parent-level attempts
produced ST-15 (2026-08-27) and ST-16 (2026-08-28). This is the third. It found a shape.

Nine complete children did not establish the parent, and this repository has now demonstrated that
three times rather than assumed it once.

## The precondition, measured first

The claim depends on `npm ci` **not** catching the defect, so that was established before anything
else rather than assumed:

```text
package.json:  "acorn": "^8.18.0"        package-lock.json:  acorn 8.18.0
$ npm ci
added 1 package, and audited 2 packages in 533ms
exit 0
```

`npm ci` accepts the pair. **`ci/dependency-posture.mjs` rule 2 is the sole guard for exact
pinning**, so a defect in that check is not redundantly covered by npm.

## The two arms

Both run with the same command on the same machine against the same oracle. Full SHAs, because an
abbreviated one is not an identity:

| Arm | Commit | Parent | Defect |
| --- | --- | --- | --- |
| A — control | `3e10a090af0b22eaca0252ce8f1dfe4eef620111` | `c04653a…` | dependency unpinned |
| B — probe | `d0b92b85cb28b1e1e281417d91edfe7f28a793d0` | `3e10a09…` | A, **plus** the stage's subject emptied |

### Executable reconstruction

The probe branch was deleted after the experiment, so the patches are recorded here rather than
referenced. Applied in order to `c04653a`, these reproduce both arms exactly.

**Arm A** — `package.json`:

```diff
   "dependencies": {
-    "acorn": "8.18.0"
+    "acorn": "^8.18.0"
   }
```

**Arm B** — `ci/dependency-posture.mjs`, one line, deliberately a plausible rename and not sabotage:

```diff
 const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
-const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
+const declared = { ...(pkg.deps ?? {}), ...(pkg.devDeps ?? {}) };
 const names = Object.keys(declared);
```

### Arm A — the control. The route reaches the stage and the stage bites.

```text
CHECK  pinned-install-invariant
FAIL  dependency "acorn" is declared as "^8.18.0", which is not an exact version.
FAIL  "acorn" is declared as ^8.18.0 but locked at 8.18.0.
FAIL  the install is not reproducible from the commit under test.

LOCAL CI: FAIL
Verified commit: 3e10a090af0b22eaca0252ce8f1dfe4eef620111
Checks executed: environment
```

**Arm A is what makes Arm B mean anything.** Without it, a pass in Arm B cannot be distinguished
from a stage that never ran.

### Arm B — the probe. The same route certifies the same defect.

```text
CHECK  pinned-install-invariant
package.json declares no dependencies — the pinned-install invariant is vacuously true
   ok  pinned-install-invariant

LOCAL CI: PASS
Verified commit: d0b92b85cb28b1e1e281417d91edfe7f28a793d0
Checks executed: environment pinned-install-invariant oracle-readiness credential-hygiene test-suite
Credential hygiene: NOT_EXERCISED
Tests:           403 passed, 0 failed, 4 skipped
```

`acorn` was **genuinely unpinned in the commit that passed**. The run did not merely fail to
exercise the property; it reported a property that was false.

The stage took its **own already-shipped early-exit path**. That path is correct for the case it
names — a repository with no dependencies really does satisfy the invariant vacuously — and it
ships at `c04653a`. The defect is that nothing distinguishes *no dependencies* from *could not find
the dependencies*, and the subject can empty for reasons that have nothing to do with the probe: a
rename, a restructure, a move to workspaces.

## What did not object

The full enumerated surface ran in Arm B — **407 tests, 403 passed, 0 failed, 4 skipped** — and
nothing objected. Tests 162–167 of that same run are the credential-hygiene stage's own guards:

```text
ok 162 - stage · the defect itself: required, with nothing to inspect, is FAILED and not a pass
ok 163 - stage · a required subject that leaves the observation set is FAILED, not silently narrowed
ok 164 - stage · a required subject that is present but not a checkout is FAILED
ok 165 - stage · a required subject retaining a credential is FAILED
ok 167 - stage · unclaimed does not mean unexamined: a real persisted credential is still FAILED
```

The repository holds this property for one CI stage and not for its neighbour. ST-17's remedy should
adopt that stage's shape rather than invent another.

## Why this is not "a module without a unit test"

`ci/dependency-posture.mjs` is exercised by no test, while `ci/credential-hygiene.mjs` and
`ci/verify.mjs` are. That is true and it is **not** the finding. A coverage gap is an assertion
about tests; this is a measured false green in a full authoritative run. The missing test is why
nothing else caught it, not what makes it an EP-06 escape.

The structural cause is a boundary: ST-11, ST-15 and ST-16 are all executable over
`scripts/test-surface.mjs`, whose `TEST_DIR` is `test`. The stages in `ci/checks.sh` are assurance
surfaces of equal standing that sit outside it, and nothing extends those guarantees to them.

## The three environments, kept apart

| Environment | Commit | Passed | Skipped |
| --- | --- | ---: | ---: |
| Hosted (GitHub Actions, run `33916341310`) | `57051a7…` | 406 | 1 |
| Windows workstation | `c04653a…` | 371 | 36 |
| Docker, exact-commit route | `c04653a…` and `5e109bc…` | 403 | 4 |

Every one of those is 0 failed, and no two are the same measurement. The Windows 36 and the hosted 1
are complements, not a discrepancy.

**Docker's four skips, named.** Captured on `5e109bc9e97725d39337d3feb871437d5c0942de`; the
`c04653a` run returned the identical count against a tree differing only in backlog markdown, and
the reasons are recorded from the run that actually produced them rather than carried across:

```text
143  line endings · every tracked file's translation is declared, not left to the machine
       SKIP no git metadata here — this tree came from `git archive` for the container, so the
            declaration cannot be read. The byte-level check still runs.
144  line endings · the working tree materialises what was declared
       SKIP no git metadata here — see the note on the previous test.
145  line endings · no committed blob carries CRLF
       SKIP no git metadata here — the byte-level check covers the archived content.
319  5b · a differently-spelled path naming the registry's policy is not a conflict
       SKIP drive-letter case folding is win32-only; case 5b was NOT exercised on this platform
```

Three are the `git archive` consequence — the container source carries no git metadata by design,
which is the same exact-commit property that stops a local `node_modules/` leaking in. The fourth is
the win32-only case, and it is the hosted run's single skip too.

The same absence shows in the posture stage itself, reported rather than passed:

```text
node_modules/ committed-state  NOT_EXERCISED — no git metadata in this tree
```

That is the vocabulary ST-17's remedy should reuse.

## What this does not establish

- **Only `pinned-install-invariant` was probed.** `credential-hygiene` demonstrably holds the
  property. `oracle-readiness` and `test-suite` are **unknown, not sound**, and ST-17 carries
  measuring them.
- **It does not reopen [ST-16](../backlog/items/ST-16.md).** ST-16's close condition was a clean
  adversarial round against its own mechanism over the test surface, and round twenty-four met it.
  This is a different surface, reached by the separate parent-level evaluation ST-16's own Notes
  call for.
- **It does not close EP-06 either way.** It settles that the parent-level condition is **not** met,
  which is the opposite of closure and is the point of having run it.
