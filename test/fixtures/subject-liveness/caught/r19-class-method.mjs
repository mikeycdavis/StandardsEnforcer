// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// FLOW. A checker as a class method, reached through an instance. Caught: the class body reaches
// a verdict, so the name it is bound to carries one.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
class C { chk(f) { assert.ok(f.length > 3); } }
const c = new C();
for (const f of files) c.chk(f);
