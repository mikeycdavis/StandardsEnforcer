// KNOWN ESCAPE, ST-16. Found by round twelve; still open after round thirteen.
//
// FILED AS an attribution failure -- "the innermost binder is [Symbol.iterator], which is not an
// identifier, so nothing carries the verdict to box". Measurement says that is NOT why it escapes.
// The consumption IS found and its subject IS `box`; the loop asserts directly, so no attribution is
// needed at all.
//
// It escapes because `staticallyNonEmpty` counts an object literal's own members as proof that the
// collection is non-empty. That is sound for an ARRAY literal, whose members are its elements. It is
// unsound for an object consumed by for-of, where `Symbol.iterator` decides what is yielded -- here,
// from `files`, which may be empty. A false PROOF OF LIVENESS, not a lost name.
//
// Left open deliberately. Closing it changes what counts as evidence of liveness, and
// `Object.entries({ ... })` is a legitimate case where the member count IS the proof. Separating the
// two needs its own falsifier, and guessing at it here would risk reddening honest guards -- the one
// failure that makes a discriminator worse than none.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const files = readdirSync("cases");
const box = { *[Symbol.iterator]() { for (const f of files) yield f; } };
for (const f of box) assert.ok(f.length > 3, "bad");
