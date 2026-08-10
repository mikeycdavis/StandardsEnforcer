/**
 * M3: is this repository governed, and who decided?
 *
 * The success criterion is deliberately not "the ML detector is accurate". It is that uncertainty
 * about scope became an explicit governed state instead of a silent bypass. So the detector tests
 * below assert what the signals are *called* and where they cannot reach, and every test that
 * matters asserts that no detector result — positive, negative, or wrong — moves a disposition.
 *
 * Organised as the four failure modes rather than as the code's modules:
 *
 *   detection that decides           → it cannot; the disposition comes only from the registry
 *   silence that renews a decision   → it cannot; a fresh decision stands on the reviewer, not on quiet
 *   a target that exempts itself     → it cannot; the registry is external and reviewers are named
 *   a decision that cannot go stale  → refused; no evidence basis means review required
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { enforce } from "../scripts/enforce.mjs";
import { detectFootprint, footprintDigest, codeView } from "../scripts/footprint.mjs";
import { resolveScope, OUTCOME } from "../scripts/scope.mjs";
import { STATE, PASSING, REQUIRES_RECORDED_DECISION, REACHABLE, VERDICT_STATES, exitFor, EXIT } from "../scripts/states.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MLS = "F:/Repos/MachineLearningStandards";
const TAG = "v1.4.0";
const CACHE = path.join(tmpdir(), "standards-enforcer-test-cache");
const TODAY = "2026-08-09";
const REVIEWER = "ml-governance@acme.example";
const ID = "github:1024871";

const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });
const MLS_AVAILABLE = existsSync(path.join(MLS, ".git")) && git(["rev-list", "-n", "1", TAG], MLS).status === 0;
const SHA = MLS_AVAILABLE ? git(["rev-list", "-n", "1", TAG], MLS).stdout.trim() : null;

async function scratch(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-scope-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), content);
  }
}

/** A registry written outside the target, which is the only place a registry may be. */
async function registryAt(dir, entry, { reviewers = [REVIEWER], name = "acme/moneyball", key = ID } = {}) {
  const p = path.join(dir, "scope-registry.json");
  await writeFile(p, JSON.stringify({
    schemaVersion: "1.0.0",
    authorisedReviewers: reviewers,
    repositories: entry === null ? {} : { [key]: { name, machineLearning: entry } },
  }, null, 2));
  return p;
}

const decision = (over = {}) => ({
  disposition: "in-scope",
  reviewedBy: REVIEWER,
  reviewedAt: "2026-08-01",
  reason: "Trains and evaluates predictive models.",
  evidence: ["src/train.py"],
  revisitWhen: ["training leaves this repository"],
  reviewedFootprint: null,
  expiresAt: null,
  ...over,
});

const resolve = (registryPath, footprint, over = {}) =>
  resolveScope({ registryPath, repoId: ID, repoName: "acme/moneyball", footprint, today: TODAY, ...over });

// ===========================================================================
// The eight fixtures. What detection sees, and what it calls it.
// ===========================================================================

const FIXTURES = {
  "obvious sklearn training": {
    "src/train.py": "import sklearn\nfrom sklearn.model_selection import train_test_split\nm.fit(X, y)\n",
    "requirements.txt": "scikit-learn==1.5.1\n",
  },
  "pytorch with zero sklearn vocabulary": {
    "detect.py": "import torch\nfrom ultralytics import YOLO\nloss.backward()\n",
  },
  "ML terminology in prose only": {
    "README.md": "We use PyTorch and scikit-learn to train a model. import torch\n",
    "notes.txt": "training the classifier with sklearn\n",
    "app.py": "# import torch and train the model\nx = 1  # sklearn\nS = 'import tensorflow'\n",
  },
  "inference client, trains nothing": {
    "src/triage.py": "import openai\nresp = openai.responses.create(model='m')\n",
  },
  "generic numerical code": {
    "analysis.py": "import numpy as np\nimport pandas as pd\nfrom scipy import stats\nstats.linregress(x, y)\ncurve.fit(x)\n",
  },
  "ML behind unusual filenames": {
    "pipeline_step_7.py": "import lightgbm\nbooster.fit(d)\n",
  },
};

test("footprint · an obvious training repository is seen for what it is", async () => {
  await scratch(async (dir) => {
    await writeTree(dir, FIXTURES["obvious sklearn training"]);
    const f = detectFootprint(dir);
    assert.deepEqual(f.kinds, ["training-call-shape", "training-framework-dependency", "training-framework-import"]);
  });
});

