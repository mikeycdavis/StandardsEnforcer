// Specimen for ST-16, adversarial round seven. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const seen = [];
for (const f of files) seen[seen.length] = f;
assert.equal(seen.length, 0);
