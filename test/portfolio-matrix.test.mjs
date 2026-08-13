/**
 * The portfolio matrix: every cell, including — especially — the ugly ones.
 *
 * ADR 0008 part 3 is one sentence long and everything here is a way of holding it: **any option that
 * reduces the cell COUNT without reducing the POPULATION is the back door.** So the arms below are
 * mostly about what the matrix refuses to do — hide a category, invent a state to fill a column,
 * resolve a repository it could not observe, or report a smaller table because a control failed.
 *
 * The pair that matters most is arms 3 and 4. An unobservable repository must be review-required,
 * and an observable one with a matching surface must be out-of-scope. Without the second, the first
 * is satisfied by a matrix that reports review-required for everything forever.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { portfolio, stateFor, defaultLocator } from "../scripts/matrix.mjs";
import { parseArgs } from "../scripts/portfolio.mjs";
import { OUTCOME } from "../scripts/scope.mjs";
import { STATE, REACHABLE } from "../scripts/states.mjs";
import { detectFootprint } from "../scripts/footprint.mjs";
import { proposeSurface } from "../scripts/digest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVIEWER = "ml-governance@acme.example";
const TODAY = "2026-08-13";
const A = "github:1024871";
const B = "github:2048113";

function scratch(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "enforcer-matrix-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pack = (id) => ({ name: id, contract: { id, sourceRef: `${id}@v1.0.0:standards-adapter.json` } });

function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
}

/** A real git repository, because a governed repository is one, and the surface resolver reads git. */
function committed(dir) {
  const g = (args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  };
  g(["init", "--quiet", "-b", "main"]);
  g(["config", "user.email", "t@example.invalid"]);
  g(["config", "user.name", "matrix"]);
  g(["config", "commit.gpgsign", "false"]);
  g(["add", "-A"]);
  g(["commit", "--quiet", "-m", "the governed repository"]);
  const proposed = proposeSurface(dir, []);
  assert.equal(proposed.ok, true, `the fixture repository produced no reviewed surface: ${proposed.why}`);
  return proposed.reviewedSurface;
}

function registryAt(dir, { standards, repositories }) {
  const p = path.join(dir, "scope-registry.json");
  writeFileSync(p, JSON.stringify({ schemaVersion: "1.0.0", authorisedReviewers: [REVIEWER], standards, repositories }, null, 2));
  return p;
}

function baselineAt(dir, cells) {
  const p = path.join(dir, "baseline.json");
  writeFileSync(p, JSON.stringify({ schemaVersion: "1.0.0", cells }, null, 2));
  return p;
}

const outcomes = (r) => r.cells.map((c) => `${c.repoId}|${c.contractId}|${c.outcome}`).sort();

// ===========================================================================

test("matrix · reports every cell in the population, including the ones nobody has looked at", () => {
  scratch((dir) => {
    const registryPath = registryAt(dir, {
      standards: { "machine-learning": pack("machine-learning"), betting: pack("betting"), engineering: pack("engineering") },
      repositories: { [A]: { name: "acme/moneyball", standards: {} }, [B]: { name: "acme/support-triage", standards: {} } },
    });
    const cells = [];
    for (const repo of [A, B]) for (const s of ["machine-learning", "betting", "engineering"]) cells.push({ repository: repo, standard: s });

    const r = portfolio({ registryPath, baselinePath: baselineAt(dir, cells), today: TODAY });
    assert.equal(r.counts.cells, 6);
    assert.equal(r.counts.byOutcome[OUTCOME.REVIEW_REQUIRED], 6);
    // Reported beside the result on purpose: a small tidy matrix must never read as a governed
    // portfolio, and the population's size is the only thing that distinguishes them.
    assert.equal(r.counts.repositories, 2);
    assert.equal(r.counts.packs, 3);
    assert.equal(r.ratchet.ok, true);
  });
});

