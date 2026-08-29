// CAUGHT specimen, ST-16. Found as an escape by round sixteen, closed by round seventeen; kept
// here so the closure is a regression test rather than a claim.
//
// `Array.prototype.forEach.call(files, chk)` moves the subject out of the receiver and into the
// first ARGUMENT. CLOSED in round seventeen by a borrowed-iteration rule: `call` and `apply` are the
// only two ways a method is invoked on a receiver it was not reached through.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk = (f) => assert.ok(f.length > 3);
const files = readdirSync("cases");
Array.prototype.forEach.call(files, chk);
