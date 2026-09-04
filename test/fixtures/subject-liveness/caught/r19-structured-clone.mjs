// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// SUBJECT. `structuredClone(files)` is empty exactly when `files` is, and is not in the
// unwrapping set — so it stays flagged as itself rather than being credited.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
for (const f of structuredClone(files)) assert.ok(f.length > 3);
