# The adapter contract could not express a policy binding, and FinancialStandards needs one

> ### SUPERSEDED IN PART — 2026-08-16, later the same day
>
> **The schema-capability finding below stands. Its description of how `{policy}` is *implemented*
> records an intermediate state and is no longer how the merged code works.**
>
> This file says `{policy}` is derived inside `runOfficialEvaluator` from `target` and `POLICY_FILE`.
> That was true when it was written, and it was the defect a later review flagged: derivation from
> the subject only works while the subject is a repository root, and released FinancialStandards
> accepts a document or directory analysis selection that need not be one.
>
> The merged mechanism still derives the path — once, and not here. `enforce()` computes
> `path.join(target, POLICY_FILE)` at the adoption boundary, proves it exists, and hands that exact
> value on. What is gone is the *second* derivation: the seam binds what it is given, does not know
> what a policy file is called, and contains no policy filename. The invariant is:
>
> > the policy whose presence established adoption is the exact policy handed to the authority
>
> **For the current state and the measurement behind it, read
> [`2026-08-16-financial-policy-interface.md`](./2026-08-16-financial-policy-interface.md).** It
> records the read-only forensic pass over released FinancialStandards (`3627c6f`; latest release
> `v1.1.0` at `0d0b271`) that separated the pack's released behaviour from its repository convention,
> qualified finding H, and strengthened finding F.
>
> **Nothing below is rewritten.** The schema-capability defect, the two-wrong-options table, the
> version-scoped placeholder decision and the measurement log are all still accurate about what was
> established when this was written, and the superseded paragraph is left in place so the correction
> has something to be a correction *to*.

**2026-08-16.** A schema-capability defect in `schemas/standards-adapter.schema.json`, found while
scoping a FinancialStandards adapter release. The release was stopped; the contract was fixed.

## The state this records

```text
FinancialStandards applicability:        supported in principle
Financial CLI contract:                  established (verified by reading its released source)
Adapter schema 1.0.0 representation:     UNREPRESENTABLE
Financial v1.1.1 adapter release:        BLOCKED, then unblocked by this change
Reason:                                  the required policy binding could not be expressed
```

This is a **schema-capability defect, not a FinancialStandards release defect**. Nothing about
Financial's interface was wrong; the contract could not describe it.

## The property that did not hold

> A pack must be able to declare the exact argv its released interface requires, including a binding
> for the policy that governs the subject.

`PLACEHOLDERS` was a flat, version-independent `["{target}"]`. A declaration naming `{policy}` was a
hard violation, so FinancialStandards had exactly two options and both were wrong:

| Option | Outcome |
| --- | --- |
| Declare `--policy {policy}` | Rejected by the enforcer's own validator. A contract nobody can consume. |
| Omit `--policy` | **Validates cleanly**, then produces a confident verdict about the wrong policy. |

The second is the dangerous one, and it is worth being precise about why. A Financial declaration of
`["check", "{target}", "--json"]` conforms to schemaVersion 1.0.0 in every respect. Publishing it
would not have left the hazard unresolved — it would have **created** one, in the repository built to
prevent exactly this.

## Why omitting it is not a partial answer

Finding F of `artifacts/evidence/2026-08-09-interface-inventory.md`, verified there by execution:

```text
node scripts/standards.mjs check F:/Repos/HowLongUntil --json
  → "project": "FinancialStandards"
```

Financial resolves an absent `--policy` to **its own** `project-policy.yml`
(`scripts/standards.mjs:167`). Pointed at a target it audits the target's markdown against the
standards pack's policy, labels the report with the standards pack's name, and exits 0. Nothing
errors, and the verdict is shaped exactly like a correct one.

Re-verified against the released source at `FinancialStandards@3627c6f:scripts/standards.mjs:502-518`:
`--policy` consumes the **next** argv element; `--policy=<value>` is refused as an unknown flag; there
is no `--dir`. The contract must therefore carry the exact argv, and the enforcer must not join,
split or reorder it.

## What changed

Placeholders became **keyed by schema version** rather than one list that grows:

```text
1.0.0   {target}
1.1.0   {target}  {policy}
```

A flat set would have silently widened 1.0.0 — a declaration released under it would begin to be read
as permitting a binding no enforcer of its era could perform, and a pack cannot re-release history. A
1.1.0 contract is correctly unreadable to an older enforcer: it is refused on the version field
rather than having the binding dropped, which is the difference between a refusal and a wrong answer.

`{policy}` binds to `<target>/project-policy.yml` — the **governed repository's** policy, never the
pack's own. It is derived inside `runOfficialEvaluator` from `target` and `POLICY_FILE` rather than
passed in, so the path a contract is given and the path `enforce` reads for adoption cannot become
two different files.

> **SUPERSEDED — see the banner at the top of this file.** The goal named in this paragraph — that the
> path a contract is given and the path `enforce` reads for adoption cannot become two different
> files — is the right goal and is now met more directly. Deriving the path in two places achieved it
> only while both derivations joined the same constant onto the same root. The merged code resolves
> it once and passes it, so there is one path rather than two that agree.

## The measurements, in order

```text
1. host,      Windows, Node 24, oracle present    199 tests  198 pass  0 fail  1 skip   <- skip IS 7b
2. container, Linux,   Node 20, oracle mounted    199 tests  198 pass  1 fail  0 skip   <- 7b, inherited
3. container, Linux,   merged with PR #1          214 tests  214 pass  0 fail  0 skip
```

Run 1's single skip is case 7b, which needs symlink privilege the Windows workstation does not have.
Reported as a skip and not as a pass: run 2 is what executed it. Run 2's single failure is the
entrypoint-containment defect this branch **inherited from `main`** and did not introduce — it was
fixed on PR #1, which merged at 17:19:19Z, and run 3 measures the combination.

## The falsifiers, run before the tests were trusted

Each new guard was checked against a deliberately broken implementation. Green tests establish
nothing until they have been shown capable of going red.

```text
drop {policy} from 1.1.0's set          8 of 10 red
widen 1.0.0 to admit {policy}           exactly the 2 version-pinning tests red
chained replaceAll, not a single pass   exactly the re-expansion test red
```

The third is the narrow one: chained substitution re-reads its own output, so a target path
containing the literal characters `{policy}` would be expanded into the policy path. Contrived, and
wrong in a way that would only ever surface on an input nobody would think to test.

The load-bearing test is not that the binding works but that **removing it is observably different**.
With the binding gone, the same synthetic pack still exits 0, still reports `COMPLIANT`, and reads its
own policy. What is asserted is the policy path, not the verdict — because the verdict looks correct
in both cases, which is the whole problem.

## What this does not establish

- **It is not a claim about FinancialStandards' released behaviour.** The synthetic pack reproduces
  the argv discipline read from Financial's source; whether the released pack behaves as finding F
  recorded is an oracle-tier question needing a pinned checkout, and no such test was added here.
- **No FinancialStandards adapter has been published.** `standards-adapter.json` does not exist in
  that repository, and v1.1.1 has not been released. This change makes the declaration expressible;
  it does not make it exist, and it asserts nothing about a pack that has not published one.
- **It says nothing about the other seven packs.** `{policy}` was forced by Financial alone. Whether
  Betting's second policy file (`betting-policy.yml`, finding G) needs a binding was not investigated.
- **The evaluation-unit mismatch is untouched.** Finding H — that Financial's subject is an analysis
  document rather than a repository root — remains open and is routed to the M3 adoption record, not
  to this contract.
