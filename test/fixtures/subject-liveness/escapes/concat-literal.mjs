// KNOWN ESCAPE, ST-16. Found by adversarial round sixteen, run against the mechanism round fifteen
// left behind and NOT modified during the round. It escaped the previous mechanism too -- the whole
// corpus was run against both, 5 escapes there and 3 here -- so recording it is the measurement
// reaching further, not a new gap.
//
// `[].concat(files)` -- the subject grammar requires a subject to begin with an identifier, so an
// ARRAY LITERAL receiver matches nothing and the loop is never a consumption. A subject-grammar gap,
// the same family as `await-subject.mjs`.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
for (const f of [].concat(files)) assert.ok(f.length > 3);
