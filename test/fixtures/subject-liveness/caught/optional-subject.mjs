// CAUGHT specimen, ST-16. Found as an escape by round twelve, closed by round thirteen; kept here
// so the closure is a regression test rather than a claim.
//
// A for-of over `files?.list`. Not a helper shape at all: the subject grammar did not admit
// `?.`, so the loop was never seen as a consumption. CLOSED in round thirteen by admitting it, which
// six other rules in the same mechanism already did.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = { list: readdirSync("cases") };
for (const f of files?.list) assert.ok(f.length > 3, "bad");
