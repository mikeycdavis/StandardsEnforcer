// KNOWN ESCAPE, ST-16. Found by adversarial round fourteen, run against a mechanism it did not
// modify. It escaped round thirteen's mechanism AND the mechanism before it -- verified by running
// this corpus against both -- so recording it is the measurement reaching further, not a new gap.
//
// `for (const f of await load())` -- the subject grammar does not admit `await`, so this loop is
// not a consumption. Distinct from the aliasing group.
//
// A SUBJECT shape rather than a helper shape: the subject grammar does not admit this, so the loop
// is never seen as a consumption at all.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const load = async () => readdirSync("cases");
for (const f of await load()) assert.ok(f.length > 3);
