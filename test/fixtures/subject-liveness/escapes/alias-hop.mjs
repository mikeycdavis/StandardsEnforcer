// KNOWN ESCAPE, ST-16. Found by adversarial round fourteen, run against a mechanism it did not
// modify. It escaped round thirteen's mechanism AND the mechanism before it -- verified by running
// this corpus against both -- so recording it is the measurement reaching further, not a new gap.
//
// `const chk = mid` -- a bare alias with no call and no construction. The simplest possible
// flow edge, and the one the model does not have.
//
// All of round fourteen's escapes are ALIASING, one hop past what round thirteen closed. Round
// thirteen followed the checker value across CONTAINMENT, a factory's return, and iteration. It does
// not follow a plain re-binding, and a plain re-binding is the cheapest hop there is.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const make = () => (f) => assert.ok(f.length > 3);
const mid = make();
const chk = mid;
const files = readdirSync("cases");
for (const f of files) chk(f);
