// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// FLOW. The checker value reaches a name this analysis does not follow.
//
// `reg["c"] = chk` assigns through a COMPUTED key. Round seventeen admitted `o.c =` by binding
// the last segment; a subscript has no segment to bind.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const reg={};
reg["c"]=(f)=>assert.ok(f.length>3);
const files = readdirSync("cases");
for (const f of files) reg["c"](f);
