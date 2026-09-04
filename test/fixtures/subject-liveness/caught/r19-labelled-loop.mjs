// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// CONSUMPTION. A labelled loop with `continue outer`. A label is not a distinguishable construct
// to this analysis, which is the point.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
outer: for (const f of files) { if (f) { assert.ok(f.length > 3); continue outer; } }
