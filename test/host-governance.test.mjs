/**
 * Consuming a real external governance evidence producer.
 *
 * The corpus is the actual before/after pair recorded by UIUXDesignStandards against live GitHub:
 * the same collector, unmodified, run either side of an authorised host-configuration change. Six
 * required controls ABSENT and aggregate UNGOVERNED before; six SATISFIED and GOVERNED after.
 * Synthetic records appear below only where a case needs a shape the real corpus does not contain.
 *
 * THE LOAD-BEARING PROPERTY IS THAT `GOVERNED` DOES NOT MEAN `rooted`. The producer matches the
 * required check by a hardcoded context name and reads neither app binding nor required-workflow
 * pinning — the properties M4 established live are what make a gate a gate. A consumer that promoted
 * its aggregate would accept the configuration ST-06 demonstrated a pull request can satisfy for
 * itself.
 *
 * AND THE NAME IT MATCHED IS NOT IN THE RECORD. It appears only inside a control's human-readable
 * `title`, so the identity of the check each observation is about is unmeasured too. That is why no
 * observation here — SATISFIED or ABSENT — produces a verdict about a named check, and why these
 * tests assert the verdict is INSENSITIVE to the name the caller expects. A name-sensitive verdict
 * would mean the caller's assertion had become the evidence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assessGate } from "../scripts/gate.mjs";
import { gateStateFor } from "../scripts/enforce.mjs";
import { STATE, exitFor, EXIT } from "../scripts/states.mjs";
import {
  platformFromGovernanceRecord,
  validateGovernanceRecord,
  assertGovernanceRecord,
  GovernanceContractError,
  sameRequiredContract,
  requiredControlIds,
  NOT_MEASURED_BY_GOVERNANCE_RECORD,
  STANDARDS_CHECK_CONTROL,
} from "../scripts/host-governance.mjs";

const CHECK = "standards";
const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "governance");

const load = (name) => JSON.parse(fs.readFileSync(path.join(CORPUS, name), "utf8"));
const BEFORE = load("uiux-2026-08-16-before.json");
const AFTER = load("uiux-2026-08-16-after.json");

const gateArgs = (over = {}) => ({ repo: "mikeycdavis/UIUXDesignStandards", branch: "main", expectedCheck: CHECK, ...over });

const assess = (record, over = {}) =>
  assessGate(platformFromGovernanceRecord(record), gateArgs(over));

/** A live platform contributing exactly the propositions the record cannot. */
const livePlatform = ({ appId = 77001, source = "organization", workflows = [] } = {}) => ({
  name: "live",
  requiredChecks: () => ({
    ok: true,
    checks: [{ context: CHECK, appId, source, enforcement: "active" }],
    workflows,
  }),
});

// ===========================================================================
// The real corpus
// ===========================================================================

test("corpus · both fixtures are present and are not the same observation", () => {
  // Anti-vacuity. Every discrimination test below is meaningless if the two files are equal, and a
  // copy-paste that made them equal would otherwise leave a suite that passes while proving nothing.
  assert.equal(BEFORE.state, "UNGOVERNED");
  assert.equal(AFTER.state, "GOVERNED");
  assert.notDeepEqual(BEFORE.controls, AFTER.controls);
  assert.ok(requiredControlIds(BEFORE).length >= 6, "a record with no required controls establishes nothing");
});

test("corpus · the before observation does not pass", () => {
  const g = assess(BEFORE);
  assert.notEqual(gateStateFor(g.verdict).state, null, "an ABSENT observation is never a root");
  assert.notEqual(exitFor(gateStateFor(g.verdict).state, false), EXIT.OK);

  // And specifically NOT a known absence. `GATE_MISSING` asserts that a named check is not required;
  // this record does not name the check it looked for, so it cannot support that claim.
  assert.equal(g.verdict, "unreadable");
  assert.notEqual(gateStateFor(g.verdict).state, STATE.GATE_MISSING);
});

test("corpus · the after observation still does not root the gate", () => {
  // The trap. Aggregate GOVERNED, standards check SATISFIED, and it is STILL not a root — because
  // check identity, app binding and workflow pinning were never measured. Not GATE_CONFIG_INVALID
  // either: nothing established that those properties fail.
  const g = assess(AFTER);
  assert.equal(g.verdict, "unreadable");
  assert.notEqual(g.verdict, "rooted", "a name-only requirement is satisfiable by the pull request itself");
  assert.notEqual(g.verdict, "invalid", "nothing established that the unmeasured properties fail");

  const routed = gateStateFor(g.verdict);
  assert.equal(routed.state, STATE.ENFORCEMENT_ERROR);
  assert.equal(exitFor(routed.state, false), EXIT.NOT_ENFORCEABLE);
});

/**
 * THE IDENTITY FALSIFIER.
 *
 * The producer matches a hardcoded `"standards"` context and serializes that name nowhere — it
 * survives only inside the control's human-readable `title`. So an observation about it answers no
 * question asked about any other name. Ask about `"my-standards-gate"` and an ABSENT observation
 * must NOT come back as "your gate is missing": that would be a known-absence claim manufactured
 * from an observation about a different check.
 *
 * This is the same evidence upgrade as promoting the aggregate, arriving by a quieter route, and it
 * is what an `expectedCheck` parameter on the translator made possible.
 */
