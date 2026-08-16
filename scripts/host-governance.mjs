/**
 * Consume an external host-governance evidence record, and translate only what it measured.
 *
 * WHAT THIS IS NOT. It is not a second gate assessor, and it does not translate the producer's
 * aggregate verdict. A producer's aggregate summarises the producer's contract; a consumer may not
 * reinterpret it as satisfying stronger predicates in its own. The first real producer answers
 * "is a check of this name required on this branch" and reports GOVERNED when it is. `assessGate`
 * requires more than that — an app binding the pull request cannot act as, or a rule pinning which
 * workflow runs — and M4 established live that a name-only requirement is satisfied by the pull
 * request's own green tick. Consuming GOVERNED as a root would accept exactly that configuration.
 *
 * So this module performs EVIDENCE translation, not STATE translation:
 *
 *     record  →  the propositions it actually measured  →  assessGate  →  verdict
 *
 * Propositions the producer did not measure are named in `unmeasured` and reach `assessGate` as
 * unknowns, which it refuses on. They are never rendered as failures: nothing established that an
 * unmeasured property would fail, and reporting one as a configuration defect would invent a finding.
 *
 * WHAT THIS RECORD CAN ESTABLISH, ON ITS OWN: nothing about any named check. The producer decides
 * `main.standards_check_required` by matching a hardcoded `"standards"` context, and serializes that
 * name NOWHERE in the record — it survives only inside the control's human-readable `title`. Reading
 * it back out would mean parsing prose into an enforcement predicate, which is the failure this
 * repository refuses everywhere else. So the identity of the check each observation is ABOUT is
 * itself unmeasured, and is listed as such.
 *
 * That collapses the one case this record used to settle. An ABSENT observation cannot become
 * `GATE_MISSING`, because `GATE_MISSING` asserts a known absence OF A PARTICULAR CHECK, and this
 * record does not say which check it looked for. A consumer expecting `"my-standards-gate"` would
 * otherwise be told its gate is known-missing on the strength of an observation about a different
 * name. That is the same evidence upgrade as promoting the aggregate, arriving by a quieter route.
 *
 * COMPOSITION IS NOT IMPLEMENTED, AND IS NOT CLAIMED. In principle a record supplying one
 * proposition and a live platform supplying others could together reach `rooted`. In practice this
 * producer supplies no name-bound proposition at all, so there is nothing here to compose with.
 * Building a composition mechanism now would mean building it for a contributor that contributes
 * nothing. If a producer serializes the context name, that is the point to revisit this.
 *
 * WHAT IS DELIBERATELY NOT READ:
 *
 *   contractDigest   Derivable from the required-control ids, but deriving it would mean
 *                    reimplementing the producer's hash here — a shared contract that does not
 *                    exist, silently wrong the day the producer changes its algorithm. The required
 *                    id SET is compared directly instead: it is what the digest identifies, needs no
 *                    shared algorithm, and names the difference when it differs. The first producer
 *                    does not serialize the digest into these records at all.
 *
 *   source           Preserved as `collectionSource`, never as `source`. The word already means two
 *                    other things: a check's `source` in this enforcer is its rooting location
 *                    (`repository` / `organization`) and drives `requireOrganisationRoot`, and the
 *                    producer's own control definitions use `source` for which surface to consult.
 *                    The emitted value is a third thing — which surfaces were consulted. It is
 *                    provenance and never assurance: "branch-protection + rulesets" is not stronger
 *                    evidence than "rulesets", it is a different place to have looked.
 *
 *   bypass events    `bypass.policy` is configuration. `BYPASS_USED` means an event occurred and is
 *                    deliberately unreachable until there is a source for events (ADR 0003). A
 *                    configured bypass actor is preserved as evidence and never becomes an event.
 */

/** Control results a record may report. An unrecognised value is a contract mismatch, not a default. */
export const CONTROL_RESULT = Object.freeze(["SATISFIED", "ABSENT", "UNREADABLE"]);

/**
 * Root properties `assessGate` requires that a governance record of this shape cannot supply.
 *
 * Stated as data rather than discovered per record, because the gap is a property of the producer's
 * contract and not of any one observation. A record that began supplying them would be a different
 * contract, and should say so.
 */
export const NOT_MEASURED_BY_GOVERNANCE_RECORD = Object.freeze([
  "check-identity",
  "app-binding",
  "workflow-pinning",
  "organisation-rooting",
]);

/** The control whose result speaks to the standards check being required at all. */
export const STANDARDS_CHECK_CONTROL = "main.standards_check_required";

export class GovernanceContractError extends Error {
  constructor(message, violations = []) {
    super(message);
    this.name = "GovernanceContractError";
    this.violations = violations;
  }
}

/**
 * Validate a record against the shape this enforcer understands.
 *
 * Fails closed and completely. A partially understood record is the dangerous case: fields that
 * affect semantics would be silently dropped and the remainder would read as a smaller, cleaner
 * observation than the one that was actually made.
 */
