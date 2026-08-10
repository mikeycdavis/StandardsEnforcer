/**
 * The enforcement state vocabulary, and the one invariant that governs it.
 *
 * Every state here is about ENFORCEMENT — whether an authority could be identified, reached, trusted
 * and heard. None of them is a standards verdict, and that is the whole point of the 0.4.0 rewrite.
 *
 *     INV-E1 — StandardsEnforcer must never convert an unknown, missing, unverifiable, or failed
 *     enforcement condition into a successful compliance result.
 *
 * WHAT CHANGED IN 0.4.0, AND WHY IT HAD TO. Until 0.3.0 this file enumerated five pack-native
 * statuses — COMPLIANT, COMPLIANT_WITH_EXCEPTIONS, NON_COMPLIANT, NOT_EVALUATED,
 * BLOCKED_BY_INVARIANT — as enforcer states, and `exitFor` mapped them to exit codes 0/1/2/3.
 *
 * ADR 0001 does not merely say the enforcer should obtain those five strings from somewhere else. It
 * says the enforcer must not know what a pack's verdict MEANS. Mapping `NOT_EVALUATED` to 2 and
 * `BLOCKED_BY_INVARIANT` to 3 kept exactly that meaning, in encoded form, in this file. Moving the
 * strings elsewhere would have been cosmetic; the semantics had to go.
 *
 * So the process projection collapses to three codes and stops claiming to know anything:
 *
 *     0   the authority spoke and established passing
 *     1   the authority spoke and did not establish passing
 *     4   the authority could not be established, heard, or trusted
 *
 * `1` deliberately reads as "an authoritative evaluation completed and did not establish passing",
 * NOT as "non-compliant". A pack's `NOT_EVALUATED` lands in that bucket without this enforcer
 * claiming it means failure — it means only that the pack did not put it in its passing set.
 *
 * WHAT IS LOST, SAID PLAINLY. A caller reading only an exit code can no longer distinguish "the
 * standards said no" from "the standards reached no conclusion". That distinction was never the
 * enforcer's to draw; it survives intact, verbatim, in the payload under `authority.status`. Only the
 * lossy projection changed.
 *
 * `exitCodes` was NOT added to the adapter contract to preserve the old behaviour. That would create
 * a second semantic projection owned by every pack, and Phase 0 already established that native exit
 * codes are not a common abstraction — Betting exits 2 on NOT_EVALUATED, MachineLearning 3 on
 * blocked, Health 4, Financial folds blocked into 1. `passing` is necessary because the enforcer must
 * answer its own binary gate question. Reproducing native process semantics is not.
 */

/**
 * Every state the enforcer can report. Frozen surface: changing it is a breaking change.
 *
 * `EVALUATED` is the only state that involves an authority having spoken, and it says nothing about
 * what was said. Whether a merge may proceed is carried beside it in `passing`, decided by the
 * pack's own declared set — never by this file recognising a word.
 */
export const STATE = {
  // An authority was identified, invoked, and returned a status it had declared it could return.
  EVALUATED: "EVALUATED",

  // States about enforcement, which no standards authority produces.
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

/**
 * Enforcement states on which a merge may proceed WITHOUT an authority having spoken.
 *
 * Written as a closed set rather than as a default, because a default is how an unlisted state
 * becomes a pass. `EVALUATED` is deliberately absent: it passes only when the pack's own contract
 * says the status it returned is passing, which is a fact about that release and not about a state
 * name this file could enumerate.
 *
 * `OUT_OF_SCOPE` is not a compliance result and never becomes one: it says an authorised reviewer
 * decided these standards do not govern this repository. A governed population needs that to be a
 * durable, mergeable state, because the alternative is a portfolio scan that either blocks every
 * excluded repository forever or starts reading detector silence as proof of anything.
 *
 * The widening is bounded by `REQUIRES_RECORDED_DECISION`. INV-E1 is untouched: an unknown, missing
 * or unverifiable condition still cannot reach this set, because an exclusion nobody recorded is
 * precisely an unknown and resolves to `SCOPE_REVIEW_REQUIRED`.
 */
export const PASSING = new Set([STATE.OUT_OF_SCOPE]);

/**
 * Passing states that are not an authority's answer, and what makes them legitimate.
 *
 * A member here may only be produced alongside a named authorised reviewer, a review date and a
 * reason. The enforcer asserts that at the point of production and a test asserts it of the payload,
 * so "merge may proceed" can never be reached by an absence — only by a decision someone owns.
 */
export const REQUIRES_RECORDED_DECISION = new Set([STATE.OUT_OF_SCOPE]);

/**
 * Exit codes. Three, and none of them interprets a standard.
 *
 * `4` is reserved exclusively for the enforcer's own inability to establish enforcement: an identity
 * that does not verify, a missing or non-conforming contract where one is required, an invocation
 * that failed, output that could not be parsed, a status the pack never declared. Every one of those
 * is "the authority could not be established, heard, or trusted", which is a different problem with
 * a different owner from "the authority answered and the answer was not a pass".
 */
export const EXIT = { OK: 0, NOT_PASSING: 1, NOT_ENFORCEABLE: 4 };

/**
 * Project a result onto a process exit code.
 *
 * Takes `passing` rather than deriving it, because deriving it would mean recognising a status — the
 * thing this module no longer does. A caller that forgets to pass it gets `false`, which fails
 * closed, which is the direction INV-E1 requires.
 */
export function exitFor(state, passing = false) {
  // Two routes to zero, and they are not interchangeable. `PASSING` is the closed enumeration of
  // enforcement states that may merge without an authority having spoken — today only OUT_OF_SCOPE,
  // and only ever by a recorded human decision. `passing` is the authority's own answer, read from
  // its declared set. Keeping both means a state cannot pass by omission and a verdict cannot pass by
  // being named.
  if (PASSING.has(state) || passing) return EXIT.OK;
  if (state === STATE.EVALUATED) return EXIT.NOT_PASSING;
  return EXIT.NOT_ENFORCEABLE;
}

/**
 * States the implementation can actually reach.
 *
 * The vocabulary is the contract and is complete; the implementation is not. Recording the gap as
 * data, with a test asserting it, is the difference between a declared limitation and a comment
 * nobody checks.
 *
 * `BYPASS_USED` needs a source for bypass events; GitHub exposes them through audit-log endpoints
 * this enforcer cannot assume are available, so the semantic is settled in ADR 0003 — a bypass is an
 * event and never a verdict — and the state is not produced until the data can be read. It is not
 * faked, and it remains the only gap.
 */
export const REACHABLE = new Set([
  STATE.EVALUATED,
  STATE.NOT_ADOPTED,
  STATE.SCOPE_REVIEW_REQUIRED,
  STATE.OUT_OF_SCOPE,
  STATE.SCOPE_REGISTRY_INVALID,
  STATE.GATE_MISSING,
  STATE.GATE_CONFIG_INVALID,
  STATE.STANDARDS_IDENTITY_MISMATCH,
  STATE.ENFORCEMENT_ERROR,
]);
