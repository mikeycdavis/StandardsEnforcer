// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// `m.get("len")` retrieves the checker from a Map. CLOSED in round fifteen for the same reason as
// bind: the carrier `m` is a receiver, and only a CALLEE can be ruled out as data.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const m = new Map([["len", (f) => assert.ok(f.length > 3)]]);
const g = m.get("len");
const files = readdirSync("cases");
for (const f of files) g(f);
