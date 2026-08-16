/**
 * M2: can the governed project avoid the verdict?
 *
 * Tested almost entirely through negative and adversarial cases, because the positive case proves
 * very little. A gate that works when everything is configured correctly is not the claim; the
 * claim is that a pull request with every plausible repository-local modification available to it
 * cannot change whether the check is required.
 *
 * The platform is injected, so these run against recorded response shapes with no network. That is
 * a deliberate boundary: everything asserted here is enforcement semantics, and the Azure DevOps
 * adapter later must change none of it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { enforce, gateStateFor } from "../scripts/enforce.mjs";
import { assessGate, isPinnedWorkflowRef, GITHUB_ACTIONS_APP_ID } from "../scripts/gate.mjs";
import { STATE, exitFor, EXIT } from "../scripts/states.mjs";
import { oracleAt } from "../test-support/oracle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "v1.5.0";
const CACHE = path.join(tmpdir(), "standards-enforcer-test-cache");
const CHECK = "standards / machine-learning";
const PINNED_WF = "acme/standards-ci/.github/workflows/standards.yml@1111111111111111111111111111111111111111";

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
// Resolved, never assumed. The gate-root tests below were among those skipping silently on CI.
const ORACLE = oracleAt(TAG);
const MLS = ORACLE.repo;
const MLS_AVAILABLE = ORACLE.available;
const SHA = ORACLE.sha;
const NEEDS_ORACLE = { skip: ORACLE.skip };

/**
 * A platform whose answers come from somewhere the governed repository's files cannot reach.
 *
 * That is the point of the fake, not a convenience: the required-check configuration is held here,
 * outside the target directory, so every adversarial mutation below can rewrite the repository
 * freely and demonstrably not touch it.
 */
function externalPlatform(checks, { ok = true, why = null, workflows = [] } = {}) {
  let calls = 0;
  return {
    name: "fake",
    get calls() { return calls; },
    requiredChecks() {
      calls++;
      return ok ? { ok: true, checks, workflows } : { ok: false, why };
    },
  };
}

// A DEDICATED app, not GitHub Actions. M4 established live that a requirement bound to the Actions
// app (15368) is satisfiable by the pull request's own workflow, so the fixture that stands for "a
// correctly rooted requirement" must name an app the pull request cannot act as.
const ROOTED = [{ context: CHECK, appId: 99001, source: "organization", enforcement: "active" }];

const gateArgs = (over = {}) => ({
  platform: "fake", repo: "acme/moneyball", branch: "main",
  expectedCheck: CHECK, trustedWorkflowRef: PINNED_WF, ...over,
});

async function scratch(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-gate-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** An adopted, compliant-enough ML project. */
async function adoptedProject(dir) {
  await mkdir(path.join(dir, ".github/workflows"), { recursive: true });
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "src/train.py"), "import sklearn\nSEED = 1\n");
  await writeFile(path.join(dir, "requirements.txt"), "scikit-learn==1.5.1\n");
  await writeFile(path.join(dir, "project-policy.yml"), 'standardVersion: "1.0.0"\nproject: "t"\nexceptions: []\n');
  await writeFile(path.join(dir, ".github/workflows/standards.yml"), "name: standards\non: [pull_request]\n");
}

// ===========================================================================
// A gate is a required check, not a workflow file
// ===========================================================================

test("gate · nothing required on the branch is GATE_MISSING", () => {
  const g = assessGate(externalPlatform([]), gateArgs());
  assert.equal(g.verdict, "missing");
  assert.match(g.why, /Nothing is required/);
});

test("gate · a workflow that exists but is required by nobody is still missing", NEEDS_ORACLE, async () => {
  // The whole reason a gate is not a file. The repository below has a perfectly good workflow in
  // its own tree, and the branch requires nothing.
  await scratch(async (dir) => {
    await adoptedProject(dir);
    assert.ok(existsSync(path.join(dir, ".github/workflows/standards.yml")));

    const r = await enforce({
      target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE,
      gate: gateArgs(), platform: externalPlatform([]),
    });
    assert.equal(r.state, STATE.GATE_MISSING);
    assert.equal(r.report, undefined, "no verdict is produced when nobody required one");
    assert.equal(exitFor(r.state), EXIT.NOT_ENFORCEABLE);
  });
});

test("gate · a differently named required check does not satisfy this one", () => {
  const g = assessGate(externalPlatform([{ context: "build", appId: 1, source: "organization", enforcement: "active" }]), gateArgs());
  assert.equal(g.verdict, "missing");
  assert.match(g.why, /Required there: build/);
});

