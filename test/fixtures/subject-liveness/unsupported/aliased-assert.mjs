// FALSIFIER 3, ST-16 round three. The dialect itself, reached through another name.
//
// Every rule in `subject-liveness.mjs` matches the identifier `assert`. Bind it to something else
// and the calls stay real, the verdict stays real, and the mechanism stops seeing any of it — the
// loop below is not a verdict as far as `bodyAsserts` is concerned, so `files` is never questioned.
//
// This is the sharpest of the three, because nothing foreign is involved. The file is written in the
// admitted dialect and is still unreadable, which is why the premise had to be checked as a BINDING
// and not as an import.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const eq = assert.equal;
const files = readdirSync("cases");

for (const f of files) eq(f.trim(), "clean");