test("footprint · a framework this repository has never heard of in its fixtures is still ML", async () => {
  // The point of not keying on sklearn vocabulary, and of not keying on `train*.py`.
  for (const name of ["pytorch with zero sklearn vocabulary", "ML behind unusual filenames"]) {
    await scratch(async (dir) => {
      await writeTree(dir, FIXTURES[name]);
      const f = detectFootprint(dir);
      assert.ok(f.kinds.includes("training-framework-import"), `${name}: not detected`);
    });
  }
});

test("footprint · terminology in prose, comments and strings is a mention, never a use", async () => {
  await scratch(async (dir) => {
    await writeTree(dir, FIXTURES["ML terminology in prose only"]);
    const f = detectFootprint(dir);
    assert.deepEqual(f.kinds, [], "a README naming PyTorch is not a repository using PyTorch");
  });
  assert.equal(codeView("# import torch\nimport json\n").includes("torch"), false);
  assert.equal(codeView("x = 'import torch'\n").includes("torch"), false);
});

test("footprint · calling a hosted model is its own signal, and is not training", async () => {
  await scratch(async (dir) => {
    await writeTree(dir, FIXTURES["inference client, trains nothing"]);
    const f = detectFootprint(dir);
    assert.deepEqual(f.kinds, ["inference-client"]);
    assert.ok(!f.kinds.some((k) => k.startsWith("training-")),
      "collapsing an API client into the training signals manufactures the false positive the reviewer exists to catch");
  });
});

test("footprint · statistics is not machine learning", async () => {
  await scratch(async (dir) => {
    await writeTree(dir, FIXTURES["generic numerical code"]);
    const f = detectFootprint(dir);
    assert.deepEqual(f.kinds, [], "numpy/pandas/scipy, and a bare .fit( in scipy code, are not a training footprint");
  });
});

test("footprint · what it did not find is stated as a limit, not implied to be absence", async () => {
  await scratch(async (dir) => {
    // A genuinely obscure in-house framework. This one is a MISS, and the test asserts the miss is
    // reported honestly rather than asserting a recall the detector does not have.
    await writeFile(path.join(dir, "run.py"), "import acmenet\nacmenet.Session().optimise(epochs=40)\n");
    const f = detectFootprint(dir);
    assert.deepEqual(f.kinds, []);
    assert.equal(f.assurance, "partial");
    assert.match(f.note, /establishes nothing/);
  });
});

test("footprint · the digest tracks kinds of evidence, not churn", async () => {
  await scratch(async (dir) => {
    await writeFile(path.join(dir, "a.py"), "import torch\n");
    const before = detectFootprint(dir);
    await writeFile(path.join(dir, "b.py"), "import torch\nimport torch\n# more of the same\n");
    const after = detectFootprint(dir);
    assert.equal(after.digest, before.digest, "ordinary commits must not manufacture review churn");
    await writeFile(path.join(dir, "c.py"), "import mlflow\n");
    assert.notEqual(detectFootprint(dir).digest, before.digest, "a new KIND of evidence must invalidate the basis");
  });
});

// ===========================================================================
// Detection cannot make a disposition
// ===========================================================================

test("scope · an unreviewed repository is review-required no matter what detection saw", async () => {
  await scratch(async (dir) => {
    const reg = await registryAt(dir, null);
    for (const kinds of [[], ["training-framework-import", "training-call-shape"], ["inference-client"]]) {
      const r = resolve(reg, { kinds, digest: footprintDigest(kinds) });
      assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.equal(r.detail.unreviewed, true);
    }
  });
});

test("scope · no detector result can produce in-scope or out-of-scope on its own", async () => {
  // The structural claim. With an empty registry the disposition-producing branch is unreachable,
  // whatever the evidence looks like.
  await scratch(async (dir) => {
    const reg = await registryAt(dir, null);
    const outcomes = new Set();
    for (const kinds of [[], ["model-artifact"], ["training-framework-import", "experiment-tracking", "dataset-artifact"]]) {
      outcomes.add(resolve(reg, { kinds, digest: footprintDigest(kinds) }).outcome);
    }
    assert.deepEqual([...outcomes], [OUTCOME.REVIEW_REQUIRED]);
  });
});

// ===========================================================================
// Silence never renews a decision
// ===========================================================================

