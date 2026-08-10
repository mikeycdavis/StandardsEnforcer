/**
 * Release discipline, executable.
 *
 * `VERSION` said `0.2.0` while `package.json` said `0.3.0`, through two milestones, because nothing
 * asserted otherwise and neither is read by the code at run time. A version nobody checks is a
 * version that drifts.
 *
 * NOTE WHAT IS DELIBERATELY NOT ASSERTED. `SCHEMA_VERSION` is not required to equal either of them.
 * It names the result envelope's shape, which is a different lifecycle: a release may change
 * behaviour without changing what it prints, and the printed shape may change without a behavioural
 * release. Today all three read `0.4.0` because the envelope genuinely did change — that is
 * agreement, not synchronisation. Freezing an equality invariant over a coincidence would force a
 * meaningless envelope bump on the first release that only changes behaviour.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION } from "../scripts/enforce.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = fs.readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");

test("VERSION and package.json name the same release", () => {
  assert.equal(pkg.version, version, "these name one thing and must not drift");
});

test("the release is a semantic version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/u);
});

test("the changelog has an entry for the current release", () => {
  assert.ok(
    changelog.includes(`## ${version} —`),
    `CHANGELOG.md has no entry for ${version}. A release nobody described is a release nobody can adopt.`,
  );
});

test("the changelog states the pre-1.0 versioning policy", () => {
  // The thing whose absence let 0.2.0 and 0.3.0 coexist.
  assert.match(changelog, /while below 1\.0\.0/iu);
  assert.match(changelog, /MAY contain breaking public-contract changes/u);
});

test("SCHEMA_VERSION is a version, and is not required to equal the release", () => {
  assert.match(SCHEMA_VERSION, /^\d+\.\d+\.\d+$/u);
  // Intentionally no equality assertion. See this file's header.
});
