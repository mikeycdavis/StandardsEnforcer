// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// The alias is chosen by a ternary. CLOSED in round fifteen -- the branches mention the carrier in
// value position, and value position is the default-carry case.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const a = (f) => assert.ok(f.length > 3);
const chk = 1 > 0 ? a : a;
const files = readdirSync("cases");
for (const f of files) chk(f);
