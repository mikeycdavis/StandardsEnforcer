// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// SUBJECT + FLOW. `run(...[files, chk])` — a spread argument list. The parameter is reported as
// the unproven subject, which is the honest name for what was never proved.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const chk = (f) => assert.ok(f.length > 3);
const run = (xs, fn) => { for (const g of xs) fn(g); };
run(...[files, chk]);
