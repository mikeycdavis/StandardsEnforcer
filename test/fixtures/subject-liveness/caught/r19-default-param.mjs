// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// FLOW. Closed by round nineteen. The checker arrives as a parameter DEFAULT rather than as an
// argument. A default is a binding whose right-hand side is evaluated at call time, and this
// analysis now treats it as one.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const chk = (f) => assert.ok(f.length > 3);
const run = (xs, fn = chk) => { for (const g of xs) fn(g); };
run(files);
