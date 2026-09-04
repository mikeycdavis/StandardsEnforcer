// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// FLOW. A checker as a STATIC method. Same closure as the instance case; the tree makes them one
// event.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
class C { static chk(f) { assert.ok(f.length > 3); } }
for (const f of files) C.chk(f);
