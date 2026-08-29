// KNOWN ESCAPE, ST-16 round twelve. Found by an adversarial round the mechanism did not modify.
//
// A for-of over `files?.list`. This one is not about helpers at all -- it is a SUBJECT
// shape the consumption rules do not match, so the loop is never considered a consumption.
//
// All six of round twelve's escapes share one fault: attribution is by NAME, and a function is a
// VALUE that flows -- through a destructuring, a return, an argument, a derived collection, a
// computed key. Closing them needs data flow, not another binder form. That is why ST-16 stays
// open rather than being patched shape by shape.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = { list: readdirSync("cases") };
for (const f of files?.list) assert.ok(f.length > 3, "bad");