test("gate · a rule in evaluate mode is configured and blocks nothing", () => {
  const g = assessGate(externalPlatform([{ context: CHECK, appId: 1, source: "organization", enforcement: "evaluate" }]), gateArgs());
  assert.equal(g.verdict, "missing");
  assert.match(g.why, /not active/);
});

// ===========================================================================
// A name-only requirement is spoofable by the pull request itself
// ===========================================================================

test("gate · a required check bound to no app is a configuration defect, not a gate", () => {
  // GitHub matches required checks by context string. A pull request can add its own workflow
  // emitting a check of the same name and satisfy the requirement with its own green tick.
  const g = assessGate(externalPlatform([{ context: CHECK, appId: null, source: "organization", enforcement: "active" }]), gateArgs());
  assert.equal(g.verdict, "invalid");
  assert.match(g.why, /not bound to an app/);
  assert.equal(g.detail.spoofable, true);
});

test("gate · GATE_CONFIG_INVALID is a different state from GATE_MISSING", () => {
  // "Nobody requires this" and "something requires it in a way the PR can satisfy for itself" need
  // different fixes, and collapsing them would send an operator to the wrong one.
  assert.notEqual(STATE.GATE_MISSING, STATE.GATE_CONFIG_INVALID);
  assert.equal(exitFor(STATE.GATE_CONFIG_INVALID), EXIT.NOT_ENFORCEABLE);
});

// ===========================================================================
// The trusted implementation must itself be pinned
// ===========================================================================

test("gate · an unpinned trusted workflow moves the mutable root one repository outward", () => {
  for (const ref of [
    "acme/standards-ci/.github/workflows/standards.yml@main",
    "acme/standards-ci/.github/workflows/standards.yml@v1",
    "acme/standards-ci/.github/workflows/standards.yml",
    "acme/standards-ci/.github/workflows/standards.yml@1111111",
  ]) {
    assert.equal(isPinnedWorkflowRef(ref), false, `${ref} must not count as pinned`);
    const g = assessGate(externalPlatform(ROOTED), gateArgs({ trustedWorkflowRef: ref }));
    assert.equal(g.verdict, "invalid", `${ref} should invalidate the gate`);
    assert.match(g.why, /not pinned to a commit/);
  }
  assert.equal(isPinnedWorkflowRef(PINNED_WF), true);
});

test("gate · the trusted workflow is checked before the platform is even asked", () => {
  // An unpinned root is not a question about what the platform says. Asking first would make a
  // correctly-configured requirement look like it rescued an untrustworthy implementation.
  const platform = externalPlatform(ROOTED);
  assessGate(platform, gateArgs({ trustedWorkflowRef: "acme/x/.github/workflows/y.yml@main" }));
  assert.equal(platform.calls, 0);
});

// ===========================================================================
// The platform failing to answer is an unknown, never an absence
// ===========================================================================

test("gate · a platform that cannot answer does not report the gate as missing", () => {
  const g = assessGate(externalPlatform([], { ok: false, why: "gh: not authenticated" }), gateArgs());
  assert.equal(g.verdict, "unreadable", "an unknown resolved as 'missing' would be a guess; as a pass it would be worse");
  assert.match(g.why, /not authenticated/);
});

/**
 * The three-way boundary, which is the whole of this correction.
 *
 * Until now the first and third rows below produced the same verdict, and therefore the same state.
 * Both exit 4, so nothing failed — but `GATE_CONFIG_INVALID` asserts the configuration was READ AND
 * FOUND WRONG, and a platform that would not answer supplied no configuration to find anything about.
 * The enforcer was stating a proposition it had not established, which is INV-E1's direction even
 * where the exit code happens to be right.
 *
 * Written as one table rather than three separate tests because the property IS the separation: any
 * two of these collapsing into one verdict is the defect, and a table makes that impossible to
 * reintroduce by editing a single case.
 */
test("gate · known-absent, known-wrong and unreadable are three different answers", () => {
  const cases = [
    {
      what: "nothing on the branch requires the expected check",
      platform: externalPlatform([]),
      verdict: "missing",
      because: "the host answered, and what it said was that this check is not required",
    },
    {
      what: "the check is required but bound to nothing, so the pull request can satisfy it",
      platform: externalPlatform([{ context: CHECK, appId: null, source: "repository", enforcement: "active" }]),
      verdict: "invalid",
      because: "the host answered, and the configuration it described roots nothing",
    },
    {
      what: "the host would not answer",
      platform: externalPlatform([], { ok: false, why: "gh: HTTP 403 rulesets" }),
      verdict: "unreadable",
      because: "nothing was observed, so neither absence nor invalidity was established",
    },
  ];

  const seen = new Map();
  for (const c of cases) {
    const g = assessGate(c.platform, gateArgs());
    assert.equal(g.verdict, c.verdict, `${c.what} — ${c.because}`);
    assert.ok(!seen.has(g.verdict), `${c.what} collapsed onto: ${seen.get(g.verdict)}`);
    seen.set(g.verdict, c.what);
  }
  assert.equal(seen.size, 3, "three distinct propositions must produce three distinct verdicts");
});

