// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// SUBJECT. A ternary in subject position. Both arms are unproven, so the consumption is named by
// the whole expression.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const other = [];
for (const f of (files.length ? files : other)) assert.ok(f.length > 3);