test("scope · a fresh exclusion holds on the reviewer's authority, and says so", async () => {
  await scratch(async (dir) => {
    const kinds = ["inference-client"];
    const fp = { kinds, digest: footprintDigest(kinds) };
    const reg = await registryAt(dir, decision({
      disposition: "out-of-scope",
      reason: "Calls a hosted model; trains nothing.",
      reviewedFootprint: { kinds, digest: fp.digest },
    }));
    const r = resolve(reg, fp);
    assert.equal(r.outcome, OUTCOME.OUT_OF_SCOPE);
    assert.match(r.detail.standsOn, /did not confirm this decision/,
      "the payload must never let 'the detector found nothing' read as 'the decision was verified'");
    assert.match(r.detail.standsOn, new RegExp(REVIEWER.replace(/[.@]/g, "\\$&")));
  });
});

test("scope · a previously out-of-scope repository that gains training code needs review again", async () => {
  await scratch(async (dir) => {
    const reviewed = ["inference-client"];
    const reg = await registryAt(dir, decision({
      disposition: "out-of-scope",
      reason: "Calls a hosted model; trains nothing.",
      reviewedFootprint: { kinds: reviewed, digest: footprintDigest(reviewed) },
    }));
    const now = ["inference-client", "training-framework-import"];
    const r = resolve(reg, { kinds: now, digest: footprintDigest(now) });
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.stale, true);
    assert.deepEqual(r.detail.gained, ["training-framework-import"]);
  });
});

test("scope · a previously in-scope repository whose ML disappears needs review again", async () => {
  await scratch(async (dir) => {
    const reviewed = ["training-call-shape", "training-framework-import"];
    const reg = await registryAt(dir, decision({ reviewedFootprint: { kinds: reviewed, digest: footprintDigest(reviewed) } }));
    const r = resolve(reg, { kinds: [], digest: footprintDigest([]) });
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.deepEqual(r.detail.lost, reviewed);
    // Note the direction: the decision is not silently dropped because the code vanished. A human
    // decides whether the repository left the population or merely moved its training elsewhere.
  });
});

test("scope · a decision with no evidence basis cannot go stale, and is therefore not trusted", async () => {
  await scratch(async (dir) => {
    const reg = await registryAt(dir, decision({ reviewedFootprint: null }));
    const r = resolve(reg, { kinds: [], digest: footprintDigest([]) });
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.noBasis, true);
  });
});

// ===========================================================================
// The target cannot decide whether it is governed
// ===========================================================================

test("scope · a registry inside the repository it governs is refused", async () => {
  await scratch(async (dir) => {
    const reg = await registryAt(dir, decision({ disposition: "out-of-scope", reason: "we say so" }));
    const r = resolveScope({ registryPath: reg, repoId: ID, target: dir, footprint: { kinds: [], digest: "x" }, today: TODAY });
    assert.equal(r.outcome, OUTCOME.REGISTRY_INVALID);
    assert.match(r.why, /inside the repository it governs/);
  });
});

test("scope · a disposition recorded by someone who is not an authorised reviewer is a proposal", async () => {
  // The socially realistic bypass. The repository owner writes the entry they want.
  await scratch(async (dir) => {
    const kinds = ["training-framework-import"];
    const reg = await registryAt(dir, decision({
      disposition: "out-of-scope",
      reviewedBy: "repo-owner@acme.example",
      reason: "we do not think this counts",
      reviewedFootprint: { kinds, digest: footprintDigest(kinds) },
    }));
    const r = resolve(reg, { kinds, digest: footprintDigest(kinds) });
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.detail.selfAsserted, true);
    assert.match(r.why, /A proposal to be excluded is not an exclusion/);
  });
});

test("scope · a registry with no authorised reviewers makes nothing authoritative", async () => {
  await scratch(async (dir) => {
    const reg = await registryAt(dir, decision({ disposition: "out-of-scope", reason: "r" }), { reviewers: [] });
    const r = resolve(reg, { kinds: [], digest: footprintDigest([]) });
    assert.equal(r.outcome, OUTCOME.REGISTRY_INVALID);
  });
});

test("scope · decisions are keyed by identity, and a matching name is a warning not a match", async () => {
  await scratch(async (dir) => {
    const kinds = [];
    const reg = await registryAt(dir, decision({
      disposition: "out-of-scope", reason: "r", reviewedFootprint: { kinds, digest: footprintDigest(kinds) },
    }), { key: "github:999999", name: "acme/moneyball" });
    const r = resolve(reg, { kinds, digest: footprintDigest(kinds) });
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED, "a renamed or recreated repository must not inherit another's decision");
    assert.equal(r.detail.nameCollision, "github:999999");
  });
});

