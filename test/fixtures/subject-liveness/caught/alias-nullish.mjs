// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// `chk ??= ...` binds with no declaration keyword. CLOSED in round fifteen by admitting logical
// assignment as a binder, so the function body finally has a name to be attributed to.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
let chk;
chk ??= (f) => assert.ok(f.length > 3);
const files = readdirSync("cases");
for (const f of files) chk(f);
