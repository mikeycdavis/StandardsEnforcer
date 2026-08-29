// KNOWN ESCAPE, ST-16. Found by adversarial round sixteen, run against the mechanism round fifteen
// left behind and NOT modified during the round. It escaped the previous mechanism too -- the whole
// corpus was run against both, 5 escapes there and 3 here -- so recording it is the measurement
// reaching further, not a new gap.
//
// `o.c = chk` assigns a carrier to a MEMBER PATH. The binder scan deliberately skips a name preceded
// by a dot, so member paths are not mistaken for declarations -- and that skip means nothing binds
// here, so `o.c` is a name the attribution never holds. This is the flow family; it is the one of
// round sixteen's three that a further pass of the same analysis could close.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk = (f) => assert.ok(f.length > 3);
const o = {};
o.c = chk;
const files = readdirSync("cases");
for (const f of files) o.c(f);
