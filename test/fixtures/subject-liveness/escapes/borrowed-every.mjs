// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// CONSUMPTION GRAMMAR. The iteration is real but is not one of the recognised forms.
//
// `assert.ok(Array.prototype.every.call(files, ok1))` -- vacuous truth reached through a borrowed
// `every`. The borrowed-iteration rule asks whether the CALLBACK reaches a verdict; here the verdict
// is the assertion wrapping the whole call, which is the `every` shape ST-16 was filed for.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const ok1=(f)=>f.length>3;
const files = readdirSync("cases");
assert.ok(Array.prototype.every.call(files, ok1));