test("identity · an observation about an unnamed check answers nothing about a named one", () => {
  for (const record of [BEFORE, AFTER]) {
    for (const name of ["my-standards-gate", "standards", "ci/standards"]) {
      const g = assess(record, { expectedCheck: name });
      assert.equal(g.verdict, "unreadable", `${name} on ${record.state}`);
      assert.notEqual(gateStateFor(g.verdict).state, STATE.GATE_MISSING);
      assert.notEqual(gateStateFor(g.verdict).state, null);
    }
  }
});

test("identity · check identity is declared unmeasured, not quietly assumed", () => {
  assert.ok(NOT_MEASURED_BY_GOVERNANCE_RECORD.includes("check-identity"),
    "the gap must be stated as data, so a producer that closes it has something to contradict");
  const t = platformFromGovernanceRecord(AFTER).translation;
  assert.ok(t.unmeasured.includes("check-identity"));
  assert.equal("assertedCheckName" in t, false,
    "an asserted name is not a measured one, and recording it invited the assertion to be trusted");
});

test("identity · the verdict does not vary with the name the caller happens to expect", () => {
  // A different defect from the one above, and a weaker guard: this catches a translator that
  // MATCHES the caller's name against the record (making the caller's assertion the evidence), not
  // one that silently assumes it. Measured — restoring the assumption leaves this test green while
  // the test above goes red. Both are kept because they fail on different mistakes.
  const verdicts = new Set(
    ["a", "b", "standards"].map((name) => assess(BEFORE, { expectedCheck: name }).verdict),
  );
  assert.equal(verdicts.size, 1, "a name-sensitive verdict would mean the name was being used as evidence");
});

test("corpus · the record's evidence discriminates even where its verdict cannot", () => {
  // The two observations are genuinely different and the translation preserves that difference —
  // driven by the control result alone, not by producer name, artifact path, ruleset id, or count.
  // The verdict is identical for both because neither can be attached to a named check, which is a
  // limit of the producer's contract rather than a failure to read the record.
  const before = platformFromGovernanceRecord(BEFORE).translation;
  const after = platformFromGovernanceRecord(AFTER).translation;
  assert.equal(before.standardsCheckControl.result, "ABSENT");
  assert.equal(after.standardsCheckControl.result, "SATISFIED");
  assert.notDeepEqual(before.standardsCheckControl, after.standardsCheckControl);

  // And the aggregate word is inert: flipping it alone changes nothing anywhere.
  const relabelled = structuredClone(BEFORE);
  relabelled.state = "GOVERNED";
  assert.equal(assess(relabelled).verdict, assess(BEFORE).verdict, "the producer's aggregate must not drive the verdict");
  assert.deepEqual(
    platformFromGovernanceRecord(relabelled).translation.standardsCheckControl,
    before.standardsCheckControl,
  );
});

test("corpus · both observations answer the same required-control contract", () => {
  // Compared as identity sets, never by rederiving the producer's digest.
  const r = sameRequiredContract(BEFORE, AFTER);
  assert.equal(r.same, true, `differs: missing=${r.missing} added=${r.added}`);
  assert.deepEqual(requiredControlIds(BEFORE), requiredControlIds(AFTER));
});

test("corpus · a record that drops a required control is refused, not silently accepted", () => {
  const short = structuredClone(AFTER);
  short.controls = short.controls.filter((c) => c.id !== "bypass.policy");
  const r = sameRequiredContract(AFTER, short);
  assert.equal(r.same, false);
  assert.deepEqual(r.missing, ["bypass.policy"]);
});

// ===========================================================================
// What the record cannot contribute
//
// There is deliberately no composition test here, because there is no composition mechanism and the
// PR no longer claims one. An earlier pair of tests called themselves composition while assessing
// only `livePlatform(...)` — the record was named in the title, asserted about, and then never
// passed to anything. They proved the live platform still works, which was already true elsewhere,
// and would have stayed green if this module were deleted outright.
//
// Composition would be legitimate if each source contributed a proposition it measured. This
// producer contributes no name-bound proposition at all, so the honest statement is the one below:
// the record cannot root, alone or otherwise, and the live path is what roots.
// ===========================================================================

test("contribution · no record in the corpus can produce a root, under any expected name", () => {
  for (const record of [BEFORE, AFTER]) {
    for (const name of [CHECK, "anything-else"]) {
      assert.notEqual(assess(record, { expectedCheck: name }).verdict, "rooted");
    }
  }
});

test("contribution · deleting the record from the equation changes no live verdict", () => {
  // The falsifier for the claim just removed. A live platform supplying binding and pinning roots,
  // and it does so without the record — which is exactly why the old "composition" tests could not
  // have been detecting composition.
  const sha = "b".repeat(40);
  const live = livePlatform({ workflows: [{ path: ".github/workflows/standards.yml", sha }] });
  assert.equal(assessGate(live, gateArgs()).verdict, "rooted");

  // And a live contradiction is decided on live evidence: a requirement bound to nothing is invalid
  // whatever a producer's aggregate says about the same repository.
  assert.equal(AFTER.state, "GOVERNED");
  assert.equal(assessGate(livePlatform({ appId: null }), gateArgs()).verdict, "invalid");
  assert.equal(gateStateFor("invalid").state, STATE.GATE_CONFIG_INVALID);
});

