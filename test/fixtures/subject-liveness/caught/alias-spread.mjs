// CAUGHT specimen, ST-16. Found as an escape by round fourteen, closed by round fifteen; kept here
// so the closure is a regression test rather than a claim.
//
// `const all = [...base]` derives a collection from one holding a checker. CLOSED in round fifteen:
// `base` is mentioned as a value, so `all` carries and its loop variable carries after it.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const base = [(f) => assert.ok(f.length > 3)];
const all = [...base];
const files = readdirSync("cases");
for (const f of files) for (const c of all) c(f);
