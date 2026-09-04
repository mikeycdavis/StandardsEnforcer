// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// FLOW. Closed by round nineteen. `Object.assign(reg, { chk })` writes into its FIRST ARGUMENT,
// which is the same event as `reg.chk = chk` with the receiver moved out of receiver position.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const chk = (f) => assert.ok(f.length > 3);
const reg = {};
Object.assign(reg, { chk });
for (const f of files) reg.chk(f);
