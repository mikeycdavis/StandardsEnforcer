/**
 * The oracle checkout must not leave its credential where the pull request can read it.
 *
 * THE FAILURE THIS GUARDS. The hosted workflow fetches a private standards oracle with a token and
 * then runs `npm test` — code the pull request wrote. With `persist-credentials` at its default, the
 * credential is in the checkout's git configuration while that code runs.
 *
 * THE ASSERTION IS ABOUT THE MECHANISM, NOT ABOUT A STRING. The obvious test — "the config does not
 * contain the token" — passes on a compromised checkout, because `actions/checkout` stores
 * `AUTHORIZATION: basic <base64>` rather than the token itself. So the known-positive case below
 * writes the real thing with real `git config` and requires the detector to catch it. If the
 * detector is ever weakened to a substring search, that case goes red.
 *
 * Known-positive and known-negative both, because a detector that never fires and a detector that
 * always fires are equally useless and look identical from a green suite.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspect, findingsIn, decideStage, HYGIENE, MECHANISM, REASON, STAGE, SUBJECT } from "../ci/credential-hygiene.mjs";
import { readSource } from "../test-support/source-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

async function scratchRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-credhygiene-"));
  try {
    assert.equal(git(["init", "-q"], dir).status, 0, "the fixture repository must initialise");
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- Known-negative: an ordinary checkout ----------------------------------------------------

test("hygiene · a checkout with no credential configuration is clean", async () => {
  await scratchRepo(async (dir) => {
    git(["remote", "add", "origin", "https://github.com/owner/repo.git"], dir);
    const r = inspect(dir);
    assert.equal(r.state, HYGIENE.CLEAN);
    assert.deepEqual(r.findings, []);
  });
});

test("hygiene · an scp-style ssh remote is not a credential", async () => {
  // `git@github.com:owner/repo` contains an `@` and is not userinfo. A naive check fires here, and
  // a detector that fires on every ordinary ssh remote gets deleted rather than fixed.
  await scratchRepo(async (dir) => {
    git(["remote", "add", "origin", "git@github.com:owner/repo.git"], dir);
    assert.equal(inspect(dir).state, HYGIENE.CLEAN);
  });
});

// --- Known-positive: exactly what actions/checkout persists ------------------------------------

test("hygiene · the extraheader actions/checkout writes is caught, though the token never appears", async () => {
  await scratchRepo(async (dir) => {
    const token = "ghp_thisIsNotARealTokenJustAFixtureValue00";
    const encoded = Buffer.from(`x-access-token:${token}`).toString("base64");
    // The real mechanism, written by real git, exactly as the action writes it.
    assert.equal(
      git(["config", "--local", "http.https://github.com/.extraheader", `AUTHORIZATION: basic ${encoded}`], dir).status,
      0,
    );

    const r = inspect(dir);
    assert.equal(r.state, HYGIENE.PERSISTED);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].mechanism, MECHANISM.EXTRAHEADER);

    // The point of the whole file: the secret is genuinely not in the stored bytes, so a substring
    // search for it would have reported this compromised checkout as clean.
    const stored = await readFile(path.join(dir, ".git", "config"), "utf8");
    assert.ok(!stored.includes(token), "the fixture must not store the literal token, or it proves nothing");
    assert.ok(stored.includes(encoded), "the fixture must store the encoded credential");
  });
});

test("hygiene · a remote URL carrying userinfo is caught", async () => {
  await scratchRepo(async (dir) => {
    git(["remote", "add", "origin", "https://x-access-token:ghp_fixture@github.com/owner/repo.git"], dir);
    const r = inspect(dir);
    assert.equal(r.state, HYGIENE.PERSISTED);
    assert.equal(r.findings[0].mechanism, MECHANISM.URL_USERINFO);
  });
});

test("hygiene · a repository-local credential helper is caught", async () => {
  await scratchRepo(async (dir) => {
    assert.equal(git(["config", "--local", "credential.helper", "store"], dir).status, 0);
    const r = inspect(dir);
    assert.equal(r.state, HYGIENE.PERSISTED);
    assert.equal(r.findings[0].mechanism, MECHANISM.CREDENTIAL_HELPER);
  });
});

// --- Unknown is not clean ----------------------------------------------------------------------

test("hygiene · a directory that is not a repository is UNREADABLE, never CLEAN", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-credhygiene-plain-"));
  try {
    const r = inspect(dir);
    assert.equal(r.state, HYGIENE.UNREADABLE);
    assert.notEqual(r.state, HYGIENE.CLEAN,
      "an unanswerable question must not resolve in the permissive direction (INV-E1)");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hygiene · an absent path is UNREADABLE", () => {
  assert.equal(inspect(path.join(tmpdir(), "enforcer-credhygiene-does-not-exist")).state, HYGIENE.UNREADABLE);
});

// --- The parser, against recorded shapes -------------------------------------------------------

test("hygiene · the key shape is matched for any host, not a known list", () => {
  const f = findingsIn("http.https://ghe.example.com/.extraheader=AUTHORIZATION: basic AAAA\n");
  assert.equal(f.length, 1);
  assert.equal(f[0].mechanism, MECHANISM.EXTRAHEADER);
});

test("hygiene · ordinary configuration produces no findings", () => {
  assert.deepEqual(
    findingsIn("core.repositoryformatversion=0\nremote.origin.url=https://github.com/owner/repo.git\nbranch.main.remote=origin\n"),
    [],
  );
});

// --- What the STAGE established, which is not what a checkout is -------------------------------
//
// The stage's first implementation discovered its subjects by looking for `.git`, found neither in
// the container, and completed successfully. Nothing was skipped and nothing was asserted, so the
// pipeline reported a credential-hygiene stage as passed in the one environment where the property
// could not possibly have been exercised. These cases exist because that is unobservable from a
// green suite — the same reason ST-11 exists.
//
// The interesting direction is the hosted one, which cannot be reproduced on this machine: there is
// no runner here and no token. `decideStage` is therefore pure and driven with recorded subject
// shapes, so both directions are testable without either.

const subject = (name, state, reason = null) => ({ name, dir: `/fixture/${name}`, state, reason });
const clean = (name) => subject(name, HYGIENE.CLEAN);

test("stage · required and every named subject clean is the only way to ESTABLISHED", () => {
  const d = decideStage({ required: true, subjects: [clean(SUBJECT.WORKSPACE), clean(SUBJECT.ORACLE)] });
  assert.equal(d.outcome, STAGE.ESTABLISHED);
});

test("stage · the defect itself: required, with nothing to inspect, is FAILED and not a pass", () => {
  // Verbatim reproduction of what the container produced — an empty subject list — under the
  // requirement. The shipped stage turned this into `done_stage`.
  const d = decideStage({ required: true, subjects: [] });
  assert.equal(d.outcome, STAGE.FAILED);
  assert.notEqual(d.outcome, STAGE.ESTABLISHED,
    "a stage with no subjects has established nothing, and must never report otherwise");
  assert.match(d.why, /was not among the inspected subjects/u);
});

test("stage · a required subject that leaves the observation set is FAILED, not silently narrowed", () => {
  // The future this guards: a workflow change stops cloning `.oracle`, the credential-bearing
  // subject disappears, and a stage that asked "did at least one checkout look clean?" still passes.
  const d = decideStage({ required: true, subjects: [clean(SUBJECT.WORKSPACE)] });
  assert.equal(d.outcome, STAGE.FAILED);
  assert.match(d.why, new RegExp(SUBJECT.ORACLE, "u"));
});

test("stage · a required subject that is present but not a checkout is FAILED", () => {
  const d = decideStage({
    required: true,
    subjects: [clean(SUBJECT.WORKSPACE), subject(SUBJECT.ORACLE, HYGIENE.UNREADABLE, REASON.NOT_A_REPOSITORY)],
  });
  assert.equal(d.outcome, STAGE.FAILED, "an uninspectable required subject is not a clean one (INV-E1)");
});

test("stage · a required subject retaining a credential is FAILED", () => {
  const d = decideStage({
    required: true,
    subjects: [clean(SUBJECT.WORKSPACE), subject(SUBJECT.ORACLE, HYGIENE.PERSISTED)],
  });
  assert.equal(d.outcome, STAGE.FAILED);
});

test("stage · unclaimed, with no checkout at all, is NOT_EXERCISED — never ESTABLISHED", () => {
  // Local container CI. The honest answer, and the whole point: it says what it did not do.
  const d = decideStage({
    required: false,
    subjects: [
      subject(SUBJECT.WORKSPACE, HYGIENE.UNREADABLE, REASON.NOT_A_REPOSITORY),
      subject(SUBJECT.ORACLE, HYGIENE.UNREADABLE, REASON.ABSENT),
    ],
  });
  assert.equal(d.outcome, STAGE.NOT_EXERCISED);
  assert.notEqual(d.outcome, STAGE.ESTABLISHED,
    "local absence of a credential must never be reported as the hosted property holding");
});

test("stage · unclaimed does not mean unexamined: a real persisted credential is still FAILED", () => {
  const d = decideStage({ required: false, subjects: [subject(SUBJECT.WORKSPACE, HYGIENE.PERSISTED)] });
  assert.equal(d.outcome, STAGE.FAILED,
    "a checkout retaining a credential beside the code under test is the exposure regardless of what the environment claimed");
});

test("stage · unclaimed, with clean checkouts, still does not claim the hosted property", () => {
  const d = decideStage({ required: false, subjects: [clean(SUBJECT.WORKSPACE)] });
  assert.equal(d.outcome, STAGE.NOT_EXERCISED);
  assert.match(d.why, /no checkout here was handed a credential/u);
});

// --- The executable itself, because a decision nothing invokes decides nothing ------------------

const runCli = (args, cwd) =>
  spawnSync(process.execPath, [path.join(ROOT, "ci/credential-hygiene.mjs"), ...args], {
    encoding: "utf8", cwd, windowsHide: true,
  });

test("cli · under the requirement, a missing oracle checkout exits non-zero", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-credhygiene-cli-"));
  try {
    assert.equal(git(["init", "-q"], dir).status, 0);
    const r = runCli([
      "--require",
      `${SUBJECT.WORKSPACE}=${dir}`,
      `${SUBJECT.ORACLE}=${path.join(dir, ".oracle")}`,
    ], dir);
    assert.notEqual(r.status, 0,
      "the workspace being clean must not carry the stage while the credential-bearing subject is absent");
    assert.match(r.stdout, new RegExp(`credential-hygiene: ${STAGE.FAILED}`, "u"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli · with no requirement and no checkout, it exits zero and writes NOT_EXERCISED", async () => {
  // The local container's exact situation. Exit zero — but the outcome it records is not a pass.
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-credhygiene-cli-local-"));
  try {
    const outcomeFile = path.join(dir, "outcome");
    const r = runCli([
      `--outcome-file=${outcomeFile}`,
      `${SUBJECT.WORKSPACE}=${dir}`,
      `${SUBJECT.ORACLE}=${path.join(dir, ".oracle")}`,
    ], dir);
    assert.equal(r.status, 0);
    const written = await readFile(outcomeFile, "utf8");
    assert.equal(written.split("\n")[0], STAGE.NOT_EXERCISED,
      "the outcome ci/checks.sh reads must say the property was not exercised here");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cli · under the requirement, a persisted credential exits non-zero", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "enforcer-credhygiene-cli-dirty-"));
  try {
    const oracle = path.join(dir, ".oracle");
    for (const d of [dir, oracle]) {
      await mkdir(d, { recursive: true });
      assert.equal(git(["init", "-q"], d).status, 0);
    }
    const encoded = Buffer.from("x-access-token:ghp_fixtureValue").toString("base64");
    assert.equal(
      git(["config", "--local", "http.https://github.com/.extraheader", `AUTHORIZATION: basic ${encoded}`], oracle).status,
      0,
    );
    const r = runCli([
      "--require",
      `${SUBJECT.WORKSPACE}=${dir}`,
      `${SUBJECT.ORACLE}=${oracle}`,
    ], dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /PERSISTED/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- The check list, so the requirement cannot be satisfied by an empty observation set ---------
//
// Source-scanning, and therefore written to the ST-11 pattern: normalise, locate, assert located,
// assert the located region is the intended one, and only then assert about its contents. A guard
// that silently matched nothing here would be this file's own subject matter.

async function checkList() {
  const src = await readSource(new URL("../ci/checks.sh", import.meta.url));
  const start = src.indexOf('stage "credential-hygiene"');
  assert.ok(start > 0, "the credential-hygiene stage could not be located in ci/checks.sh");
  const end = src.indexOf('stage "test-suite"', start);
  assert.ok(end > start,
    "the test-suite stage does not follow credential-hygiene in ci/checks.sh — the credential must be " +
    "established before the code under test runs, or it establishes nothing");
  const region = src.slice(start, end);
  assert.ok(region.includes("credential-hygiene.mjs"),
    "the located region does not invoke the hygiene module, so the assertions below would prove nothing");
  return { src, region };
}

test("checks · the stage names both credential-bearing subjects unconditionally", async () => {
  const { region } = await checkList();
  for (const name of [SUBJECT.WORKSPACE, SUBJECT.ORACLE]) {
    assert.ok(region.includes(`${name}=`),
      `ci/checks.sh must pass ${name} as a named subject on every run. Building the subject list from ` +
      `which directories happen to exist is what let the stage complete with nothing to inspect.`);
  }
});

test("checks · the requirement, and only the requirement, turns on --require", async () => {
  const { region } = await checkList();
  assert.match(region, /ENFORCER_REQUIRE_CREDENTIAL_HYGIENE/u,
    "the stage must consult the environment's capability claim");
  assert.match(region, /--require/u);
});

test("checks · the stage outcome reaches the result document rather than only the log", async () => {
  const { src } = await checkList();
  assert.match(src, /"credentialHygiene":/u,
    "latest.json must record what the stage established; a reader cannot otherwise tell a hosted run " +
    "that proved the property from a local run that could not have");
});

test("workflow · hosted CI declares that it holds a checkout credential", async () => {
  const yml = await readSource(new URL("../.github/workflows/ci.yml", import.meta.url));
  const step = yml.slice(yml.indexOf("Run the authoritative check list"));
  assert.ok(step.length > 0 && step.includes("ci/checks.sh"),
    "the step that runs the check list could not be located in ci.yml");
  assert.match(step, /ENFORCER_REQUIRE_CREDENTIAL_HYGIENE:\s*'1'/u,
    "the hosted job obtains the oracle with a token, so it must require credential hygiene to be " +
    "established rather than merely attempted");
});

// --- The workflow itself -----------------------------------------------------------------------

/**
 * Collect the live (uncommented) `actions/checkout` steps and the lines belonging to each.
 *
 * Line-based rather than a regex over the whole document: a pattern that tries to bracket a YAML
 * step ends up matching a fragment and asserting against the wrong text, which is how a guard
 * passes while the file is wrong. A step ends at the next line indented no further than its own
 * `-`, which is all the YAML this needs to know.
 */
