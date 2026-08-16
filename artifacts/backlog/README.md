# Backlog

<!--
  NOT a generated file, and it no longer claims to be. This page is written by hand; every
  mechanical claim on it — the counts, the percentages, the progress tuples, the in-flight list and
  the tree — is recomputed from items/*.md and checked against this file by
  test/backlog-tracker.test.mjs on every authoritative CI run.

  Change an item, then run `node scripts/backlog.mjs` to be told which figures moved (ST-10).
-->

Work on this project classified with the Extended Agile Hierarchy. Every item is a file in
[`items/`](./items/); its YAML frontmatter is the source of truth, and the figures on this page are
derived from it and checked against it by [`scripts/backlog.mjs`](../../scripts/backlog.mjs).

**15 of 23 leaf items complete — 65%**

```
██████████████████████████░░░░░░░░░░░░░░  65%
```

## Status

| Status | Items |
| --- | ---: |
| ○ Not started | 6 |
| ◑ In progress | 7 |
| ◒ Blocked | 2 |
| ● Complete | 17 |
| **Total** | **32** |

## The hierarchy

| Level | Prefix | Count | Answers |
| --- | --- | ---: | --- |
| Theme | `TH-` | 1 | Which enduring area of value is this? |
| Initiative | `IN-` | 1 | What outcome are we pursuing there? |
| Epic | `EP-` | 6 | What large body of work delivers it? |
| Feature | `FE-` | 14 | What shippable slice of that epic? |
| Story | `ST-` | 10 | What user-visible change, roughly one PR? |
| Task | `TA-` | 0 | What technical step inside a story? |

## Progress by theme

| Theme | Progress | Done | Remaining |
| --- | --- | ---: | ---: |
| [TH-01 Enforced standards compliance across the portfolio](./items/TH-01.md) | `█████████░░░░░` 65% | 15 | 8 |

## In flight

- ◑ [EP-02](./items/EP-02.md) — The enforcement root — a gate the governed pull request cannot satisfy
- ◑ [EP-04](./items/EP-04.md) — The enforcer's own release lineage
- ◑ [EP-06](./items/EP-06.md) — Self-assurance — this repository's own evidence must establish what it reports
- ◑ [FE-04](./items/FE-04.md) — M4 — the enforcement root against live GitHub
- ◒ [FE-09](./items/FE-09.md) — Make BYPASS_USED reachable
- ◑ [FE-14](./items/FE-14.md) — A skipped oracle is not a passing integration
- ◑ [IN-01](./items/IN-01.md) — Enforcement a governed repository cannot weaken
- ◒ [ST-07](./items/ST-07.md) — Validate the required-workflows remedy against a real organisation ruleset
- ◑ [TH-01](./items/TH-01.md) — Enforced standards compliance across the portfolio

## Ready to pick up

_Nothing marked ready._

## Everything

- ◑ **[TH-01](./items/TH-01.md)** Enforced standards compliance across the portfolio _(15/23)_
  - ◑ **[IN-01](./items/IN-01.md)** Enforcement a governed repository cannot weaken _(15/23)_
    - ● **[EP-01](./items/EP-01.md)** Authority transport — run a pack's own evaluator under a pinned identity _(8/8)_
      - ● **[FE-01](./items/FE-01.md)** M1 — run the official standards implementation and report what it said
      - ● **[FE-02](./items/FE-02.md)** M2 — contract-driven authority transport _(5/5)_
        - ● **[ST-01](./items/ST-01.md)** M2 Phase 0 — what the eight released interfaces actually are
        - ● **[ST-02](./items/ST-02.md)** M2 Phase 1 — the contract is adequate; four of eight packs are not
        - ● **[ST-03](./items/ST-03.md)** M2 Phase 3 — the enforcer stops knowing what a verdict means
        - ● **[ST-04](./items/ST-04.md)** An executable adapter conformance boundary
        - ● **[ST-05](./items/ST-05.md)** Adapter provenance bound to the verified release
      - ● **[FE-13](./items/FE-13.md)** A cache marker is not proof of current identity
      - ● **[FE-15](./items/FE-15.md)** Concurrent processes share a mutable cache root
    - ◑ **[EP-02](./items/EP-02.md)** The enforcement root — a gate the governed pull request cannot satisfy _(2/3)_
      - ● **[FE-03](./items/FE-03.md)** M2 — a gate is a required check, not a file
      - ◑ **[FE-04](./items/FE-04.md)** M4 — the enforcement root against live GitHub _(1/2)_
        - ● **[ST-06](./items/ST-06.md)** Establish live whether an Actions-bound required check is spoofable
        - ◒ **[ST-07](./items/ST-07.md)** Validate the required-workflows remedy against a real organisation ruleset
    - ● **[EP-03](./items/EP-03.md)** Scope — whether a standard governs a repository is a recorded decision
    - ◑ **[EP-04](./items/EP-04.md)** The enforcer's own release lineage _(1/1)_
      - ● **[FE-06](./items/FE-06.md)** Decide which line becomes authoritative, and then the disposition of main
    - ○ **[EP-05](./items/EP-05.md)** Reach beyond one repository, one platform, one standard _(1/6)_
      - ○ **[FE-07](./items/FE-07.md)** Repository discovery across an organisation
      - ○ **[FE-08](./items/FE-08.md)** A second platform adapter
      - ◒ **[FE-09](./items/FE-09.md)** Make BYPASS_USED reachable
      - ○ **[FE-10](./items/FE-10.md)** Reviewer identity beyond a configured list
      - ○ **[FE-11](./items/FE-11.md)** Cross-pack dependency ordering
      - ● **[FE-12](./items/FE-12.md)** Scope dispositions keyed per pack, not hardcoded to machine-learning
    - ◑ **[EP-06](./items/EP-06.md)** Self-assurance — this repository's own evidence must establish what it reports _(2/3)_
      - ◑ **[FE-14](./items/FE-14.md)** A skipped oracle is not a passing integration
      - ● **[ST-08](./items/ST-08.md)** Authoritative container CI must assert the symlink capability it depends on
      - ● **[ST-10](./items/ST-10.md)** The backlog tracker claims to be derived, and no executable derivation exists
    - ○ **[ST-09](./items/ST-09.md)** scripts/ci.sh fails under Git Bash on Windows

