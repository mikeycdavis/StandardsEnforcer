# FE-13 — a cache marker is not proof of current identity

**Date:** 2026-08-12
**Item:** [FE-13](../backlog/items/FE-13.md), under [EP-01](../backlog/items/EP-01.md)
**Raw output:** [`2026-08-12-fe13-cache-identity-raw/`](./2026-08-12-fe13-cache-identity-raw/)

## The property

Set by the owner on 2026-08-12 and used verbatim as the acceptance condition:

> Every execution must establish that the materialised authority's current identity still matches the
> authority identity that was resolved and approved for that run. Cached state may avoid
> reacquisition, but it may never substitute for identity verification.

## The reproduction came first, and it was written to be outcome-shaped

`test/identity-cache.test.mjs` asserts one property across every case: either the call **refuses**, or
the directory it returns **is** the requested commit. Repair and refusal both satisfy it; trusting the
marker does not.

That phrasing was deliberate. FE-13 says *the mechanism follows the evidence*, so a test naming
re-verification in advance would have been a test of the chosen fix rather than of the guarantee.

### Observed red — [`red-before.txt`](./2026-08-12-fe13-cache-identity-raw/red-before.txt)

Six cases, **four failing**, against the implementation as it stood:

| Case | Before |
|---|---|
| Cached tree moved to a different commit | ✖ accepted on the strength of the marker |
| Working tree edited, `HEAD` untouched | ✖ tampered `VERSION` handed back |
| Marker naming a different SHA | ✔ passed |
| Empty marker | ✔ passed |
| Marked directory with no repository in it | ✖ returned as success |
| Entry filed under another identity's name | ✖ wrong commit executed |

### The two passes were the finding, not a gap

The marker-metadata cases passed **because the marker's content was never read at all**. Corrupting
it changed nothing: the tree was still the approved commit, so the property held.

That killed the remedy that looks obvious from the item's title. Making the marker load-bearing —
reading the SHA back, checksumming it, signing it — would have replaced a marker asserting the tree
was verified with a marker asserting it more carefully, which is the same defect with better
stationery. **The tree is the evidence. The marker is bookkeeping.** Both cases are kept, because the
property must hold whatever the marker says.

## What the fix is

`checkoutIsExactly(dir, sha)` asks three questions in the order that keeps their answers
distinguishable: is there a repository here, is `HEAD` the commit, does `git status --porcelain` come
back empty.

**The tree check is not decoration, and the reproduction is why it is in.** `rev-parse HEAD`
establishes the commit and not the files; the edited-`VERSION` case kept a correct `HEAD` and would
have executed different code. FE-13 flagged HEAD-only versus dirty-tree as a decision rather than a
detail, and the evidence decided it.

`materialise` now treats a cache hit as a **candidate, not a conclusion**. A hit is verified before it
is returned; a failing entry is discarded, rebuilt from source, and verified again by the identical
check — so repair cannot become its own soft path. The reason a hit was rejected travels back as
`repaired`, because content-addressing means a rejected entry is always evidence of something: the
directory name could not have gone stale on its own.

### The marker moved out of the tree

`<cacheRoot>/<sha>/.enforcer-complete` → `<cacheRoot>/<sha>.complete`.

A marker written inside the checkout is a file the enforcer added to the authority it is about to
execute, and it would have forced a permanent exception into the clean-tree clause. An invariant with
a standing exception carved into it is not an invariant. Existing caches are not migrated: an old
entry simply fails verification once and is rebuilt.

## Two things found while fixing it, both real

**1. A genuinely corrupt cache entry on this machine — the defect biting outside the fixture.**

The MachineLearningStandards entry `d9cffa11df68f15da9aadc6032ca49748cad5946` verified as:

```text
the checkout is at d9cffa11df68f15da9aadc6032ca49748cad5946 but its working tree is not:
5 path(s) differ, starting with "D artifacts/project-plan-breakdown/00-overview.md"
```

Five files deleted from a materialised authority, which the previous implementation executed without
complaint on every run after the first. Nothing establishes how they were lost, and no exploitation is
claimed — what is established is that the enforcer was running an incomplete authority and reporting
its verdict as though the identity held.

**2. Re-verification made repair destructive, and the first fix was wrong.**

Deleting a rejected entry in place raced with concurrent runs sharing a cache root: `rmSync` threw
`ENOTEMPTY` out of `materialise`, and the suite went intermittently red in files that had nothing to do
with the change.

An exception is a **third outcome**, which this module's contract explicitly does not have. Fixed by
building into a per-process staging directory and renaming into place, and by wrapping the filesystem
mutations so a fault returns a reason instead of throwing. If the swap is lost to another run, the
entry that won is verified by the same check rather than deferred to — deferring without verification
would be the original defect wearing a different hat.

**Residual, stated rather than papered over:** there is no cross-process lock. Two runs can still
repair the same identity concurrently; both now converge on a verified tree, and neither deletes a
directory the other is executing from, but the window is narrowed rather than closed. Closing it needs
a lock file, which nothing has yet forced.

## Result — [`green-after.txt`](./2026-08-12-fe13-cache-identity-raw/green-after.txt), [`suite-after.txt`](./2026-08-12-fe13-cache-identity-raw/suite-after.txt)

Ten cases pass. The full suite stands at **173 tests, 172 pass, 1 skipped**, stable across three
consecutive runs after the concurrency fix.

**The one skip is still ADR 0005 case 7b**, symlinked entrypoint, `EPERM` on this platform. It is
skipped and not passed, and this result must not be compressed into "all identity tests pass".

## Cost

One additional `git rev-parse HEAD` and one `git status --porcelain` per cache hit. That is the price
of the guarantee, and it is why the shortcut existed rather than a reason to keep it.

## What this does not establish

- Nothing here says the cache was ever *attacked*. One entry was found materially wrong; how it got
  that way is unknown and is not claimed.
- Verification happens at materialisation, not continuously. A tree altered between the check and the
  evaluator's read would not be caught. Closing that needs the evaluator to run against a tree nothing
  else can write to, which is a different piece of work and is not done here.
- The concurrent-repair window above.

## Provenance limitation — the red source was not preserved

Recorded because it is a real weakness in this evidence chain, and because the alternative on offer was
worse.

The pre-remedy falsifier **was executed and observed failing**: four of six cases, output preserved
verbatim in [`red-before.txt`](./2026-08-12-fe13-cache-identity-raw/red-before.txt). What was not
preserved is its **source**. The six-test file was never committed while red, and the ten-case suite in
`test/identity-cache.test.mjs` was written against the fix — it is a *successor*, not the historical
red artifact, and two of its case names differ from the six.

**The six-test source is therefore not recoverable**, and it is deliberately not being reconstructed.
Re-deriving a file from `red-before.txt` now would produce a new artifact wearing the date of an old
one, which is worse provenance than saying plainly what was lost.

What this costs, stated exactly: FE-13's process requirement — *freeze the reproduction before
designing the remedy* — was met in **execution** and not in **the record**. The engineering acceptance
property is unaffected; only the durability of its first step is.

The bridge that does survive is the case table above: each of the four observed failures names a
behaviour, and each behaviour has a successor case in the ten. That mapping is what supports the claim
that the same behaviours are now green — **not** any claim that the two suites are the same file.
