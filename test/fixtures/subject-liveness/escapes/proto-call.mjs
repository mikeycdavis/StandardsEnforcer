// KNOWN ESCAPE, ST-16. Found by adversarial round sixteen, run against the mechanism round fifteen
// left behind and NOT modified during the round. It escaped the previous mechanism too -- the whole
// corpus was run against both, 5 escapes there and 3 here -- so recording it is the measurement
// reaching further, not a new gap.
//
// `Array.prototype.forEach.call(files, chk)` -- the CONSUMPTION rules expect the subject to be the
// receiver of `.forEach(`, and here the receiver is `Array.prototype` while the subject is an
// argument. A consumption-grammar gap, not a flow gap.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk = (f) => assert.ok(f.length > 3);
const files = readdirSync("cases");
Array.prototype.forEach.call(files, chk);
