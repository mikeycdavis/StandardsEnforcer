// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// FLOW. The checker value reaches a name this analysis does not follow.
//
// `mk()` returns an OBJECT holding the checker rather than the checker. The flow gate asks whether
// the callee hands back a function, and this hands back a container of one.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const mk=()=>({chk:(f)=>assert.ok(f.length>3)});
const h=mk();
const files = readdirSync("cases");
for (const f of files) h.chk(f);
