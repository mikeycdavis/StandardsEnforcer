// KNOWN ESCAPE, ST-16 round twelve. Found by an adversarial round the mechanism did not modify.
//
// The helper is passed by reference, so no call syntax mentions it inside any loop body.
// There is no loop body at all: `files.forEach(check)` is the whole verdict.
//
// All six of round twelve's escapes share one fault: attribution is by NAME, and a function is a
// VALUE that flows -- through a destructuring, a return, an argument, a derived collection, a
// computed key. Closing them needs data flow, not another binder form. That is why ST-16 stays
// open rather than being patched shape by shape.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const check = (f) => assert.ok(f.length > 3, "bad");
const files = readdirSync("cases");
files.forEach(check);
