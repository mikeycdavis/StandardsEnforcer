/**
 * The portfolio matrix: every cell, including — especially — the ugly ones.
 *
 * [ADR 0008](../artifacts/adr/0008-the-cell-identity-key-and-the-total-ratchet.md), part 3. There is
 * no `--only-signalled`, no flag that hides unknown cells, and no default that collapses a category.
 * **Any option that reduces the cell COUNT without reducing the POPULATION is the back door this
 * milestone was built to close**, and `test/portfolio-matrix.test.mjs` asserts its absence against
 * this source rather than trusting this paragraph.
 *
 * WHAT THIS DOES NOT DO. It does not evaluate. An in-scope cell means a human decided the standard
 * governs the repository; whether that repository satisfies the standard is a question for the
 * evaluator seam, one target at a time, and answering it here would mean running nine packs across
 * fifty repositories to draw a table. So an in-scope cell reports `evaluated: false` and no state,
 * and the renderer says so in words. **The matrix reports applicability, not compliance**, and a
 * column that looked like compliance would be the most expensive lie in the system.
 *
 * WHY MOST CELLS WILL BE `review-required`, AND WHY THAT IS THE RESULT RATHER THAN A BUG. A cell
 * resolves further than that only when this run can observe the repository: the freshness authority
 * of ADR 0007 is the tracked content of the reviewed surface, and content cannot be observed without
 * a working copy. A registered repository with no locatable checkout is `undetermined` — not fresh,
 * not stale — which is the truthful answer and goes to a human.
 *
 * THE TOTALITY CLAIM IS BOUNDED, AND THE BOUND IS REPORTED BESIDE THE RESULT. This is total over the
 * REGISTERED population, not over the world. A repository nobody registered has no cell to be missing
 * from. Closing that is repository discovery — enumerating an organisation and noticing something
 * nobody ever assessed — which is a separate obligation and is not in this slice. So every result
 * carries the size of the registered population, because a small tidy matrix must never be able to
 * read as a governed portfolio.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { detectFootprint } from "./footprint.mjs";
import { reviewSurface } from "./digest.mjs";
import { readPopulation } from "./population.mjs";
import { loadBaseline, checkRatchet } from "./ratchet.mjs";
import { resolveScope, OUTCOME } from "./scope.mjs";
import { STATE } from "./states.mjs";

/**
 * The scope outcome a cell resolved to, projected onto the enforcement vocabulary where — and only
 * where — a state genuinely corresponds.
 *
 * `in-scope` maps to nothing on purpose. No member of `STATE` means "governed, and not evaluated
 * here", and inventing one to fill the column would put a word in the vocabulary that exists to make
 * a table look complete. `REACHABLE`'s gap stays exactly `["BYPASS_USED"]`.
 */
export function stateFor(outcome) {
  switch (outcome) {
    case OUTCOME.OUT_OF_SCOPE: return STATE.OUT_OF_SCOPE;
    case OUTCOME.REVIEW_REQUIRED: return STATE.SCOPE_REVIEW_REQUIRED;
    case OUTCOME.REGISTRY_INVALID: return STATE.SCOPE_REGISTRY_INVALID;
    default: return null;
  }
}

/**
 * Default locator: a registered repository is observable if its entry records a `localPath` that
 * exists, or if a `--repos-root` holds a directory named after the entry.
 *
 * `localPath` is operator configuration and not governance — where a checkout happens to sit on one
 * machine says nothing about whether a standard governs it. It can only ever make a cell resolve
 * FURTHER; it can never make one pass, because an unobservable surface is `undetermined` and
 * `undetermined` is review-required.
 */
export function defaultLocator({ reposRoot = null } = {}) {
  return (repo) => {
    if (repo.localPath && existsSync(repo.localPath)) return path.resolve(repo.localPath);
    if (!reposRoot || !repo.name) return null;
    const leaf = repo.name.split("/").pop();
    const guess = path.join(reposRoot, leaf);
    return existsSync(guess) ? guess : null;
  };
}

