# Worktrees — why this repository is checked out more than once

Two agent sessions worked this repository concurrently in one working directory. Over a single
afternoon that produced: commits landing on the wrong branch, a script whose input files changed
between two of its own steps, duplicated work on the same assignment, `index.lock` contention that
made `git status` and `git add` return silently, uncommitted work that appeared to have vanished and
had not, and one track's session rewriting the other track's tests.

The procedural fix — *check the branch before you write* — was tried and does not hold, because the
environment allows a race between the check and the write. Session isolation does not imply worktree
isolation. Separate git indexes do.

```text
F:\Repos\StandardsEnforcer                main / integration, and the composition track
F:\Repos\StandardsEnforcer-enforcement    the enforcement track (M1–M5)
```

A branch checked out in one worktree cannot be checked out in another. That refusal is the control.

    git worktree add -b <branch> F:\Repos\StandardsEnforcer-<track> <base>
    git worktree list

Before starting work in a session, run `git worktree list` and confirm which directory you are in.
If a directory holds a branch you did not expect, stop rather than tidying it: the tidying is itself
a write, and the last incident began with one.