test("scope · an exclusion with no reason, no date or an expired bound is not an exclusion", async () => {
  await scratch(async (dir) => {
    const kinds = [];
    const basis = { kinds, digest: footprintDigest(kinds) };
    for (const [label, over] of [
      ["no reason", { reason: null }],
      ["no date", { reviewedAt: null }],
      ["expired", { expiresAt: "2026-01-01" }],
      ["unrecognised disposition", { disposition: "probably-fine" }],
    ]) {
      const reg = await registryAt(dir, decision({ disposition: "out-of-scope", reason: "r", reviewedFootprint: basis, ...over }));
      assert.equal(resolve(reg, basis).outcome, OUTCOME.REVIEW_REQUIRED, `${label} should require review`);
    }
  });
});

// ===========================================================================
// The state model after M3
// ===========================================================================

test("states · SCOPE_REVIEW_REQUIRED and OUT_OF_SCOPE are reachable; only BYPASS_USED is not", () => {
  for (const s of [STATE.SCOPE_REVIEW_REQUIRED, STATE.OUT_OF_SCOPE, STATE.SCOPE_REGISTRY_INVALID]) {
    assert.ok(REACHABLE.has(s), `${s} should be reachable after M3`);
  }
  const unreachable = Object.values(STATE).filter((s) => !REACHABLE.has(s));
  assert.deepEqual(unreachable, [STATE.BYPASS_USED]);
});

test("states · every passing state is a verdict or carries a recorded human decision", () => {
  // The bound on M3's widening of PASSING. A future state cannot join it by attrition.
  for (const s of PASSING) {
    assert.ok(VERDICT_STATES.has(s) || REQUIRES_RECORDED_DECISION.has(s),
      `${s} may not be a passing state without being a verdict or a recorded decision`);
  }
  assert.equal(exitFor(STATE.OUT_OF_SCOPE), EXIT.OK);
  assert.equal(exitFor(STATE.SCOPE_REVIEW_REQUIRED), EXIT.NOT_ENFORCEABLE);
  assert.equal(exitFor(STATE.SCOPE_REGISTRY_INVALID), EXIT.NOT_ENFORCEABLE);
});

test("states · OUT_OF_SCOPE is not a standards verdict", () => {
  assert.equal(VERDICT_STATES.has(STATE.OUT_OF_SCOPE), false,
    "an exclusion must never read as though the standards examined this repository and were satisfied");
});

// ===========================================================================
// End to end
// ===========================================================================

test("enforce · in scope and not adopted is a stronger finding than no policy file",
  { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  await scratch(async (outside) => {
    await scratch(async (dir) => {
      await writeFile(path.join(dir, "train.py"), "import sklearn\nm.fit(X, y)\n");
      const kinds = detectFootprint(dir).kinds;
      const reg = await registryAt(outside, decision({ reviewedFootprint: { kinds, digest: footprintDigest(kinds) } }));

      const scoped = await enforce({
        target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE, today: TODAY,
        scope: { registryPath: reg, repoId: ID, repoName: "acme/moneyball" },
      });
      assert.equal(scoped.state, STATE.NOT_ADOPTED);
      assert.equal(scoped.governed, true);
      assert.match(scoped.detail, /governed and has not adopted/);
      assert.equal(exitFor(scoped.state), EXIT.NOT_ENFORCEABLE);

      // Without a registry the same repository produces the same state with the weaker M2 meaning.
      const unscoped = await enforce({ target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE });
      assert.equal(unscoped.state, STATE.NOT_ADOPTED);
      assert.notEqual(unscoped.governed, true);
      assert.equal(unscoped.scope.checked, false);
    });
  });
});

test("enforce · a recorded exclusion merges, evaluates nothing, and reads as an exclusion",
  { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  await scratch(async (outside) => {
    await scratch(async (dir) => {
      await writeFile(path.join(dir, "triage.py"), "import openai\n");
      const kinds = detectFootprint(dir).kinds;
      const reg = await registryAt(outside, decision({
        disposition: "out-of-scope",
        reason: "Consumes a hosted inference API; trains and evaluates nothing.",
        reviewedFootprint: { kinds, digest: footprintDigest(kinds) },
      }));
      const r = await enforce({
        target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE, today: TODAY,
        scope: { registryPath: reg, repoId: ID, repoName: "acme/moneyball" },
      });
      assert.equal(r.state, STATE.OUT_OF_SCOPE);
      assert.equal(r.passing, true);
      assert.equal(r.isStandardsVerdict, false);
      assert.equal(r.report, undefined, "nothing was evaluated, so there is no report to quote");
      assert.equal(exitFor(r.state), EXIT.OK);
    });
  });
});