test("gate · every verdict routes to a state, and an unrecognised one fails closed", () => {
  // Found by making the correction, not by reading the code. The routing in enforce.mjs was a chain
  // of `if`s that fell THROUGH to `rooted: true` for anything it did not recognise — so adding a
  // fourth verdict in gate.mjs, which this release does, would have rooted the gate on an answer the
  // enforcer did not understand. A fail-open in the one component whose whole job is to refuse,
  // introduced by editing a different file.
  assert.equal(gateStateFor("rooted").state, null, "rooted is the only verdict that continues");
  assert.equal(gateStateFor("missing").state, STATE.GATE_MISSING);
  assert.equal(gateStateFor("invalid").state, STATE.GATE_CONFIG_INVALID);
  assert.equal(gateStateFor("unreadable").state, STATE.ENFORCEMENT_ERROR);

  for (const unknown of ["provisionally-rooted", "", null, undefined, "ROOTED", "rooted "]) {
    const r = gateStateFor(unknown);
    assert.equal(r.recognised, false, `${JSON.stringify(unknown)} must not be recognised`);
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.notEqual(r.state, null, `${JSON.stringify(unknown)} must never continue to evaluation`);
    assert.equal(exitFor(r.state, false), EXIT.NOT_ENFORCEABLE);
  }

  // `rooted` is the only null, so no future verdict can reach evaluation by resembling it.
  const continuing = ["rooted", "missing", "invalid", "unreadable"].filter((v) => gateStateFor(v).state === null);
  assert.deepEqual(continuing, ["rooted"]);
});

test("gate · unreadability is not softer than invalidity — both refuse, for different reasons", () => {
  // Guards the DIRECTION of the correction. Routing an unknown to a more permissive answer would be
  // the failure this change exists to prevent; the point is accuracy about which proposition holds,
  // never leniency. Neither may ever be "rooted", and both must say what stopped them.
  const unreadable = assessGate(externalPlatform([], { ok: false, why: "gh: HTTP 403" }), gateArgs());
  const invalid = assessGate(
    externalPlatform([{ context: CHECK, appId: null, source: "repository", enforcement: "active" }]),
    gateArgs(),
  );
  for (const g of [unreadable, invalid]) {
    assert.notEqual(g.verdict, "rooted");
    assert.ok(typeof g.why === "string" && g.why.length > 0, "a refusal must say what stopped it");
  }
});

test("gate · no expected check name configured is invalid, not satisfied", () => {
  const g = assessGate(externalPlatform(ROOTED), gateArgs({ expectedCheck: undefined }));
  assert.equal(g.verdict, "invalid");
});

// ===========================================================================
// Rooting, and what a repository-level rule does and does not establish
// ===========================================================================

test("gate · an organisation-rooted requirement verifies, and says where it is rooted", () => {
  const g = assessGate(externalPlatform(ROOTED), gateArgs());
  assert.equal(g.verdict, "rooted");
  assert.deepEqual(g.detail.rootedAt, ["organization"]);
  assert.match(g.detail.note, /cannot reach it/);
});

test("gate · a requirement bound to GitHub Actions is satisfiable by the pull request itself", () => {
  // THE M4 FINDING, observed against a live repository before it was written here. Every workflow in
  // a repository runs as the Actions app, so a requirement bound to it is satisfied by a workflow the
  // pull request adds. Observed: mergeable MERGEABLE, mergeStateStatus CLEAN, on a pull request that
  // had deleted the enforcement and replaced it with `run: echo`.
  const g = assessGate(
    externalPlatform([{ context: CHECK, appId: GITHUB_ACTIONS_APP_ID, source: "organization", enforcement: "active" }]),
    gateArgs(),
  );
  assert.equal(g.verdict, "invalid", "app binding to Actions is not a root; M2 believed it was");
  assert.equal(g.detail.boundToActions, true);
  assert.match(g.why, /every workflow in the repository runs as/);
});

