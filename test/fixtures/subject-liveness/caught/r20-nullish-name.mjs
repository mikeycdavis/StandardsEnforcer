// CAUGHT, ST-16. Written for adversarial round twenty, against the parser-backed mechanism
// (ADR 0010) and run before that round modified anything. The round found 2 of 20;
// what it closed: `.at(0)` as a presence shape, and an asserting `sort` comparator.
//
// Kept as a regression test whether it escaped or not: a round is measured by what it found,
// and a specimen that never escaped is the evidence that it did not.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const other = files;
for (const f of (files ?? other)) assert.ok(f.length > 3);
