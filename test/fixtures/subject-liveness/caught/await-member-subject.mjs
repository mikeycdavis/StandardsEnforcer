// KNOWN ESCAPE, ST-16. Found by adversarial round eighteen, run against the mechanism round
// seventeen left behind and NOT modified during the round. The whole corpus was run against the
// previous mechanism too -- 15 escapes there, 12 here, no regressions -- so this is the
// measurement reaching further, not a gap that opened.
//
// SUBJECT GRAMMAR. The loop is never seen as a consumption, so nothing downstream runs.
//
// `await o.load()` -- the same family as `await-subject.mjs`, reached through a member call.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const o={load:async()=>readdirSync("cases")};
for (const f of await o.load()) assert.ok(f.length>3);
