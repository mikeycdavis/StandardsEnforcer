/**
 * The native status vocabulary is open, and passing is the pack's word rather than the enforcer's.
 *
 * Phase 3 removed five pack-native statuses from `states.mjs`. That is easy to do cosmetically —
 * move the strings to a constant somewhere else and nothing has really changed. These tests are the
 * check that it was done properly, and they are deliberately built on vocabulary no pack uses.
 *
 * If BANANA and PINEAPPLE work without a line of enforcer source changing, the vocabulary is
 * genuinely open. If they need anything added anywhere, it was never open — today's five strings had
 * simply been moved.
 *
 * The second pair is sharper. Two packs declare the SAME two words and disagree about which one
 * passes. Nothing in the enforcer may infer meaning from spelling, even for a token it has already
 * seen decided the other way in the same test run.
 *
 * These use synthetic packs rather than real ones on purpose: a real pack could pass by coincidence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { enforce } from "../scripts/enforce.mjs";
import { STATE, EXIT, exitFor } from "../scripts/states.mjs";

const CACHE = path.join(tmpdir(), "enforcer-open-vocab-cache");

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * A standards pack that exists only for this test: a real git repository, a real tag, a real
 * evaluator, and a contract declaring whatever vocabulary the caller wants.
 *
 * The evaluator echoes the target it was given, so a test can prove substitution happened rather
 * than assuming it.
 */
async function syntheticPack({ id, statuses, passing, emits }) {
  const dir = await mkdtemp(path.join(tmpdir(), `pack-${id}-`));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(
    path.join(dir, "standards-adapter.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      standard: { id },
      evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["judge", "--dir={target}", "--json"] },
      result: { statuses, passing },
    }),
  );
  await writeFile(
    path.join(dir, "scripts", "standards.mjs"),
    `const dir = process.argv.find((a) => a.startsWith("--dir="))?.slice(6) ?? null;\n` +
      `process.stdout.write(JSON.stringify({ status: ${JSON.stringify(emits)}, sawTarget: dir }) + "\\n");\n`,
  );
  git(["init", "-q"], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "t"], dir);
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "synthetic pack"], dir);
  git(["tag", "v1.0.0"], dir);
  return { dir, tag: "v1.0.0", sha: git(["rev-list", "-n", "1", "v1.0.0"], dir) };
}

async function governedTarget() {
  const dir = await mkdtemp(path.join(tmpdir(), "governed-"));
  await writeFile(
    path.join(dir, "project-policy.yml"),
    'standardVersion: "1.0.0"\nproject: "t"\nexceptions: []\n',
  );
  return dir;
}

