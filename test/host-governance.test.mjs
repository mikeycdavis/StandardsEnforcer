/**
 * Consuming a real external governance evidence producer.
 *
 * The corpus is the actual before/after pair recorded by UIUXDesignStandards against live GitHub:
 * the same collector, unmodified, run either side of an authorised host-configuration change. Six
 * required controls ABSENT and aggregate UNGOVERNED before; six SATISFIED and GOVERNED after.
 * Synthetic records appear below only where a case needs a shape the real corpus does not contain.
 *
 * THE LOAD-BEARING PROPERTY IS THAT `GOVERNED` DOES NOT MEAN `rooted`. The producer matches the
 * required check by context name and reads neither app binding nor required-workflow pinning — the
 * properties M4 established live are what make a gate a gate. A consumer that promoted its aggregate
 * would accept the configuration ST-06 demonstrated a pull request can satisfy for itself.
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
  assessGate(platformFromGovernanceRecord(record, { expectedCheck: CHECK }), gateArgs(over));

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
  assert.equal(g.verdict, "missing", "the producer read the surface and the check is not required there");
  const routed = gateStateFor(g.verdict);
  assert.equal(routed.state, STATE.GATE_MISSING);
  assert.notEqual(exitFor(routed.state, false), EXIT.OK);
});

test("corpus · the after observation still does not root the gate", () => {
  // The trap. Aggregate GOVERNED, standards check SATISFIED, and it is STILL not a root — because
  // app binding and workflow pinning were never measured. Not GATE_CONFIG_INVALID either: nothing
  // established that those properties fail.
  const g = assess(AFTER);
  assert.equal(g.verdict, "unreadable");
  assert.notEqual(g.verdict, "rooted", "a name-only requirement is satisfiable by the pull request itself");
  assert.notEqual(g.verdict, "invalid", "nothing established that the unmeasured properties fail");

  const routed = gateStateFor(g.verdict);
  assert.equal(routed.state, STATE.ENFORCEMENT_ERROR);
  assert.equal(exitFor(routed.state, false), EXIT.NOT_ENFORCEABLE);
  for (const p of NOT_MEASURED_BY_GOVERNANCE_RECORD) assert.match(g.why, new RegExp(p));
});

test("corpus · the before/after difference is driven by control results alone", () => {
  // Neither producer name, artifact path, ruleset id, ruleset name, nor a hard-coded count. The only
  // thing changed here is the standards-check control's result.
  const forged = structuredClone(BEFORE);
  for (const c of forged.controls) if (c.id === STANDARDS_CHECK_CONTROL) c.result = "SATISFIED";
  assert.notEqual(assess(forged).verdict, assess(BEFORE).verdict);

  // And the aggregate word is inert: flipping it alone changes nothing.
  const relabelled = structuredClone(BEFORE);
  relabelled.state = "GOVERNED";
  assert.equal(assess(relabelled).verdict, assess(BEFORE).verdict, "the producer's aggregate must not drive the verdict");
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
// Composition — each source contributing what it measured
// ===========================================================================

test("compose · record name-presence plus live binding and pinning can root", () => {
  const sha = "b".repeat(40);
  const g = assessGate(
    livePlatform({ workflows: [{ path: ".github/workflows/standards.yml", sha }] }),
    gateArgs(),
  );
  assert.equal(g.verdict, "rooted", g.why ?? "");
  assert.equal(gateStateFor(g.verdict).state, null);
});

test("compose · a contradiction is decided by the stronger measurement, not averaged", () => {
  // The record says GOVERNED. Live evidence says the requirement is bound to nothing, so a pull
  // request satisfies it with its own workflow. GOVERNED must not rescue that.
  assert.equal(AFTER.state, "GOVERNED");
  const g = assessGate(livePlatform({ appId: null }), gateArgs());
  assert.equal(g.verdict, "invalid");
  assert.equal(gateStateFor(g.verdict).state, STATE.GATE_CONFIG_INVALID);
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

  const t = platformFromGovernanceRecord(b, { expectedCheck: CHECK }).translation;
  assert.equal(t.collectionSource[STANDARDS_CHECK_CONTROL], "branch-protection + rulesets");
  assert.equal("source" in t, false, "must not shadow a check's rooting source");
});

test("provenance · nothing infers an assurance tier from the corpus", () => {
  const t = platformFromGovernanceRecord(AFTER, { expectedCheck: CHECK }).translation;
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