test("gate · a pinned required-workflows rule is what roots an Actions-produced check", () => {
  // The remedy, and the reason it is a different rule rather than a stronger binding: this names a
  // repository, a path and a commit, none of which the governed pull request controls.
  const sha = "34db273f5f1fa8ebcc1a9dc1fa6fd58c40cc2ae2";
  const g = assessGate(
    externalPlatform([{ context: CHECK, appId: GITHUB_ACTIONS_APP_ID, source: "organization", enforcement: "active" }], {
      workflows: [{ repositoryId: 1, path: ".github/workflows/standards-gate.yml", sha, source: "organization" }],
    }),
    gateArgs({ trustedWorkflowRef: `acme/ci/.github/workflows/standards-gate.yml@${sha}` }),
  );
  assert.equal(g.verdict, "rooted");
  assert.match(g.detail.note, /pinned-workflow rule is what makes this a root/);
});

test("gate · a required-workflows rule pinning a DIFFERENT commit does not root this check", () => {
  const g = assessGate(
    externalPlatform([{ context: CHECK, appId: GITHUB_ACTIONS_APP_ID, source: "organization", enforcement: "active" }], {
      workflows: [{ repositoryId: 1, path: ".github/workflows/standards-gate.yml", sha: "b".repeat(40), source: "organization" }],
    }),
    gateArgs(),
  );
  assert.equal(g.verdict, "invalid");
});

test("gate · a repository-level rule is accepted and its weaker rooting is stated", () => {
  const g = assessGate(externalPlatform([{ context: CHECK, appId: 7, source: "repository", enforcement: "active" }]), gateArgs());
  assert.equal(g.verdict, "rooted");
  assert.match(g.detail.note, /repository admin can change it/,
    "outside the pull request is not the same as outside the repository, and the report must not blur them");
});

test("gate · organisation rooting can be required, and then a repository rule is not enough", () => {
  const g = assessGate(
    externalPlatform([{ context: CHECK, appId: 7, source: "repository", enforcement: "active" }]),
    gateArgs({ requireOrganisationRoot: true }),
  );
  assert.equal(g.verdict, "invalid");
});

// ===========================================================================
// THE ADVERSARIAL CASE
// ===========================================================================

test("adversarial · no repository-local change a pull request can make alters the requirement", NEEDS_ORACLE, async () => {
  // Every plausible escape available to a pull request, applied one after another to the same
  // working tree, with the external requirement held constant outside it. The assertion is not
  // that the verdict stays the same — deleting the policy legitimately changes it — but that the
  // gate stays rooted and no mutation produces a passing state it should not.
  await scratch(async (dir) => {
    const platform = externalPlatform(ROOTED);
    const run = () => enforce({
      target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE,
      gate: gateArgs(), platform,
    });

    await adoptedProject(dir);
    const baseline = await run();
    assert.equal(baseline.gate.rooted, true);
    assert.equal(baseline.authoritative, true);

    const escapes = [
      ["delete the local workflow", async () => rm(path.join(dir, ".github/workflows/standards.yml"), { force: true })],
      ["delete the whole workflows directory", async () => rm(path.join(dir, ".github"), { recursive: true, force: true })],
      ["add a workflow emitting a check of the required name", async () => {
        await mkdir(path.join(dir, ".github/workflows"), { recursive: true });
        await writeFile(path.join(dir, ".github/workflows/impostor.yml"),
          `name: ${CHECK}\non: [pull_request]\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: [{run: 'exit 0'}]\n`);
      }],
      ["claim a different standards version in the policy", async () =>
        writeFile(path.join(dir, "project-policy.yml"), 'standardVersion: "9.9.9"\nproject: "t"\nexceptions: []\n')],
      ["add a CODEOWNERS file granting itself review", async () => {
        await mkdir(path.join(dir, ".github"), { recursive: true });
        await writeFile(path.join(dir, ".github/CODEOWNERS"), "* @attacker\n");
      }],
      ["add a file named like the enforcer's own config", async () =>
        writeFile(path.join(dir, "standards-enforcer.json"), '{"gate":{"rooted":true}}\n')],
      ["remove the policy entirely", async () => rm(path.join(dir, "project-policy.yml"), { force: true })],
    ];

    for (const [name, mutate] of escapes) {
      await mutate();
      const r = await run();
      assert.equal(r.gate.rooted, true, `${name}: the requirement moved, which means it was reachable from the repository`);
      assert.deepEqual(r.gate.rootedAt, ["organization"], `${name}: rooting changed`);
      if (r.passing) {
        // The only route to passing here is an authority having spoken and its own contract calling
        // that answer passing. Before 0.4.0 this named COMPLIANT directly, which was the enforcer
        // asserting it knew which word meant yes.
        assert.equal(r.state, STATE.EVALUATED, `${name}: produced a passing state it should not have`);
        assert.equal(typeof r.authority.status, "string");
        assert.equal(r.authoritative, true);
      }
    }

    // Deleting the policy is the one mutation that must change the outcome, and it must change it
    // in the safe direction: no adoption, no verdict, no merge.
    const final = await run();
    assert.equal(final.state, STATE.NOT_ADOPTED);
    assert.equal(final.passing, false,
      "removing the standards is not a route to a green check");
  });
});

