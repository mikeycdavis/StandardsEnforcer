// FALSIFIER 1, ST-16 round three. A foreign assertion library, in a file that USES the dialect.
//
// Round two's compensating control asked "does this file import node:assert?". This file does, and
// asserts with it, and still reaches the verdict below through `expect` — so the control passes and
// the vacuous loop survives. That is why the question had to change from "does this file use the
// dialect" to "can this file reach a verdict through anything the mechanism cannot read".
//
// `expect` is bound by no import, no declaration and no parameter here, and is not a language
// global, so `unsupportedReasons` reports it as a free callee. The mechanism does not need to know
// what `expect` does; it needs to notice that it cannot know.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const files = readdirSync("cases");
assert.ok(typeof files === "object", "an honest assertion, so the dialect guard is satisfied");

for (const f of files) expect(f).toBeTruthy();
