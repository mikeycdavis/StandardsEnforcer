# Backlog

This backlog is in **GitHub Issues**, not in files. `artifacts/backlog/github-mapping.json`
records `authority: "github"` — every legacy id maps to the issue that now carries it.

- Read it: `gh issue list --repo mikeycdavis/StandardsEnforcer`, or the `backlog-validate` skill's
  GitHub adapter, which needs its full path — the bare `backlog-gh.mjs` this line used to print is
  not resolvable from this directory and fails with `Cannot find module`:

  ```bash
  node ~/.claude/skills/backlog-validate/scripts/github/backlog-gh.mjs list --repo=mikeycdavis/StandardsEnforcer
  ```

  `list`, `json` (schemaVersion 2.0.0), `validate`, `reconcile` and `authority` are the read
  commands; `authority` prints the evidence for which store is in force. Measured 2026-09-27:
  **48 items, 0 problems.**
- File-backed tools (`backlog.mjs`, the `backlog` skill) refuse to run here and print this
  same state. This repository's own tracker checker (`scripts/backlog.mjs`,
  `test/backlog-tracker.test.mjs`) was retired in an earlier pull request.
- **Recovery:** restore `artifacts/backlog/items/` from the commit before this one, then set
  `authority` back to `"files"` in `github-mapping.json`. A pre-migration snapshot is also
  retained at `F:\Repos\_migration-snapshots\prep-StandardsEnforcer-20260923-1` (owner's machine),
  independent of this repository's git history.

## The failure this file cannot prevent

Authority is resolved from **what is on disk in the working tree**, not from `main`. A checkout on
a pre-migration branch still has `artifacts/backlog/items/` and no mapping, so every tool correctly
concludes `files` and reads item files that nobody maintains any more. Nothing is inconsistent and
nothing errors — which is exactly why it is worth writing down.

Observed 2026-09-27: `F:\Repos\StandardsEnforcer` was on `backlog/hierarchy-repair`, five days
older than the migration, and `backlog.mjs` validated 42 stale items there and reported the tracker
out of date. The same command in a checkout of `main` refused and printed the GitHub adapter.

Before trusting any backlog output, confirm which store answered:

```bash
node ~/.claude/skills/backlog-validate/scripts/github/backlog-gh.mjs authority --repo=mikeycdavis/StandardsEnforcer
```

`state: github` means the issues answered. `state: files` or `staged` from this repository means the
checkout is behind, not that the migration came undone.
