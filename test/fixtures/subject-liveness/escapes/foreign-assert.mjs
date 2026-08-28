// KNOWN ESCAPE, ST-16. The one shape the subject-liveness mechanism does not reject.
//
// The mechanism recognises this repository's assertion dialect: `node:assert` and `throw`. A foreign
// assertion library reaches a verdict through neither, so the loop below reads as data shaping and
// its subject is never questioned. Empty `files` therefore passes.
//
// COMPENSATING CONTROL. `test/subject-liveness.test.mjs` asserts that every file in the authoritative
// surface imports `node:assert`, so this shape cannot currently occur there. That is a guard on the
// ASSUMPTION, not a closure of the gap: adopting another library would silently widen it, which is
// why this specimen stays here and ST-16 stays open.

for (const f of files) expect(f).toBeTruthy();
