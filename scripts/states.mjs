/**
 * The enforcement state vocabulary, and the one invariant that governs it.
 *
 * Some of these are verdicts the standards system reached. Others are states about enforcement
 * itself — the repository never adopted, the identity did not verify, the gate is absent. Forcing
 * the second group into the standards system's exit codes would make "we could not establish
 * anything" indistinguishable from "the standards had no objection", which is the single failure
 * mode every MachineLearningStandards release from 1.0 to 1.4 was spent removing.
 *
 *     INV-E1 — StandardsEnforcer must never convert an unknown, missing, unverifiable, or failed
 *     enforcement condition into a successful compliance result.
 *
 * Enforced structurally: `PASSING` is an explicit, closed, enumerated set, `exitFor` derives from
 * it, and a test asserts that every state outside it exits non-zero. A state added later without a
 * decision about its exit code fails that test rather than defaulting to success. Every member of
 * `PASSING` is either a standards verdict or listed in `REQUIRES_RECORDED_DECISION`, which is what
 * stops the set growing by attrition.
 */

/** Every state the enforcer can ever report. Frozen surface: adding one is a MAJOR change. */
export const STATE = {
  // Verdicts the standards system reached, passed through unaltered.
  COMPLIANT: "COMPLIANT",
  COMPLIANT_WITH_EXCEPTIONS: "COMPLIANT_WITH_EXCEPTIONS",
  NON_COMPLIANT: "NON_COMPLIANT",
  NOT_EVALUATED: "NOT_EVALUATED",
  BLOCKED_BY_INVARIANT: "BLOCKED_BY_INVARIANT",

  // States about enforcement, which no standards system produces.
  // GATE_CONFIG_INVALID is distinct from GATE_MISSING on purpose: "nobody requires this" and
  // "something requires it in a way a pull request can satisfy for itself" need different fixes.
  NOT_ADOPTED: "NOT_ADOPTED",
  SCOPE_REVIEW_REQUIRED: "SCOPE_REVIEW_REQUIRED",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  SCOPE_REGISTRY_INVALID: "SCOPE_REGISTRY_INVALID",
  GATE_MISSING: "GATE_MISSING",
  GATE_CONFIG_INVALID: "GATE_CONFIG_INVALID",
  BYPASS_USED: "BYPASS_USED",
  STANDARDS_IDENTITY_MISMATCH: "STANDARDS_IDENTITY_MISMATCH",
  ENFORCEMENT_ERROR: "ENFORCEMENT_ERROR",
};

/** The states that are a standards verdict rather than an enforcement condition. */
export const VERDICT_STATES = new Set([
  STATE.COMPLIANT,
  STATE.COMPLIANT_WITH_EXCEPTIONS,
  STATE.NON_COMPLIANT,
  STATE.NOT_EVALUATED,
  STATE.BLOCKED_BY_INVARIANT,
]);

/**
 * The states a merge may proceed on.
 *
 * Written as a closed set rather than as a default, because a default is how an unlisted state
 * becomes a pass.
 *
 * M3 widened this from two members to three, which is the only widening in the enforcer's history
 * and is recorded rather than quietly made. `OUT_OF_SCOPE` is not a compliance result and never
 * becomes one: it says an authorised reviewer decided these standards do not govern this repository.
 * A governed population needs that to be a durable, mergeable state, because the alternative is a
 * portfolio scan that either blocks every excluded repository forever or starts reading detector
 * silence as proof a repository is not doing machine-learning work.
 *
 * The widening is bounded by `REQUIRES_RECORDED_DECISION` below. INV-E1 is untouched: an unknown,
 * missing or unverifiable condition still cannot reach this set, because an exclusion nobody
 * recorded is precisely an unknown and resolves to `SCOPE_REVIEW_REQUIRED`.
 */
export const PASSING = new Set([STATE.COMPLIANT, STATE.COMPLIANT_WITH_EXCEPTIONS, STATE.OUT_OF_SCOPE]);

/**
 * Passing states that are not a standards verdict, and what makes them legitimate.
 *
 * A member here may only be produced alongside a named authorised reviewer, a review date and a
 * reason. The enforcer asserts that at the point of production and a test asserts it of the payload,
 * so "merge may proceed" can never be reached by an absence — only by a decision someone owns.
 */
export const REQUIRES_RECORDED_DECISION = new Set([STATE.OUT_OF_SCOPE]);

/**
 * Exit codes.
 *
 * For any state that is a standards verdict the code is the standards system's own, unchanged —
 * `0` ok, `1` non-compliant, `2` no verdict reached, `3` blocked by an invariant. Passing them
 * through rather than re-deriving them is what "orchestrate, do not reinterpret" means at the
 * level a caller sees.
 *
 * `4` is the enforcer's own, and MachineLearningStandards never returns it. A caller reading only
 * an exit status can therefore distinguish "the standards said no" from "enforcement could not be
 * established", which are different problems with different owners.
 */
export const EXIT = { OK: 0, NON_COMPLIANT: 1, NO_VERDICT: 2, BLOCKED: 3, NOT_ENFORCEABLE: 4 };

export function exitFor(state) {
  if (PASSING.has(state)) return EXIT.OK;
  switch (state) {
    case STATE.NON_COMPLIANT:
      return EXIT.NON_COMPLIANT;
    case STATE.NOT_EVALUATED:
    case STATE.ENFORCEMENT_ERROR:
      return EXIT.NO_VERDICT;
    case STATE.BLOCKED_BY_INVARIANT:
      return EXIT.BLOCKED;
    case STATE.NOT_ADOPTED:
    case STATE.SCOPE_REVIEW_REQUIRED:
    case STATE.SCOPE_REGISTRY_INVALID:
    case STATE.GATE_MISSING:
    case STATE.GATE_CONFIG_INVALID:
    case STATE.BYPASS_USED:
    case STATE.STANDARDS_IDENTITY_MISMATCH:
      return EXIT.NOT_ENFORCEABLE;
    default:
      // An unrecognised state is itself an unknown, and INV-E1 says an unknown is not a pass.
      return EXIT.NO_VERDICT;
  }
}

/**
 * States the implementation can actually reach.
 *
 * The vocabulary is the contract and is complete; the implementation is not. Recording the gap as
 * data, with a test asserting it, is the difference between a declared limitation and a comment
 * nobody checks.
 *
 * `BYPASS_USED` needs a source for bypass events; GitHub exposes them through audit-log endpoints
 * this enforcer cannot assume are available, so the semantic is settled in ADR 0003 — a bypass is
 * an event and never a verdict — and the state is not produced until the data can be read.
 *
 * It is not faked. M3 made the three scope states reachable, leaving it as the only gap.
 */
export const REACHABLE = new Set([
  STATE.COMPLIANT,
  STATE.COMPLIANT_WITH_EXCEPTIONS,
  STATE.NON_COMPLIANT,
  STATE.NOT_EVALUATED,
  STATE.BLOCKED_BY_INVARIANT,
  STATE.NOT_ADOPTED,
  STATE.SCOPE_REVIEW_REQUIRED,
  STATE.OUT_OF_SCOPE,
  STATE.SCOPE_REGISTRY_INVALID,
  STATE.GATE_MISSING,
  STATE.GATE_CONFIG_INVALID,
  STATE.STANDARDS_IDENTITY_MISMATCH,
  STATE.ENFORCEMENT_ERROR,
]);
