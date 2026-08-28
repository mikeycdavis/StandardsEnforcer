/**
 * ST-15 FALSIFIER. A guard that certifies a property while examining nothing.
 *
 * This file is the specimen the liveness mechanism must redden. It is committed deliberately and
 * temporarily: an acceptance criterion that says "prove the suite accepts it" is not satisfied by a
 * probe nobody can re-run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("probe · no source file contains a forbidden marker", async () => {
  const files = [];                       // populated by nothing
  const offenders = [];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    if (src.includes("FORBIDDEN_MARKER")) offenders.push(f);
  }
  assert.deepEqual(offenders, []);        // vacuously true, forever
});
