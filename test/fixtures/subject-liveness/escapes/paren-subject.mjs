// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// SUBJECT GRAMMAR. The loop is never seen as a consumption, so nothing downstream runs.
//
// `for (const f of (files))` -- a PARENTHESISED subject. Ordinary JavaScript that a parser would
// handle for nothing, and that a regex subject grammar cannot see at all.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
for (const f of (files)) assert.ok(f.length>3);
