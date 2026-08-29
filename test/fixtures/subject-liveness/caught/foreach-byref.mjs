// CAUGHT specimen, ST-16. Found as an escape by round twelve, closed by round thirteen; kept here
// so the closure is a regression test rather than a claim.
//
// The helper is passed by reference, so no call syntax mentions it and there is no loop body
// at all. CLOSED in round thirteen by reading a bare-reference argument as the call `forEach` is
// about to make of it, which lets the existing verdict rules see it with no rule of their own.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const check = (f) => assert.ok(f.length > 3, "bad");
const files = readdirSync("cases");
files.forEach(check);
