import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testFiles, TEST_DIR } from "../scripts/test-surface.mjs";

/**
 * ST-13. Three properties, pinned separately, because they fail separately.
 *
 *   1. repository-owned tests run
 *   2. tests that merely sit beneath the repository root do not
 *   3. the intentional oracle integration coverage still runs
 *
 * (2) alone is satisfiable by running nothing. (1) alone is satisfiable by running everything.
 * (3) is the FE-14 defect's return path: a narrowing that quietly drops the oracle-dependent
 * tests would look like an improvement and would restore the false green FE-14 closed.
 *
 * NO COUNT IS ASSERTED ANYWHERE HERE. A total passes for the wrong reason the moment either
 * suite changes size, and it never says which files ran.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("surface · the run is enumerated, not discovered", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const script = pkg.scripts?.test;

  assert.ok(script, "package.json must define a `test` script");
  assert.doesNotMatch(
    script,
    /^node\s+--test\s*$/u,
    "`node --test` with no operand delegates the choice of what runs to the runtime's discovery " +
      "rules applied to the working directory. That is the ST-13 defect verbatim.",
  );
  assert.match(
    script,
    /scripts\/test-surface\.mjs/u,
    `the test script must run the enumerated surface; got: ${script}`,
  );
});

test("surface · a foreign suite beneath the root is not in the surface", () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "st13-surface-"));
  try {
    mkdirSync(path.join(sandbox, TEST_DIR), { recursive: true });
    writeFileSync(path.join(sandbox, TEST_DIR, "owned.test.mjs"), "");

    // Two decoys, deliberately different in kind.
    //   `.oracle` is the real contaminant. Node 22+ skips it for the incidental reason that it is
    //   a dot-directory, so on a developer's Node 24 it would look excluded even when it is not.
    //   `vendor` is not hidden, so no Node version excludes it by accident. It is what makes this
    //   test prove the surface was narrowed rather than that dot-directories happen to be ignored.
    for (const dir of [".oracle/test", "vendor/test"]) {
      mkdirSync(path.join(sandbox, dir), { recursive: true });
      writeFileSync(path.join(sandbox, dir, "foreign.test.mjs"), "");
    }

    assert.deepEqual(
      testFiles(sandbox),
      ["test/owned.test.mjs"],
      "the surface must contain the repository's own test files and nothing else",
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("surface · the runner actually runs the surface, and only it", () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "st13-runner-"));
  try {
    mkdirSync(path.join(sandbox, TEST_DIR), { recursive: true });
    writeFileSync(
      path.join(sandbox, TEST_DIR, "owned.test.mjs"),
      'import test from "node:test";\ntest("SANDBOX-OWNED", () => {});\n',
    );
    for (const dir of [".oracle/test", "vendor/test"]) {
      mkdirSync(path.join(sandbox, dir), { recursive: true });
      writeFileSync(
        path.join(sandbox, dir, "foreign.test.mjs"),
        `import test from "node:test";\ntest("SANDBOX-FOREIGN-${dir.split("/")[0]}", () => {});\n`,
      );
    }

    // `NODE_TEST_CONTEXT` is set in this process because we are inside the runner. Inherited, the
    // child refuses to run any file at all — which would make this test pass by producing no
    // output rather than by excluding anything.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;

    const run = spawnSync(process.execPath, [path.join(ROOT, "scripts/test-surface.mjs")], {
      cwd: sandbox,
      encoding: "utf8",
      env,
    });
    const output = `${run.stdout}${run.stderr}`;

    assert.match(output, /SANDBOX-OWNED/u, `the owned test did not run. Output:\n${output}`);
    assert.doesNotMatch(
      output,
      /SANDBOX-FOREIGN-\.oracle/u,
      `a suite checked out at .oracle entered the run. Output:\n${output}`,
    );
    assert.doesNotMatch(
      output,
      /SANDBOX-FOREIGN-vendor/u,
      `a suite vendored beneath the root entered the run. Output:\n${output}`,
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("surface · an empty surface is an error, not a pass", () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "st13-empty-"));
  try {
    mkdirSync(path.join(sandbox, TEST_DIR), { recursive: true });
    assert.throws(
      () => testFiles(sandbox),
      /Refusing to run an empty suite/u,
      "a surface that selects nothing must fail loudly; zero tests otherwise report success",
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("surface · the oracle integration tests are inside the surface", () => {
  // Narrowing until the oracle-dependent tests fall outside the surface would be the FE-14 defect
  // returning by another route. These are the six names FE-14 closed on, verified hosted by name.
  const NAMES = [
    "oracle · MachineLearningStandards under its own v1.4.0 reproduces the recorded verdict",
    "oracle · the enforcer's payload IS the official evaluator's output, not a recomputation",
    "oracle · a non-compliant target reports non-compliant, with the official numbers",
    "oracle · the specimen that found the false green does not pass, and no ML field is consulted",
    "oracle · a run that claims to be authoritative has an authoritative oracle",
    "oracle · the three conditions stay distinguishable",
  ];

  const surface = testFiles(ROOT);
  for (const file of ["test/enforce.test.mjs", "test/oracle-required.test.mjs"]) {
    assert.ok(surface.includes(file), `${file} is not in the test surface`);
  }

  // Each name must still be defined by a file the surface selects — not merely present somewhere
  // in the repository, which would survive the file being dropped from the run.
  const selected = surface
    .map((file) => readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
  for (const name of NAMES) {
    assert.ok(selected.includes(name), `oracle test is no longer in the run: ${name}`);
  }
});