function checkoutSteps(yml) {
  const lines = yml.split(/\r?\n/);
  const steps = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) continue;
    if (!/uses:\s*actions\/checkout@/.test(line)) continue;
    // Walk back to the `-` that opens this step, so a `name:`-first step is bracketed correctly.
    let start = i;
    while (start > 0 && !lines[start].trim().startsWith("- ")) start--;
    const indent = lines[start].search(/\S/);
    const body = [lines[start]];
    for (let j = start + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() && l.search(/\S/) <= indent) break;
      body.push(l);
    }
    steps.push(body.join("\n"));
  }
  return steps;
}

test("workflow · every checkout in hosted CI disables credential persistence", async () => {
  const yml = await readFile(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const steps = checkoutSteps(yml);
  assert.ok(steps.length >= 2, `expected the workspace and oracle checkouts; found ${steps.length}`);
  for (const step of steps) {
    assert.match(step, /persist-credentials:\s*false/,
      `a checkout in ci.yml does not set persist-credentials: false:\n${step}`);
  }
});

test("workflow · the job declares least-privilege permissions", async () => {
  const yml = await readFile(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /^permissions:\s*\n\s+contents:\s*read\s*$/m,
    "ci.yml must declare contents: read rather than inheriting the repository default");
});

// --- Mutation: the guard must be able to fail ---------------------------------------------------

test("mutation · removing persist-credentials from the workflow fails the workflow assertion", async () => {
  const file = path.join(ROOT, ".github/workflows/ci.yml");
  const original = await readFile(file, "utf8");
  const mutated = original.replace(/\n\s+persist-credentials:\s*false/, "");
  assert.notEqual(mutated, original, "the mutation must actually change the file, or it proves nothing");
  try {
    await writeFile(file, mutated);
    const steps = checkoutSteps(await readFile(file, "utf8"));
    assert.ok(steps.some((s) => !/persist-credentials:\s*false/.test(s)),
      "with the line removed, at least one checkout must be detectably unguarded");
  } finally {
    await writeFile(file, original);
  }
  assert.equal(await readFile(file, "utf8"), original, "the file must be restored exactly");
});