/**
 * Resolve every cell in the registered population.
 *
 * The ratchet runs first and its findings travel with the result rather than replacing it. Both
 * questions are worth answering on the same run and they are different questions: the ratchet asks
 * whether the population changed without a governance event, the matrix asks what the population
 * currently says. A ratchet violation makes the run fail; it does not make the cells unreportable,
 * and hiding them would mean the only way to see the portfolio is to have already satisfied the
 * control.
 */
export function portfolio({ registryPath, baselinePath = null, today, locate = null, observe = true }) {
  const population = readPopulation(registryPath);
  if (population.outcome === OUTCOME.REGISTRY_INVALID) {
    return {
      ok: false,
      registryInvalid: true,
      why: population.why,
      ratchet: { ok: false, findings: [] },
      packs: [],
      repositories: [],
      cells: [],
      counts: { repositories: 0, packs: 0, cells: 0, byOutcome: {} },
    };
  }

  const loaded = loadBaseline(baselinePath);
  const ratchet = loaded.ok
    ? checkRatchet({ population, baseline: loaded.baseline })
    : { ok: false, findings: loaded.findings };

  const locator = locate ?? (() => null);
  const observed = new Map();

  const cells = [];
  for (const cell of population.cells) {
    const repo = population.repositories.find((r) => r.repoId === cell.repoId);

    // Detection and the surface resolver are per repository, not per cell. Running them once per pack
    // would be nine identical scans of the same tree and, worse, nine chances for them to disagree.
    if (!observed.has(cell.repoId)) {
      let footprints = {};
      let observeSurface = null;
      let dir = null;
      if (observe) {
        try {
          dir = locator(repo);
        } catch {
          dir = null;
        }
      }
      if (dir) {
        try {
          const fp = detectFootprint(dir);
          footprints = { [fp.surface]: { kinds: fp.kinds, digest: fp.digest, signals: fp.signals } };
          observeSurface = (exclusions) => reviewSurface(dir, exclusions);
        } catch {
          // A checkout that cannot be read is an unobserved repository, which is `undetermined`. It
          // is never an observed repository that happened to yield nothing — that conversion is the
          // one INV-E1 forbids, and it is how "I could not look" becomes "I looked and it was fine".
          footprints = {};
          observeSurface = null;
        }
      }
      observed.set(cell.repoId, { dir, footprints, observeSurface });
    }
    const { dir, footprints, observeSurface } = observed.get(cell.repoId);

    const resolved = resolveScope({
      registryPath,
      repoId: cell.repoId,
      repoName: repo?.name ?? null,
      standardId: cell.contractId,
      target: dir,
      footprints,
      observeSurface,
      today,
    });

    cells.push({
      repoId: cell.repoId,
      repoName: repo?.name ?? null,
      contractId: cell.contractId,
      observed: Boolean(dir),
      outcome: resolved.outcome,
      state: stateFor(resolved.outcome),
      evaluated: false,
      why: resolved.why ?? null,
      decision: resolved.detail?.decision ?? null,
      exclusions: resolved.detail?.surface?.exclusions ?? [],
    });
  }

  const byOutcome = {};
  for (const c of cells) byOutcome[c.outcome] = (byOutcome[c.outcome] ?? 0) + 1;

  return {
    // The run fails on a ratchet violation. It does not fail merely because most cells are
    // unreviewed: an honest portfolio full of unknowns is the expected first result, and a run that
    // exited non-zero for it would be a control nobody could ever turn on.
    ok: ratchet.ok,
    registryInvalid: false,
    ratchet,
    packs: population.packs,
    repositories: population.repositories.map((r) => ({ repoId: r.repoId, name: r.name, localPath: r.localPath })),
    cells,
    counts: {
      repositories: population.repositories.length,
      packs: population.packs.length,
      cells: cells.length,
      observed: cells.filter((c) => c.observed).length,
      byOutcome,
    },
  };
}