// ===========================================================================
// Advisory versus authoritative
// ===========================================================================

test("advisory · a run with no gate checked is stamped non-authoritative and says so", NEEDS_ORACLE, async () => {
  await scratch(async (dir) => {
    await adoptedProject(dir);
    const r = await enforce({ target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
    assert.equal(r.authoritative, false);
    assert.equal(r.gate.checked, false);
    assert.match(r.gate.note, /advisory/i);
  });
});

test("advisory · the rendered output warns when a pass came from an unrooted run", NEEDS_ORACLE, async () => {
  // The target used to be MachineLearningStandards itself, which reported COMPLIANT on its own tree
  // having evaluated nothing. v1.5.0 repaired that, so this needs a target the pack genuinely passes
  // — one applicable rule established and nothing failing. `scored: 1` rather than `scored: 0` is
  // what makes this a pass worth asserting an advisory notice about.
  const dir = await mkdtemp(path.join(tmpdir(), "advisory-"));
  try {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src/train.py"), "import sklearn\nSEED = 1\n");
    await writeFile(path.join(dir, "requirements.txt"), "scikit-learn==1.5.0\n");
    await writeFile(
      path.join(dir, "project-policy.yml"),
      'standardVersion: "1.0.0"\nproject: "clean-ml"\nexceptions: []\n',
    );

    const r = spawnSync(process.execPath, [
      path.join(ROOT, "scripts/enforce.mjs"),
      `--target=${dir}`, `--standards=${MLS}`, `--tag=${TAG}`, `--sha=${SHA}`,
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ADVISORY/);
    assert.match(r.stdout, /does not establish that/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a half-configured gate is refused rather than half-checked", () => {
  const r = spawnSync(process.execPath, [
    path.join(ROOT, "scripts/enforce.mjs"),
    "--target=.", "--standards=.", "--tag=v1", `--sha=${"0".repeat(40)}`, "--platform=github",
  ], { encoding: "utf8" });
  assert.equal(r.status, EXIT.NOT_ENFORCEABLE);
  assert.match(r.stderr, /half-configured gate is not a gate/);
});

/**
 * The `unmeasured` mechanism, exercised directly.
 *
 * A platform may answer with a check it genuinely read while declaring which rooting properties it
 * did not measure. `assessGate` must refuse — not because anything failed, but because the answer is
 * incomplete in a way that matters: a requirement matched by name alone is satisfiable by the pull
 * request's own workflow.
 *
 * Tested against a synthetic platform rather than through a producer, because it is a property of
 * `assessGate` and must survive any particular producer's contract. The governance corpus reached
 * this path until that producer was found not to serialize check identity at all; without this test
 * the guard would have become uncovered code the moment its only caller stopped using it.
 */
test("unmeasured · a platform that names what it did not measure is refused, not accepted", () => {
  const named = (unmeasured) => ({
    name: "partial",
    requiredChecks: () => ({
      ok: true,
      checks: [{ context: "standards", appId: null, source: "repository", enforcement: "active" }],
      workflows: [],
      ...(unmeasured ? { unmeasured } : {}),
    }),
  });
  const args = { repo: "o/r", branch: "main", expectedCheck: "standards" };

  const refused = assessGate(named(["app-binding", "workflow-pinning"]), args);
  assert.equal(refused.verdict, "unreadable", "an incomplete answer is an unknown, not a defect");
  assert.notEqual(refused.verdict, "invalid", "nothing established that the unmeasured properties fail");
  assert.deepEqual(refused.detail.unmeasured, ["app-binding", "workflow-pinning"]);
  for (const p of ["app-binding", "workflow-pinning"]) assert.match(refused.why, new RegExp(p));

  // The discriminator: the SAME answer without the declaration is judged on its merits, and an
  // unbound requirement is a defect rather than an unknown. So `unmeasured` is what is doing the
  // work here, not the shape of the check.
  assert.equal(assessGate(named(null), args).verdict, "invalid");
});
