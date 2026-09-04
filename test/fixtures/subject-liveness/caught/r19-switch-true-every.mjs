// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// CONSUMPTION. `switch (true) { case files.every(p): ... }` — a vacuously-true `every` in a
// discriminant.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
switch (true) { case files.every((f) => f.length > 3): break; default: assert.fail("bad"); }
