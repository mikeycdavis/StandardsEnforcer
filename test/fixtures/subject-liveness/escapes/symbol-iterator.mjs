// KNOWN ESCAPE, ST-16 round twelve. Found by an adversarial round the mechanism did not modify.
//
// A computed method name. The function body is found, but the innermost containing
// binder is `[Symbol.iterator]`, which is not an identifier, so nothing carries the verdict to `box`.
//
// All six of round twelve's escapes share one fault: attribution is by NAME, and a function is a
// VALUE that flows -- through a destructuring, a return, an argument, a derived collection, a
// computed key. Closing them needs data flow, not another binder form. That is why ST-16 stays
// open rather than being patched shape by shape.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const box = { *[Symbol.iterator]() { for (const f of files) yield f; } };
for (const f of box) assert.ok(f.length > 3, "bad");
