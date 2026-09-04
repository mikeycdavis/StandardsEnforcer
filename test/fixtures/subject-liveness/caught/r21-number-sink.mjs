// CAUGHT, ST-16. Written for adversarial round twenty-one, against the parser-backed mechanism
// (ADR 0010) and run before that round modified anything. The round found 1 of 20;
// what it closed: a bare `switch (files.length)` whose empty case is the pass.
//
// Kept as a regression test whether it escaped or not: a round is measured by what it found,
// and a specimen that never escaped is the evidence that it did not.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
assert.equal(Number(files.filter((f) => f.length <= 3).length), 0);
