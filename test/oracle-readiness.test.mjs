/**
 * ST-22 — the `oracle-readiness` stage must not report `ok` for a property it never examined.
 *
 * `for tag in $ORACLE_TAGS; do …; done; done_stage` over an empty list ran no iteration and printed
 * `ok`. The stage is exercised here as written in ci/checks.sh, not restated: its text is cut out of
 * the script between its own two markers and run under bash, with the working directory a scratch
 * directory whose `test-support/oracle.mjs` exports the tag list the case needs (the stage reads
 * that file from the current directory, so no test seam was added to the script).
 *
 * The liveness case matters as much as the failure case: a harness that could not run the stage would
 * also "see" a non-ok outcome, so the stage is shown to be able to PASS first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readSource } from "../test-support/source-scan.mjs";

const START = 'stage "oracle-readiness"';
const END = "# --- credential hygiene";

async function stageText() {
  const src = await readSource(new URL("../ci/checks.sh", import.meta.url));
  const start = src.indexOf(START);
  const end = src.indexOf(END, start);
  assert.ok(start > 0 && end > start, "the oracle-readiness stage could not be located in ci/checks.sh");
  return src.slice(start, end);
}

function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
    cwd, encoding: "utf8",
  });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
}

async function runStage({ tags, requireOracle }) {
  const work = await mkdtemp(path.join(tmpdir(), "se-readiness-"));
  try {
    const oracle = path.join(work, "oracle");
    await mkdir(oracle);
    git(oracle, "init", "-q");
    git(oracle, "commit", "-q", "--allow-empty", "-m", "x");
    git(oracle, "tag", "v1.0.0");
    await mkdir(path.join(work, "test-support"));
    await writeFile(path.join(work, "test-support", "oracle.mjs"),
      `export const ORACLE_TAGS = ${JSON.stringify(tags)};\n`);
    const script = [
      "set -Eeuo pipefail",
      "say()  { printf '%s\\n' \"$*\"; }",
      "stage() { CURRENT=\"$1\"; say \"CHECK  $1\"; }",
      "done_stage() { say \"   ok  $CURRENT\"; }",
      'FAILED_STAGE=""',
      `ORACLE=${JSON.stringify(oracle.replaceAll("\\", "/"))}`,
      await stageText(),
    ].join("\n");
    // MSYS_NO_PATHCONV: under Git Bash the "/test-support/…" literal inside `node -e` would be
    // rewritten to a Windows path; it is a no-op on the Linux CI runner.
    const env = { ...process.env, MSYS_NO_PATHCONV: "1" };
    delete env.ENFORCER_REQUIRE_ORACLE;
    if (requireOracle) env.ENFORCER_REQUIRE_ORACLE = "1";
    const r = spawnSync("bash", ["-c", script], { cwd: work, encoding: "utf8", env });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

test("oracle-readiness · the stage can pass: a resolvable pinned tag reports ok", async () => {
  const r = await runStage({ tags: ["v1.0.0"], requireOracle: true });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /v1\.0\.0 -> [0-9a-f]{40}/u, "the tag must be resolved, so the loop really ran");
  assert.match(r.out, /ok {2}oracle-readiness/u);
});

test("oracle-readiness · a tag the oracle cannot resolve still fails", async () => {
  const r = await runStage({ tags: ["v9.9.9"], requireOracle: true });
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /does not resolve v9\.9\.9/u);
  assert.doesNotMatch(r.out, /ok {2}oracle-readiness/u);
});

for (const requireOracle of [true, false]) {
  test(`oracle-readiness · an empty ORACLE_TAGS fails and is never ok (ENFORCER_REQUIRE_ORACLE ${requireOracle ? "=1" : "unset"})`, async () => {
    const r = await runStage({ tags: [], requireOracle });
    assert.notEqual(r.status, 0, `an empty tag list must not pass:\n${r.out}`);
    assert.match(r.out, /ORACLE_TAGS is empty/u, "the failure must say why");
    assert.doesNotMatch(r.out, /ok {2}oracle-readiness/u, "the stage must not report ok having examined nothing");
  });
}

test("oracle-readiness · both CI routes set the requirement (ST-22 criterion 3)", async () => {
  const yml = await readSource(new URL("../compose.ci.yml", import.meta.url));
  assert.match(yml, /^\s*ENFORCER_REQUIRE_ORACLE:\s*"1"/mu);
  const wf = await readSource(new URL("../.github/workflows/ci.yml", import.meta.url));
  assert.match(wf.slice(wf.indexOf("Run the authoritative check list")), /^\s*ENFORCER_REQUIRE_ORACLE:\s*'1'/mu);
});
