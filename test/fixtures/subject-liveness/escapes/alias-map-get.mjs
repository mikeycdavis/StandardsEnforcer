// KNOWN ESCAPE, ST-16. Found by adversarial round fourteen, run against a mechanism it did not
// modify. It escaped round thirteen's mechanism AND the mechanism before it -- verified by running
// this corpus against both -- so recording it is the measurement reaching further, not a new gap.
//
// `m.get("len")` retrieves the checker from a Map. Same shape as the factory, except the callee
// is a builtin whose body this file does not contain.
//
// All of round fourteen's escapes are ALIASING, one hop past what round thirteen closed. Round
// thirteen followed the checker value across CONTAINMENT, a factory's return, and iteration. It does
// not follow a plain re-binding, and a plain re-binding is the cheapest hop there is.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const m = new Map([["len", (f) => assert.ok(f.length > 3)]]);
const g = m.get("len");
const files = readdirSync("cases");
for (const f of files) g(f);
