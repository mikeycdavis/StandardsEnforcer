// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// The checker is an ARGUMENT, called through the parameter name. CLOSED in round fifteen by the
// argument edge: a parameter that receives a carrier at any call site carries it. The offender is
// `xs`, the parameter the collection lands in, which is the honest subject here.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk = (f) => assert.ok(f.length > 3);
const run = (xs, fn) => { for (const f of xs) fn(f); };
const files = readdirSync("cases");
run(files, chk);
