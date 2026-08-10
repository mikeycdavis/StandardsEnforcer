# UIUXDesignStandards is not a ninth authority

**Recon, closing a census question before M2 can be called complete.** The
[conformance-boundary review](2026-08-09-adapter-conformance-boundary.md) noted a ninth standards
repository and recommended the eight-pack universe be labelled *intended scope* rather than empirical
census. That recommendation stands. This note settles whether the ninth repository is an authority
StandardsEnforcer can invoke.

**It is not, and it is further from being one than a glance suggests.**

## What is actually there

```text
$ git log --oneline
f9abcec Initial commit

$ git tag
(none)

$ git ls-files
README.md
```

One commit. No tags. One tracked file, containing the single line `# UIUXDesignStandards`.

The `scripts/` directory that prompted this recon is **untracked**:

```text
?? artifacts/   ?? package.json   ?? rules/   ?? scripts/   ?? standards/   ?? test/
```

An earlier note in this session reported that the repository "now has `scripts/`" and inferred it
might need an adapter. That inference was wrong: the files exist in someone's working tree and are not
in the repository. There is no VERSION file, tracked or otherwise. The uncommitted `package.json`
declares `"version": "1.0.0"` and a `bin` of `scripts/uiux.mjs` — a file that is neither committed nor
present under that name among the untracked scripts.

## Against the four criteria

```text
1. an authoritative repository verdict   NO   nothing tracked can produce one
2. machine-readable output               NO   unestablished; the CLI is uncommitted
3. a stable invocation                   NO   package.json names scripts/uiux.mjs, which is absent
4. a release identity                    NO   no tag, no VERSION, one commit
```

Four of four fail, and the fourth fails hardest. **Not a dependency — a non-participant.** The other
five packs on the dependency list are real authorities that cannot yet be pinned; this is a repository
that has not begun. Listing it beside Engineering or Health would overstate both.

## What this means for the denominator

The M2 acceptance denominator stays at **eight**. The census statement changes, not the scope:

> Nine repositories carry a standards-shaped name. Eight are standards authorities with committed
> evaluators. UIUXDesignStandards is a repository under construction, tracking one file, and is not
> an authority StandardsEnforcer can invoke or fail to invoke.

The adapter protocol is not destabilised, because nothing about this repository's eventual interface
is known. If it acquires a committed evaluator and a release, it enters recon then — at which point
the standing question is whether it forces a schema field, exactly as any pack would.

**It must not be quietly counted as a ninth pack, and it must not be quietly ignored.** Recorded so
that a future reader finding a fully built UI/UX standards repository knows this state was inspected
on 2026-08-10 and found to be one commit and a heading.