// ===========================================================================
// Unreadability
// ===========================================================================

test("unreadable · one required control unreadable, all others satisfied, does not pass", () => {
  const r = structuredClone(AFTER);
  r.controls.find((c) => c.id === "main.force_push_prohibited").result = "UNREADABLE";
  const g = assess(r);
  assert.equal(g.verdict, "unreadable");
  assert.equal(gateStateFor(g.verdict).state, STATE.ENFORCEMENT_ERROR);
});

test("unreadable · absent plus unreadable is uncertainty, not known absence", () => {
  // The producer's deliberate precedence: UNGOVERNED claims the complete current state is known, and
  // an unreadable control means it is not. Preserved rather than simplified — the unreadable control
  // may be the one that would have established the absence.
  const r = structuredClone(BEFORE);
  r.controls.find((c) => c.id === "tags.v_star_immutable").result = "UNREADABLE";
  const g = assess(r);
  assert.equal(g.verdict, "unreadable", "must not report GATE_MISSING, which claims a known absence");
  assert.equal(gateStateFor(g.verdict).state, STATE.ENFORCEMENT_ERROR);
});

// ===========================================================================
// Provenance is never assurance
// ===========================================================================

test("provenance · collection source is preserved but changes no verdict", () => {
  const a = structuredClone(AFTER);
  const b = structuredClone(AFTER);
  for (const c of a.controls) c.source = "rulesets";
  for (const c of b.controls) c.source = "branch-protection + rulesets";
  assert.equal(assess(a).verdict, assess(b).verdict, "two sources is not stronger than one");

  const t = platformFromGovernanceRecord(b).translation;
  assert.equal(t.collectionSource[STANDARDS_CHECK_CONTROL], "branch-protection + rulesets");
  assert.equal("source" in t, false, "must not shadow a check's rooting source");
});

test("provenance · nothing infers an assurance tier from the corpus", () => {
  const t = platformFromGovernanceRecord(AFTER).translation;
  const serialized = JSON.stringify(t);
  for (const invented of ["evidenceStrength", "behaviorallyVerified", "confidence", "corroborated", "observed-enforcement", "host-configuration"]) {
    assert.ok(!serialized.includes(invented), `${invented} was synthesised from evidence that never contained it`);
  }
});

// ===========================================================================
// Bypass
// ===========================================================================

test("bypass · a configured bypass policy never becomes BYPASS_USED", () => {
  for (const record of [BEFORE, AFTER]) {
    const g = assess(record);
    assert.notEqual(gateStateFor(g.verdict).state, STATE.BYPASS_USED);
  }
  // BYPASS_USED means an event occurred. The producer emits configuration and no event feed, so the
  // state stays unreachable — as states.mjs declares and a test there asserts.
  assert.equal(BEFORE.controls.find((c) => c.id === "bypass.policy").result, "ABSENT");
  assert.equal(AFTER.controls.find((c) => c.id === "bypass.policy").result, "SATISFIED");
});

// ===========================================================================
// Contract mismatch fails closed
// ===========================================================================

test("contract · an unrecognised control result is refused rather than ignored", () => {
  const r = structuredClone(AFTER);
  r.controls[0].result = "PROBABLY_FINE";
  const v = validateGovernanceRecord(r);
  assert.ok(v.some((m) => /PROBABLY_FINE/.test(m)));
  assert.throws(() => assertGovernanceRecord(r), (e) => e instanceof GovernanceContractError);
});

test("contract · an empty or required-less control set is refused", () => {
  assert.ok(validateGovernanceRecord({ controls: [] }).some((m) => /establishes nothing/.test(m)));
  const none = { controls: [{ id: "x", required: false, result: "SATISFIED" }] };
  assert.ok(validateGovernanceRecord(none).some((m) => /load-bearing/.test(m)));
});

test("contract · a malformed record is refused, not partially read", () => {
  for (const bad of [null, [], "governed", 42, {}]) {
    assert.ok(validateGovernanceRecord(bad).length > 0, `${JSON.stringify(bad)} was accepted`);
  }
});

// ===========================================================================
// Frozen state surface
// ===========================================================================

test("frozen · every state this path can produce is already in states.mjs", () => {
  const produced = new Set();
  for (const record of [BEFORE, AFTER]) produced.add(gateStateFor(assess(record).verdict).state);
  for (const verdict of ["rooted", "missing", "invalid", "unreadable", "something-new"]) {
    produced.add(gateStateFor(verdict).state);
  }
  produced.delete(null); // "rooted" continues rather than producing a state
  const known = new Set(Object.values(STATE));
  for (const s of produced) assert.ok(known.has(s), `${s} is not in the frozen vocabulary`);
  assert.ok(produced.size > 0);
});
