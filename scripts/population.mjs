/**
 * The governed population: which cells exist at all.
 *
 * [ADR 0007](../artifacts/adr/0007-the-review-surface-is-the-whole-repository.md) established what it
 * means for ONE applicability determination to be current. It says nothing about which determinations
 * ought to exist — and a cell that does not exist cannot be stale, cannot be reviewed, and cannot
 * fail. That is the last shape of the bypass this milestone closes: not "declare it out of scope",
 * but "never appear in the population".
 *
 * This module answers the prior question ADR 0008 exists to settle. It does not decide anything about
 * a cell; it decides which cells there are, and refuses several ways that enumeration goes quietly
 * wrong.
 *
 *     cellKey = repoId  ␀  contractId
 *
 *     repoId      an immutable platform identity, opaque here      (ADR 0004)
 *     contractId  the `standard.id` the pack declares about itself  (ADR 0008)
 *
 * THE PACK HALF IS THE NEW PART, AND IT IS A REFUSAL RATHER THAN A CONVENTION. A registry may not
 * invent a pack; it may only register one by transcribing the identity that pack declares. So the map
 * key must equal `contract.id` — a registry filing a pack under a spelling the pack does not use is
 * invalid, neither silently accepted nor silently corrected — and an invocation naming a pack nobody
 * registered is refused, DIFFERENTLY from a registered pack with no disposition on file. A typo is a
 * configuration error; an unreviewed pack is a governance gap. FE-12 closed leaving exactly that
 * residue open, harmlessly while cells were resolved one at a time, and not harmlessly once a
 * population is enumerated: a misspelling retires one cell and mints another with no governance
 * event anywhere.
 *
 * WHAT THIS MODULE WILL NOT DO. It does not open a pack, resolve a release, or read an adapter. The
 * identity it reads is TRANSCRIBED, and `sourceRef` records where from. FE-12's finding — that a
 * malformed or unreachable contract must never erase a human's recorded decision — is the reason,
 * and it survives intact only if this file stays incurious.
 *
 * NOTHING HERE KNOWS WHICH PACKS EXIST. Every pack name in this file's output came out of the
 * registry. `test/authority-boundary.test.mjs` asserts that against the source.
 */

import { loadRegistry, OUTCOME } from "./scope.mjs";

/** The separator inside a cell key. Refused inside either component, so the key cannot be forged. */
const SEP = "\u0000";

export class PopulationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PopulationError";
    this.code = code;
  }
}

export const POPULATION = {
  NO_ROSTER: "NO_ROSTER",
  ROSTER_MALFORMED: "ROSTER_MALFORMED",
  SPELLING_MISMATCH: "SPELLING_MISMATCH",
  IDENTITY_MALFORMED: "IDENTITY_MALFORMED",
  UNREGISTERED_PACK: "UNREGISTERED_PACK",
};

export function cellKey(repoId, contractId) {
  return `${repoId}${SEP}${contractId}`;
}

export function splitCellKey(key) {
  const i = key.indexOf(SEP);
  if (i < 0) throw new PopulationError(`"${key}" is not a cell key`, POPULATION.IDENTITY_MALFORMED);
  return { repoId: key.slice(0, i), contractId: key.slice(i + 1) };
}

function identity(value, what) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PopulationError(`${what} is not a non-empty string, so it cannot identify anything`, POPULATION.IDENTITY_MALFORMED);
  }
  if (value.includes(SEP)) {
    throw new PopulationError(`${what} contains a NUL, which is the cell-key separator`, POPULATION.IDENTITY_MALFORMED);
  }
  return value;
}

/**
 * Read the registered pack roster.
 *
 * Registration is transcription. The map key IS the identity, and `contract.id` is the transcription
 * of what the pack declares — so requiring them to be equal is what stops registry spelling from
 * becoming identity by drift. There is no normalisation step here on purpose: normalising
 * `machineLearning` into `machine-learning` would be this enforcer deciding what a pack is called,
 * and the false green FE-12 found was exactly a representation mismatch nobody was watching.
 */