async function run(packSpec) {
  const pack = await syntheticPack(packSpec);
  const target = await governedTarget();
  try {
    return await enforce({
      target,
      standardsRepo: pack.dir,
      tag: pack.tag,
      sha: pack.sha,
      cacheRoot: CACHE,
    });
  } finally {
    await rm(pack.dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
}

// ---- Vocabulary no pack uses. ----

const FRUIT = { id: "fruit", statuses: ["BANANA", "PINEAPPLE"], passing: ["PINEAPPLE"] };

test("an invented passing status passes, and survives into the payload", async () => {
  const r = await run({ ...FRUIT, emits: "PINEAPPLE" });
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.passing, true);
  assert.equal(r.authority.status, "PINEAPPLE");
  assert.equal(r.report.status, "PINEAPPLE", "the native payload is carried verbatim");
  assert.equal(exitFor(r.state, r.passing), EXIT.OK);
});

test("an invented non-passing status does not pass, and is not called non-compliant", async () => {
  const r = await run({ ...FRUIT, emits: "BANANA" });
  assert.equal(r.state, STATE.EVALUATED);
  assert.equal(r.passing, false);
  assert.equal(r.authority.status, "BANANA");
  assert.equal(exitFor(r.state, r.passing), EXIT.NOT_PASSING);
  // The enforcer has no opinion about what BANANA means, and its own words must not supply one.
  assert.match(r.detail, /BANANA/);
  assert.doesNotMatch(r.detail, /non-compliant|not evaluated|blocked/i);
});

test("a status outside the declared vocabulary fails closed", async () => {
  // Undeclared is unknown, and INV-E1 says an unknown is not a pass — even one that reads well.
  const r = await run({ ...FRUIT, emits: "MANGO" });
  assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
  assert.equal(r.passing, false);
  assert.equal(exitFor(r.state, r.passing), EXIT.NOT_ENFORCEABLE);
  assert.match(r.detail, /its own contract does not declare/);
});

test("the declared argv is substituted and reaches the evaluator", async () => {
  const r = await run({ ...FRUIT, emits: "PINEAPPLE" });
  assert.equal(typeof r.report.sawTarget, "string");
  assert.ok(r.report.sawTarget.length > 0, "the evaluator was invoked without its target");
});

// ---- The same word, decided both ways. ----

const OPTIMIST = { id: "optimist", statuses: ["GOOD", "BAD"], passing: ["GOOD"] };
const CONTRARIAN = { id: "contrarian", statuses: ["GOOD", "BAD"], passing: ["BAD"] };

test("two packs sharing a vocabulary are each read by their own contract", async () => {
  // The strongest statement of the property. GOOD passes for one pack and fails for the other, in
  // the same test run, and the enforcer must not carry an opinion between them.
  const optimistGood = await run({ ...OPTIMIST, emits: "GOOD" });
  const contrarianGood = await run({ ...CONTRARIAN, emits: "GOOD" });
  const optimistBad = await run({ ...OPTIMIST, emits: "BAD" });
  const contrarianBad = await run({ ...CONTRARIAN, emits: "BAD" });

  assert.equal(optimistGood.passing, true);
  assert.equal(contrarianGood.passing, false);
  assert.equal(optimistBad.passing, false);
  assert.equal(contrarianBad.passing, true);

  // Same state, same native status, opposite gate decisions — decided entirely by the contract.
  assert.equal(optimistGood.authority.status, contrarianGood.authority.status);
  assert.equal(optimistGood.state, contrarianGood.state);
  assert.notEqual(optimistGood.passing, contrarianGood.passing);
});

test("no synthetic vocabulary can reach an exit code outside 0, 1 and 4", async () => {
  for (const spec of [
    { ...FRUIT, emits: "PINEAPPLE" },
    { ...FRUIT, emits: "BANANA" },
    { ...FRUIT, emits: "MANGO" },
    { ...CONTRARIAN, emits: "GOOD" },
  ]) {
    const r = await run(spec);
    assert.ok([EXIT.OK, EXIT.NOT_PASSING, EXIT.NOT_ENFORCEABLE].includes(exitFor(r.state, r.passing)));
  }
});

// ---- Provenance, on the same synthetic ground. ----

test("a pinned release with no contract is an integration failure, not a fallback", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-bare-"));
  const target = await governedTarget();
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "scripts", "standards.mjs"), "process.stdout.write('{}');\n");
    git(["init", "-q"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    git(["add", "-A"], dir);
    git(["commit", "-q", "-m", "no contract"], dir);
    git(["tag", "v1.0.0"], dir);
    const r = await enforce({
      target,
      standardsRepo: dir,
      tag: "v1.0.0",
      sha: git(["rev-list", "-n", "1", "v1.0.0"], dir),
      cacheRoot: CACHE,
    });
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(r.passing, false);
    assert.match(r.detail, /standards-adapter\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("a non-conforming contract in a verified release fails closed", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pack-bad-"));
  const target = await governedTarget();
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    // passing names a status outside statuses — the cross-field rule JSON Schema cannot express.
    await writeFile(
      path.join(dir, "standards-adapter.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        standard: { id: "bad" },
        evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["judge", "{target}"] },
        result: { statuses: ["BAD"], passing: ["GOOD"] },
      }),
    );
    await writeFile(path.join(dir, "scripts", "standards.mjs"), 'process.stdout.write(\'{"status":"BAD"}\');\n');
    git(["init", "-q"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "t"], dir);
    git(["add", "-A"], dir);
    git(["commit", "-q", "-m", "bad contract"], dir);
    git(["tag", "v1.0.0"], dir);
    const r = await enforce({
      target,
      standardsRepo: dir,
      tag: "v1.0.0",
      sha: git(["rev-list", "-n", "1", "v1.0.0"], dir),
      cacheRoot: CACHE,
    });
    assert.equal(r.state, STATE.ENFORCEMENT_ERROR);
    assert.equal(r.passing, false);
    assert.match(r.detail, /not in \$\.result\.statuses/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});
