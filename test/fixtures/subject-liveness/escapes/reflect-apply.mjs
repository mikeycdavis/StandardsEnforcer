// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// CONSUMPTION GRAMMAR. The iteration is real but is not one of the recognised forms.
//
// `Reflect.apply(Array.prototype.forEach, files, [chk])` -- borrowed iteration one level further
// out than `call`/`apply`, with the subject as the SECOND argument of a different function.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk=(f)=>assert.ok(f.length>3);
const files = readdirSync("cases");
Reflect.apply(Array.prototype.forEach,files,[chk]);
