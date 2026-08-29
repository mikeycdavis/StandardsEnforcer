// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// `o.chk.bind(o)`. CLOSED in round fifteen: `o` appears as a RECEIVER, not a callee, so the
// returns-a-function gate is never consulted and the default carry applies.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const o = { chk(f) { assert.ok(f.length > 3); } };
const b = o.chk.bind(o);
const files = readdirSync("cases");
for (const f of files) b(f);
