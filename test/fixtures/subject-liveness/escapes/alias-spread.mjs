// KNOWN ESCAPE, ST-16. Found by adversarial round fourteen, run against a mechanism it did not
// modify. It escaped round thirteen's mechanism AND the mechanism before it -- verified by running
// this corpus against both -- so recording it is the measurement reaching further, not a new gap.
//
// `const all = [...base]` derives a new collection from one holding a checker. Iteration carries
// a carrier, but nothing carries the carrier into `all`.
//
// All of round fourteen's escapes are ALIASING, one hop past what round thirteen closed. Round
// thirteen followed the checker value across CONTAINMENT, a factory's return, and iteration. It does
// not follow a plain re-binding, and a plain re-binding is the cheapest hop there is.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const base = [(f) => assert.ok(f.length > 3)];
const all = [...base];
const files = readdirSync("cases");
for (const f of files) for (const c of all) c(f);
