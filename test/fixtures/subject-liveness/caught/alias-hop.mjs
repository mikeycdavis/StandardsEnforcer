// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// `const chk = mid` -- a bare alias. CLOSED in round fifteen: an expression carries unless every
// mention of a carrier is a call whose result is data, and a bare mention is not a call at all.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const make = () => (f) => assert.ok(f.length > 3);
const mid = make();
const chk = mid;
const files = readdirSync("cases");
for (const f of files) chk(f);
