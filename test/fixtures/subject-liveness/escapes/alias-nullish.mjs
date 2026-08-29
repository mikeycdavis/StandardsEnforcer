// KNOWN ESCAPE, ST-16. Found by adversarial round fourteen, run against a mechanism it did not
// modify. It escaped round thirteen's mechanism AND the mechanism before it -- verified by running
// this corpus against both -- so recording it is the measurement reaching further, not a new gap.
//
// `chk ??= (f) => ...` binds with no declaration keyword, so no declaration extent contains the
// function body and containment has nothing to credit.
//
// All of round fourteen's escapes are ALIASING, one hop past what round thirteen closed. Round
// thirteen followed the checker value across CONTAINMENT, a factory's return, and iteration. It does
// not follow a plain re-binding, and a plain re-binding is the cheapest hop there is.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
let chk;
chk ??= (f) => assert.ok(f.length > 3);
const files = readdirSync("cases");
for (const f of files) chk(f);
