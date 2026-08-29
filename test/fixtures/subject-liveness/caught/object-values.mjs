// CAUGHT specimen, ST-16. Found as an escape by round twelve, closed by round thirteen; kept here
// so the closure is a regression test rather than a claim.
//
// The checks are reached through `Object.values(handlers)`. CLOSED in round thirteen by
// crediting EVERY containing declaration rather than the innermost, so `handlers` carries as well as
// `len`, and by letting a loop bind its variable from an EXPRESSION mentioning a carrier.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const handlers = { len: (f) => assert.ok(f.length > 3, "bad") };
const files = readdirSync("cases");
for (const f of files) for (const h of Object.values(handlers)) h(f);
