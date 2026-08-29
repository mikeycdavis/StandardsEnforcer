// CAUGHT specimen, ST-16. Found as an escape by round sixteen, closed by round seventeen; kept
// here so the closure is a regression test rather than a claim.
//
// `o.c = chk` binds a carrier to a MEMBER PATH. CLOSED in round seventeen by admitting member
// assignment as a binder and attributing the LAST SEGMENT, which is the name the call site writes.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk = (f) => assert.ok(f.length > 3);
const o = {};
o.c = chk;
const files = readdirSync("cases");
for (const f of files) o.c(f);
