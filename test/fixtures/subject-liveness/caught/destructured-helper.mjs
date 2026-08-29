// CAUGHT specimen, ST-16. Found as an escape by round twelve, closed by round thirteen; kept here
// so the closure is a regression test rather than a claim.
//
// A helper taken out of an array by destructuring: the binding is a PATTERN, so no name is
// the initialiser of the function. CLOSED in round thirteen by binding pattern names to the extent of
// the initialiser they came out of, so containment decides which of them carry.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const [check] = [(f) => assert.ok(f.length > 3, "bad")];
const files = readdirSync("cases");
for (const f of files) check(f);
