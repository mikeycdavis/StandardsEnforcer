// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const seen = new Map();
for (const f of files) seen.set(f, 1);
assert.equal(seen.size, files.length);
