// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// SUBJECT. `new Map(files.map(...))` unwraps through the constructor and the preserving `.map`
// to `files`.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const m = new Map(files.map((f) => [f, 1]));
for (const [k] of m) assert.ok(k.length > 3);
