#!/usr/bin/env node
/**
 * ST-13. This repository's test surface, stated rather than discovered.
 *
 * WHY THIS FILE EXISTS. `npm test` was `node --test` with no path. That delegates the choice of
 * what runs to the runtime's discovery rules, applied to whatever happens to be sitting under the
 * repository root. On a hosted run the oracle is checked out at `.oracle`, and Node 20 — the
 * version CI pins — discovers test files inside dot-directories. MachineLearningStandards' whole
 * suite therefore ran as part of this repository's authoritative run and was reported in one
 * number with it. A green covering a population this repository does not own establishes less
 * than it appears to.
 *
 * WHY NOT JUST PASS A PATH. There is no operand form that works on both versions in play:
 *
 *   node --test test/            Node 20: searches the directory.  Node 24: "Cannot find module".
 *   node --test 'test/*.test.mjs'  Node 24: glob.  Node 20: globs unsupported, resolved literally.
 *   node --test test/*.test.mjs  expanded by sh, NOT by cmd.exe — breaks Windows development.
 *
 * Enumerating the files here is the one form that is identical on every Node and every shell, and
 * it is also the more honest one: the surface is a list this repository maintains, not a side
 * effect of a directory walk.
 *
 * DELIBERATELY NOT RECURSIVE. `test/fixtures/` holds inputs, not tests. A test file that needs to
 * live in a subdirectory should change this rule on purpose rather than be picked up by it.
 */

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The only directory this repository runs tests from. */
export const TEST_DIR = "test";

/** What counts as a test file within it. */
export const TEST_FILE = /\.test\.mjs$/u;

/**
 * The repository's test surface, as repo-relative POSIX paths, sorted.
 * Throws rather than returning an empty list: a surface of nothing would run zero tests and
 * report success, which is the failure mode this whole item exists to prevent.
 */
export function testFiles(root) {
  const dir = path.join(root, TEST_DIR);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && TEST_FILE.test(entry.name))
    .map((entry) => `${TEST_DIR}/${entry.name}`)
    .sort();

  if (files.length === 0) {
    throw new Error(
      `no test files matched ${TEST_FILE} in ${dir}. Refusing to run an empty suite, because an ` +
        `empty suite passes.`,
    );
  }
  return files;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const root = process.cwd();
  const passthrough = process.argv.slice(2);
  const result = spawnSync(
    process.execPath,
    ["--test", ...passthrough, ...testFiles(root)],
    { cwd: root, stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
