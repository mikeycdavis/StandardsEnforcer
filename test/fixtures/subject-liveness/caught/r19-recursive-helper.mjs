// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// CONSUMPTION. Closed by round nineteen. A LENGTH GUARD that decides whether a verdict is
// reached is an index loop, whatever supplies the back edge — here a recursive call rather than
// a loop keyword. On an empty subject the guard is true at first entry, so nothing after it
// runs.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const chk = (f) => assert.ok(f.length > 3);
const walk = (xs, i = 0) => { if (i >= xs.length) return; chk(xs[i]); walk(xs, i + 1); };
walk(files);