test("enforce · a scope check without a registry path is refused rather than half-run", () => {
  const r = spawnSync(process.execPath, [
    path.join(ROOT, "scripts/enforce.mjs"),
    "--target=.", "--standards=.", "--tag=v1", `--sha=${"0".repeat(40)}`, "--repo-id=github:1",
  ], { encoding: "utf8" });
  assert.equal(r.status, EXIT.NO_VERDICT);
  assert.match(r.stderr, /half-configured scope check/);
});

// ===========================================================================
// THE ADVERSARIAL CASE — the target tries to declare itself ungoverned
// ===========================================================================

test("adversarial · nothing a repository writes about its own scope changes its disposition",
  { skip: !MLS_AVAILABLE && "MachineLearningStandards not on disk" }, async () => {
  // The M3 counterpart of M2's adversarial test, and the same shape of proof: the authority is held
  // outside the tree, the tree is rewritten freely, the disposition does not move.
  //
  //   M2: the target cannot control whether its gate exists.
  //   M3: the target cannot control whether it is governed.
  await scratch(async (outside) => {
    await scratch(async (dir) => {
      await writeFile(path.join(dir, "train.py"), "import sklearn\nm.fit(X, y)\n");
      const kinds = detectFootprint(dir).kinds;
      const reg = await registryAt(outside, decision({ reviewedFootprint: { kinds, digest: footprintDigest(kinds) } }));
      const run = () => enforce({
        target: dir, standardsRepo: MLS, tag: TAG, sha: SHA, cacheRoot: CACHE, today: TODAY,
        scope: { registryPath: reg, repoId: ID, repoName: "acme/moneyball" },
      });

      const baseline = await run();
      assert.equal(baseline.scope.disposition, OUTCOME.IN_SCOPE);

      const escapes = [
        ["declare out-of-scope in the policy", async () =>
          writeFile(path.join(dir, "project-policy.yml"), 'standardVersion: "1.0.0"\nmachineLearningStandards:\n  scope: out-of-scope\nexceptions: []\n')],
        ["add a scope file of its own", async () =>
          writeFile(path.join(dir, ".standards-scope.yml"), "disposition: out-of-scope\nreviewedBy: ml-governance@acme.example\n")],
        ["commit a registry of its own naming itself excluded", async () =>
          writeFile(path.join(dir, "scope-registry.json"), JSON.stringify({
            authorisedReviewers: ["repo-owner@acme.example"],
            repositories: { [ID]: { name: "acme/moneyball", machineLearning: decision({ disposition: "out-of-scope", reviewedBy: "repo-owner@acme.example" }) } },
          }))],
        ["add itself to a reviewers file", async () =>
          writeFile(path.join(dir, "AUTHORISED_REVIEWERS"), "repo-owner@acme.example\n")],
        ["rename itself in a metadata file", async () =>
          writeFile(path.join(dir, "repo.json"), '{"id":"github:999999","name":"acme/something-else"}\n')],
        ["hide the training code behind a neutral filename", async () => {
          await writeFile(path.join(dir, "step_seven.py"), "import sklearn\nm.fit(X, y)\n");
          await rm(path.join(dir, "train.py"), { force: true });
        }],
      ];

      for (const [name, mutate] of escapes) {
        await mutate();
        const r = await run();
        assert.equal(r.scope.disposition, OUTCOME.IN_SCOPE, `${name}: the disposition moved, which means it was reachable from the repository`);
        assert.equal(r.state === STATE.OUT_OF_SCOPE, false, `${name}: the repository excluded itself`);
        assert.equal(r.scope.decision.reviewedBy, REVIEWER, `${name}: the reviewer changed`);
      }

      // Deleting the ML code is the one mutation that must change something, and it changes it to a
      // question for a human rather than to an exemption.
      await rm(path.join(dir, "step_seven.py"), { force: true });
      const after = await run();
      assert.equal(after.state, STATE.SCOPE_REVIEW_REQUIRED);
      assert.equal(after.passing, false, "deleting the training code is not a route to being ungoverned");
      assert.equal(after.scope.stale, true);
    });
  });
});
