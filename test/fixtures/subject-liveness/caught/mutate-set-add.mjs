// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// FLOW. The checker value reaches a name this analysis does not follow.
//
// `s.add(chk)` puts the checker into a container by MUTATION. Binding is what this analysis
// follows, and a mutation is not a binding -- `s` was already bound, to an empty Set.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk=(f)=>assert.ok(f.length>3);
const s=new Set();
s.add(chk);
const files = readdirSync("cases");
for (const f of files) for (const c of s) c(f);