export function readRoster(registry) {
  const roster = registry.standards;
  if (roster === undefined) {
    throw new PopulationError(
      "the scope registry registers no standards packs, so no cell has a pack axis and the population is empty by " +
      "omission rather than by decision",
      POPULATION.NO_ROSTER,
    );
  }
  if (!roster || typeof roster !== "object" || Array.isArray(roster)) {
    throw new PopulationError("the registry's `standards` roster is not an object", POPULATION.ROSTER_MALFORMED);
  }

  const packs = [];
  for (const [key, entry] of Object.entries(roster)) {
    identity(key, `the pack roster key "${key}"`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PopulationError(`the roster entry for "${key}" is not an object`, POPULATION.ROSTER_MALFORMED);
    }
    const contract = entry.contract;
    if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
      throw new PopulationError(
        `the roster entry for "${key}" records no \`contract\`, so its identity was asserted by the registry rather ` +
        "than transcribed from the pack",
        POPULATION.ROSTER_MALFORMED,
      );
    }
    identity(contract.id, `the contract id of "${key}"`);
    if (contract.id !== key) {
      throw new PopulationError(
        `the pack registered as "${key}" declares its contract id as "${contract.id}". A registry may register a ` +
        "pack, not rename one, and a cell keyed on the registry's spelling is keyed on nothing the pack agrees to",
        POPULATION.SPELLING_MISMATCH,
      );
    }
    if (typeof contract.sourceRef !== "string" || contract.sourceRef.trim() === "") {
      throw new PopulationError(
        `the roster entry for "${key}" records no \`sourceRef\`, so a wrong transcription would be an anonymous ` +
        "string rather than a findable act",
        POPULATION.ROSTER_MALFORMED,
      );
    }
    for (const optional of ["tag", "sha"]) {
      if (contract[optional] !== undefined && typeof contract[optional] !== "string") {
        throw new PopulationError(`the roster entry for "${key}" records a non-string \`${optional}\``, POPULATION.ROSTER_MALFORMED);
      }
    }
    packs.push({
      contractId: contract.id,
      name: typeof entry.name === "string" ? entry.name : null,
      sourceRef: contract.sourceRef,
      tag: contract.tag ?? null,
      sha: contract.sha ?? null,
    });
  }
  packs.sort((a, b) => (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0));
  return packs;
}

/**
 * Enumerate the whole registered population: every repository × every registered pack.
 *
 * TOTAL, NOT SPARSE, and the difference is the whole mechanism. A sparse enumeration lists what is
 * known, so anything unknown is absent, so absence is permission. Here a repository registered with
 * no disposition for a pack still produces a cell — an unreviewed one, visible and countable —
 * because the alternative is a portfolio that looks smaller the less of it anybody has looked at.
 *
 * Returns `{ outcome }` rather than throwing when the REGISTRY is the problem, so a portfolio run can
 * report `SCOPE_REGISTRY_INVALID` for the run instead of crashing. A malformed ROSTER throws, because
 * it is a structural error in the population itself and there is no partial population to report.
 */
export function readPopulation(registryPath, { target = null } = {}) {
  const loaded = loadRegistry(registryPath, { target });
  if (loaded.outcome === OUTCOME.REGISTRY_INVALID) return loaded;
  const { registry } = loaded;

  const packs = readRoster(registry);

  const repositories = [];
  for (const [repoId, entry] of Object.entries(registry.repositories)) {
    identity(repoId, `the repository identity "${repoId}"`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PopulationError(`the registry entry for "${repoId}" is not an object`, POPULATION.ROSTER_MALFORMED);
    }
    repositories.push({
      repoId,
      name: typeof entry.name === "string" ? entry.name : null,
      localPath: typeof entry.localPath === "string" ? entry.localPath : null,
      entry,
    });
  }
  repositories.sort((a, b) => (a.repoId < b.repoId ? -1 : a.repoId > b.repoId ? 1 : 0));

  const cells = [];
  for (const repo of repositories) {
    for (const pack of packs) {
      cells.push({ key: cellKey(repo.repoId, pack.contractId), repoId: repo.repoId, contractId: pack.contractId });
    }
  }

  return { outcome: null, registry, repositories, packs, cells };
}

/**
 * Resolve an invocation's pack spelling against the roster.
 *
 * The two refusals are kept apart deliberately. "You named a pack nobody registered" and "this
 * repository has no decision on file for that pack" have different owners and different remedies, and
 * FE-12 closed noting that they were indistinguishable from the outcome alone.
 */
export function resolvePack(packs, spelling) {
  const found = packs.find((p) => p.contractId === spelling);
  if (found) return found;
  const near = packs.find((p) => p.contractId.replace(/[-_]/g, "").toLowerCase() === String(spelling).replace(/[-_]/g, "").toLowerCase());
  throw new PopulationError(
    `no standards pack is registered under the identity "${spelling}"` +
    (near ? `. A registered pack declares "${near.contractId}", which differs only in spelling — and a cell keyed on ` +
      "a spelling nobody declared is a cell nobody reviews" : "") +
    ". A pack this registry never registered has no cell, and an unregistered cell cannot be governed",
    POPULATION.UNREGISTERED_PACK,
  );
}
