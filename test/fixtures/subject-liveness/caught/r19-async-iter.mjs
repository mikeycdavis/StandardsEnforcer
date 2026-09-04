// CAUGHT, ST-16. Written for adversarial round nineteen, the first run against the
// PARSER-BACKED mechanism (ADR 0010). Twenty shapes were aimed at the frontier the parse tree
// had just moved; five escaped, and all five were closed inside the round. Every specimen is
// kept as a regression test, whether it escaped or not.
//
// CONSUMPTION. `for await` over an async generator. The same loop over the same emptiness.
//
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const gen = async function* () { for (const f of files) yield f; };
for await (const f of gen()) assert.ok(f.length > 3);
