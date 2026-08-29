// KNOWN ESCAPE, ST-16 round twelve. Found by an adversarial round the mechanism did not modify.
//
// A helper taken out of an array by destructuring. The arrow IS attributed --
// to `check` is what attribution cannot do: the binding is a PATTERN, and the function it receives
// arrived as an array element rather than as the initialiser of a name.
//
// All six of round twelve's escapes share one fault: attribution is by NAME, and a function is a
// VALUE that flows -- through a destructuring, a return, an argument, a derived collection, a
// computed key. Closing them needs data flow, not another binder form. That is why ST-16 stays
// open rather than being patched shape by shape.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const [check] = [(f) => assert.ok(f.length > 3, "bad")];
const files = readdirSync("cases");
for (const f of files) check(f);
