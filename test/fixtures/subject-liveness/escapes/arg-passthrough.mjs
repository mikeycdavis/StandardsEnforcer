// KNOWN ESCAPE, ST-16. Found by adversarial round fourteen, run against a mechanism it did not
// modify. It escaped round thirteen's mechanism AND the mechanism before it -- verified by running
// this corpus against both -- so recording it is the measurement reaching further, not a new gap.
//
// The checker is passed as an ARGUMENT and called through the parameter name. The loop is inside
// `run`, whose subject is the parameter `xs`, and nothing connects `xs` to `files` at the call.
//
// All of round fourteen's escapes are ALIASING, one hop past what round thirteen closed. Round
// thirteen followed the checker value across CONTAINMENT, a factory's return, and iteration. It does
// not follow a plain re-binding, and a plain re-binding is the cheapest hop there is.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const chk = (f) => assert.ok(f.length > 3);
const run = (xs, fn) => { for (const f of xs) fn(f); };
const files = readdirSync("cases");
run(files, chk);
