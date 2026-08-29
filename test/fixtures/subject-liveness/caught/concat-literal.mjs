// CAUGHT specimen, ST-16. Found as an escape by round sixteen, closed by round seventeen; kept
// here so the closure is a regression test rather than a claim.
//
// `[].concat(files)` -- CLOSED in round seventeen by letting a subject begin with an ARRAY
// LITERAL receiver. A literal WITH elements is still proven live, so `for (const x of [1, 2])` is
// not reddened; that control is asserted in the suite.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
for (const f of [].concat(files)) assert.ok(f.length > 3);
