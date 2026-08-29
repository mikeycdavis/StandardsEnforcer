// CAUGHT specimen, ST-16. Found as an escape by round twelve, closed by round thirteen; kept here
// so the closure is a regression test rather than a claim.
//
// A helper returned by a factory. CLOSED in round thirteen by the flow edge for a call whose
// callee HANDS BACK a function. That gate is the whole reason the edge is safe: `make()` returns a
// checker, `statesTable()` returns rows, and "mentions a carrier" cannot tell them apart.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const make = () => (f) => assert.ok(f.length > 3, "bad");
const chk = make();
const files = readdirSync("cases");
for (const f of files) chk(f);
