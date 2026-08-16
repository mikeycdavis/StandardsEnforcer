# Governance corpus — provenance

Copied **verbatim**, byte-for-byte, from an external producer. Not authored here, and not to be
edited here: a fixture someone tidied is a fixture that no longer records what the producer emitted.

| Fixture | Origin |
| --- | --- |
| `uiux-2026-08-16-before.json` | `UIUXDesignStandards@54352e9a0dc0fb3ba0e4762663d341c46d8a3c89:artifacts/governance/host-evidence-2026-08-16.json` |
| `uiux-2026-08-16-after.json` | `UIUXDesignStandards@54352e9a0dc0fb3ba0e4762663d341c46d8a3c89:artifacts/governance/host-evidence-2026-08-16-after-rulesets.json` |

## Why this pair is worth having

The same collector, unmodified, run either side of an authorised host-configuration change against
live GitHub. Before: six required controls `ABSENT`, aggregate `UNGOVERNED`. After: six `SATISFIED`,
aggregate `GOVERNED`. Real API responses, a real host mutation between them, and no synthetic record
in either direction.

That makes it a discrimination corpus rather than an example. A consumer that cannot tell these two
apart, or that tells them apart for the wrong reason — the filename, the aggregate word, a ruleset
id, a hard-coded count — is measurably broken by them.

## What this pair does NOT establish

The producer decides `main.standards_check_required` by matching the required check's **context name**
and reads neither app binding nor required-workflow pinning. So `GOVERNED` here means "a check of
that name is required", which is strictly weaker than this repository's rooting requirement — M4
established live that a name-only requirement is satisfied by the pull request's own workflow.

Neither file carries `contractDigest`; that field appears only in the producer's `baseline.json`,
which has a different shape. The required-control identity set is compared directly instead, so
nothing here depends on reimplementing the producer's hash.

## Updating

Re-copy from a named producer commit and update the table. Do not hand-edit. If a record's shape
changes, that is a producer contract change and the consumer should fail closed on it rather than
being adjusted to match quietly.
