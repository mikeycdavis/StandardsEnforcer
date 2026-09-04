// CAUGHT, ST-16. Written for adversarial round twenty-three, against the parser-backed mechanism
// (ADR 0010) and run before that round modified anything. The round found 4 of 20;
// what it closed: a string-keyed method call, a detached method, an index destructure through an object pattern, and a derivation returned from a getter.
//
// Kept as a regression test whether it escaped or not: a round is measured by what it found,
// and a specimen that never escaped is the evidence that it did not.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const chk = (f) => assert.ok(f.length > 3);
files["forEach"](chk);