test("matrix · a repository this run could not observe is review-required, never a pass", () => {
  scratch((dir) => {
    // A fully-formed, authorised, unexpired out-of-scope decision — everything except the ability to
    // look at the repository it describes. ADR 0007's third disposition: undetermined is neither
    // fresh nor stale, and it goes to a human. Converting it to a pass is exactly INV-E1's defect.
    const registryPath = registryAt(dir, {
      standards: { "machine-learning": pack("machine-learning") },
      repositories: {
        [A]: {
          name: "acme/support-triage",
          standards: {
            "machine-learning": {
              disposition: "out-of-scope",
              reviewedBy: REVIEWER,
              reviewedAt: "2026-08-01",
              reason: "Consumes a hosted inference API and trains nothing.",
              reviewedFootprint: { surface: "training-evidence", kinds: ["inference-client"], digest: "d0" },
              reviewedSurface: { resolverVersion: 1, surfaceDigest: "s0", contentDigest: "c0", exclusions: [] },
            },
          },
        },
      },
    });
    const r = portfolio({ registryPath, baselinePath: baselineAt(dir, [{ repository: A, standard: "machine-learning" }]), today: TODAY, locate: () => null });
    assert.equal(r.cells[0].observed, false);
    assert.equal(r.cells[0].outcome, OUTCOME.REVIEW_REQUIRED);
    assert.equal(r.cells[0].state, STATE.SCOPE_REVIEW_REQUIRED);
  });
});

test("matrix · an observed repository whose surface still matches resolves out-of-scope", () => {
  scratch((dir) => {
    // The pair for the arm above. Without it, "unobservable is review-required" is satisfied by a
    // matrix that reports review-required for every cell forever and proves nothing.
    const repoDir = path.join(dir, "support-triage");
    mkdirSync(repoDir);
    write(repoDir, { "README.md": "# support triage\n", "src/triage.py": "import requests\n\ndef triage(t):\n    return requests.post('https://api.example/v1/classify', json={'t': t})\n" });
    const reviewedSurface = committed(repoDir);
    const fp = detectFootprint(repoDir);

    const registryPath = registryAt(dir, {
      standards: { "machine-learning": pack("machine-learning") },
      repositories: {
        [A]: {
          name: "acme/support-triage",
          standards: {
            "machine-learning": {
              disposition: "out-of-scope",
              reviewedBy: REVIEWER,
              reviewedAt: "2026-08-01",
              reason: "Consumes a hosted inference API and trains nothing.",
              reviewedFootprint: { surface: fp.surface, kinds: fp.kinds, digest: fp.digest },
              reviewedSurface,
            },
          },
        },
      },
    });
    const r = portfolio({
      registryPath,
      baselinePath: baselineAt(dir, [{ repository: A, standard: "machine-learning" }]),
      today: TODAY,
      locate: () => repoDir,
    });
    assert.equal(r.cells[0].observed, true);
    assert.equal(r.cells[0].outcome, OUTCOME.OUT_OF_SCOPE, r.cells[0].why ?? "");
    assert.equal(r.cells[0].state, STATE.OUT_OF_SCOPE);
    // Still not a compliance result, and still not evaluated here.
    assert.equal(r.cells[0].evaluated, false);
  });
});

test("matrix · an in-scope cell invents no state to fill the column", () => {
  scratch((dir) => {
    const repoDir = path.join(dir, "moneyball");
    mkdirSync(repoDir);
    write(repoDir, { "README.md": "# moneyball\n", "src/train.py": "import lightgbm\n\nmodel = lightgbm.LGBMClassifier()\nmodel.fit(X, y)\n" });
    const reviewedSurface = committed(repoDir);
    const fp = detectFootprint(repoDir);

    const registryPath = registryAt(dir, {
      standards: { "machine-learning": pack("machine-learning") },
      repositories: {
        [A]: {
          name: "acme/moneyball",
          standards: {
            "machine-learning": {
              disposition: "in-scope",
              reviewedBy: REVIEWER,
              reviewedAt: "2026-08-01",
              reason: "Trains and evaluates gradient-boosted models.",
              reviewedFootprint: { surface: fp.surface, kinds: fp.kinds, digest: fp.digest },
              reviewedSurface,
            },
          },
        },
      },
    });
    const r = portfolio({ registryPath, baselinePath: baselineAt(dir, [{ repository: A, standard: "machine-learning" }]), today: TODAY, locate: () => repoDir });
    assert.equal(r.cells[0].outcome, OUTCOME.IN_SCOPE, r.cells[0].why ?? "");
    // No STATE member means "governed, and not evaluated here". Inventing one to make the table look
    // complete would put a word in the vocabulary for the sake of a column.
    assert.equal(r.cells[0].state, null);
    assert.equal(r.cells[0].evaluated, false);
  });
});