export function validateGovernanceRecord(record) {
  const v = [];
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return ["the governance record is not a JSON object"];
  }
  if (!Array.isArray(record.controls)) {
    v.push("$.controls must be an array of control observations");
  } else {
    if (record.controls.length === 0) {
      // Anti-vacuity. An empty control set would satisfy every "no required control failed" test ever
      // written against it, which is how a record that measured nothing passes for one that measured
      // everything.
      v.push("$.controls is empty, so this record establishes nothing about any control");
    }
    record.controls.forEach((c, i) => {
      if (typeof c?.id !== "string" || c.id.length === 0) v.push(`$.controls[${i}].id must be a non-empty string`);
      if (typeof c?.required !== "boolean") v.push(`$.controls[${i}].required must be a boolean`);
      if (!CONTROL_RESULT.includes(c?.result)) {
        v.push(
          `$.controls[${i}].result is ${JSON.stringify(c?.result)}, which this enforcer does not implement. ` +
            `Known: ${CONTROL_RESULT.join(", ")}. An unrecognised result is refused rather than ignored, because ` +
            `ignoring it would drop a proposition that may be the one that matters.`,
        );
      }
    });
    if (record.controls.some((c) => c?.required === true) === false) {
      v.push("$.controls names no required control, so no observation here is load-bearing");
    }
  }
  return v;
}

/** `validateGovernanceRecord`, as an assertion. */
export function assertGovernanceRecord(record, source = "governance record") {
  const violations = validateGovernanceRecord(record);
  if (violations.length > 0) {
    throw new GovernanceContractError(`${source} does not conform:\n  - ${violations.join("\n  - ")}`, violations);
  }
  return record;
}

/** The required-control identity set — what `contractDigest` identifies, compared without it. */
export function requiredControlIds(record) {
  return (record?.controls ?? [])
    .filter((c) => c?.required === true)
    .map((c) => c.id)
    .sort();
}

/**
 * Do two records answer the same required-control contract?
 *
 * Compared as sets rather than through a digest, so a mismatch can say WHICH controls differ. A
 * digest can only say that something did.
 */
export function sameRequiredContract(a, b) {
  const [x, y] = [requiredControlIds(a), requiredControlIds(b)];
  const missing = x.filter((id) => !y.includes(id));
  const added = y.filter((id) => !x.includes(id));
  return { same: missing.length === 0 && added.length === 0, missing, added };
}

/**
 * Translate a record into a platform answer `assessGate` can evaluate.
 *
 * Takes no expected check name, deliberately. An earlier version accepted one and used it as the
 * context each observation was about — which meant the consumer supplied the identity, the record
 * appeared to confirm it, and a `"standards"` observation could answer a question asked about
 * `"my-standards-gate"`. The parameter was the whole mechanism of that fabrication, so it is gone
 * rather than guarded: a name this function never receives is a name it cannot attach.
 */
export function platformFromGovernanceRecord(record) {
  assertGovernanceRecord(record);

  const byId = new Map(record.controls.map((c) => [c.id, c]));
  const standards = byId.get(STANDARDS_CHECK_CONTROL);

  const unreadable = record.controls.filter((c) => c.required && c.result === "UNREADABLE").map((c) => c.id);

  return {
    name: "governance-record",
    translation: {
      requiredControls: requiredControlIds(record),
      unreadableRequired: unreadable,
      standardsCheckControl: standards ? { id: standards.id, result: standards.result } : null,
      unmeasured: [...NOT_MEASURED_BY_GOVERNANCE_RECORD],
      // Provenance, never assurance. Preserved under a name that cannot be confused with a check's
      // rooting `source`, so a collection label can never be read as an enforcement property.
      collectionSource: Object.fromEntries(record.controls.map((c) => [c.id, c.source ?? null])),
      evidenceRead: Object.fromEntries(record.controls.map((c) => [c.id, c.evidenceRead ?? null])),
      producerAggregate: record.state ?? null,
    },
    requiredChecks() {
      // A required control that could not be read is an unknown about the whole answer: the control
      // that was unreadable may be the one that would have established absence.
      if (unreadable.length > 0) {
        return { ok: false, why: `the governance record could not read: ${unreadable.join(", ")}` };
      }
      if (!standards) {
        return { ok: false, why: `the governance record has no ${STANDARDS_CHECK_CONTROL} observation` };
      }
      // Whatever the result says, it says it about a check this record does not name. SATISFIED
      // cannot become a requirement and ABSENT cannot become a known absence, because neither can be
      // attached to the context the caller is asking about. This is not the record being useless: it
      // is the record being read for exactly what it measured, which is a control's disposition
      // rather than a named check's presence.
      return {
        ok: false,
        why:
          `the governance record observed ${STANDARDS_CHECK_CONTROL} as ${standards.result}, but does not serialize ` +
          `which check context that observation is about, so it establishes nothing about any particular check. ` +
          `The name survives only in the control's human-readable title, and a name parsed out of prose is not a ` +
          `measurement.`,
      };
    },
  };
}
