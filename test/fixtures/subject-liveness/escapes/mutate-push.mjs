// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// FLOW. The checker value reaches a name this analysis does not follow.
//
// `cs.push(chk)` -- the same fault as add: the collection is bound empty and filled afterwards.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk=(f)=>assert.ok(f.length>3);
const cs=[];
cs.push(chk);
const files = readdirSync("cases");
for (const f of files) cs[0](f);
