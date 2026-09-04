// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// FLOW. The checker value reaches a name this analysis does not follow.
//
// `[a, b] = [b, a]` is a destructuring ASSIGNMENT with no declaration keyword, so the pattern
// binder -- which keys on const/let/var -- does not see it.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
let a=(f)=>assert.ok(f.length>3);
let b=null;
[a,b]=[b,a];
const files = readdirSync("cases");
for (const f of files) b(f);