test("matrix · the state projection stays inside the vocabulary, and adds nothing to it", () => {
  for (const outcome of Object.values(OUTCOME)) {
    const s = stateFor(outcome);
    if (s !== null) assert.ok(Object.values(STATE).includes(s), `${outcome} projected to "${s}", which is not a state`);
  }
  // The gap ADR 0002 records, unchanged by this slice.
  assert.deepEqual(Object.values(STATE).filter((s) => !REACHABLE.has(s)), [STATE.BYPASS_USED]);
});

test("matrix · a ratchet violation fails the run and hides nothing", () => {
  scratch((dir) => {
    const registryPath = registryAt(dir, {
      standards: { "machine-learning": pack("machine-learning"), betting: pack("betting") },
      repositories: { [A]: { name: "a", standards: {} }, [B]: { name: "b", standards: {} } },
    });
    const full = portfolio({ registryPath, baselinePath: baselineAt(dir, [
      { repository: A, standard: "machine-learning" }, { repository: A, standard: "betting" },
      { repository: B, standard: "machine-learning" }, { repository: B, standard: "betting" },
    ]), today: TODAY });
    assert.equal(full.ok, true);

    const broken = portfolio({ registryPath, baselinePath: baselineAt(dir, [{ repository: A, standard: "machine-learning" }]), today: TODAY });
    assert.equal(broken.ok, false);
    assert.ok(broken.ratchet.findings.length > 0);
    // The only way to see the portfolio must not be to have already satisfied the control.
    assert.deepEqual(outcomes(broken), outcomes(full));
    assert.equal(broken.counts.cells, 4);
  });
});

test("matrix · an invalid registry yields no population, and says so rather than yielding zero cells quietly", () => {
  scratch((dir) => {
    const r = portfolio({ registryPath: path.join(dir, "absent.json"), baselinePath: baselineAt(dir, []), today: TODAY });
    assert.equal(r.registryInvalid, true);
    assert.equal(r.ok, false);
    assert.equal(r.cells.length, 0);
    assert.match(r.why, /does not exist/);
  });
});

test("cli · no flag reduces the cell count without reducing the population", () => {
  // Asserted against the source, in the shape of the guard that has already caught a real defect
  // here once. `--only-signalled` is named in ADR 0008 and in the plan as the back door; the point is
  // that it must not exist, not that it is documented as unwise.
  const src = readFileSync(path.join(ROOT, "scripts/portfolio.mjs"), "utf8");
  // Comments are stripped: naming the prohibition in prose is the point, implementing it is the
  // defect. The same distinction the ratchet's write-path guard makes.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["--only-signalled", "--hide", "--filter", "--summary-only", "--limit", "--failed-only"]) {
    assert.ok(!code.includes(forbidden), `scripts/portfolio.mjs implements "${forbidden}"`);
  }
  assert.ok(parseArgs(["--scope-registry=r.json", "--baseline=b.json", "--only-signalled"]).error);

  // ...and `--require-reviewed` is the shape a flag IS allowed to have: strictly stricter.
  assert.equal(parseArgs(["--scope-registry=r.json", "--baseline=b.json", "--require-reviewed"]).args.requireReviewed, true);
});

test("cli · a run with no baseline is refused rather than run without the ratchet", () => {
  assert.match(parseArgs(["--scope-registry=r.json"]).error, /baseline/);
  assert.match(parseArgs(["--baseline=b.json"]).error, /registry/);
  assert.ok(parseArgs(["--scope-registry=r.json", "--baseline=b.json"]).args);
});

test("cli · locating a checkout can make a cell resolve further, never make one pass", () => {
  scratch((dir) => {
    const locate = defaultLocator({ reposRoot: dir });
    assert.equal(locate({ name: "acme/nothing-here", localPath: null }), null);
    mkdirSync(path.join(dir, "present"));
    assert.equal(locate({ name: "acme/present", localPath: null }), path.join(dir, "present"));
    assert.equal(locate({ name: null, localPath: path.join(dir, "present") }), path.join(dir, "present"));
    assert.equal(locate({ name: null, localPath: path.join(dir, "gone") }), null);
  });
});
