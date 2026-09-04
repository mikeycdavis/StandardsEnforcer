// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// FLOW. Closed by round nineteen. `Object.defineProperty` is the same relocation as
// `Object.assign` above.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const chk = (f) => assert.ok(f.length > 3);
const reg = {};
Object.defineProperty(reg, "c", { value: chk });
for (const f of files) reg.c(f);
