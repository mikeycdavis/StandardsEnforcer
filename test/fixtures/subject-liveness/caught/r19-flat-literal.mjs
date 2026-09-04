// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// FALSE PROOF OF LIVENESS. Closed by round nineteen. `[files].flat()` is empty exactly when
// `files` is, and the literal's one member is a COLLECTION, not an element. The same fault as
// `symbol-iterator.mjs`, reached through flattening instead of through `Symbol.iterator`.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
for (const f of [files].flat()) assert.ok(f.length > 3);
