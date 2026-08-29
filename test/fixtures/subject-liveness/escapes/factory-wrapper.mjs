// KNOWN ESCAPE, ST-16 round twelve. Found by an adversarial round the mechanism did not modify.
//
// A helper returned by a factory. `make` is verdict-bearing and `chk = make()` is data
// flow, not construction -- and the hop is deliberately restricted to construction, because promoting
// every value derived from a verdict-reaching call flagged an honest parse loop in front-door.
//
// All six of round twelve's escapes share one fault: attribution is by NAME, and a function is a
// VALUE that flows -- through a destructuring, a return, an argument, a derived collection, a
// computed key. Closing them needs data flow, not another binder form. That is why ST-16 stays
// open rather than being patched shape by shape.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const make = () => (f) => assert.ok(f.length > 3, "bad");
const chk = make();
const files = readdirSync("cases");
for (const f of files) chk(f);
