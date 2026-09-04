// CAUGHT, ST-16. Written for adversarial round twenty-two, against the parser-backed mechanism
// (ADR 0010) and run before that round modified anything. The round found 4 of 20;
// what it closed: a callback that asserts inside `some`/`find`/`reduceRight`, and an iterator handle advanced outside the loop test.
//
// Kept as a regression test whether it escaped or not: a round is measured by what it found,
// and a specimen that never escaped is the evidence that it did not.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const o = { a: 1 };
const chk = (k) => assert.ok(k.length > 3);
Object.keys(load()).forEach(chk);
function load() { return o; }
