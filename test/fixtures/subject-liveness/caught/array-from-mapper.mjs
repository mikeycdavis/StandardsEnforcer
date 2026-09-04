// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// CONSUMPTION GRAMMAR. The iteration is real but is not one of the recognised forms.
//
// `Array.from(files, chk)` -- the second argument of `Array.from` is a mapper that runs per element,
// which is an iteration with no method call on the subject at all.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk=(f)=>{assert.ok(f.length>3);return f;};
const files = readdirSync("cases");
Array.from(files, chk);
