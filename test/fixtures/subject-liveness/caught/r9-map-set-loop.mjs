// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const results = new Map();
for (const f of files) if (!ok(f)) results.set(f, 1);
assert.equal(results.size, 0);
